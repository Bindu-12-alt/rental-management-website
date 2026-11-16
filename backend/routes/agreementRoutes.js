const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const {
  getAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  renewAgreement,
  emailAgreement,
  downloadAgreement,
  uploadAgreement,
  emailConfiguration,
  signatureConfiguration,
  sendAgreementForSignature,
  refreshAgreementSignature,
} = require('../controllers/agreementController');
const router = express.Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number.parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10) },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(file.originalname)) {
      const error = new Error('Only PDF agreement files are allowed');
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

function handlePdfUpload(req, res, next) {
  pdfUpload.single('agreement')(req, res, (error) => {
    if (!error) return next();
    if (!error.statusCode) error.statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    next(error);
  });
}

router.get('/email/status', protect, emailConfiguration);
router.get('/signature/config', protect, signatureConfiguration);
router.get('/', protect, getAgreements);
router.get('/:id', protect, getAgreementById);
router.post('/', protect, createAgreement);
router.post('/:id/signature', protect, sendAgreementForSignature);
router.post('/:id/signature/refresh', protect, refreshAgreementSignature);
router.put('/:id', protect, updateAgreement);
router.post('/:id/renew', protect, renewAgreement);
router.get('/:id/document', protect, downloadAgreement);
router.post('/:id/document', protect, handlePdfUpload, uploadAgreement);
router.post('/:id/email', protect, emailAgreement);

module.exports = router;
