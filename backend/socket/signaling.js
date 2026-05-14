let ioInstance = null;

module.exports = (io) => {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Dashboard: subscribe to meeting status updates for a user
    socket.on('subscribe-dashboard', (userId) => {
      socket.join(`dashboard:${userId}`);
      console.log(`User ${socket.id} subscribed to dashboard updates for user ${userId}`);
    });

    // Join a specific meeting room
    socket.on('join-room', (roomId, userId) => {
      socket.join(roomId);
      socket.to(roomId).emit('user-connected', userId);

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', userId);
      });
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
      socket.to(data.to).emit('offer', { offer: data.offer, from: socket.id });
    });

    socket.on('answer', (data) => {
      socket.to(data.to).emit('answer', { answer: data.answer, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
      socket.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    });
  });
};

// Called from aiRoutes.js to push real-time status changes to the dashboard
module.exports.emitMeetingStatusUpdate = (io, userId, meetingId, status) => {
  io.to(`dashboard:${userId}`).emit('meeting-status-update', { meetingId, status });
};
