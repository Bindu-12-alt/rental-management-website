const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getDashboardStats, getRecentActivities } = require('../controllers/dashboardController');
const router = express.Router();

router.get('/stats', protect, getDashboardStats);
router.get('/recent-activities', protect, getRecentActivities);

module.exports = router;
