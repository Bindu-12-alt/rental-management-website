const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getHistory } = require('../controllers/historyController');
const router = express.Router();

router.get('/', protect, getHistory);

module.exports = router;
