const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null },
  phone: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  identification: { type: String, trim: true },
  emergencyContact: { type: String, trim: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', default: null },
  rentalStartDate: { type: Date },
  status: { type: String, enum: ['Active', 'Former'], default: 'Active' },
  history: [{ type: mongoose.Schema.Types.ObjectId, ref: 'History' }],
}, { timestamps: true });

module.exports = mongoose.model('Tenant', TenantSchema);
