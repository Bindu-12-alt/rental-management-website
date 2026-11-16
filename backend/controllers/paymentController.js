const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates } = require('../services/emailService');
const { sendWhatsApp, templates: waTemplates } = require('../services/whatsappService');

function isNonNegativeAmount(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

async function sendPaymentConfirmationEmail(paymentId) {
  const now = new Date();
  const payment = await Payment.findOneAndUpdate({
    _id: paymentId,
    status: 'Paid',
    $or: [
      { confirmationEmailStatus: { $nin: ['sending', 'sent'] } },
      { confirmationEmailStatus: 'sending', confirmationEmailSendingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
      { confirmationEmailStatus: 'sending', confirmationEmailSendingAt: null },
    ],
  }, {
    $set: { confirmationEmailStatus: 'sending', confirmationEmailSendingAt: now, confirmationEmailError: null },
    $inc: { confirmationEmailAttempts: 1 },
  }, { new: true });

  if (!payment) {
    const current = await Payment.findById(paymentId).select('confirmationEmailStatus confirmationEmailSentAt confirmationEmailError');
    return current
      ? { status: current.confirmationEmailStatus, sentAt: current.confirmationEmailSentAt, error: current.confirmationEmailError }
      : { status: 'not_found' };
  }

  try {
    const tenant = await Tenant.findById(payment.tenant).select('fullName email phone');
    const apartment = await Apartment.findById(payment.apartment).select('apartmentNumber');
    if (!tenant || !tenant.email) throw new Error('Payment tenant has no deliverable email address');

    const result = await sendEmail({
      to: tenant.email,
      ...templates.paymentConfirmationEmail({
        fullName: tenant.fullName,
        amount: payment.amount,
        paymentDate: payment.paymentDate.toLocaleDateString(),
        transactionId: payment.transactionId,
        apartmentNumber: apartment?.apartmentNumber || '—',
      }),
    });
    payment.confirmationEmailStatus = result.success ? 'sent' : result.notConfigured ? 'not_configured' : 'failed';
    payment.confirmationEmailSendingAt = null;
    payment.confirmationEmailSentAt = result.success ? new Date() : undefined;
    payment.confirmationEmailMessageId = result.success ? result.messageId : undefined;
    payment.confirmationEmailError = result.success ? undefined : result.error;
    await payment.save();

    if (result.success) {
      try {
        await createNotification({
          type: 'Payment Confirmation',
          message: `Payment confirmation for INR ${payment.amount} was emailed to ${tenant.email}`,
          relatedTenant: tenant._id,
          relatedApartment: payment.apartment,
          eventKey: `payment-confirmation-${payment._id}`,
        });
      } catch (notificationError) {
        console.error('[Payment] Confirmation notification could not be recorded:', notificationError.message);
      }
    }
    return {
      status: payment.confirmationEmailStatus,
      sentAt: payment.confirmationEmailSentAt,
      error: payment.confirmationEmailError,
      messageId: payment.confirmationEmailMessageId,
    };
  } catch (error) {
    payment.confirmationEmailStatus = 'failed';
    payment.confirmationEmailSendingAt = null;
    payment.confirmationEmailError = error.message;
    await payment.save();
    console.error('[Payment] Confirmation email failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

async function getPayments(req, res, next) {
  try {
    const { search, status, tenant, apartment, startDate, endDate } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { method: new RegExp(search, 'i') },
        { transactionId: new RegExp(search, 'i') },
      ];
    }
    if (status) query.status = status;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;
    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) query.paymentDate.$gte = new Date(startDate);
      if (endDate) query.paymentDate.$lte = new Date(endDate);
    }

    const payments = await Payment.find(query)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .sort({ paymentDate: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
}

async function createPayment(req, res, next) {
  try {
    const { tenant, apartment, amount, paymentDate, dueDate, method, transactionId, status, notes } = req.body;
    if (!tenant || !apartment || amount == null || !paymentDate || !dueDate || !method) {
      const err = new Error('Tenant, apartment, amount, payment date, due date, and method are required');
      err.statusCode = 400;
      return next(err);
    }
    if (!isNonNegativeAmount(amount)) {
      const err = new Error('Payment amount must be a valid non-negative number');
      err.statusCode = 400;
      return next(err);
    }

    const paymentStatus = status || (new Date(paymentDate) > new Date(dueDate) ? 'Overdue' : 'Paid');
    const payment = await Payment.create({
      tenant, apartment, amount,
      paymentDate: new Date(paymentDate),
      dueDate: new Date(dueDate),
      method, transactionId, notes,
      status: paymentStatus,
    });

    await History.create({
      type: 'Rent Payment',
      title: `Payment recorded`,
      description: `Recorded rent payment of ₹${amount}`,
      tenant, apartment,
      relatedPayment: payment._id,
    });

    if (paymentStatus === 'Pending' || paymentStatus === 'Overdue') {
      await createNotification({
        type: paymentStatus === 'Overdue' ? 'Overdue Payment' : 'Pending Payment',
        message: `Rent payment ${paymentStatus.toLowerCase()} for apartment ${apartment}`,
        relatedTenant: tenant, relatedApartment: apartment,
        priority: paymentStatus === 'Overdue' ? 'High' : 'Medium',
      });
    }

    let emailDelivery = { status: 'not_sent' };
    if (paymentStatus === 'Paid') {
      emailDelivery = await sendPaymentConfirmationEmail(payment._id);
      try {
        const tenantDoc = await Tenant.findById(tenant).select('fullName email phone');
        const aptDoc = await Apartment.findById(apartment).select('apartmentNumber');
        if (tenantDoc) {
          if (tenantDoc.phone) {
            await sendWhatsApp(tenantDoc.phone, waTemplates.paymentConfirmed({
              fullName: tenantDoc.fullName,
              amount,
              paymentDate: new Date(paymentDate).toLocaleDateString(),
              apartmentNumber: aptDoc?.apartmentNumber || '—',
            }));
          }
        }
      } catch (notifErr) {
        console.error('[Payment] Confirmation notification failed:', notifErr.message);
      }
    }

    res.status(201).json({ success: true, data: payment, emailDelivery });
  } catch (error) {
    next(error);
  }
}

async function getPaymentById(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber');
    if (!payment) {
      const err = new Error('Payment not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
}

async function updatePayment(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      const err = new Error('Payment not found');
      err.statusCode = 404;
      return next(err);
    }

    const { amount, paymentDate, dueDate, method, transactionId, status, notes } = req.body;
    if (amount != null && !isNonNegativeAmount(amount)) {
      const err = new Error('Payment amount must be a valid non-negative number');
      err.statusCode = 400;
      return next(err);
    }

    const oldStatus = payment.status;

    Object.assign(payment, {
      amount: amount ?? payment.amount,
      paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
      dueDate: dueDate ? new Date(dueDate) : payment.dueDate,
      method: method ?? payment.method,
      transactionId: transactionId ?? payment.transactionId,
      notes: notes ?? payment.notes,
      status: status ?? payment.status,
    });

    // Only auto-derive status if not explicitly provided
    if (!status) {
      if (payment.paymentDate > payment.dueDate) payment.status = 'Overdue';
      else payment.status = 'Paid';
    }

    await payment.save();

    await History.create({
      type: 'Payment Updated',
      title: `Payment updated`,
      description: `Payment record updated — Status: ${payment.status}`,
      tenant: payment.tenant,
      apartment: payment.apartment,
      relatedPayment: payment._id,
    });

    let emailDelivery = { status: 'not_sent' };
    if (payment.status === 'Paid' && oldStatus !== 'Paid') {
      emailDelivery = await sendPaymentConfirmationEmail(payment._id);
      try {
        const tenantDoc = await Tenant.findById(payment.tenant).select('fullName email phone');
        const aptDoc = await Apartment.findById(payment.apartment).select('apartmentNumber');
        if (tenantDoc) {
          if (tenantDoc.phone) {
            await sendWhatsApp(tenantDoc.phone, waTemplates.paymentConfirmed({
              fullName: tenantDoc.fullName,
              amount: payment.amount,
              paymentDate: payment.paymentDate.toLocaleDateString(),
              apartmentNumber: aptDoc?.apartmentNumber || '—',
            }));
          }
        }
      } catch (notifErr) {
        console.error('[Payment] Update notification failed:', notifErr.message);
      }
    }

    res.json({ success: true, data: payment, emailDelivery });
  } catch (error) {
    next(error);
  }
}

async function retryPaymentConfirmation(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id).select('status');
    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      return next(error);
    }
    if (payment.status !== 'Paid') {
      const error = new Error('Only confirmed paid payments have a confirmation email');
      error.statusCode = 400;
      return next(error);
    }
    const emailDelivery = await sendPaymentConfirmationEmail(payment._id);
    const statusCode = emailDelivery.status === 'failed' ? 502 : emailDelivery.status === 'not_configured' ? 503 : 200;
    res.status(statusCode).json({
      success: emailDelivery.status === 'sent',
      emailDelivery,
      message: emailDelivery.status === 'sent'
        ? 'Payment confirmation email accepted by SMTP.'
        : emailDelivery.error || 'Payment confirmation email was not sent.',
      ...(emailDelivery.status === 'sent' ? {} : {
        error: emailDelivery.error || 'Payment confirmation email was not sent.',
      }),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getPayments, getPaymentById, createPayment, updatePayment, retryPaymentConfirmation };
