/**
 * RentEase Email Service
 * Uses Nodemailer with SMTP. EMAIL_DEV_MODE=true disables delivery.
 */
const nodemailer = require('nodemailer');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

let transporter;

function getEmailConfiguration() {
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || '';
  const devMode = process.env.EMAIL_DEV_MODE === 'true';
  const port = Number.parseInt(process.env.EMAIL_PORT || '587', 10);
  const configured = !devMode
    && Boolean(process.env.EMAIL_HOST && process.env.EMAIL_HOST.trim())
    && Boolean(process.env.EMAIL_USER)
    && Boolean(process.env.EMAIL_PASS)
    && Number.isInteger(port) && port > 0 && port <= 65535
    && EMAIL_REGEX.test(fromAddress);
  return {
    configured,
    devMode,
    host: process.env.EMAIL_HOST || '',
    port,
    secure: process.env.EMAIL_SECURE === 'true',
    fromAddress,
  };
}

function getTransporter() {
  if (transporter) return transporter;
  const configuration = getEmailConfiguration();
  if (!configuration.configured) return null;
  transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

async function verifyEmailConnection() {
  const configuration = getEmailConfiguration();
  if (!configuration.configured) {
    console.warn('[EmailService] Email not sent:', configuration.devMode
      ? 'delivery is disabled in development mode'
      : 'SMTP credentials or sender configuration are missing');
    return {
      configured: false,
      devMode: configuration.devMode,
      verified: false,
      fromAddress: configuration.fromAddress || null,
      error: configuration.devMode
        ? 'Email delivery is disabled in development mode'
        : 'SMTP host, credentials, and a valid sender address are required',
    };
  }
  try {
    await getTransporter().verify();
    return {
      configured: true,
      devMode: false,
      verified: true,
      host: configuration.host,
      fromAddress: configuration.fromAddress,
    };
  } catch (error) {
    return {
      configured: true,
      devMode: false,
      verified: false,
      host: configuration.host,
      fromAddress: configuration.fromAddress,
      error: error.message,
    };
  }
}

/**
 * Send a plain-text/HTML email.
 * @param {object} options
 * @param {string} options.to       - Recipient email
 * @param {string} options.subject  - Subject line
 * @param {string} options.html     - HTML body
 * @param {string} [options.text]   - Plain text fallback
 */
async function sendEmail({ to, subject, html, text, attachments = [] }) {
  if (typeof to !== 'string' || !EMAIL_REGEX.test(to.trim())
    || typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)
    || !html) {
    return { success: false, error: 'A valid recipient, subject, and HTML body are required' };
  }

  const configuration = getEmailConfiguration();
  if (!configuration.configured) {
    console.warn('[EmailService] Email not sent:', configuration.devMode
      ? 'delivery is disabled in development mode'
      : 'SMTP credentials or sender configuration are missing');
    return {
      success: false,
      notConfigured: true,
      devMode: configuration.devMode,
      error: configuration.devMode
        ? 'Email delivery is disabled in development mode'
        : 'SMTP host, credentials, and a valid sender address are required',
    };
  }

  try {
    const t = getTransporter();
    const fromName = String(process.env.EMAIL_FROM_NAME || 'RentEase')
      .replace(/[\r\n"]/g, ' ')
      .slice(0, 80);
    const info = await t.sendMail({
      from: `"${fromName}" <${configuration.fromAddress}>`,
      to: to.trim(),
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
      attachments,
    });
    const accepted = Array.isArray(info.accepted)
      && info.accepted.some((address) => String(address).toLowerCase() === to.trim().toLowerCase());
    if (!accepted) {
      return { success: false, error: 'SMTP server did not accept the recipient address' };
    }
    console.log(`[EmailService] Sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed to send to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>RentEase</title>
  <style>
    body { margin: 0; padding: 0; background: #FAF6F1; font-family: Inter, Arial, sans-serif; color: #2C1A0E; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; border: 1px solid #E8D5C4; overflow: hidden; }
    .header { background: #4A2000; padding: 28px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; opacity: 0.8; font-size: 14px; }
    .body { padding: 32px; }
    .body p { line-height: 1.7; margin: 0 0 16px; }
    .btn { display: inline-block; background: #7B3F00; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; margin: 16px 0; }
    .info-box { background: #FAF6F1; border: 1px solid #E8D5C4; border-radius: 10px; padding: 16px 20px; margin: 16px 0; }
    .info-box p { margin: 6px 0; font-size: 15px; }
    .label { color: #8B6F5E; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .footer { background: #FAF6F1; border-top: 1px solid #E8D5C4; padding: 20px 32px; font-size: 13px; color: #8B6F5E; text-align: center; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #fff; }
    .badge-green { background: #16A34A; }
    .badge-yellow { background: #F59E0B; }
    .badge-red { background: #DC2626; }
    .badge-brown { background: #7B3F00; }
    .divider { border: none; border-top: 1px solid #E8D5C4; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏠 RentEase</h1>
      <p>Your trusted rental management platform</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} RentEase. This is an automated message — please do not reply.</p>
      <p>If you have any questions, contact your property manager.</p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeEmail({ fullName, email }) {
  return {
    subject: 'Your RentEase registration is confirmed',
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your tenant registration is confirmed. Welcome to <strong>RentEase</strong>!</p>
      <div class="info-box">
        <p class="label">Account Details</p>
        <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      </div>
      <p>You can now log in to the tenant portal to view your apartment details, payments, maintenance requests, and more.</p>
      <p>If you did not create this account, please contact your property manager immediately.</p>
    `),
  };
}

function newTenantRegistrationEmail({ fullName, email }) {
  return {
    subject: 'New tenant registration — RentEase',
    html: baseTemplate(`
      <p>A tenant has registered with RentEase.</p>
      <div class="info-box">
        <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      </div>
      <p>Review the tenant account and apartment assignment in the admin portal.</p>
    `),
  };
}

function paymentReminderEmail({ fullName, amount, dueDate, apartmentNumber }) {
  return {
    subject: `Rent Due Reminder — INR ${amount} due on ${dueDate}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>This is a friendly reminder that your rent payment is due soon.</p>
      <div class="info-box">
        <p class="label">Payment Details</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Amount Due:</strong> INR ${escapeHtml(amount)}</p>
        <p><strong>Due Date:</strong> ${escapeHtml(dueDate)}</p>
      </div>
      <p>Please make your payment on time to avoid any late fees.</p>
      <p>Log in to the RentEase tenant portal to view your payment details.</p>
    `),
  };
}

function paymentConfirmationEmail({ fullName, amount, paymentDate, transactionId, apartmentNumber }) {
  return {
    subject: `Payment Confirmed — INR ${amount} received`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your rent payment has been received and recorded.</p>
      <div class="info-box">
        <p class="label">Payment Confirmation</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Amount:</strong> INR ${escapeHtml(amount)}</p>
        <p><strong>Date:</strong> ${escapeHtml(paymentDate)}</p>
        ${transactionId ? `<p><strong>Transaction ID:</strong> ${escapeHtml(transactionId)}</p>` : ''}
        <p><strong>Status:</strong> <span class="status-badge badge-green">Paid</span></p>
      </div>
      <p>Thank you for your timely payment. Keep this confirmation for your records.</p>
    `),
  };
}

function maintenanceSubmittedEmail({ fullName, title, requestId, priority }) {
  const priorityBadge = priority === 'High' ? 'badge-red' : priority === 'Medium' ? 'badge-yellow' : 'badge-brown';
  return {
    subject: `Maintenance Request Received — ${String(title).replace(/[\r\n]/g, ' ').slice(0, 100)}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>We have received your maintenance request and it is now being reviewed.</p>
      <div class="info-box">
        <p class="label">Request Details</p>
        <p><strong>Title:</strong> ${escapeHtml(title)}</p>
        <p><strong>Request ID:</strong> ${escapeHtml(requestId)}</p>
        <p><strong>Priority:</strong> <span class="status-badge ${priorityBadge}">${escapeHtml(priority)}</span></p>
        <p><strong>Status:</strong> <span class="status-badge badge-yellow">Pending</span></p>
      </div>
      <p>Our team will review your request and get back to you shortly. You can track the status in your tenant portal.</p>
    `),
  };
}

function maintenanceUpdatedEmail({ fullName, title, status, adminComments }) {
  const statusBadge = status === 'Completed' ? 'badge-green' : status === 'In Progress' ? 'badge-yellow' : status === 'Rejected' ? 'badge-red' : 'badge-brown';
  return {
    subject: `Maintenance Update — ${String(title).replace(/[\r\n]/g, ' ').slice(0, 100)}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your maintenance request has been updated.</p>
      <div class="info-box">
        <p class="label">Update Details</p>
        <p><strong>Request:</strong> ${escapeHtml(title)}</p>
        <p><strong>New Status:</strong> <span class="status-badge ${statusBadge}">${escapeHtml(status)}</span></p>
        ${adminComments ? `<p><strong>Admin Notes:</strong> ${escapeHtml(adminComments)}</p>` : ''}
      </div>
      <p>Log in to the RentEase tenant portal for full details.</p>
    `),
  };
}

function agreementCreatedEmail({
  fullName,
  agreementId,
  startDate,
  expiryDate,
  monthlyRent,
  apartmentNumber,
  status = 'Active',
  event = 'created',
}) {
  const eventLabel = { created: 'Created', updated: 'Updated', renewed: 'Renewed' }[event] || 'Updated';
  return {
    subject: `Rental Agreement ${eventLabel} — ${String(agreementId).replace(/[\r\n]/g, ' ').slice(0, 80)}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>A rental agreement has been ${escapeHtml(event)} for your apartment.</p>
      <div class="info-box">
        <p class="label">Agreement Details</p>
        <p><strong>Agreement ID:</strong> ${escapeHtml(agreementId)}</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Start Date:</strong> ${escapeHtml(startDate)}</p>
        <p><strong>Expiry Date:</strong> ${escapeHtml(expiryDate)}</p>
        <p><strong>Monthly Rent:</strong> INR ${escapeHtml(monthlyRent)}</p>
        <p><strong>Status:</strong> ${escapeHtml(status)}</p>
      </div>
      <p>The rental agreement PDF is attached. Please review and keep it for your records.</p>
    `),
  };
}

function agreementRenewalReminderEmail({ fullName, agreementId, expiryDate, apartmentNumber }) {
  return {
    subject: `Rental Agreement Expiring Soon — ${agreementId}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your rental agreement is expiring soon. Please contact your property manager to discuss renewal options.</p>
      <div class="info-box">
        <p class="label">Agreement Details</p>
        <p><strong>Agreement ID:</strong> ${escapeHtml(agreementId)}</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Expiry Date:</strong> <strong style="color:#DC2626">${escapeHtml(expiryDate)}</strong></p>
      </div>
      <p>Contact your property manager before the expiry date to ensure a smooth renewal process.</p>
    `),
  };
}

function agreementExpiredEmail({ fullName, agreementId, expiryDate, apartmentNumber }) {
  return {
    subject: `Rental Agreement Expired — ${String(agreementId).replace(/[\r\n]/g, ' ').slice(0, 80)}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your rental agreement has expired. Please contact your property manager to confirm renewal or move-out arrangements.</p>
      <div class="info-box">
        <p><strong>Agreement ID:</strong> ${escapeHtml(agreementId)}</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Expiry Date:</strong> ${escapeHtml(expiryDate)}</p>
      </div>
    `),
  };
}

function tenantContactEmail({ tenantName, tenantEmail, tenantPhone, message }) {
  return {
    subject: 'New RentEase tenant message',
    html: baseTemplate(`
      <p>A tenant has contacted you through RentEase.</p>
      <div class="info-box">
        <p><strong>Name:</strong> ${escapeHtml(tenantName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(tenantEmail)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(tenantPhone || 'Not provided')}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      </div>
    `),
  };
}

function directMessageEmail({ recipientName, senderName, subject, message }) {
  return {
    subject,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
      <p>You have a new message from ${escapeHtml(senderName)}.</p>
      <div class="info-box"><p style="white-space:pre-wrap">${escapeHtml(message)}</p></div>
    `),
  };
}

function vacatingRequestEmail({ fullName, expectedVacatingDate, status, adminComments }) {
  const statusBadge = status === 'Approved' ? 'badge-green' : status === 'Rejected' ? 'badge-red' : 'badge-yellow';
  return {
    subject: `Vacating Request ${status} — RentEase`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your vacating request has been updated.</p>
      <div class="info-box">
        <p class="label">Request Details</p>
        <p><strong>Expected Vacating Date:</strong> ${escapeHtml(expectedVacatingDate)}</p>
        <p><strong>Status:</strong> <span class="status-badge ${statusBadge}">${escapeHtml(status)}</span></p>
        ${adminComments ? `<p><strong>Notes:</strong> ${escapeHtml(adminComments)}</p>` : ''}
      </div>
      <p>Log in to your RentEase tenant portal for full details and next steps.</p>
    `),
  };
}

function vacatingAdminEmail({ fullName, email, apartmentNumber, expectedVacatingDate, status }) {
  return {
    subject: `New vacating request — ${String(apartmentNumber).replace(/[\r\n]/g, ' ').slice(0, 80)}`,
    html: baseTemplate(`
      <p>A tenant submitted a vacating request.</p>
      <div class="info-box">
        <p><strong>Tenant:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Apartment:</strong> ${escapeHtml(apartmentNumber)}</p>
        <p><strong>Requested date:</strong> ${escapeHtml(expectedVacatingDate)}</p>
        <p><strong>Status:</strong> ${escapeHtml(status)}</p>
      </div>
      <p>Review this request in the RentEase admin portal.</p>
    `),
  };
}

function tenantDocumentDecisionEmail({ fullName, documentType, status, reviewComment }) {
  const approved = status === 'Approved';
  return {
    subject: `RentEase document ${approved ? 'approved' : 'rejected'}`,
    html: baseTemplate(`
      <p>Hi <strong>${escapeHtml(fullName)}</strong>,</p>
      <p>Your uploaded <strong>${escapeHtml(documentType)}</strong> document was ${approved ? 'approved' : 'rejected'} by the RentEase property manager.</p>
      ${reviewComment ? `<div class="info-box"><p><strong>Review notes:</strong></p><p style="white-space:pre-wrap">${escapeHtml(reviewComment)}</p></div>` : ''}
      <p>You can review your document status in the RentEase tenant portal.</p>
    `),
  };
}

module.exports = {
  sendEmail,
  getEmailConfiguration,
  verifyEmailConnection,
  templates: {
    welcomeEmail,
    newTenantRegistrationEmail,
    paymentReminderEmail,
    paymentConfirmationEmail,
    maintenanceSubmittedEmail,
    maintenanceUpdatedEmail,
    agreementCreatedEmail,
    agreementRenewalReminderEmail,
    agreementExpiredEmail,
    tenantContactEmail,
    directMessageEmail,
    vacatingRequestEmail,
    vacatingAdminEmail,
    tenantDocumentDecisionEmail,
  },
};
