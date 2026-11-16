const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { protectTenant } = require('../middleware/authMiddleware');
const Payment = require('../models/Payment');
const RentalAgreement = require('../models/RentalAgreement');
const SecurityDeposit = require('../models/SecurityDeposit');
const Notification = require('../models/Notification');
const MaintenanceRequest = require('../models/MaintenanceRequest');
const VacatingRequest = require('../models/VacatingRequest');
const History = require('../models/History');
const Tenant = require('../models/Tenant');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates } = require('../services/emailService');
const { sendWhatsApp, templates: waTemplates } = require('../services/whatsappService');
const { downloadTenantAgreement } = require('../controllers/agreementController');
const { resolveMaintenancePhoto, sendMaintenancePhoto } = require('../services/maintenancePhotoService');
const {
  createTenantDocument,
  getTenantDocuments,
  downloadTenantDocument,
} = require('../controllers/tenantDocumentController');

const router = express.Router();
const configuredUploadLimit = Number.parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);
const uploadLimit = Number.isSafeInteger(configuredUploadLimit) && configuredUploadLimit > 0
  ? configuredUploadLimit
  : 5 * 1024 * 1024;

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimit },
  fileFilter: (req, file, callback) => {
    const supported = {
      'application/pdf': /\.pdf$/i,
      'image/jpeg': /\.jpe?g$/i,
      'image/png': /\.png$/i,
    };
    const extension = supported[file.mimetype];
    if (!extension || !extension.test(file.originalname)) {
      const error = new Error('Only PDF, JPEG, and PNG documents are allowed');
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

router.get('/maintenance/:id/photos/:photoIndex', protectTenant, async (req, res, next) => {
  try {
    const photoIndex = Number(req.params.photoIndex);
    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      const error = new Error('Invalid photo index');
      error.statusCode = 400;
      return next(error);
    }
    const request = await MaintenanceRequest.findOne({
      _id: req.params.id,
      tenant: req.tenant._id,
    }).select('photos');
    const filePath = request && resolveMaintenancePhoto(request.photos[photoIndex]);
    if (!filePath) {
      const error = new Error('Maintenance photo not found');
      error.statusCode = 404;
      return next(error);
    }
    sendMaintenancePhoto(res, filePath, next);
  } catch (error) {
    next(error);
  }
});

function handleDocumentUpload(req, res, next) {
  documentUpload.single('document')(req, res, (error) => {
    if (!error) return next();
    if (!error.statusCode) error.statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    next(error);
  });
}

// ── Multer setup for maintenance photo uploads ────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../uploads/maintenance');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `maint_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxSize = uploadLimit;

const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`));
    }
  },
});

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/me', protectTenant, (req, res) => {
  res.json({ success: true, data: req.tenant });
});

router.put('/me', protectTenant, async (req, res, next) => {
  try {
    const { fullName, phone, address, emergencyContact, identification } = req.body;
    const tenant = await Tenant.findById(req.tenant._id);
    if (!tenant) { const e = new Error('Not found'); e.statusCode = 404; return next(e); }
    if (fullName) tenant.fullName = fullName;
    if (phone) tenant.phone = phone;
    if (address) tenant.address = address;
    if (emergencyContact !== undefined) tenant.emergencyContact = emergencyContact;
    if (identification !== undefined) tenant.identification = identification;
    await tenant.save();
    res.json({ success: true, data: tenant });
  } catch (e) { next(e); }
});

// ── Payments ──────────────────────────────────────────────────────────────────
router.get('/payments', protectTenant, async (req, res, next) => {
  try {
    const payments = await Payment.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ paymentDate: -1 });
    res.json({ success: true, data: payments });
  } catch (e) { next(e); }
});

// ── Rental Agreements ─────────────────────────────────────────────────────────
router.get('/agreements', protectTenant, async (req, res, next) => {
  try {
    const agreements = await RentalAgreement.find({ tenant: req.tenant._id })
      .select('-documentData')
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber buildingDetails floorDetails')
      .sort({ startDate: -1 });
    res.json({ success: true, data: agreements });
  } catch (e) { next(e); }
});
router.get('/agreements/:id/document', protectTenant, downloadTenantAgreement);

// ── Private tenant documents ──────────────────────────────────────────────────
router.get('/documents', protectTenant, getTenantDocuments);
router.post('/documents', protectTenant, handleDocumentUpload, createTenantDocument);
router.get('/documents/:id/download', protectTenant, downloadTenantDocument);

// ── Security Deposits ─────────────────────────────────────────────────────────
router.get('/deposits', protectTenant, async (req, res, next) => {
  try {
    const deposits = await SecurityDeposit.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber');
    res.json({ success: true, data: deposits });
  } catch (e) { next(e); }
});

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', protectTenant, async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      relatedTenant: req.tenant._id,
      audience: { $ne: 'admin' },
    }).sort({ createdAt: -1 }).limit(50);
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ success: true, data: notifications, unreadCount });
  } catch (e) { next(e); }
});

router.put('/notifications/:id/read', protectTenant, async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      relatedTenant: req.tenant._id,
      audience: { $ne: 'admin' },
    });
    if (!notification) { const e = new Error('Not found'); e.statusCode = 404; return next(e); }
    notification.read = true;
    await notification.save();
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.put('/notifications/mark-all-read', protectTenant, async (req, res, next) => {
  try {
    await Notification.updateMany({
      relatedTenant: req.tenant._id,
      audience: { $ne: 'admin' },
      read: false,
    }, { $set: { read: true } });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Maintenance Requests ──────────────────────────────────────────────────────
router.get('/maintenance', protectTenant, async (req, res, next) => {
  try {
    const requests = await MaintenanceRequest.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ requestDate: -1 });
    res.json({ success: true, data: requests });
  } catch (e) { next(e); }
});

router.get('/maintenance/:id', protectTenant, async (req, res, next) => {
  try {
    const request = await MaintenanceRequest.findOne({ _id: req.params.id, tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber');
    if (!request) { const e = new Error('Not found'); e.statusCode = 404; return next(e); }
    res.json({ success: true, data: request });
  } catch (e) { next(e); }
});

router.post('/maintenance', protectTenant, upload.array('photos', 5), async (req, res, next) => {
  try {
    const { title, description, priority, category } = req.body;
    if (!title || !description) {
      const err = new Error('Title and description are required');
      err.statusCode = 400;
      // Clean up any uploaded files if validation fails
      if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
      return next(err);
    }
    if (!req.tenant.apartment) {
      const err = new Error('You are not assigned to an apartment');
      err.statusCode = 400;
      if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
      return next(err);
    }

    const photos = req.files ? req.files.map(f => f.filename) : [];

    const request = await MaintenanceRequest.create({
      apartment: req.tenant.apartment._id,
      tenant: req.tenant._id,
      title,
      description,
      category: category || 'Other',
      priority: priority || 'Medium',
      requestDate: new Date(),
      status: 'Pending',
      photos,
    });

    await createNotification({
      type: 'Maintenance Request',
      message: `New maintenance request: ${title}`,
      relatedTenant: req.tenant._id,
      relatedApartment: req.tenant.apartment._id,
      priority: 'Medium',
    });

    // Email + WhatsApp confirmation
    try {
      const emailData = templates.maintenanceSubmittedEmail({
        fullName: req.tenant.fullName,
        title,
        requestId: request._id.toString().slice(-8).toUpperCase(),
        priority: priority || 'Medium',
      });
      await sendEmail({ to: req.tenant.email, ...emailData });

      if (req.tenant.phone) {
        await sendWhatsApp(req.tenant.phone, waTemplates.maintenanceReceived({
          fullName: req.tenant.fullName,
          title,
          requestId: request._id.toString().slice(-8).toUpperCase(),
        }));
      }
    } catch (notifErr) {
      console.error('[TenantPortal/Maintenance] Notification failed:', notifErr.message);
    }

    res.status(201).json({ success: true, data: request });
  } catch (e) { next(e); }
});

// ── Vacating Requests ─────────────────────────────────────────────────────────
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
    if (!expectedVacatingDate) {
      const err = new Error('Expected vacating date is required');
      err.statusCode = 400;
      return next(err);
    }
    if (!req.tenant.apartment) {
      const err = new Error('You are not assigned to an apartment');
      err.statusCode = 400;
      return next(err);
    }

    const requestDate = new Date();
    const expectedDt = new Date(expectedVacatingDate);
    if (!Number.isFinite(expectedDt.getTime()) || expectedDt <= requestDate) {
      const err = new Error('Expected vacating date must be a valid future date');
      err.statusCode = 400;
      return next(err);
    }
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

    await createNotification({
      type: 'Vacating Request',
      message: `Vacating request submitted by ${req.tenant.fullName}`,
      relatedTenant: req.tenant._id,
      relatedApartment: req.tenant.apartment._id,
      priority: 'High',
    });
    await createNotification({
      type: 'New Vacating Request',
      message: `Vacating request from ${req.tenant.fullName} for apartment ${req.tenant.apartment.apartmentNumber}`,
      relatedTenant: req.tenant._id,
      relatedApartment: req.tenant.apartment._id,
      priority: 'High',
      audience: 'admin',
    });
    let tenantEmailDelivery = { status: 'not_sent' };
    const tenantEmailResult = await sendEmail({
      to: req.tenant.email,
      ...templates.vacatingRequestEmail({
        fullName: req.tenant.fullName,
        expectedVacatingDate: expectedDt.toLocaleDateString(),
        status,
        adminComments: status === 'Rejected'
          ? 'A minimum of 60 days notice is required. Please submit a new request with a later date.'
          : '',
      }),
    });
    tenantEmailDelivery = {
      status: tenantEmailResult.success ? 'sent' : tenantEmailResult.notConfigured ? 'not_configured' : 'failed',
      error: tenantEmailResult.error,
    };
    let adminEmailDelivery = { status: 'not_configured', error: 'ADMIN_EMAIL is not configured' };
    if (process.env.ADMIN_EMAIL) {
      const emailResult = await sendEmail({
        to: process.env.ADMIN_EMAIL,
        ...templates.vacatingAdminEmail({
          fullName: req.tenant.fullName,
          email: req.tenant.email,
          apartmentNumber: req.tenant.apartment.apartmentNumber,
          expectedVacatingDate: expectedDt.toLocaleDateString(),
          status,
        }),
      });
      if (!emailResult.success) {
        console.error('[TenantPortal/Vacating] Admin email notification failed:', emailResult.error);
      }
      adminEmailDelivery = {
        status: emailResult.success ? 'sent' : emailResult.notConfigured ? 'not_configured' : 'failed',
        error: emailResult.error,
      };
    }

    const message = status === 'Rejected'
      ? `Request not accepted: minimum 60 days notice required. Earliest valid date: ${earliestValidDate.toISOString().split('T')[0]}`
      : 'Vacating request submitted successfully and is pending review.';

    res.status(201).json({
      success: true,
      data: vacatingRequest,
      message,
      tenantEmailDelivery,
      adminEmailDelivery,
    });
  } catch (e) { next(e); }
});

// ── History ───────────────────────────────────────────────────────────────────
router.get('/history', protectTenant, async (req, res, next) => {
  try {
    const history = await History.find({ tenant: req.tenant._id })
      .populate('apartment', 'apartmentNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: history });
  } catch (e) { next(e); }
});

// ── WhatsApp contact admin ────────────────────────────────────────────────────
router.post('/contact-admin', protectTenant, async (req, res, next) => {
  try {
    const { message, channel = 'whatsapp' } = req.body;
    if (typeof message !== 'string' || message.trim().length < 5 || message.trim().length > 500) {
      const err = new Error('Message must be between 5 and 500 characters');
      err.statusCode = 400;
      return next(err);
    }
    if (!['email', 'whatsapp', 'both'].includes(channel)) {
      const err = new Error('Choose email, WhatsApp, or both as the message channel');
      err.statusCode = 400;
      return next(err);
    }

    const cleanMessage = message.trim();
    const results = {};
    if (channel === 'email' || channel === 'both') {
      if (!process.env.ADMIN_EMAIL) {
        results.email = { success: false, error: 'Admin email is not configured' };
      } else {
        const { sendEmail, templates } = require('../services/emailService');
        results.email = await sendEmail({
          to: process.env.ADMIN_EMAIL,
          ...templates.tenantContactEmail({
            tenantName: req.tenant.fullName,
            tenantEmail: req.tenant.email,
            tenantPhone: req.tenant.phone,
            message: cleanMessage,
          }),
        });
      }
    }
    if (channel === 'whatsapp' || channel === 'both') {
      if (!process.env.ADMIN_WHATSAPP_PHONE) {
        results.whatsapp = { success: false, error: 'Admin WhatsApp is not configured' };
      } else {
        results.whatsapp = await sendWhatsApp(process.env.ADMIN_WHATSAPP_PHONE, waTemplates.contactAdmin({
          tenantName: req.tenant.fullName,
          phone: req.tenant.phone,
          message: cleanMessage,
        }));
      }
    }

    const successfulChannels = Object.entries(results)
      .filter(([, result]) => result.success)
      .map(([name]) => name);
    const sent = successfulChannels.length > 0;
    if (!sent) {
      const allUnconfigured = Object.values(results).every((result) => result.error?.includes('not configured'));
      const err = new Error(allUnconfigured
        ? 'No selected contact channel is configured. Please contact your property manager.'
        : 'The message could not be delivered. Please try again later.');
      err.statusCode = allUnconfigured ? 503 : 502;
      return next(err);
    }

    await createNotification({
      type: 'Tenant Message',
      message: `Message from ${req.tenant.fullName}: ${cleanMessage.substring(0, 100)}`,
      relatedTenant: req.tenant._id,
      priority: 'Medium',
    });

    const deliveredChannels = successfulChannels;
    const loggedChannels = Object.entries(results)
      .filter(([, result]) => result.devMode)
      .map(([name]) => name);
    const partiallyDelivered = Object.values(results).some((result) => !result.success && !result.devMode);
    let deliveryMessage = 'Message sent to admin.';
    if (deliveredChannels.length && loggedChannels.length) {
      deliveryMessage = `Message sent using ${deliveredChannels.join(' and ')}; ${loggedChannels.join(' and ')} was logged in development mode only.`;
    } else if (loggedChannels.length) {
      deliveryMessage = 'Message logged in development mode; no message was delivered.';
    } else if (partiallyDelivered) {
      deliveryMessage = `Message sent using ${deliveredChannels.join(' and ')}; another selected channel was unavailable.`;
    }
    res.json({
      success: true,
      results,
      message: deliveryMessage,
    });
  } catch (e) { next(e); }
});

module.exports = router;
