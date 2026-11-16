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
  rentReminderSentAt: { type: Date },
  rentReminderError: { type: String },
  rentReminderWhatsAppSentAt: { type: Date },
  confirmationEmailStatus: {
    type: String,
    enum: ['not_sent', 'sending', 'sent', 'failed', 'not_configured'],
    default: 'not_sent',
  },
  confirmationEmailSendingAt: { type: Date },
  confirmationEmailSentAt: { type: Date },
  confirmationEmailMessageId: { type: String },
  confirmationEmailError: { type: String },
  confirmationEmailAttempts: { type: Number, default: 0 },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
