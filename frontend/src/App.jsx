import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MeetingRoom from './pages/MeetingRoom';
import AIWorkspace from './pages/AIWorkspace';
import Landing from './pages/Landing';

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useContext(AuthContext);
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Loading...</div>;
  if (!token) return <Navigate to="/login" />;
  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/meeting/:roomId" element={
        <ProtectedRoute>
          <MeetingRoom />
        </ProtectedRoute>
      } />

      <Route path="/workspace/:meetingId" element={
        <ProtectedRoute>
          <AIWorkspace />
        </ProtectedRoute>
      } />
      <Route path="/" element={<Landing />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}


export default App;
