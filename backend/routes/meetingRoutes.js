const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');
const authMiddleware = require('../middleware/auth');

router.post('/create', authMiddleware, meetingController.createMeeting);
router.post('/join', authMiddleware, meetingController.joinMeeting);
router.get('/history', authMiddleware, meetingController.getMeetingHistory);
router.get('/:id', authMiddleware, meetingController.getMeetingDetails);
router.delete('/:id', authMiddleware, meetingController.deleteMeeting);


module.exports = router;
