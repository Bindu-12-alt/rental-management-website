const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getAgreements, getAgreementById, createAgreement, updateAgreement, renewAgreement } = require('../controllers/agreementController');
const router = express.Router();

router.get('/', protect, getAgreements);
router.get('/:id', protect, getAgreementById);
router.post('/', protect, createAgreement);
router.put('/:id', protect, updateAgreement);
router.post('/:id/renew', protect, renewAgreement);

module.exports = router;
