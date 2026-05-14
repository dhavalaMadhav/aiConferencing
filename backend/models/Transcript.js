const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
  meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  speaker: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Transcript', transcriptSchema);
