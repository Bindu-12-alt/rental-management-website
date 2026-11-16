const path = require('path');
const TenantDocument = require('../models/TenantDocument');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');
const {
  sendDocumentDecisionEmail,
  documentMimeFromBuffer,
} = require('../services/tenantDocumentService');

const ALLOWED_DOCUMENT_TYPES = ['Identity', 'Address Proof', 'Income Proof', 'Other'];

function getDownloadName(originalName) {
  const name = path.basename(path.win32.basename(originalName || 'tenant-document'))
    .replace(/[\r\n"]/g, '_')
    .slice(0, 180);
  return name || 'tenant-document';
}

function sendDocumentDownload(res, document) {
  res.type(document.mimeType);
  res.attachment(getDownloadName(document.originalName));
  res.set({
    'Content-Length': document.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(Buffer.from(document.documentData));
}

async function createTenantDocument(req, res, next) {
  try {
    if (!req.file) {
      const error = new Error('A PDF, JPEG, or PNG document is required');
      error.statusCode = 400;
      return next(error);
    }

    const detectedMime = documentMimeFromBuffer(req.file.buffer);
    if (!detectedMime || detectedMime !== req.file.mimetype) {
      const error = new Error('The uploaded file content does not match its file type');
      error.statusCode = 400;
      return next(error);
    }

    const documentType = typeof req.body.documentType === 'string' ? req.body.documentType.trim() : '';
    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      const error = new Error('Choose a valid document type');
      error.statusCode = 400;
      return next(error);
    }

    const document = await TenantDocument.create({
      tenant: req.tenant._id,
      apartment: req.tenant.apartment?._id || req.tenant.apartment || null,
      documentType,
      originalName: getDownloadName(req.file.originalname),
      mimeType: detectedMime,
      size: req.file.size,
      documentData: req.file.buffer,
    });

    await createNotification({
      type: 'Tenant Document Submitted',
      message: `${req.tenant.fullName} submitted a ${documentType} document for review.`,
      relatedTenant: req.tenant._id,
      relatedApartment: req.tenant.apartment?._id || req.tenant.apartment,
      priority: 'Medium',
      audience: 'admin',
      eventKey: `tenant-document:${document._id}:submitted`,
    });

    res.status(201).json({
      success: true,
      data: {
        _id: document._id,
        documentType: document.documentType,
        originalName: document.originalName,
        status: document.status,
        createdAt: document.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getTenantDocuments(req, res, next) {
  try {
    const documents = await TenantDocument.find({ tenant: req.tenant._id })
      .select('-documentData -emailNotificationError -emailNotificationMessageId -emailNotificationSendingAt')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}

async function downloadTenantDocument(req, res, next) {
  try {
    const document = await TenantDocument.findOne({
      _id: req.params.id,
      tenant: req.tenant._id,
    }).select('+documentData');
    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      return next(error);
    }
    sendDocumentDownload(res, document);
  } catch (error) {
    next(error);
  }
}

async function getAdminDocuments(req, res, next) {
  try {
    const query = {};
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    const documents = await TenantDocument.find(query)
      .select('-documentData')
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(250);
    res.json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
}

async function downloadAdminDocument(req, res, next) {
  try {
    const document = await TenantDocument.findById(req.params.id).select('+documentData');
    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      return next(error);
    }
    sendDocumentDownload(res, document);
  } catch (error) {
    next(error);
  }
}

async function reviewTenantDocument(req, res, next) {
  try {
    const { status, reviewComment = '' } = req.body || {};
    if (!['Approved', 'Rejected'].includes(status)
      || typeof reviewComment !== 'string'
      || reviewComment.trim().length > 1000
      || (status === 'Rejected' && !reviewComment.trim())) {
      const error = new Error('Choose Approved or Rejected, include a rejection reason, and limit comments to 1000 characters');
      error.statusCode = 400;
      return next(error);
    }

    const document = await TenantDocument.findOneAndUpdate({
      _id: req.params.id,
      status: 'Pending',
    }, {
      $set: {
        status,
        reviewComment: reviewComment.trim(),
        reviewedBy: req.admin._id,
        reviewedAt: new Date(),
      },
    }, { new: true, runValidators: true });
    if (!document) {
      const exists = await TenantDocument.exists({ _id: req.params.id });
      if (exists) {
        const error = new Error('Only pending documents can be reviewed');
        error.statusCode = 409;
        return next(error);
      }
      const error = new Error('Document not found');
      error.statusCode = 404;
      return next(error);
    }

    await History.create({
      type: 'Tenant Document Reviewed',
      title: `Tenant document ${status.toLowerCase()}`,
      description: `${document.documentType} document ${status.toLowerCase()}`,
      tenant: document.tenant,
      apartment: document.apartment,
    });
    await createNotification({
      type: `Document ${status}`,
      message: `Your ${document.documentType} document was ${status.toLowerCase()}${document.reviewComment ? `: ${document.reviewComment}` : '.'}`,
      relatedTenant: document.tenant,
      relatedApartment: document.apartment,
      priority: status === 'Rejected' ? 'High' : 'Medium',
      audience: 'tenant',
      eventKey: `tenant-document:${document._id}:${status.toLowerCase()}`,
    });

    const emailDelivery = await sendDocumentDecisionEmail(document._id);
    res.json({
      success: true,
      data: { _id: document._id, status: document.status, emailDelivery },
      message: `Document ${status.toLowerCase()}; email notification status: ${emailDelivery.status}.`,
    });
  } catch (error) {
    next(error);
  }
}

async function retryDocumentNotification(req, res, next) {
  try {
    const document = await TenantDocument.findById(req.params.id).select('status');
    if (!document) {
      const error = new Error('Document not found');
      error.statusCode = 404;
      return next(error);
    }
    if (!['Approved', 'Rejected'].includes(document.status)) {
      const error = new Error('Review the document before sending a decision notification');
      error.statusCode = 409;
      return next(error);
    }

    const emailDelivery = await sendDocumentDecisionEmail(document._id);
    if (emailDelivery.status === 'sending') {
      return res.status(409).json({
        success: false,
        emailDelivery,
        error: 'Email notification is already in progress; no duplicate was sent.',
      });
    }
    if (emailDelivery.status !== 'sent') {
      const message = emailDelivery.error || 'Email notification was not sent';
      const statusCode = emailDelivery.status === 'not_configured' ? 503 : 502;
      return res.status(statusCode).json({ success: false, emailDelivery, error: message });
    }
    res.json({
      success: true,
      emailDelivery,
      message: emailDelivery.duplicatePrevented
        ? 'The email was already accepted by SMTP; no duplicate was sent.'
        : 'Decision email accepted by SMTP.',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createTenantDocument,
  getTenantDocuments,
  downloadTenantDocument,
  getAdminDocuments,
  downloadAdminDocument,
  reviewTenantDocument,
  retryDocumentNotification,
  sendDocumentDownload,
};
