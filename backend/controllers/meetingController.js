const Meeting = require('../models/Meeting');
const crypto = require('crypto');

exports.createMeeting = async (req, res) => {
  try {
    const { title } = req.body;
    const roomId = crypto.randomBytes(4).toString('hex'); // simple 8-char room ID
    
    const meeting = new Meeting({
      roomId,
      title: title || 'New Meeting',
      hostId: req.user.id,
      participants: [req.user.id]
    });
    
    await meeting.save();
    res.status(201).json(meeting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { roomId } = req.body;
    const meeting = await Meeting.findOne({ roomId });
    
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    
    if (!meeting.participants.includes(req.user.id)) {
      meeting.participants.push(req.user.id);
      await meeting.save();
    }
    
    res.status(200).json(meeting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getMeetingHistory = async (req, res) => {
  try {
    const meetings = await Meeting.find({ participants: req.user.id })
      .populate('hostId', 'username email')
      .sort({ createdAt: -1 });
      
    res.status(200).json(meetings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getMeetingDetails = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('hostId', 'username email')
      .populate('participants', 'username email');
      
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    
    // Check if user is participant
    if (!meeting.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to view this meeting' });
    }
    
    res.status(200).json(meeting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};
exports.deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await Meeting.findById(id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (meeting.hostId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only the host can delete this meeting' });
    }
    await Meeting.findByIdAndDelete(id);
    res.status(200).json({ message: 'Meeting deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};
