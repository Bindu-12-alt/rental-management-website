const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  amount: { type: Number, required: true, min: 0 },
  paymentDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  method: { type: String, required: true, trim: true },
  transactionId: { type: String, trim: true },
  status: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
