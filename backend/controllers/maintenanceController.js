const MaintenanceRequest = require('../models/MaintenanceRequest');
const History = require('../models/History');
const Tenant = require('../models/Tenant');
const { createNotification } = require('../services/notificationService');
const { sendEmail, templates } = require('../services/emailService');
const { sendWhatsApp, templates: waTemplates } = require('../services/whatsappService');

async function getRequests(req, res, next) {
  try {
    // FIX: Added search support (was missing before)
    const { status, tenant, apartment, priority, search, category } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }

    const requests = await MaintenanceRequest.find(query)
      .populate('tenant', 'fullName email phone')
      .populate('apartment', 'apartmentNumber')
      .sort({ requestDate: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
}

async function createRequest(req, res, next) {
  try {
    const { apartment, tenant, title, description, priority, requestDate, category } = req.body;
    if (!apartment || !tenant || !title || !description || !requestDate) {
      const err = new Error('Apartment, tenant, title, description, and request date are required');
      err.statusCode = 400;
      return next(err);
    }

    const request = await MaintenanceRequest.create({
      apartment,
      tenant,
      title,
      description,
      category: category || 'Other',
      priority: priority || 'Medium',
      requestDate: new Date(requestDate),
      status: 'Pending',
    });

    await History.create({
      type: 'Maintenance Request',
      title: `Maintenance request created`,
      description: title,
      tenant,
      apartment,
    });

    await createNotification({
      type: 'Maintenance Request',
      message: `New maintenance request: ${title}`,
      relatedTenant: tenant,
      relatedApartment: apartment,
      priority: 'Medium',
    });

    // Send email + WhatsApp to tenant (non-blocking)
    try {
      const tenantDoc = await Tenant.findById(tenant).select('fullName email phone');
      if (tenantDoc) {
        const emailData = templates.maintenanceSubmittedEmail({
          fullName: tenantDoc.fullName,
          title,
          requestId: request._id.toString().slice(-8).toUpperCase(),
          priority: priority || 'Medium',
        });
        await sendEmail({ to: tenantDoc.email, ...emailData });

        if (tenantDoc.phone) {
          await sendWhatsApp(tenantDoc.phone, waTemplates.maintenanceReceived({
            fullName: tenantDoc.fullName,
            title,
            requestId: request._id.toString().slice(-8).toUpperCase(),
          }));
        }
      }
    } catch (notifErr) {
      console.error('[Maintenance] Notification failed:', notifErr.message);
    }

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function getRequestById(req, res, next) {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('tenant', 'fullName email phone')
      .populate('apartment', 'apartmentNumber');
    if (!request) {
      const err = new Error('Maintenance request not found');
      err.statusCode = 404;
      return next(err);
    }
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function updateRequest(req, res, next) {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('tenant', 'fullName email phone');
    if (!request) {
      const err = new Error('Maintenance request not found');
      err.statusCode = 404;
      return next(err);
    }

    const oldStatus = request.status;
    const { apartment, tenant, title, description, priority, status, adminComments, completedDate, assignedTo, resolutionDetails, category } = req.body;
    if (completedDate) request.completedDate = new Date(completedDate);
    if (status) request.status = status;
    if (adminComments !== undefined) request.adminComments = adminComments;
    if (resolutionDetails !== undefined) request.resolutionDetails = resolutionDetails;
    if (assignedTo !== undefined) request.assignedTo = assignedTo;
    if (apartment) request.apartment = apartment;
    if (tenant) request.tenant = tenant;
    if (title) request.title = title;
    if (description) request.description = description;
    if (priority) request.priority = priority;
    if (category) request.category = category;

    await request.save();

    await History.create({
      type: 'Maintenance Updated',
      title: `Maintenance request updated`,
      description: `${request.title} status changed to ${request.status}`,
      tenant: request.tenant._id || request.tenant,
      apartment: request.apartment,
    });

    // Notify tenant if status changed
    if (status && status !== oldStatus) {
      await createNotification({
        type: 'Maintenance Updated',
        message: `Maintenance request "${request.title}" updated to ${status}`,
        relatedTenant: request.tenant._id || request.tenant,
        relatedApartment: request.apartment,
        priority: 'Medium',
      });

      // Email + WhatsApp
      try {
        const tenantDoc = request.tenant.email ? request.tenant : await Tenant.findById(request.tenant).select('fullName email phone');
        if (tenantDoc) {
          const emailData = templates.maintenanceUpdatedEmail({
            fullName: tenantDoc.fullName,
            title: request.title,
            status,
            adminComments,
          });
          await sendEmail({ to: tenantDoc.email, ...emailData });

          if (tenantDoc.phone) {
            await sendWhatsApp(tenantDoc.phone, waTemplates.maintenanceUpdated({
              fullName: tenantDoc.fullName,
              title: request.title,
              status,
              adminComments,
            }));
          }
        }
      } catch (notifErr) {
        console.error('[Maintenance] Update notification failed:', notifErr.message);
      }
    }

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

module.exports = { getRequests, getRequestById, createRequest, updateRequest };
