const jwt = require('jsonwebtoken');

function generateAdminToken(adminId) {
  return jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

function generateTenantToken(tenantId) {
  return jwt.sign({ id: tenantId, role: 'tenant' }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

module.exports = { generateAdminToken, generateTenantToken };
