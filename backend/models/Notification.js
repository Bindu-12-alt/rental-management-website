const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  relatedTenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  relatedApartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  audience: { type: String, enum: ['tenant', 'admin', 'both'], default: 'both' },
  eventKey: { type: String },
}, { timestamps: true });

NotificationSchema.index({ eventKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Notification', NotificationSchema);
