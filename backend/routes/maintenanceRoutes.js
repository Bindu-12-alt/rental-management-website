const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getRequests,
  getRequestById,
  downloadMaintenancePhoto,
  createRequest,
  updateRequest,
} = require('../controllers/maintenanceController');
const router = express.Router();

router.get('/', protect, getRequests);
router.get('/:id/photos/:photoIndex', protect, downloadMaintenancePhoto);
router.get('/:id', protect, getRequestById);
router.post('/', protect, createRequest);
router.put('/:id', protect, updateRequest);

module.exports = router;
