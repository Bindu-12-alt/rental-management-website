const mongoose = require('mongoose');

const TenantDocumentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  apartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', default: null },
  documentType: {
    type: String,
    enum: ['Identity', 'Address Proof', 'Income Proof', 'Other'],
    required: true,
  },
  originalName: { type: String, required: true, maxlength: 180 },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
  size: { type: Number, required: true, min: 1 },
  documentData: { type: Buffer, required: true, select: false },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
  reviewComment: { type: String, maxlength: 1000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedAt: { type: Date },
  emailNotificationStatus: {
    type: String,
    enum: ['not_sent', 'sending', 'sent', 'failed', 'not_configured'],
    default: 'not_sent',
  },
  emailNotificationSendingAt: { type: Date },
  emailNotificationSentAt: { type: Date },
  emailNotificationMessageId: { type: String },
  emailNotificationError: { type: String },
  emailNotificationAttempts: { type: Number, default: 0 },
}, { timestamps: true });

TenantDocumentSchema.index({ tenant: 1, createdAt: -1 });
TenantDocumentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('TenantDocument', TenantDocumentSchema);
