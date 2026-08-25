const Notification = require('../models/Notification');

async function getNotifications(req, res, next) {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 });
    const unreadCount = await Notification.countDocuments({ read: false });
    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    next(error);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      const err = new Error('Notification not found');
      err.statusCode = 404;
      return next(err);
    }
    notification.read = true;
    await notification.save();
    res.json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
}

module.exports = { getNotifications, markNotificationRead };