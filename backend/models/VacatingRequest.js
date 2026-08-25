const mongoose = require('mongoose');

const VacatingRequestSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  requestDate: { type: Date, required: true },
  expectedVacatingDate: { type: Date, required: true },
  noticePeriodDays: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Completed'], default: 'Pending' },
  adminComments: { type: String },
  earliestValidDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('VacatingRequest', VacatingRequestSchema);
