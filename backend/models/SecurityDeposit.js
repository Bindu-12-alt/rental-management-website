const mongoose = require('mongoose');

const SecurityDepositSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  amount: { type: Number, required: true, min: 0 },
  paidDate: { type: Date, required: true },
  paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Refunded'], default: 'Paid' },
  refundAmount: { type: Number, default: 0, min: 0 },
  refundDate: { type: Date },
  refundStatus: { type: String, enum: ['Pending', 'Completed', 'Partial', 'None'], default: 'Pending' },
  deductions: [{ reason: String, amount: { type: Number, min: 0 } }],
  conditionDetails: { type: String },
  history: [{ type: mongoose.Schema.Types.ObjectId, ref: 'History' }],
}, { timestamps: true });

module.exports = mongoose.model('SecurityDeposit', SecurityDepositSchema);
