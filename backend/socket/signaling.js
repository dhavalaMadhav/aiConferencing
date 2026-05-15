let ioInstance = null;

module.exports = (io) => {
  ioInstance = io;

  const roomUsers = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Dashboard: subscribe to meeting status updates for a user
    socket.on('subscribe-dashboard', (userId) => {
      socket.join(`dashboard:${userId}`);
    });

    // Join a specific meeting room
    socket.on('join-room', (roomId, user) => {
      socket.join(roomId);
      
      if (!roomUsers[roomId]) {
        roomUsers[roomId] = [];
      }
      
      // Deduplicate: remove any existing entry for this socket OR this userId (prevents ghosts on refresh)
      roomUsers[roomId] = roomUsers[roomId].filter(u => u._id !== user._id && u.socketId !== socket.id);
      
      // Store user info in the room
      const userData = { ...user, socketId: socket.id };
      roomUsers[roomId].push(userData);
      
      console.log(`[SOCKET] User ${user.username} joined room ${roomId}. Current count: ${roomUsers[roomId].length}`);
      
      // Send the list of existing users to the new user
      const otherUsers = roomUsers[roomId].filter(u => u.socketId !== socket.id);
      socket.emit('all-users', otherUsers);
      
      // Tell others a new user joined
      socket.to(roomId).emit('user-joined', userData);

      socket.on('disconnect', () => {
        if (roomUsers[roomId]) {
          roomUsers[roomId] = roomUsers[roomId].filter(u => u.socketId !== socket.id);
          socket.to(roomId).emit('user-left', socket.id);
        }
      });
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
      io.to(data.to).emit('offer', { offer: data.offer, from: socket.id, user: data.user });
    });

    socket.on('answer', (data) => {
      io.to(data.to).emit('answer', { answer: data.answer, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
      io.to(data.to).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    });
  });
};

// Called from aiRoutes.js to push real-time status changes to the dashboard
module.exports.emitMeetingStatusUpdate = (io, userId, meetingId, status) => {
  io.to(`dashboard:${userId}`).emit('meeting-status-update', { meetingId, status });
};
