const MaintenanceRequest = require('../models/MaintenanceRequest');
const History = require('../models/History');
const { createNotification } = require('../services/notificationService');

async function getRequests(req, res, next) {
  try {
    const { status, tenant, apartment, priority } = req.query;
    const query = {};
    if (status) query.status = status;
    if (tenant) query.tenant = tenant;
    if (apartment) query.apartment = apartment;
    if (priority) query.priority = priority;

    const requests = await MaintenanceRequest.find(query)
      .populate('tenant', 'fullName email')
      .populate('apartment', 'apartmentNumber')
      .sort({ requestDate: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
}

async function createRequest(req, res, next) {
  try {
    const { apartment, tenant, title, description, priority, requestDate } = req.body;
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
      message: `New maintenance request for apartment ${apartment}`,
      relatedTenant: tenant,
      relatedApartment: apartment,
      priority: 'Medium',
    });

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

async function getRequestById(req, res, next) {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('tenant', 'fullName email')
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
    const request = await MaintenanceRequest.findById(req.params.id);
    if (!request) {
      const err = new Error('Maintenance request not found');
      err.statusCode = 404;
      return next(err);
    }

    const { apartment, tenant, title, description, priority, status, adminComments, completedDate } = req.body;
    if (completedDate) request.completedDate = new Date(completedDate);
    if (status) request.status = status;
    if (adminComments) request.adminComments = adminComments;
    if (apartment) request.apartment = apartment;
    if (tenant) request.tenant = tenant;
    if (title) request.title = title;
    if (description) request.description = description;
    if (priority) request.priority = priority;

    await request.save();

    await History.create({
      type: 'Maintenance Updated',
      title: `Maintenance request updated`,
      description: `${request.title} status changed to ${request.status}`,
      tenant: request.tenant,
      apartment: request.apartment,
    });

    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
}

module.exports = { getRequests, getRequestById, createRequest, updateRequest };