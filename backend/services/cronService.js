/**
 * RentEase Cron Jobs
 * Runs scheduled tasks: agreement expiry detection, rent reminders, etc.
 * Call startCronJobs() once from server.js after DB connects.
 */
const cron = require('node-cron');
const RentalAgreement = require('../models/RentalAgreement');
const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const { createNotification } = require('./notificationService');
const { sendEmail, templates } = require('./emailService');
const { sendWhatsApp, templates: waTemplates } = require('./whatsappService');

/**
 * Check for agreements expiring within 30 days and update their status.
 * Sends email + WhatsApp reminder to tenant and creates in-app notification.
 * Runs daily at 08:00.
 */
async function checkAgreementExpiry() {
  try {
    console.log('[Cron] Checking agreement expiry...');
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Find active agreements expiring in the next 30 days
    const expiringSoon = await RentalAgreement.find({
      status: 'Active',
      expiryDate: { $lte: thirtyDaysOut, $gt: now },
    }).populate('tenant', 'fullName email phone').populate('apartment', 'apartmentNumber');

    for (const agreement of expiringSoon) {
      agreement.status = 'Expiring Soon';
      await agreement.save();

      if (agreement.tenant) {
        await createNotification({
          type: 'Agreement Renewal',
          message: `Your rental agreement ${agreement.agreementId} expires on ${agreement.expiryDate.toLocaleDateString()}`,
          relatedTenant: agreement.tenant._id,
          relatedApartment: agreement.apartment?._id,
          priority: 'High',
        });

        try {
          if (agreement.tenant.email) {
            const emailData = templates.agreementRenewalReminderEmail({
              fullName: agreement.tenant.fullName,
              agreementId: agreement.agreementId,
              expiryDate: agreement.expiryDate.toLocaleDateString(),
              apartmentNumber: agreement.apartment?.apartmentNumber || '—',
            });
            await sendEmail({ to: agreement.tenant.email, ...emailData });
          }
          if (agreement.tenant.phone) {
            await sendWhatsApp(agreement.tenant.phone, waTemplates.agreementExpiringSoon({
              fullName: agreement.tenant.fullName,
              agreementId: agreement.agreementId,
              expiryDate: agreement.expiryDate.toLocaleDateString(),
            }));
          }
        } catch (notifErr) {
          console.error('[Cron] Agreement expiry notification failed:', notifErr.message);
        }
      }
    }

    // Mark truly expired agreements
    const expired = await RentalAgreement.find({
      status: { $in: ['Active', 'Expiring Soon'] },
      expiryDate: { $lte: now },
    });
    for (const agreement of expired) {
      agreement.status = 'Expired';
      await agreement.save();
    }

    console.log(`[Cron] Agreement check done: ${expiringSoon.length} expiring soon, ${expired.length} expired.`);
  } catch (error) {
    console.error('[Cron] checkAgreementExpiry error:', error.message);
  }
}

/**
 * Send rent due reminders for payments due in the next 3 days.
 * Runs daily at 09:00.
 */
async function sendRentReminders() {
  try {
    console.log('[Cron] Sending rent reminders...');
    const now = new Date();
    const threeDaysOut = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const upcoming = await Payment.find({
      status: 'Pending',
      dueDate: { $gte: now, $lte: threeDaysOut },
    }).populate('tenant', 'fullName email phone').populate('apartment', 'apartmentNumber');

    let sent = 0;
    for (const payment of upcoming) {
      if (!payment.tenant) continue;
      try {
        await createNotification({
          type: 'Rent Due',
          message: `Rent of ₹${payment.amount} is due on ${payment.dueDate.toLocaleDateString()}`,
          relatedTenant: payment.tenant._id,
          relatedApartment: payment.apartment?._id,
          priority: 'High',
        });
        if (payment.tenant.email) {
          const emailData = templates.paymentReminderEmail({
            fullName: payment.tenant.fullName,
            amount: payment.amount,
            dueDate: payment.dueDate.toLocaleDateString(),
            apartmentNumber: payment.apartment?.apartmentNumber || '—',
          });
          await sendEmail({ to: payment.tenant.email, ...emailData });
        }
        if (payment.tenant.phone) {
          await sendWhatsApp(payment.tenant.phone, waTemplates.rentReminder({
            fullName: payment.tenant.fullName,
            amount: payment.amount,
            dueDate: payment.dueDate.toLocaleDateString(),
            apartmentNumber: payment.apartment?.apartmentNumber || '—',
          }));
        }
        sent++;
      } catch (notifErr) {
        console.error('[Cron] Rent reminder failed:', notifErr.message);
      }
    }
    console.log(`[Cron] Rent reminders sent: ${sent}`);
  } catch (error) {
    console.error('[Cron] sendRentReminders error:', error.message);
  }
}

function startCronJobs() {
  // Daily at 08:00 — agreement expiry check
  cron.schedule('0 8 * * *', checkAgreementExpiry);
  // Daily at 09:00 — rent reminders
  cron.schedule('0 9 * * *', sendRentReminders);
  console.log('[Cron] Scheduled jobs started.');
}

module.exports = { startCronJobs, checkAgreementExpiry, sendRentReminders };
