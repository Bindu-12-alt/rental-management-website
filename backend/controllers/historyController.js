const History = require('../models/History');

async function getHistory(req, res, next) {
  try {
    const { type, tenant, apartment, startDate, endDate } = req.query;
    const query = {};
    if (type) query.type = type;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    const history = await History.find(query)
      .populate('tenant', 'fullName')
      .populate('apartment', 'apartmentNumber')
      .populate('relatedAgreement', 'agreementId')
      .populate('relatedPayment', 'amount')
      .populate('relatedDeposit', 'amount')
      .populate('relatedVacating', 'status')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHistory };