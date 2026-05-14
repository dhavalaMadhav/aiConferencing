import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Send, Sparkles, Terminal, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './AIWorkspace.css';

const AIWorkspace = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [meetingId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const fetchData = async () => {
    try {
      const [meetingRes, transcriptRes, chatRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meeting/${meetingId}`),
        axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/ai/transcript/${meetingId}`),
        axios.get(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/ai/chat/${meetingId}`)
      ]);
      setMeeting(meetingRes.data);
      setTranscripts(transcriptRes.data);
      setChatHistory(chatRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    const userQ = question;
    setQuestion('');
    setIsAsking(true);

    const tempChat = { _id: Date.now(), question: userQ, answer: '...', temp: true };
    setChatHistory(prev => [...prev, tempChat]);

    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/ai/ask-ai`, { meetingId, question: userQ });
      setChatHistory(prev => prev.map(chat => chat.temp ? res.data.chat : chat));
    } catch (err) {
      console.error(err);
      setChatHistory(prev => prev.map(chat => chat.temp ? { ...chat, answer: 'Connection to AI framework failed.', temp: false } : chat));
    } finally {
      setIsAsking(false);
    }
  };

  if (!meeting) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '14px' }}>INITIALIZING_WORKSPACE...</div>;

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <button onClick={() => navigate('/dashboard')} className="back-btn">
          <ArrowLeft size={16} />
        </button>
        <div className="header-info">
          <div className="header-title-container">
            <h1 className="header-title">
              {meeting.title}
              <span className="system-badge">
                <Sparkles size={12} /> System Active
              </span>
            </h1>
            <p className="header-meta">ID: {meetingId} • TS: {new Date(meeting.createdAt).getTime()}</p>
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        
        {/* Transcript Panel */}
        <div className="transcript-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Terminal size={16} color="var(--text-primary)" /> Protocol Transcript
            </h2>
            <button onClick={fetchData} className="refresh-btn">
              <RefreshCcw size={14} />
            </button>
          </div>
          
          <div className="transcript-bg"></div>
          
          <div className="transcript-content">
            {transcripts.length === 0 ? (
              <div className="transcript-empty">
                <Terminal size={32} strokeWidth={1} style={{ marginBottom: '16px' }} />
                <p>AWAITING_DATA_STREAM...</p>
              </div>
            ) : (
              transcripts.map((t, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  key={idx} 
                  className="transcript-item"
                >
                  <div className="transcript-time">
                    {new Date(t.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div className="transcript-text-container">
                    <span className="transcript-speaker">{t.userId?.username || 'SYS'}:</span>
                    <span className="transcript-text">{t.text}</span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Chatbot Panel */}
        <div className="chat-panel">
          <div className="chat-bg"></div>
          
          <div className="chat-content">
            {chatHistory.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="chat-empty"
              >
                <div className="chat-empty-icon">
                  <Sparkles size={24} color="var(--text-primary)" strokeWidth={1.5} />
                </div>
                <h3 className="chat-empty-title">Intelligence Module</h3>
                <p className="chat-empty-desc">
                  Query the meeting vector database. The system synthesizes answers directly from transcribed semantics.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <button onClick={() => setQuestion("Synthesize the main action items.")} className="suggestion-btn group">
                    <span>"Synthesize the main action items."</span>
                    <ArrowLeft size={16} className="suggestion-arrow" />
                  </button>
                  <button onClick={() => setQuestion("Extract the final decisions.")} className="suggestion-btn group">
                    <span>"Extract the final decisions."</span>
                    <ArrowLeft size={16} className="suggestion-arrow" />
                  </button>
                </div>
              </motion.div>
            )}
            
            <AnimatePresence initial={false}>
              {chatHistory.map((chat, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="chat-message-container"
                >
                  {/* User Message */}
                  <div className="msg-row-user">
                    <div className="msg-bubble-user">
                      <p className="msg-text-user">{chat.question}</p>
                    </div>
                  </div>
                  
                  {/* AI Response */}
                  <div className="msg-row-ai">
                    <div className="msg-bubble-ai">
                      <div className="msg-ai-highlight"></div>
                      <div className="msg-ai-icon-container">
                        <div className="msg-ai-icon">
                          <Sparkles size={12} color="var(--text-primary)" />
                        </div>
                      </div>
                      <div className="msg-ai-text">
                        {chat.temp ? (
                          <div className="typing-indicator">
                            <motion.span className="animate-dot">●</motion.span>
                            <motion.span className="animate-dot">●</motion.span>
                            <motion.span className="animate-dot">●</motion.span>
                          </div>
                        ) : (
                          chat.answer
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={chatEndRef} style={{ height: '16px' }} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-divider"></div>
            <form onSubmit={handleAsk} className="chat-form">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Query workspace..."
                disabled={isAsking}
                className="chat-input"
              />
              <button 
                type="submit" 
                disabled={isAsking || !question.trim()}
                className="chat-send-btn"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default AIWorkspace;
