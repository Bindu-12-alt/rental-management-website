const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates } = require('../services/emailService');
const { sendWhatsApp, templates: waTemplates } = require('../services/whatsappService');

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
    if (amount < 0) {
      const err = new Error('Payment amount must be a positive number');
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

    // Send payment confirmation email + WhatsApp when payment is confirmed Paid
    if (paymentStatus === 'Paid') {
      try {
        const tenantDoc = await Tenant.findById(tenant).select('fullName email phone');
        const aptDoc = await Apartment.findById(apartment).select('apartmentNumber');
        if (tenantDoc) {
          const emailData = templates.paymentConfirmationEmail({
            fullName: tenantDoc.fullName,
            amount,
            paymentDate: new Date(paymentDate).toLocaleDateString(),
            transactionId,
            apartmentNumber: aptDoc?.apartmentNumber || '—',
          });
          await sendEmail({ to: tenantDoc.email, ...emailData });

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

    res.status(201).json({ success: true, data: payment });
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
    if (amount != null && amount < 0) {
      const err = new Error('Payment amount must be positive');
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

    // Send confirmation if status changed to Paid
    if (payment.status === 'Paid' && oldStatus !== 'Paid') {
      try {
        const tenantDoc = await Tenant.findById(payment.tenant).select('fullName email phone');
        const aptDoc = await Apartment.findById(payment.apartment).select('apartmentNumber');
        if (tenantDoc) {
          const emailData = templates.paymentConfirmationEmail({
            fullName: tenantDoc.fullName,
            amount: payment.amount,
            paymentDate: payment.paymentDate.toLocaleDateString(),
            transactionId: payment.transactionId,
            apartmentNumber: aptDoc?.apartmentNumber || '—',
          });
          await sendEmail({ to: tenantDoc.email, ...emailData });
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

    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
}

module.exports = { getPayments, getPaymentById, createPayment, updatePayment };
