const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getVacatingRequests,
  getVacatingRequestById,
  createVacatingRequest,
  updateVacatingRequest,
  approveVacatingRequest,
  rejectVacatingRequest,
  completeVacatingRequest,
} = require('../controllers/vacatingController');
const router = express.Router();

router.get('/', protect, getVacatingRequests);
router.get('/:id', protect, getVacatingRequestById);
router.post('/', protect, createVacatingRequest);
router.put('/:id', protect, updateVacatingRequest);
router.put('/:id/approve', protect, approveVacatingRequest);
router.put('/:id/reject', protect, rejectVacatingRequest);
router.put('/:id/complete', protect, completeVacatingRequest);

module.exports = router;
