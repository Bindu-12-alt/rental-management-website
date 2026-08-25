const Apartment = require('../models/Apartment');
const Tenant = require('../models/Tenant');
const Payment = require('../models/Payment');
const RentalAgreement = require('../models/RentalAgreement');
const VacatingRequest = require('../models/VacatingRequest');
const SecurityDeposit = require('../models/SecurityDeposit');
const Notification = require('../models/Notification');
const History = require('../models/History');

async function getDashboardStats(req, res, next) {
  try {
    const totalApartments = await Apartment.countDocuments();
    const occupiedApartments = await Apartment.countDocuments({ status: 'Occupied' });
    const emptyApartments = await Apartment.countDocuments({ status: 'Empty' });
    const vacatingSoon = await Apartment.countDocuments({ status: 'Vacating Soon' });
    const totalTenants = await Tenant.countDocuments({ status: 'Active' });
    const pendingRent = await Payment.countDocuments({ status: 'Pending' });
    const overdueRent = await Payment.countDocuments({ status: 'Overdue' });
    const upcomingRenewals = await RentalAgreement.countDocuments({ status: 'Expiring Soon' });
    const pendingVacatingRequests = await VacatingRequest.countDocuments({ status: 'Pending' });
    const pendingDepositRefunds = await SecurityDeposit.countDocuments({ refundStatus: { $in: ['Pending', 'Partial'] } });

    res.json({
      success: true,
      data: {
        totalApartments,
        occupiedApartments,
        emptyApartments,
        vacatingSoon,
        totalTenants,
        pendingRent,
        overdueRent,
        upcomingRenewals,
        pendingVacatingRequests,
        pendingDepositRefunds,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getRecentActivities(req, res, next) {
  try {
    const activities = await History.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('tenant', 'fullName')
      .populate('apartment', 'apartmentNumber')
      .populate('relatedAgreement', 'agreementId')
      .populate('relatedPayment', 'amount')
      .populate('relatedDeposit', 'amount')
      .populate('relatedVacating', 'status');

    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboardStats, getRecentActivities };