const { createNotification } = require('./notificationService');
const { sendEmail, templates } = require('./emailService');
const Tenant = require('../models/Tenant');

async function sendTenantWelcomeEmail(tenantId) {
  const now = new Date();
  const tenant = await Tenant.findOneAndUpdate({
    _id: tenantId,
    $or: [
      { welcomeEmailStatus: { $nin: ['sending', 'sent'] } },
      { welcomeEmailStatus: 'sending', welcomeEmailSendingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      { welcomeEmailStatus: 'sending', welcomeEmailSendingAt: null },
    ],
  }, {
    $set: { welcomeEmailStatus: 'sending', welcomeEmailSendingAt: now, welcomeEmailError: null },
    $inc: { welcomeEmailAttempts: 1 },
  }, { new: true });

  if (!tenant) {
    const current = await Tenant.findById(tenantId).select('welcomeEmailStatus welcomeEmailSentAt welcomeEmailError');
    return current
      ? {
        status: current.welcomeEmailStatus,
        sentAt: current.welcomeEmailSentAt,
        error: current.welcomeEmailError,
        duplicatePrevented: current.welcomeEmailStatus === 'sent' || current.welcomeEmailStatus === 'sending',
      }
      : { status: 'not_found' };
  }

  try {
    const result = await sendEmail({
      to: tenant.email,
      ...templates.welcomeEmail({ fullName: tenant.fullName, email: tenant.email }),
    });
    tenant.welcomeEmailStatus = result.success ? 'sent' : result.notConfigured ? 'not_configured' : 'failed';
    tenant.welcomeEmailSendingAt = null;
    tenant.welcomeEmailSentAt = result.success ? new Date() : undefined;
    tenant.welcomeEmailError = result.success ? undefined : result.error;
    await tenant.save();
    return {
      status: tenant.welcomeEmailStatus,
      sentAt: tenant.welcomeEmailSentAt,
      error: tenant.welcomeEmailError,
    };
  } catch (error) {
    tenant.welcomeEmailStatus = 'failed';
    tenant.welcomeEmailSendingAt = null;
    tenant.welcomeEmailError = error.message;
    await tenant.save();
    console.error('[Auth] Welcome email failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

async function notifyTenantRegistration(tenant) {
  const adminNotification = await createNotification({
    type: 'New Tenant Registration',
    message: `${tenant.fullName} registered with ${tenant.email}`,
    relatedTenant: tenant._id,
    priority: 'High',
    audience: 'admin',
  });

  const welcome = await sendTenantWelcomeEmail(tenant._id);

  const adminEmail = process.env.ADMIN_EMAIL
    ? await sendEmail({
      to: process.env.ADMIN_EMAIL,
      ...templates.newTenantRegistrationEmail({ fullName: tenant.fullName, email: tenant.email }),
    })
    : { success: false, notConfigured: true, error: 'ADMIN_EMAIL is not configured' };

  return {
    welcomeEmail: {
      status: welcome.status,
      error: welcome.error,
    },
    adminNotification: { status: 'created', id: adminNotification._id },
    adminEmail: {
      status: adminEmail.success ? 'sent' : adminEmail.notConfigured ? 'not_configured' : 'failed',
      error: adminEmail.error,
    },
  };
}

module.exports = { notifyTenantRegistration, sendTenantWelcomeEmail };
