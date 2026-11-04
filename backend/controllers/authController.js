const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const { sendEmail, templates } = require('../services/emailService');
const { generateAdminToken, generateTenantToken } = require('../utils/authTokens');

async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      return next(err);
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin || !admin.password) {
      const err = new Error('Invalid login credentials');
      err.statusCode = 401;
      return next(err);
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      const err = new Error('Invalid login credentials');
      err.statusCode = 401;
      return next(err);
    }

    const token = generateAdminToken(admin._id);
    res.json({ success: true, token, admin: { name: admin.name, email: admin.email, id: admin._id } });
  } catch (error) {
    next(error);
  }
}

async function registerAdmin(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // Use env variable instead of hardcoded email
    const allowedEmail = (process.env.ADMIN_EMAIL || 'bindusrikavuri@gmail.com').toLowerCase().trim();
    if (!email || email.toLowerCase().trim() !== allowedEmail) {
      const err = new Error('Registration is not allowed for this email.');
      err.statusCode = 403;
      return next(err);
    }
    const existing = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      const err = new Error('Admin account already exists. Please login.');
      err.statusCode = 403;
      return next(err);
    }
    if (!name || !password) {
      const err = new Error('Name and password are required');
      err.statusCode = 400;
      return next(err);
    }
    if (password.length < 6) {
      const err = new Error('Password must be at least 6 characters');
      err.statusCode = 400;
      return next(err);
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email: email.toLowerCase().trim(), password: hashed });
    const token = generateAdminToken(admin._id);
    res.status(201).json({ success: true, token, admin: { name: admin.name, email: admin.email, id: admin._id } });
  } catch (error) {
    next(error);
  }
}

async function registerTenant(req, res, next) {
  try {
    const { fullName, email, password, phone, address } = req.body;

    if (!fullName || !email || !password || !phone) {
      const err = new Error('Full name, email, phone, and password are required');
      err.statusCode = 400;
      return next(err);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const err = new Error('Please enter a valid email address');
      err.statusCode = 400;
      return next(err);
    }

    if (password.length < 6) {
      const err = new Error('Password must be at least 6 characters');
      err.statusCode = 400;
      return next(err);
    }

    const existing = await Tenant.findOne({ email: email.toLowerCase().trim() });
    if (existing && existing.password) {
      const err = new Error('An account with this email already exists. Please login.');
      err.statusCode = 400;
      return next(err);
    }

    const hashed = await bcrypt.hash(password, 10);
    let tenant;
    const isNewAccount = !existing;

    if (existing) {
      // Admin-created tenant self-registering — merge accounts
      existing.password = hashed;
      existing.fullName = fullName;
      existing.phone = phone;
      existing.authProvider = existing.googleId ? 'mixed' : 'password';
      if (address) existing.address = address;
      await existing.save();
      tenant = existing;
    } else {
      tenant = await Tenant.create({
        fullName,
        email: email.toLowerCase().trim(),
        password: hashed,
        phone,
        address: address || '',
      });
    }

    const token = generateTenantToken(tenant._id);

    // Send welcome email (non-blocking)
    if (isNewAccount) {
      try {
        const emailData = templates.welcomeEmail({ fullName, email: tenant.email });
        await sendEmail({ to: tenant.email, ...emailData });
      } catch (emailErr) {
        console.error('[Auth] Welcome email failed:', emailErr.message);
      }
    }

    res.status(201).json({
      success: true,
      token,
      tenant: { id: tenant._id, fullName: tenant.fullName, email: tenant.email },
    });
  } catch (error) {
    next(error);
  }
}

async function loginTenant(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      return next(err);
    }
    const tenant = await Tenant.findOne({ email: email.toLowerCase().trim() });
    if (!tenant || !tenant.password) {
      const err = new Error('Invalid credentials or account not activated');
      err.statusCode = 401;
      return next(err);
    }
    const isMatch = await bcrypt.compare(password, tenant.password);
    if (!isMatch) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      return next(err);
    }
    const token = generateTenantToken(tenant._id);
    res.json({ success: true, token, tenant: { id: tenant._id, fullName: tenant.fullName, email: tenant.email } });
  } catch (error) {
    next(error);
  }
}

module.exports = { loginAdmin, registerAdmin, registerTenant, loginTenant };
