const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null },
  googleId: { type: String, unique: true, sparse: true },
  profilePicture: { type: String, default: '' },
  authProvider: { type: String, enum: ['password', 'google', 'mixed'], default: 'password' },
}, { timestamps: true });

module.exports = mongoose.model('Admin', AdminSchema);
