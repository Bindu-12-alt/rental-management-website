const SecurityDeposit = require('../models/SecurityDeposit');
const Tenant = require('../models/Tenant');
const Apartment = require('../models/Apartment');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');

async function getDeposits(req, res, next) {
  try {
    const deposits = await SecurityDeposit.find()
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: deposits });
  } catch (error) {
    next(error);
  }
}

async function getDepositById(req, res, next) {
  try {
    const deposit = await SecurityDeposit.findById(req.params.id)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber');
    if (!deposit) {
      const err = new Error('Deposit not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: deposit });
  } catch (error) {
    next(error);
  }
}

async function createDeposit(req, res, next) {
  try {
    const { tenant, apartment, amount, paidDate, paymentStatus, conditionDetails } = req.body;
    if (!tenant || !apartment || amount == null || !paidDate) {
      const err = new Error('Tenant, apartment, amount, and paid date are required');
      err.statusCode = 400;
      return next(err);
    }
    if (amount < 0) {
      const err = new Error('Deposit amount must be positive');
      err.statusCode = 400;
      return next(err);
    }

    const deposit = await SecurityDeposit.create({
      tenant,
      apartment,
      amount,
      paidDate: new Date(paidDate),
      paymentStatus: paymentStatus || 'Paid',
      conditionDetails: conditionDetails || '',
      refundStatus: 'Pending',
    });

    await History.create({
      type: 'Deposit Paid',
      title: `Security deposit recorded`,
      description: `Deposit of ${amount} recorded for tenant ${tenant}`,
      tenant,
      apartment,
      relatedDeposit: deposit._id,
    });

    await createNotification({
      type: 'Deposit Payment',
      message: `Security deposit recorded for apartment ${apartment}`,
      relatedTenant: tenant,
      relatedApartment: apartment,
      priority: 'Medium',
    });

    res.status(201).json({ success: true, data: deposit });
  } catch (error) {
    next(error);
  }
}

async function updateDeposit(req, res, next) {
  try {
    const deposit = await SecurityDeposit.findById(req.params.id);
    if (!deposit) {
      const err = new Error('Deposit record not found');
      err.statusCode = 404;
      return next(err);
    }

    const { tenant, apartment, amount, paidDate, paymentStatus, conditionDetails, refundStatus } = req.body;
    if (amount != null && amount < 0) {
      const err = new Error('Deposit amount must be positive');
      err.statusCode = 400;
      return next(err);
    }

    Object.assign(deposit, {
      tenant: tenant ?? deposit.tenant,
      apartment: apartment ?? deposit.apartment,
      amount: amount != null ? amount : deposit.amount,
      paidDate: paidDate ? new Date(paidDate) : deposit.paidDate,
      paymentStatus: paymentStatus ?? deposit.paymentStatus,
      conditionDetails: conditionDetails ?? deposit.conditionDetails,
      refundStatus: refundStatus ?? deposit.refundStatus,
    });
    await deposit.save();

    await History.create({
      type: 'Deposit Updated',
      title: `Deposit ${deposit._id} updated`,
      description: 'Updated security deposit record',
      tenant: deposit.tenant,
      apartment: deposit.apartment,
      relatedDeposit: deposit._id,
    });

    res.json({ success: true, data: deposit });
  } catch (error) {
    next(error);
  }
}

async function refundDeposit(req, res, next) {
  try {
    const deposit = await SecurityDeposit.findById(req.params.id);
    if (!deposit) {
      const err = new Error('Deposit record not found');
      err.statusCode = 404;
      return next(err);
    }

    const { refundAmount, refundDate, deductions, refundStatus } = req.body;
    if (refundAmount == null) {
      const err = new Error('Refund amount is required');
      err.statusCode = 400;
      return next(err);
    }
    if (refundAmount < 0) {
      const err = new Error('Refund amount must be positive');
      err.statusCode = 400;
      return next(err);
    }
    if (refundAmount > deposit.amount) {
      const err = new Error('Refund amount cannot exceed the security deposit');
      err.statusCode = 400;
      return next(err);
    }

    deposit.refundAmount = refundAmount;
    deposit.refundDate = refundDate ? new Date(refundDate) : new Date();
    deposit.refundStatus = refundStatus || (refundAmount === deposit.amount ? 'Completed' : 'Partial');
    deposit.deductions = deductions || [];
    deposit.paymentStatus = 'Refunded';
    await deposit.save();

    await History.create({
      type: 'Deposit Refund',
      title: `Deposit refund processed`,
      description: `Refund of ${refundAmount} processed`,
      tenant: deposit.tenant,
      apartment: deposit.apartment,
      relatedDeposit: deposit._id,
    });

    await createNotification({
      type: 'Deposit Refund',
      message: `Deposit refund processed for apartment ${deposit.apartment}`,
      relatedTenant: deposit.tenant,
      relatedApartment: deposit.apartment,
      priority: 'Medium',
    });

    res.json({ success: true, data: deposit });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDeposits, getDepositById, createDeposit, updateDeposit, refundDeposit };