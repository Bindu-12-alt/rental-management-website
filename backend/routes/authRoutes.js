const express = require('express');
const { loginAdmin, registerAdmin, registerTenant, loginTenant } = require('../controllers/authController');
const router = express.Router();

router.post('/login', loginAdmin);
router.post('/register', registerAdmin);
router.post('/tenant/register', registerTenant);
router.post('/tenant/login', loginTenant);

module.exports = router;
