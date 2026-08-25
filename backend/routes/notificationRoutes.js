const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getNotifications, markNotificationRead } = require('../controllers/notificationController');
const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/:id/read', protect, markNotificationRead);

module.exports = router;
