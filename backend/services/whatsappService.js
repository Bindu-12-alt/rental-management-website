/**
 * RentEase WhatsApp Service
 * Uses Twilio WhatsApp API. Set WHATSAPP_DEV_MODE=true to log messages instead of sending.
 *
 * Requirements:
 *  - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env
 *  - TWILIO_WHATSAPP_FROM = whatsapp:+14155238886 (Twilio sandbox) or your approved number
 *  - Approved message templates (required for business-initiated messages)
 *
 * IMPORTANT: WhatsApp requires explicit user opt-in before sending messages.
 * This service handles the sending layer only; opt-in tracking is managed by the calling code.
 */

const DEV_MODE =
  process.env.WHATSAPP_DEV_MODE === 'true' ||
  !process.env.TWILIO_ACCOUNT_SID ||
  !process.env.TWILIO_AUTH_TOKEN;

let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (DEV_MODE) return null;
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

/**
 * Normalize a phone number to WhatsApp format.
 * Expects E.164 format (e.g. +919876543210) or 10-digit Indian number.
 */
function toWhatsAppNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  // If 10-digit Indian number, prefix country code
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  return `whatsapp:+${cleaned}`;
}

/**
 * Send a WhatsApp message.
 * @param {string} toPhone - Recipient phone number
 * @param {string} message - Message text (plain text; use approved templates for business-initiated)
 * @returns {Promise<object>} - Result object
 */
async function sendWhatsApp(toPhone, message) {
  if (!toPhone || !message) {
    console.warn('[WhatsAppService] Missing phone or message — skipping');
    return { skipped: true };
  }

  const to = toWhatsAppNumber(toPhone);
  if (!to) {
    console.warn('[WhatsAppService] Could not parse phone number:', toPhone);
    return { skipped: true, reason: 'invalid_phone' };
  }

  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (DEV_MODE) {
    console.log('─────────────────────────────────────');
    console.log('[WhatsAppService DEV] Would send WhatsApp message:');
    console.log(`  From: ${from}`);
    console.log(`  To:   ${to}`);
    console.log(`  Msg:  ${message.substring(0, 120)}${message.length > 120 ? '...' : ''}`);
    console.log('─────────────────────────────────────');
    return { devMode: true, to, message };
  }

  try {
    const client = getTwilioClient();
    const result = await client.messages.create({
      from,
      to,
      body: message,
    });
    console.log(`[WhatsAppService] Sent to ${to}: SID=${result.sid}`);
    return { success: true, sid: result.sid, status: result.status };
  } catch (error) {
    console.error(`[WhatsAppService] Failed to send to ${to}:`, error.message);
    // Don't throw — messaging failures should not crash the main flow
    return { success: false, error: error.message, to };
  }
}

// ─── Message Templates ────────────────────────────────────────────────────────
// Keep messages concise and compliant with WhatsApp Business Policy.
// For production, register these as approved templates in your Twilio console.

const templates = {
  rentReminder: ({ fullName, amount, dueDate, apartmentNumber }) =>
    `Hi ${fullName}! 👋 This is a friendly reminder from *RentEase* that your rent of *₹${amount}* for apartment *${apartmentNumber}* is due on *${dueDate}*. Please make your payment on time. Thank you! 🏠`,

  paymentConfirmed: ({ fullName, amount, paymentDate, apartmentNumber }) =>
    `Hi ${fullName}! ✅ Your rent payment of *₹${amount}* for apartment *${apartmentNumber}* has been confirmed on ${paymentDate}. Thank you for your timely payment! — *RentEase*`,

  maintenanceReceived: ({ fullName, title, requestId }) =>
    `Hi ${fullName}! 🔧 Your maintenance request *"${title}"* (ID: ${requestId}) has been received. Our team will review it shortly. Track status in the RentEase portal. — *RentEase*`,

  maintenanceUpdated: ({ fullName, title, status, adminComments }) =>
    `Hi ${fullName}! 🔔 Your maintenance request *"${title}"* has been updated to *${status}*.${adminComments ? ` Note: ${adminComments}` : ''} Check your portal for details. — *RentEase*`,

  agreementCreated: ({ fullName, agreementId, expiryDate, monthlyRent }) =>
    `Hi ${fullName}! 📄 A rental agreement (ID: ${agreementId}) has been created for you with monthly rent *₹${monthlyRent}*, valid until *${expiryDate}*. Log in to RentEase to view it. — *RentEase*`,

  agreementExpiringSoon: ({ fullName, agreementId, expiryDate }) =>
    `Hi ${fullName}! ⚠️ Your rental agreement *${agreementId}* is expiring on *${expiryDate}*. Please contact your property manager to discuss renewal. — *RentEase*`,

  vacatingUpdate: ({ fullName, status, expectedVacatingDate }) =>
    `Hi ${fullName}! Your vacating request for *${expectedVacatingDate}* has been *${status}*. Log in to the RentEase portal for more details. — *RentEase*`,

  contactAdmin: ({ tenantName, phone, message }) =>
    `📩 Message from tenant *${tenantName}* (${phone}):\n\n"${message}"\n\nReply via the RentEase admin portal.`,
};

module.exports = { sendWhatsApp, templates, toWhatsAppNumber };
