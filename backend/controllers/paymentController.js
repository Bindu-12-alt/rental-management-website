const Payment = require('../models/Payment');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');

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
    const { tenant, apartment, amount, paymentDate, dueDate, method, transactionId, status } = req.body;
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
      tenant,
      apartment,
      amount,
      paymentDate: new Date(paymentDate),
      dueDate: new Date(dueDate),
      method,
      transactionId,
      status: paymentStatus,
    });

    await History.create({
      type: 'Rent Payment',
      title: `Payment ${payment._id} recorded`,
      description: `Recorded rent payment of ${amount}`,
      tenant,
      apartment,
      relatedPayment: payment._id,
    });

    if (paymentStatus === 'Pending' || paymentStatus === 'Overdue') {
      await createNotification({
        type: paymentStatus === 'Overdue' ? 'Overdue Payment' : 'Pending Payment',
        message: `Rent payment ${paymentStatus.toLowerCase()} for apartment ${apartment}`,
        relatedTenant: tenant,
        relatedApartment: apartment,
        priority: paymentStatus === 'Overdue' ? 'High' : 'Medium',
      });
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

    const { amount, paymentDate, dueDate, method, transactionId, status } = req.body;
    if (amount != null && amount < 0) {
      const err = new Error('Payment amount must be positive');
      err.statusCode = 400;
      return next(err);
    }

    Object.assign(payment, {
      amount: amount ?? payment.amount,
      paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
      dueDate: dueDate ? new Date(dueDate) : payment.dueDate,
      method: method ?? payment.method,
      transactionId: transactionId ?? payment.transactionId,
      status: status ?? payment.status,
    });

    if (!status) {
      if (payment.paymentDate > payment.dueDate) payment.status = 'Overdue';
      else if (payment.paymentDate <= payment.dueDate) payment.status = 'Paid';
    }

    await payment.save();
    await History.create({
      type: 'Payment Updated',
      title: `Payment ${payment._id} updated`,
      description: 'Updated payment record',
      tenant: payment.tenant,
      apartment: payment.apartment,
      relatedPayment: payment._id,
    });
    res.json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
}

module.exports = { getPayments, getPaymentById, createPayment, updatePayment };