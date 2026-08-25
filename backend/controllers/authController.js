const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');

function generateToken(adminId) {
  return jwt.sign({ id: adminId }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.statusCode = 400;
      return next(err);
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
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

    const token = generateToken(admin._id);
    res.json({ success: true, token, admin: { name: admin.name, email: admin.email, id: admin._id } });
  } catch (error) {
    next(error);
  }
}

async function registerAdmin(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (email !== 'bindusrikavuri@gmail.com') {
      const err = new Error('Registration is not allowed for this email.');
      err.statusCode = 403;
      return next(err);
    }
    const existing = await Admin.findOne({ email });
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
    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, password: hashed });
    const token = generateToken(admin._id);
    res.status(201).json({ success: true, token, admin: { name: admin.name, email: admin.email, id: admin._id } });
  } catch (error) {
    next(error);
  }
}

async function registerTenant(req, res, next) {
  try {
    const { fullName, email, password, phone, address } = req.body;
    if (!fullName || !email || !password || !phone || !address) {
      const err = new Error('All fields are required');
      err.statusCode = 400;
      return next(err);
    }
    const existing = await Tenant.findOne({ email });
    if (existing && existing.password) {
      const err = new Error('Account already exists. Please login.');
      err.statusCode = 400;
      return next(err);
    }
    const hashed = await bcrypt.hash(password, 10);
    let tenant;
    if (existing) {
      existing.password = hashed;
      existing.fullName = fullName;
      existing.phone = phone;
      existing.address = address;
      await existing.save();
      tenant = existing;
    } else {
      tenant = await Tenant.create({ fullName, email, password: hashed, phone, address });
    }
    const token = jwt.sign({ id: tenant._id, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ success: true, token, tenant: { id: tenant._id, fullName: tenant.fullName, email: tenant.email } });
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
    const tenant = await Tenant.findOne({ email });
    if (!tenant || !tenant.password) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      return next(err);
    }
    const isMatch = await bcrypt.compare(password, tenant.password);
    if (!isMatch) {
      const err = new Error('Invalid credentials');
      err.statusCode = 401;
      return next(err);
    }
    const token = jwt.sign({ id: tenant._id, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ success: true, token, tenant: { id: tenant._id, fullName: tenant.fullName, email: tenant.email } });
  } catch (error) {
    next(error);
  }
}

module.exports = { loginAdmin, registerAdmin, registerTenant, loginTenant };
