const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const authMiddleware = require('../middleware/auth');
const { emitMeetingStatusUpdate } = require('../socket/signaling');

const Transcript = require('../models/Transcript');
const Chat = require('../models/Chat');
const Meeting = require('../models/Meeting');

const upload = multer({ dest: 'uploads/' });

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8001'; // Change to Render URL for production
// const FASTAPI_URL = 'https://aiconferencing-python-fastapi.onrender.com';

// Upload Audio & Process Pipeline (Forwards to FastAPI)
router.post('/upload-audio', authMiddleware, upload.single('audio'), async (req, res) => {
  console.log('[NODE] Received /upload-audio request from frontend.');
  try {
    const { meetingId } = req.body;
    const userId = req.user.id;

    console.log(`[NODE] Request details - meetingId: ${meetingId}, userId: ${userId}`);

    if (!req.file) {
      console.error('[NODE] ERROR: No file received by Multer.');
      return res.status(400).json({ message: 'No audio file uploaded.' });
    }

    const audioPath = req.file.path;
    console.log(`[NODE] Multer saved file to: ${audioPath}`);
    console.log(`[NODE] File details - mimetype: ${req.file.mimetype}, size: ${req.file.size} bytes`);

    if (!fs.existsSync(audioPath)) {
      console.error(`[NODE] ERROR: File does not exist on disk at path: ${audioPath}`);
      return res.status(500).json({ message: 'Audio file was not saved correctly to disk.' });
    }

    // Update meeting status + emit real-time update
    await Meeting.findByIdAndUpdate(meetingId, { transcriptStatus: 'processing' });
    emitMeetingStatusUpdate(req.io, userId, meetingId, 'processing');
    console.log('[NODE] Meeting transcript status updated to "processing".');

    // Create form-data to forward to FastAPI
    console.log('[NODE] Preparing FormData to send to FastAPI...');
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath), {
      filename: req.file.originalname || 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm'
    });
    formData.append('meeting_id', meetingId);
    formData.append('user_id', userId);
    formData.append('speaker', req.user.username || 'Speaker');

    // Forward to FastAPI
    console.log(`[NODE] Forwarding request to FastAPI at ${FASTAPI_URL}/process-audio...`);
    const response = await axios.post(`${FASTAPI_URL}/process-audio`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    console.log('[NODE] Received successful response from FastAPI:', response.data);
    const { text } = response.data;

    // Save Transcript to DB
    const transcript = new Transcript({
      meetingId,
      userId,
      speaker: req.user.username || 'Speaker',
      text
    });
    await transcript.save();
    console.log('[NODE] Saved new transcript to MongoDB.');

    // Update meeting status + emit real-time update
    await Meeting.findByIdAndUpdate(meetingId, { transcriptStatus: 'completed' });
    emitMeetingStatusUpdate(req.io, userId, meetingId, 'completed');

    // Cleanup local file
    fs.unlinkSync(audioPath);
    console.log(`[NODE] Cleaned up temporary file: ${audioPath}`);

    res.status(200).json({ message: 'Audio processed successfully', transcript });
  } catch (error) {
    console.error('[NODE] ERROR during audio processing:', error.message);
    if (error.response) {
      console.error('[NODE] FastAPI Response Error Data:', error.response.data);
      console.error('[NODE] FastAPI Response Status:', error.response.status);
    }

    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log(`[NODE] Cleaned up temporary file after error: ${req.file.path}`);
    }

    if (req.body && req.body.meetingId) {
      await Meeting.findByIdAndUpdate(req.body.meetingId, { transcriptStatus: 'failed' });
      emitMeetingStatusUpdate(req.io, req.user?.id, req.body.meetingId, 'failed');
    }

    res.status(500).json({
      message: 'Error processing audio in FastAPI',
      error: error.message,
      details: error.response?.data || 'No additional details'
    });

  }
});

// Ask AI Route (Forwards to FastAPI)
router.post('/ask-ai', authMiddleware, async (req, res) => {
  try {
    const { meetingId, question } = req.body;
    const userId = req.user.id;

    const response = await axios.post(`${FASTAPI_URL}/ask-ai`, {
      meeting_id: meetingId,
      question: question
    });

    const answer = response.data.answer;

    const chat = new Chat({
      meetingId,
      userId,
      question,
      answer
    });
    await chat.save();

    res.status(200).json({ answer, chat });
  } catch (error) {
    console.error('FastAPI error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Error querying AI from FastAPI' });
  }
});

// Fetch Meeting Transcript
router.get('/transcript/:meetingId', authMiddleware, async (req, res) => {
  try {
    const transcripts = await Transcript.find({ meetingId: req.params.meetingId }).populate('userId', 'username');
    res.status(200).json(transcripts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching transcripts' });
  }
});

// Fetch Meeting Chat History
router.get('/chat/:meetingId', authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ meetingId: req.params.meetingId }).sort({ createdAt: 1 });
    res.status(200).json(chats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching chat history' });
  }
});

module.exports = router;
