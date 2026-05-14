import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Focus } from 'lucide-react';
import { motion } from 'framer-motion';
import './MeetingRoom.css';

const MeetingRoom = () => {
  const { roomId } = useParams();
  const { socket } = useContext(SocketContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState(null);
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const localVideoRef = useRef();
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    axios.post('http://localhost:3000/api/meeting/join', { roomId })
      .then(res => setMeeting(res.data))
      .catch(err => {
        console.error(err);
        navigate('/dashboard');
      });
  }, [roomId, navigate]);

  useEffect(() => {
    if (!socket || !meeting) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(currentStream => {
        setStream(currentStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }

        // Prevent duplicate initializations
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          console.warn('[FRONTEND] MediaRecorder is already active. Skipping duplicate initialization.');
          return;
        }

        const audioTrack = currentStream.getAudioTracks()[0];
        const audioStream = new MediaStream([audioTrack]);

        // Clear old chunks before starting
        audioChunksRef.current = [];

        mediaRecorderRef.current = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        console.log('[FRONTEND] MediaRecorder initialized with MIME type: audio/webm');

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
            console.log(`[FRONTEND] Audio chunk received: ${e.data.size} bytes. Total chunks: ${audioChunksRef.current.length}`);
          }
        };

        mediaRecorderRef.current.start(1000);
        setIsRecording(true);
        console.log('[FRONTEND] MediaRecorder started recording.');

        socket.emit('join-room', roomId, user._id);

        socket.on('user-connected', (userId) => {
          console.log('User connected', userId);
        });

      })
      .catch(err => console.error("Failed to get local stream", err));

    return () => {
      socket.off('user-connected');
    };
  }, [socket, meeting, roomId, user._id]);

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !stream.getAudioTracks()[0].enabled;
      setIsMuted(!stream.getAudioTracks()[0].enabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !stream.getVideoTracks()[0].enabled;
      setIsVideoOff(!stream.getVideoTracks()[0].enabled);
    }
  };

  const leaveMeeting = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('[FRONTEND] stop() called on MediaRecorder.');
      console.log('[FRONTEND] Waiting for final chunks to flush...');

      mediaRecorderRef.current.onstop = async () => {
        console.log('[FRONTEND] onstop triggered. All chunks flushed.');
        console.log(`[FRONTEND] Final chunk count: ${audioChunksRef.current.length}`);

        if (audioChunksRef.current.length === 0) {
          console.error('[FRONTEND] ERROR: No audio chunks collected. Skipping upload.');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log(`[FRONTEND] Blob finalized successfully. Size: ${audioBlob.size} bytes, Type: ${audioBlob.type}`);

        if (audioBlob.size === 0) {
          console.error('[FRONTEND] ERROR: Audio Blob size is 0. Recording failed.');
          return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('meetingId', meeting._id);

        try {
          console.log('[FRONTEND] Upload starting... Sending audio to Node.js backend (/api/ai/upload-audio)');
          const res = await axios.post('http://localhost:3000/api/ai/upload-audio', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          console.log('[FRONTEND] Upload completed! Response:', res.data);
        } catch (err) {
          console.error('[FRONTEND] Failed to upload audio:', err.response?.data || err.message);
        }
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      console.log('[FRONTEND] No active recording to stop.');
    }

    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`[FRONTEND] Track ${track.kind} stopped.`);
      });
    }

    navigate('/dashboard');
  };

  if (!meeting) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Connecting...</div>;

  return (
    <div className="meeting-page">
      <div className="meeting-gradient-top"></div>
      <div className="meeting-gradient-bottom"></div>

      <header className="meeting-header">
        <div className="glass-panel-light meeting-info" style={{ padding: '8px 16px', borderRadius: '12px' }}>
          <h1 className="meeting-title">{meeting.title}</h1>
          <p className="meeting-room-id">Room: {roomId}</p>
        </div>
        <div className="glass-panel-light rec-badge">
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="rec-dot"
          />
          <span className="rec-text">REC</span>
        </div>
      </header>

      <main className="meeting-main">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="video-container"
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            className="video-element"
            style={{ display: isVideoOff ? 'none' : 'block' }}
          />
          {isVideoOff && (
            <div className="video-off-state">
              <div className="video-avatar">
                {user.username.charAt(0).toUpperCase()}
              </div>
            </div>
          )}

          <div className="glass-panel-light video-nametag">
            {user.username} (You)
          </div>

          <div className="video-focus-btn">
            <Focus size={16} />
          </div>
        </motion.div>
      </main>

      <div className="dock-container">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
          className="glass-panel controls-dock"
        >
          <button
            onClick={toggleMute}
            className={`dock-btn ${isMuted ? 'dock-btn-active' : 'dock-btn-inactive'}`}
          >
            {isMuted ? <MicOff size={20} strokeWidth={2} /> : <Mic size={20} strokeWidth={2} />}
          </button>

          <button
            onClick={toggleVideo}
            className={`dock-btn ${isVideoOff ? 'dock-btn-active' : 'dock-btn-inactive'}`}
          >
            {isVideoOff ? <VideoOff size={20} strokeWidth={2} /> : <Video size={20} strokeWidth={2} />}
          </button>

          <div className="dock-divider"></div>

          <button className="dock-btn dock-btn-inactive">
            <Users size={20} strokeWidth={2} />
          </button>

          <div className="dock-divider"></div>

          <button onClick={leaveMeeting} className="leave-btn">
            <PhoneOff size={20} strokeWidth={2} />
            <span className="leave-btn-text">Leave</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default MeetingRoom;
