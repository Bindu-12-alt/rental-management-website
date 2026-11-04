const express = require('express');
const { loginAdmin, registerAdmin, registerTenant, loginTenant } = require('../controllers/authController');
const { getGoogleConfig, loginWithGoogle } = require('../controllers/googleAuthController');
const router = express.Router();

router.get('/google/config', getGoogleConfig);
router.post('/google', loginWithGoogle);
router.post('/login', loginAdmin);
router.post('/register', registerAdmin);
router.post('/tenant/register', registerTenant);
router.post('/tenant/login', loginTenant);

module.exports = router;
