const Notification = require('../models/Notification');

async function createNotification({
  type,
  message,
  relatedTenant,
  relatedApartment,
  priority = 'Medium',
  audience = 'both',
  eventKey,
}) {
  const notification = { type, message, relatedTenant, relatedApartment, priority, audience, eventKey };
  if (!eventKey) return Notification.create(notification);
  try {
    return await Notification.findOneAndUpdate(
      { eventKey },
      { $setOnInsert: notification },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Notification.findOne({ eventKey });
  }
}

module.exports = { createNotification };
