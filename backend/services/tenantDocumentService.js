const TenantDocument = require('../models/TenantDocument');
const { sendEmail, templates } = require('./emailService');

async function sendDocumentDecisionEmail(documentId) {
  const now = new Date();
  const document = await TenantDocument.findOneAndUpdate({
    _id: documentId,
    status: { $in: ['Approved', 'Rejected'] },
    $or: [
      { emailNotificationStatus: { $nin: ['sending', 'sent'] } },
      {
        emailNotificationStatus: 'sending',
        emailNotificationSendingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) },
      },
      { emailNotificationStatus: 'sending', emailNotificationSendingAt: null },
    ],
  }, {
    $set: {
      emailNotificationStatus: 'sending',
      emailNotificationSendingAt: now,
      emailNotificationError: null,
    },
    $inc: { emailNotificationAttempts: 1 },
  }, { new: true }).populate('tenant', 'fullName email');

  if (!document) {
    const current = await TenantDocument.findById(documentId)
      .select('status emailNotificationStatus emailNotificationSentAt emailNotificationError');
    return current
      ? {
        status: current.emailNotificationStatus,
        sentAt: current.emailNotificationSentAt,
        error: current.emailNotificationError,
        duplicatePrevented: ['sent', 'sending'].includes(current.emailNotificationStatus),
      }
      : { status: 'not_found' };
  }

  try {
    if (!document.tenant) throw new Error('Document owner could not be found');
    const result = await sendEmail({
      to: document.tenant.email,
      ...templates.tenantDocumentDecisionEmail({
        fullName: document.tenant.fullName,
        documentType: document.documentType,
        status: document.status,
        reviewComment: document.reviewComment,
      }),
    });

    document.emailNotificationStatus = result.success
      ? 'sent'
      : result.notConfigured ? 'not_configured' : 'failed';
    document.emailNotificationSendingAt = null;
    document.emailNotificationSentAt = result.success ? new Date() : undefined;
    document.emailNotificationMessageId = result.success ? result.messageId : undefined;
    document.emailNotificationError = result.success ? undefined : result.error;
    await document.save();
    return {
      status: document.emailNotificationStatus,
      sentAt: document.emailNotificationSentAt,
      error: document.emailNotificationError,
    };
  } catch (error) {
    document.emailNotificationStatus = 'failed';
    document.emailNotificationSendingAt = null;
    document.emailNotificationError = error.message;
    await document.save();
    console.error('[TenantDocument] Decision email failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

function documentMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return null;
}

module.exports = { sendDocumentDecisionEmail, documentMimeFromBuffer };
