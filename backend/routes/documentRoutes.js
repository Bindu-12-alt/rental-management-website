const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getAdminDocuments,
  downloadAdminDocument,
  reviewTenantDocument,
  retryDocumentNotification,
} = require('../controllers/tenantDocumentController');

const router = express.Router();

router.get('/', protect, getAdminDocuments);
router.get('/:id/download', protect, downloadAdminDocument);
router.patch('/:id/review', protect, reviewTenantDocument);
router.post('/:id/notification/retry', protect, retryDocumentNotification);

module.exports = router;
