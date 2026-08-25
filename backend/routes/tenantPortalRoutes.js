const express = require('express');
const { protectTenant } = require('../middleware/authMiddleware');
const Payment = require('../models/Payment');
const RentalAgreement = require('../models/RentalAgreement');
const SecurityDeposit = require('../models/SecurityDeposit');
const Notification = require('../models/Notification');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const VacatingRequest = require('../models/VacatingRequest');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');
const router = express.Router();

router.get('/me', protectTenant, (req, res) => {
  res.json({ success: true, data: req.tenant });
});

router.get('/payments', protectTenant, async (req, res, next) => {
  try {
    const payments = await Payment.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ paymentDate: -1 });
    res.json({ success: true, data: payments });
  } catch (e) { next(e); }
});

router.get('/agreements', protectTenant, async (req, res, next) => {
  try {
    const agreements = await RentalAgreement.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber buildingDetails floorDetails')
      .sort({ startDate: -1 });
    res.json({ success: true, data: agreements });
  } catch (e) { next(e); }
});

router.get('/deposits', protectTenant, async (req, res, next) => {
  try {
    const deposits = await SecurityDeposit.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber');
    res.json({ success: true, data: deposits });
  } catch (e) { next(e); }
});

router.get('/notifications', protectTenant, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ relatedTenant: req.tenant._id }).sort({ createdAt: -1 });
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ success: true, data: notifications, unreadCount });
  } catch (e) { next(e); }
});

router.put('/notifications/:id/read', protectTenant, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) { const err = new Error('Not found'); err.statusCode = 404; return next(err); }
    notification.read = true;
    await notification.save();
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.get('/maintenance', protectTenant, async (req, res, next) => {
  try {
    const requests = await MaintenanceRequest.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ requestDate: -1 });
    res.json({ success: true, data: requests });
  } catch (e) { next(e); }
});

router.post('/maintenance', protectTenant, async (req, res, next) => {
  try {
    const { title, description, priority } = req.body;
    if (!title || !description) { const err = new Error('Title and description are required'); err.statusCode = 400; return next(err); }
    if (!req.tenant.apartment) { const err = new Error('You are not assigned to an apartment'); err.statusCode = 400; return next(err); }
    const request = await MaintenanceRequest.create({
      apartment: req.tenant.apartment._id,
      tenant: req.tenant._id,
      title, description,
      priority: priority || 'Medium',
      requestDate: new Date(),
      status: 'Pending',
    });
    await createNotification({ type: 'Maintenance Request', message: `New maintenance request: ${title}`, relatedTenant: req.tenant._id, relatedApartment: req.tenant.apartment._id, priority: 'Medium' });
    res.status(201).json({ success: true, data: request });
  } catch (e) { next(e); }
});

router.get('/vacating', protectTenant, async (req, res, next) => {
  try {
    const requests = await VacatingRequest.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (e) { next(e); }
});

router.post('/vacating', protectTenant, async (req, res, next) => {
  try {
    const { expectedVacatingDate } = req.body;
    if (!expectedVacatingDate) { const err = new Error('Expected vacating date is required'); err.statusCode = 400; return next(err); }
    if (!req.tenant.apartment) { const err = new Error('You are not assigned to an apartment'); err.statusCode = 400; return next(err); }
    const requestDate = new Date();
    const expectedDt = new Date(expectedVacatingDate);
    const noticePeriodDays = Math.ceil((expectedDt - requestDate) / (1000 * 60 * 60 * 24));
    const earliestValidDate = new Date(requestDate);
    earliestValidDate.setDate(earliestValidDate.getDate() + 60);
    const status = noticePeriodDays >= 60 ? 'Pending' : 'Rejected';
    const vacatingRequest = await VacatingRequest.create({
      tenant: req.tenant._id,
      apartment: req.tenant.apartment._id,
      requestDate,
      expectedVacatingDate: expectedDt,
      noticePeriodDays,
      status,
      earliestValidDate,
    });
    await createNotification({ type: 'Vacating Request', message: `Vacating request submitted by ${req.tenant.fullName}`, relatedTenant: req.tenant._id, relatedApartment: req.tenant.apartment._id, priority: 'High' });
    const message = status === 'Rejected'
      ? `Request rejected: minimum 60 days notice required. Earliest valid date: ${earliestValidDate.toISOString().split('T')[0]}`
      : 'Vacating request submitted successfully and pending approval.';
    res.status(201).json({ success: true, data: vacatingRequest, message });
  } catch (e) { next(e); }
});

router.get('/history', protectTenant, async (req, res, next) => {
  try {
    const history = await History.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (e) { next(e); }
});

module.exports = router;
