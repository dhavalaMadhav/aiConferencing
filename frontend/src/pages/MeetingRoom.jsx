import React, { useEffect, useState, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { SocketContext } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Focus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [peers, setPeers] = useState({}); // { socketId: { stream, user } }
  const [participants, setParticipants] = useState([]);
  const [showParticipants, setShowParticipants] = useState(false);

  const localVideoRef = useRef();
  const peersRef = useRef({}); // RTCPeerConnection instances
  const candidateQueues = useRef({}); // Queues for ICE candidates arriving too early
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  useEffect(() => {
    axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meeting/join`, { roomId })
      .then(res => setMeeting(res.data))
      .catch(() => navigate('/dashboard'));
  }, [roomId, navigate]);

  useEffect(() => {
    if (!socket || !meeting) return;

    const initializeRTC = async () => {
      try {
        const currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(currentStream);
        if (localVideoRef.current) localVideoRef.current.srcObject = currentStream;

        initRecording(currentStream);

        // Join room
        socket.emit('join-room', roomId, { _id: user._id, username: user.username });

        socket.on('all-users', (users) => {
          setParticipants(users);
          users.forEach(otherUser => {
            initiateCall(otherUser.socketId, currentStream, otherUser);
          });
        });

        socket.on('user-joined', (otherUser) => {
          console.log(`[RTC] User joined: ${otherUser.username} (${otherUser.socketId})`);
          // Clear any stale connection for the same user ID but different socket ID
          if (peersRef.current[otherUser.socketId]) {
            peersRef.current[otherUser.socketId].close();
            delete peersRef.current[otherUser.socketId];
          }
          
          setParticipants(prev => {
            const filtered = prev.filter(u => u._id !== otherUser._id);
            return [...filtered, otherUser];
          });
        });

        socket.on('offer', async (data) => {
          console.log('[RTC] Received offer from:', data.user.username);
          if (peersRef.current[data.from]) {
            peersRef.current[data.from].close();
          }
          const peer = await handleOffer(data.from, data.offer, currentStream, data.user);
          peersRef.current[data.from] = peer;
        });

        socket.on('answer', async (data) => {
          const peer = peersRef.current[data.from];
          if (peer) {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
            processQueuedCandidates(data.from);
          }
        });

        socket.on('ice-candidate', async (data) => {
          const peer = peersRef.current[data.from];
          if (peer && peer.remoteDescription) {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            if (!candidateQueues.current[data.from]) candidateQueues.current[data.from] = [];
            candidateQueues.current[data.from].push(data.candidate);
          }
        });

        socket.on('user-left', (socketId) => {
          if (peersRef.current[socketId]) {
            peersRef.current[socketId].close();
            delete peersRef.current[socketId];
          }
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[socketId];
            return newPeers;
          });
          setParticipants(prev => prev.filter(u => u.socketId !== socketId));
        });
      } catch (err) {
        console.error("RTC Initialization failed", err);
      }
    };

    initializeRTC();

    return () => {
      ['all-users', 'user-joined', 'offer', 'answer', 'ice-candidate', 'user-left'].forEach(ev => socket.off(ev));
    };
  }, [socket, meeting]);

  const initiateCall = async (socketId, localStream, otherUser) => {
    const peer = new RTCPeerConnection(iceServers);
    peersRef.current[socketId] = peer;

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    peer.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
    };

    peer.ontrack = (e) => {
      setPeers(prev => ({ ...prev, [socketId]: { stream: e.streams[0], user: otherUser } }));
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('offer', { to: socketId, offer, user: { _id: user._id, username: user.username } });
  };

  const handleOffer = async (socketId, offer, localStream, otherUser) => {
    const peer = new RTCPeerConnection(iceServers);
    peersRef.current[socketId] = peer;

    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    peer.onicecandidate = (e) => {
      if (e.candidate) socket.emit('ice-candidate', { to: socketId, candidate: e.candidate });
    };

    peer.ontrack = (e) => {
      setPeers(prev => ({ ...prev, [socketId]: { stream: e.streams[0], user: otherUser } }));
    };

    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('answer', { to: socketId, answer });
    
    processQueuedCandidates(socketId);
    return peer;
  };

  const processQueuedCandidates = (socketId) => {
    const queue = candidateQueues.current[socketId];
    const peer = peersRef.current[socketId];
    if (queue && peer) {
      queue.forEach(candidate => peer.addIceCandidate(new RTCIceCandidate(candidate)));
      delete candidateQueues.current[socketId];
    }
  };

  const initRecording = (currentStream) => {
    const audioTrack = currentStream.getAudioTracks()[0];
    const audioStream = new MediaStream([audioTrack]);
    audioChunksRef.current = [];
    mediaRecorderRef.current = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.start(1000);
  };

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

  const leaveMeeting = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (stream) stream.getTracks().forEach(track => track.stop());
    Object.values(peersRef.current).forEach(p => p.close());
    navigate('/dashboard');
  };

  if (!meeting) return <div className="meeting-loading">Initializing Secure Nexus...</div>;

  return (
    <div className="meeting-page">
      <header className="meeting-header">
        <div className="glass-panel-light meeting-info">
          <h1 className="meeting-title">{meeting.title}</h1>
          <p className="meeting-room-id">ID: {roomId}</p>
        </div>
        <div className="glass-panel-light rec-badge">
          <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} className="rec-dot" />
          <span className="rec-text">LIVE</span>
        </div>
      </header>

      <main className="meeting-main">
        <div className={`video-grid ${Object.keys(peers).length === 0 ? 'single' : 'multi'}`}>
          <div className="video-card local">
            <video ref={localVideoRef} autoPlay muted className="video-element" style={{ opacity: isVideoOff ? 0 : 1 }} />
            {isVideoOff && <div className="video-placeholder">{user.username.charAt(0).toUpperCase()}</div>}
            <div className="video-label">You {isMuted && <MicOff size={12} />}</div>
          </div>

          {Object.entries(peers).map(([socketId, peerObj]) => (
            <div key={socketId} className="video-card">
              <RemoteVideo stream={peerObj.stream} />
              <div className="video-label">{peerObj.user?.username || 'Participant'}</div>
            </div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {showParticipants && (
          <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="participants-drawer glass-panel">
            <div className="drawer-header">
              <h3>In Meeting ({participants.length + 1})</h3>
              <button onClick={() => setShowParticipants(false)} className="close-drawer"><X size={20} /></button>
            </div>
            <div className="participants-list">
              <div className="participant-item">
                <div className="p-avatar self">{user.username.charAt(0).toUpperCase()}</div>
                <div className="p-info"><span className="p-name">{user.username} (You)</span><span className="p-status">Host</span></div>
              </div>
              {participants.map(p => (
                <div key={p.socketId} className="participant-item">
                  <div className="p-avatar">{p.username.charAt(0).toUpperCase()}</div>
                  <div className="p-info"><span className="p-name">{p.username}</span><span className="p-status">Participant</span></div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="dock-container">
        <div className="glass-panel controls-dock">
          <button onClick={toggleMute} className={`dock-btn ${isMuted ? 'active' : ''}`}>{isMuted ? <MicOff size={22} /> : <Mic size={22} />}</button>
          <button onClick={toggleVideo} className={`dock-btn ${isVideoOff ? 'active' : ''}`}>{isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
          <div className="dock-divider"></div>
          <button onClick={() => setShowParticipants(!showParticipants)} className={`dock-btn ${showParticipants ? 'active' : ''}`}><Users size={22} /></button>
          <div className="dock-divider"></div>
          <button onClick={leaveMeeting} className="leave-btn"><PhoneOff size={22} /><span>End</span></button>
        </div>
      </div>
    </div>
  );
};

const RemoteVideo = ({ stream }) => {
  const videoRef = useRef();
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={videoRef} autoPlay className="video-element" />;
};

export default MeetingRoom;
