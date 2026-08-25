const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');

async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Not authorized, token missing');
      err.statusCode = 401;
      return next(err);
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      const err = new Error('Not authorized, invalid token');
      err.statusCode = 401;
      return next(err);
    }
    req.admin = admin;
    next();
  } catch (error) {
    const err = new Error('Not authorized, token failed');
    err.statusCode = 401;
    next(err);
  }
}

async function protectTenant(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err = new Error('Not authorized, token missing');
      err.statusCode = 401;
      return next(err);
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'tenant') {
      const err = new Error('Not authorized as tenant');
      err.statusCode = 401;
      return next(err);
    }
    const tenant = await Tenant.findById(decoded.id).select('-password').populate('apartment', 'apartmentNumber buildingDetails floorDetails monthlyRent securityDeposit status');
    if (!tenant) {
      const err = new Error('Tenant not found');
      err.statusCode = 401;
      return next(err);
    }
    req.tenant = tenant;
    next();
  } catch (error) {
    const err = new Error('Not authorized, token failed');
    err.statusCode = 401;
    next(err);
  }
}

module.exports = { protect, protectTenant };
