const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getDeposits, getDepositById, createDeposit, updateDeposit, refundDeposit } = require('../controllers/depositController');
const router = express.Router();

router.get('/', protect, getDeposits);
router.get('/:id', protect, getDepositById);
router.post('/', protect, createDeposit);
router.put('/:id', protect, updateDeposit);
router.put('/:id/refund', protect, refundDeposit);

module.exports = router;
