const VacatingRequest = require('../models/VacatingRequest');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const SecurityDeposit = require('../models/SecurityDeposit');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates } = require('../services/emailService');
const { sendWhatsApp, templates: waTemplates } = require('../services/whatsappService');

async function sendVacatingDecisionEmail(requestId) {
  const now = new Date();
  const request = await VacatingRequest.findOneAndUpdate({
    _id: requestId,
    status: { $in: ['Approved', 'Rejected'] },
    $or: [
      { decisionEmailStatus: { $nin: ['sending', 'sent'] } },
      { decisionEmailStatus: 'sending', decisionEmailSendingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      { decisionEmailStatus: 'sending', decisionEmailSendingAt: null },
    ],
  }, {
    $set: { decisionEmailStatus: 'sending', decisionEmailSendingAt: now, decisionEmailError: null },
    $inc: { decisionEmailAttempts: 1 },
  }, { new: true });

  if (!request) {
    const current = await VacatingRequest.findById(requestId)
      .select('decisionEmailStatus decisionEmailSentAt decisionEmailError');
    return current
      ? { status: current.decisionEmailStatus, sentAt: current.decisionEmailSentAt, error: current.decisionEmailError }
      : { status: 'not_found' };
  }

  try {
    const tenant = await Tenant.findById(request.tenant).select('fullName email');
    if (!tenant || !tenant.email) throw new Error('Tenant has no deliverable email address');
    const result = await sendEmail({
      to: tenant.email,
      ...templates.vacatingRequestEmail({
        fullName: tenant.fullName,
        expectedVacatingDate: request.expectedVacatingDate.toLocaleDateString(),
        status: request.status,
        adminComments: request.adminComments,
      }),
    });
    request.decisionEmailStatus = result.success ? 'sent' : result.notConfigured ? 'not_configured' : 'failed';
    request.decisionEmailSendingAt = null;
    request.decisionEmailSentAt = result.success ? new Date() : undefined;
    request.decisionEmailError = result.success ? undefined : result.error;
    await request.save();
    return {
      status: request.decisionEmailStatus,
      sentAt: request.decisionEmailSentAt,
      error: request.decisionEmailError,
    };
  } catch (error) {
    request.decisionEmailStatus = 'failed';
    request.decisionEmailSendingAt = null;
    request.decisionEmailError = error.message;
    await request.save();
    console.error('[Vacating] Decision email failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

function dateDiffDays(start, end) {
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function getVacatingRequests(req, res, next) {
  try {
    const { status, tenant, apartment } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;

    const requests = await VacatingRequest.find(query)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
}

async function createVacatingRequest(req, res, next) {
  try {
    const { tenant, apartment, requestDate, expectedVacatingDate, adminComments } = req.body;
    if (!tenant || !apartment || !requestDate || !expectedVacatingDate) {
      const err = new Error('Tenant, apartment, request date and expected vacating date are required');
      err.statusCode = 400;
      return next(err);
    }

    const requestDt = new Date(requestDate);
    const expectedDt = new Date(expectedVacatingDate);
    if (expectedDt <= requestDt) {
      const err = new Error('Expected vacating date must be after request date');
      err.statusCode = 400;
      return next(err);
    }

    const noticePeriodDays = dateDiffDays(requestDt, expectedDt);
    const earliestValidDate = new Date(requestDt);
    earliestValidDate.setDate(earliestValidDate.getDate() + 60);

    const status = noticePeriodDays >= 60 ? 'Pending' : 'Rejected';
    const vacatingRequest = await VacatingRequest.create({
      tenant,
      apartment,
      requestDate: requestDt,
      expectedVacatingDate: expectedDt,
      noticePeriodDays,
      status,
      adminComments: adminComments || '',
      earliestValidDate,
    });

    await History.create({
      type: 'Vacating Request',
      title: `Vacating request created`,
      description: `Notice period ${noticePeriodDays} days`,
      tenant,
      apartment,
      relatedVacating: vacatingRequest._id,
    });

    await createNotification({
      type: 'Vacating Request',
      message: `Vacating request from apartment ${apartment}`,
      relatedTenant: tenant,
      relatedApartment: apartment,
      priority: 'High',
    });

    const responseMessage = status === 'Rejected'
      ? `Vacating request rejected: notice period must be at least 60 days. Earliest valid date is ${earliestValidDate.toISOString().split('T')[0]}`
      : 'Vacating request submitted and pending approval';

    res.status(201).json({ success: true, data: vacatingRequest, message: responseMessage });
  } catch (error) {
    next(error);
  }
}

async function getVacatingRequestById(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber');
    if (!request) {
      const err = new Error('Vacating request not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function updateVacatingRequest(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id);
    if (!request) {
      const err = new Error('Vacating request not found');
      err.statusCode = 404;
      return next(err);
    }
    const { expectedVacatingDate, adminComments } = req.body;
    if (expectedVacatingDate) request.expectedVacatingDate = new Date(expectedVacatingDate);
    if (adminComments !== undefined) request.adminComments = adminComments;
    await request.save();
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function approveVacatingRequest(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id);
    if (!request) {
      const err = new Error('Vacating request not found');
      err.statusCode = 404;
      return next(err);
    }
    if (request.status === 'Rejected') {
      const err = new Error('Cannot approve a rejected request');
      err.statusCode = 400;
      return next(err);
    }
    const alreadyApproved = request.status === 'Approved';
    request.status = 'Approved';
    await request.save();

    const apartment = await Apartment.findById(request.apartment);
    if (apartment) {
      apartment.status = 'Vacating Soon';
      await apartment.save();
    }

    await History.create({
      type: 'Vacating Approved',
      title: `Vacating request approved`,
      description: `Request approved for apartment ${request.apartment}`,
      tenant: request.tenant,
      apartment: request.apartment,
      relatedVacating: request._id,
    });

    await createNotification({
      type: 'Vacating Approved',
      message: `Vacating approved for apartment ${request.apartment}`,
      relatedTenant: request.tenant,
      relatedApartment: request.apartment,
      priority: 'High',
    });

    // Email + WhatsApp
    try {
      const tenantDoc = await Tenant.findById(request.tenant).select('fullName email phone');
      if (tenantDoc) {
        if (tenantDoc.phone && !alreadyApproved) {
          await sendWhatsApp(tenantDoc.phone, waTemplates.vacatingUpdate({
            fullName: tenantDoc.fullName,
            status: 'Approved',
            expectedVacatingDate: request.expectedVacatingDate.toLocaleDateString(),
          }));
        }
      }
    } catch (notifErr) {
      console.error('[Vacating] Approval notification failed:', notifErr.message);
    }

    const emailDelivery = await sendVacatingDecisionEmail(request._id);
    res.json({ success: true, data: request, emailDelivery });
  } catch (error) {
    next(error);
  }
}

async function rejectVacatingRequest(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id);
    if (!request) {
      const err = new Error('Vacating request not found');
      err.statusCode = 404;
      return next(err);
    }
    request.status = 'Rejected';
    request.adminComments = req.body.adminComments || request.adminComments;
    await request.save();

    await History.create({
      type: 'Vacating Rejected',
      title: `Vacating request rejected`,
      description: req.body.adminComments || 'Rejected by admin',
      tenant: request.tenant,
      apartment: request.apartment,
      relatedVacating: request._id,
    });

    await createNotification({
      type: 'Vacating Rejected',
      message: `Vacating request rejected for apartment ${request.apartment}`,
      relatedTenant: request.tenant,
      relatedApartment: request.apartment,
      priority: 'Medium',
    });

    const emailDelivery = await sendVacatingDecisionEmail(request._id);
    res.json({ success: true, data: request, emailDelivery });
  } catch (error) {
    next(error);
  }
}

async function completeVacatingRequest(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id);
    if (!request) {
      const err = new Error('Vacating request not found');
      err.statusCode = 404;
      return next(err);
    }
    if (request.status !== 'Approved') {
      const err = new Error('Only approved requests can be completed');
      err.statusCode = 400;
      return next(err);
    }

    request.status = 'Completed';
    await request.save();

    const apartment = await Apartment.findById(request.apartment);
    const tenant = await Tenant.findById(request.tenant);
    if (apartment) {
      apartment.status = 'Empty';
      apartment.currentTenant = null;
      apartment.rentalStartDate = undefined;
      await apartment.save();
    }
    if (tenant) {
      tenant.status = 'Former';
      tenant.apartment = null;
      await tenant.save();
    }

    const deposit = await SecurityDeposit.findOne({ tenant: request.tenant, apartment: request.apartment }).sort({ createdAt: -1 });
    if (deposit && deposit.refundStatus === 'Pending') {
      deposit.refundStatus = 'Pending';
      await deposit.save();
    }

    await History.create({
      type: 'Vacating Completed',
      title: `Tenant moved out`,
      description: `Final move-out completed for apartment ${request.apartment}`,
      tenant: request.tenant,
      apartment: request.apartment,
      relatedVacating: request._id,
    });

    await createNotification({
      type: 'Move-Out Completed',
      message: `Tenant move-out completed for apartment ${request.apartment}`,
      relatedTenant: request.tenant,
      relatedApartment: request.apartment,
      priority: 'Medium',
    });

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function retryVacatingDecisionEmail(req, res, next) {
  try {
    const request = await VacatingRequest.findById(req.params.id).select('status');
    if (!request) {
      const error = new Error('Vacating request not found');
      error.statusCode = 404;
      return next(error);
    }
    if (!['Approved', 'Rejected'].includes(request.status)) {
      const error = new Error('Only approved or rejected requests have a decision email');
      error.statusCode = 400;
      return next(error);
    }
    const emailDelivery = await sendVacatingDecisionEmail(request._id);
    const statusCode = emailDelivery.status === 'failed' ? 502 : emailDelivery.status === 'not_configured' ? 503 : 200;
    const message = emailDelivery.status === 'sent'
      ? 'Vacating decision email accepted by SMTP.'
      : emailDelivery.error || 'Vacating decision email was not sent.';
    res.status(statusCode).json({
      success: emailDelivery.status === 'sent',
      emailDelivery,
      message,
      ...(emailDelivery.status === 'sent' ? {} : { error: message }),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getVacatingRequests,
  getVacatingRequestById,
  createVacatingRequest,
  updateVacatingRequest,
  approveVacatingRequest,
  rejectVacatingRequest,
  completeVacatingRequest,
  retryVacatingDecisionEmail,
};