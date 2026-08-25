const mongoose = require('mongoose');

const HistorySchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  relatedAgreement: { type: mongoose.Schema.Types.ObjectId, ref: 'RentalAgreement' },
  relatedPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  relatedDeposit: { type: mongoose.Schema.Types.ObjectId, ref: 'SecurityDeposit' },
  relatedVacating: { type: mongoose.Schema.Types.ObjectId, ref: 'VacatingRequest' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('History', HistorySchema);
