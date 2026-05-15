const User = require('../models/User');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    console.log(`[AUTH] Registration request received - Username: ${username}, Email: ${email}`);
    
    let user = await User.findOne({ email });
    if (user) {
      console.log(`[AUTH] Registration failed: User ${email} already exists`);
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    console.log(`[AUTH] Attempting to save user: ${email} to DB: ${mongoose.connection.name}`);
    user = new User({ username, email, password: hashedPassword });
    await user.save();
    console.log(`[AUTH] User saved successfully: ${email}`);

    const payload = { id: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(`[AUTH] Registration Error: ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.login = async (req, res) => {
  try {
    console.log('[AUTH] Login endpoint hit');
    const { email, password } = req.body;
    console.log(`[AUTH] Login attempt for: ${email}`);
    let user = await User.findOne({ email });
    if (!user) {
      console.log(`[AUTH] Login failed: User not found`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[AUTH] Login failed: Password mismatch for ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    console.log(`[AUTH] Password matched for ${email}. Proceeding to generate token.`);

    const payload = { id: user._id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

    console.log(`[AUTH] Login successful for: ${email}`);
    res.status(200).json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(`[AUTH] Error: ${err}`);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(`[AUTH] GetMe Error: ${err.message}`);
    res.status(500).json({ message: 'Server Error' });
  }
};
