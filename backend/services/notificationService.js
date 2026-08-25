const Notification = require('../models/Notification');

async function createNotification({ type, message, relatedTenant, relatedApartment, priority = 'Medium' }) {
  return Notification.create({ type, message, relatedTenant, relatedApartment, priority });
}

module.exports = { createNotification };
