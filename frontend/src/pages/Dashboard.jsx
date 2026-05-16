import React, { useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import {
  Video, Users, History, LogOut, MessageSquare,
  ChevronRight, Trash2, CheckCircle, AlertCircle, Loader, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Dashboard.css';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ─── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    completed: { cls: 'status-ready', icon: <CheckCircle size={12} />, label: 'AI Ready' },
    processing: { cls: 'status-processing', icon: <Loader size={12} className="spin" />, label: 'Building AI…' },
    pending:    { cls: 'status-pending',    icon: <Clock size={12} />, label: 'AI Pending' },
    failed:     { cls: 'status-failed',     icon: <AlertCircle size={12} />, label: 'AI Failed' },
  };
  const { cls, icon, label } = map[status] || map.pending;
  return (
    <span className={`status-badge ${cls}`}>
      {icon}
      {label}
    </span>
  );
};

// ─── Delete Confirmation Modal ─────────────────────────────────────────────────
const DeleteModal = ({ onConfirm, onCancel }) => (
  <motion.div
    className="modal-overlay"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onCancel}
  >
    <motion.div
      className="modal-box glass-panel"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      onClick={e => e.stopPropagation()}
    >
      <Trash2 size={28} className="modal-icon" />
      <h3 className="modal-title">Delete Meeting?</h3>
      <p className="modal-desc">This will permanently remove the meeting, its transcript, and all associated AI data.</p>
      <div className="modal-actions">
        <button className="modal-cancel" onClick={onCancel}>Cancel</button>
        <button className="modal-confirm" onClick={onConfirm}>Delete</button>
      </div>
    </motion.div>
  </motion.div>
);

// ─── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const { socket } = useContext(SocketContext);
  const [meetings, setMeetings] = useState([]);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const navigate = useNavigate();

  // ── Fetch History ────────────────────────────────────────────────────────────
  const fetchMeetings = useCallback(async () => {
    try {
      const res = await axios.get(`${BASE}/api/meeting/history`);
      setMeetings(res.data);
    } catch (err) {
      console.error('Failed to fetch meetings', err);
    }
  }, []);

  useEffect(() => {
    if (user) fetchMeetings();
  }, [user, fetchMeetings]);

  // ── Socket real-time status updates ─────────────────────────────────────────
  useEffect(() => {
    if (!socket || !user) return;
    socket.emit('subscribe-dashboard', user._id);

    const handler = ({ meetingId, status }) => {
      setMeetings(prev =>
        prev.map(m => m._id === meetingId ? { ...m, transcriptStatus: status } : m)
      );
    };
    socket.on('meeting-status-update', handler);
    return () => socket.off('meeting-status-update', handler);
  }, [socket, user]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleHostMeeting = async () => {
    try {
      const res = await axios.post(`${BASE}/api/meeting/create`, { title: 'New Meeting' });
      navigate(`/meeting/${res.data.roomId}`);
    } catch (err) {
      console.error('Failed to host meeting', err);
    }
  };

  const handleJoinMeeting = async (e) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    try {
      await axios.post(`${BASE}/api/meeting/join`, { roomId: joinRoomId });
      navigate(`/meeting/${joinRoomId}`);
    } catch (err) {
      console.error('Failed to join meeting', err);
      alert('Failed to join meeting. Please check the Room ID.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${BASE}/api/meeting/${deleteTarget}`);
      setMeetings(prev => prev.filter(m => m._id !== deleteTarget));
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Framer variants ──────────────────────────────────────────────────────────
  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } }
  };

  return (
    <div className="dashboard-page">

      {/* ── Futuristic Background ─────────────────────────────────────────── */}
      <div className="dash-bg" aria-hidden="true">
        <div className="dash-bg-orb dash-bg-orb-1" />
        <div className="dash-bg-orb dash-bg-orb-2" />
        <div className="dash-bg-grid" />
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <div className="header-container">
          <div className="header-logo">
            <h1 className="logo-text">GetAiFor</h1>
          </div>
          <div className="header-actions">
            <div className="user-badge">
              <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
              <span className="user-name">{user?.username}</span>
            </div>
            <button onClick={handleLogout} className="logout-btn" title="Logout">
              <LogOut size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="dashboard-main">

        {/* ── Unified Host + Join Container ────────────────────────────── */}
        <motion.div
          className="meeting-actions-container glass-panel"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Host */}
          <motion.div
            className="action-pane"
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            onClick={handleHostMeeting}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && handleHostMeeting()}
          >
            <div className="action-card-icon"></div>
            <h2 className="action-card-title">Host a Meeting</h2>
            <p className="action-card-desc">Create a secure, AI-powered conference room instantly.</p>
            <div className="action-cta">
              Start Now <ChevronRight size={16} />
            </div>
          </motion.div>

          <div className="action-divider" />

          {/* Join */}
          <div className="action-pane">
            <div className="action-card-icon"><Users size={24} color="var(--text-primary)" strokeWidth={1.5} /></div>
            <h2 className="action-card-title">Join Meeting</h2>
            <p className="action-card-desc">Enter a room ID to join an existing session.</p>
            <form onSubmit={handleJoinMeeting} className="join-form">
              <input
                type="text"
                placeholder="Enter Room ID"
                className="join-input"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value)}
              />
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                type="submit"
                className="join-btn"
              >
                Join
              </motion.button>
            </form>
          </div>
        </motion.div>

        {/* ── Meeting History ──────────────────────────────────────────── */}
        <div className="history-header">
          <History size={20} color="var(--text-secondary)" strokeWidth={1.5} />
          <h2 className="history-title">Meeting History</h2>
        </div>

        <motion.div
          className="history-grid"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <AnimatePresence>
            {meetings.length > 0 ? meetings.map((meeting) => (
              <motion.div
                key={meeting._id}
                variants={itemVariants}
                layout
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
                className="history-card"
              >
                <div className="history-card-glow" />

                {/* Delete Button */}
                <button
                  className="history-delete-btn"
                  onClick={() => setDeleteTarget(meeting._id)}
                  title="Delete meeting"
                >
                  <Trash2 size={14} />
                </button>

                <h3 className="history-card-title">{meeting.title}</h3>
                <p className="history-card-date">
                  {new Date(meeting.createdAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric',
                    hour: 'numeric', minute: 'numeric'
                  })}
                </p>

                <div className="history-card-footer">
                  <StatusBadge status={meeting.transcriptStatus} />
                  {meeting.transcriptStatus === 'completed' && (
                    <button
                      onClick={() => navigate(`/workspace/${meeting._id}`)}
                      className="workspace-btn"
                    >
                      Workspace <MessageSquare size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )) : (
              <div className="empty-history">
                <div className="empty-history-icon"><History size={40} strokeWidth={1} /></div>
                <p>No previous meetings found.</p>
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
