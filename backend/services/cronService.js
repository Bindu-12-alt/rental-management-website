/**
 * RentEase Cron Jobs
 * Call startCronJobs() once from server.js after DB connects.
 */
const cron = require('node-cron');
const RentalAgreement = require('../models/RentalAgreement');
const Payment = require('../models/Payment');
const { createNotification } = require('./notificationService');
const { sendEmail, templates } = require('./emailService');
const { sendWhatsApp, templates: waTemplates } = require('./whatsappService');

async function checkAgreementExpiry() {
  try {
    console.log('[Cron] Checking agreement expiry...');
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringSoon = await RentalAgreement.find({
      status: { $in: ['Active', 'Expiring Soon', 'Generated', 'Pending Signature', 'Signed'] },
      expiryDate: { $lte: thirtyDaysOut, $gt: now },
    }).populate('tenant', 'fullName email phone').populate('apartment', 'apartmentNumber');

    for (const agreement of expiringSoon) {
      if (agreement.status !== 'Expiring Soon') {
        agreement.status = 'Expiring Soon';
        await agreement.save();
      }
      if (!agreement.tenant) continue;

      await createNotification({
        type: 'Agreement Renewal',
        message: `Your rental agreement ${agreement.agreementId} expires on ${agreement.expiryDate.toLocaleDateString()}`,
        relatedTenant: agreement.tenant._id,
        relatedApartment: agreement.apartment?._id,
        priority: 'High',
        eventKey: `agreement-renewal-${agreement._id}`,
      });

      if (!agreement.renewalReminderSentAt) {
        const emailResult = agreement.tenant.email
          ? await sendEmail({
            to: agreement.tenant.email,
            ...templates.agreementRenewalReminderEmail({
              fullName: agreement.tenant.fullName,
              agreementId: agreement.agreementId,
              expiryDate: agreement.expiryDate.toLocaleDateString(),
              apartmentNumber: agreement.apartment?.apartmentNumber || '—',
            }),
          })
          : { success: false, error: 'Tenant has no email address' };
        if (emailResult.success) {
          agreement.renewalReminderSentAt = new Date();
          agreement.renewalReminderError = undefined;
        } else {
          agreement.renewalReminderError = emailResult.error;
          console.error(`[Cron] Agreement renewal email failed for ${agreement.agreementId}:`, emailResult.error);
        }
      }

      if (agreement.tenant.phone && !agreement.renewalReminderWhatsAppSentAt) {
        const result = await sendWhatsApp(agreement.tenant.phone, waTemplates.agreementExpiringSoon({
          fullName: agreement.tenant.fullName,
          agreementId: agreement.agreementId,
          expiryDate: agreement.expiryDate.toLocaleDateString(),
        }));
        if (result.success) agreement.renewalReminderWhatsAppSentAt = new Date();
      }
      await agreement.save();
    }

    const expired = await RentalAgreement.find({
      status: { $nin: ['Renewed', 'Terminated'] },
      expiryDate: { $lte: now },
      expiryNotificationSentAt: { $exists: false },
    }).populate('tenant', 'fullName email').populate('apartment', 'apartmentNumber');

    for (const agreement of expired) {
      agreement.status = 'Expired';
      await createNotification({
        type: 'Agreement Expired',
        message: `Rental agreement ${agreement.agreementId} expired on ${agreement.expiryDate.toLocaleDateString()}`,
        relatedTenant: agreement.tenant?._id,
        relatedApartment: agreement.apartment?._id,
        priority: 'High',
        eventKey: `agreement-expired-${agreement._id}`,
      });
      if (agreement.tenant?.email) {
        const result = await sendEmail({
          to: agreement.tenant.email,
          ...templates.agreementExpiredEmail({
            fullName: agreement.tenant.fullName,
            agreementId: agreement.agreementId,
            expiryDate: agreement.expiryDate.toLocaleDateString(),
            apartmentNumber: agreement.apartment?.apartmentNumber || '—',
          }),
        });
        if (result.success) {
          agreement.expiryNotificationSentAt = new Date();
          agreement.expiryNotificationError = undefined;
        } else {
          agreement.expiryNotificationError = result.error;
          console.error(`[Cron] Agreement expiry email failed for ${agreement.agreementId}:`, result.error);
        }
      } else {
        agreement.expiryNotificationError = 'Tenant has no email address';
      }
      await agreement.save();
    }

    console.log(`[Cron] Agreement check done: ${expiringSoon.length} expiring soon, ${expired.length} newly expired.`);
  } catch (error) {
    console.error('[Cron] checkAgreementExpiry error:', error.message);
  }
}

async function sendRentReminders() {
  try {
    console.log('[Cron] Sending rent reminders...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysOut = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const upcoming = await Payment.find({
      status: 'Pending',
      dueDate: { $gte: today, $lte: threeDaysOut },
      rentReminderSentAt: { $exists: false },
    }).populate('tenant', 'fullName email phone').populate('apartment', 'apartmentNumber');

    for (const payment of upcoming) {
      if (!payment.tenant) continue;
      await createNotification({
        type: 'Rent Due',
        message: `Rent of INR ${payment.amount} is due on ${payment.dueDate.toLocaleDateString()}`,
        relatedTenant: payment.tenant._id,
        relatedApartment: payment.apartment?._id,
        priority: 'High',
        eventKey: `rent-reminder-${payment._id}`,
      });

      const emailResult = payment.tenant.email
        ? await sendEmail({
          to: payment.tenant.email,
          ...templates.paymentReminderEmail({
            fullName: payment.tenant.fullName,
            amount: payment.amount,
            dueDate: payment.dueDate.toLocaleDateString(),
            apartmentNumber: payment.apartment?.apartmentNumber || '—',
          }),
        })
        : { success: false, error: 'Tenant has no email address' };

      if (emailResult.success) {
        payment.rentReminderSentAt = new Date();
        payment.rentReminderError = undefined;
      } else {
        payment.rentReminderError = emailResult.error;
        console.error(`[Cron] Rent reminder email failed for payment ${payment._id}:`, emailResult.error);
      }

      if (payment.tenant.phone && !payment.rentReminderWhatsAppSentAt) {
        const result = await sendWhatsApp(payment.tenant.phone, waTemplates.rentReminder({
          fullName: payment.tenant.fullName,
          amount: payment.amount,
          dueDate: payment.dueDate.toLocaleDateString(),
          apartmentNumber: payment.apartment?.apartmentNumber || '—',
        }));
        if (result.success) payment.rentReminderWhatsAppSentAt = new Date();
      }
      await payment.save();
    }
    console.log(`[Cron] Rent reminder emails accepted: ${upcoming.filter((payment) => payment.rentReminderSentAt).length}`);
  } catch (error) {
    console.error('[Cron] sendRentReminders error:', error.message);
  }
}

function startCronJobs() {
  cron.schedule('0 8 * * *', checkAgreementExpiry);
  cron.schedule('0 9 * * *', sendRentReminders);
  console.log('[Cron] Scheduled jobs started.');
}

module.exports = { startCronJobs, checkAgreementExpiry, sendRentReminders };
