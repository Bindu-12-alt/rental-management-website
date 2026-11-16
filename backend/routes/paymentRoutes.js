const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getPayments, getPaymentById, createPayment, updatePayment, retryPaymentConfirmation } = require('../controllers/paymentController');
const router = express.Router();

router.get('/', protect, getPayments);
router.get('/:id', protect, getPaymentById);
router.post('/', protect, createPayment);
router.post('/:id/email', protect, retryPaymentConfirmation);
router.put('/:id', protect, updatePayment);

module.exports = router;
