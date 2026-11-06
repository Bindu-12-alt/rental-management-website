const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getTenants,
  getTenantById,
  createTenant,
  updateTenant,
  emailTenant,
} = require('../controllers/tenantController');
const router = express.Router();

router.get('/', protect, getTenants);
router.get('/:id', protect, getTenantById);
router.post('/', protect, createTenant);
router.put('/:id', protect, updateTenant);
router.post('/:id/email', protect, emailTenant);

module.exports = router;
