const test = require('node:test');
const assert = require('node:assert/strict');
const { generateAgreementPdf } = require('../services/agreementPdfService');
const { getEmailConfiguration, sendEmail, templates } = require('../services/emailService');
const RentalAgreement = require('../models/RentalAgreement');
const jwt = require('jsonwebtoken');
const { protect, protectTenant } = require('../middleware/authMiddleware');

test('agreement generation produces a downloadable PDF with the required terms', async () => {
  const agreement = {
    agreementId: 'LEASE-2026-01',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    monthlyRent: 20000,
    maintenanceCharges: 1500,
    securityDeposit: 40000,
    rentalCycle: 'Monthly',
    status: 'Generated',
    renewalTerms: 'Renewal requires 60 days notice.',
    legalConditions: 'No subletting without written consent.',
    agreementDetails: 'Tenant is responsible for utility bills.',
  };
  const tenant = {
    fullName: 'Test Tenant',
    email: 'tenant@example.com',
    phone: '+911234567890',
    address: '10 Example Street',
  };
  const apartment = {
    apartmentNumber: 'A-101',
    buildingDetails: 'RentEase House',
    floorDetails: 'First floor',
    address: '12 Example Road',
  };

  const pdf = await generateAgreementPdf(agreement, tenant, apartment);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.includes(Buffer.from('%%EOF')));
  assert.ok(pdf.length > 1000);
});

test('email templates escape user-provided HTML', () => {
  const email = templates.welcomeEmail({
    fullName: '<script>alert(1)</script>',
    email: 'tenant@example.com',
  });
  assert.ok(!email.html.includes('<script>'));
  assert.ok(email.html.includes('&lt;script&gt;'));
});

test('email service does not report development logging as delivery', async () => {
  const originalDevMode = process.env.EMAIL_DEV_MODE;
  const originalUser = process.env.EMAIL_USER;
  const originalPassword = process.env.EMAIL_PASS;
  process.env.EMAIL_DEV_MODE = 'true';
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  try {
    assert.equal(getEmailConfiguration().configured, false);
    const result = await sendEmail({
      to: 'tenant@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });
    assert.equal(result.success, false);
    assert.equal(result.notConfigured, true);
    assert.equal(result.devMode, true);
  } finally {
    if (originalDevMode === undefined) delete process.env.EMAIL_DEV_MODE;
    else process.env.EMAIL_DEV_MODE = originalDevMode;
    if (originalUser === undefined) delete process.env.EMAIL_USER;
    else process.env.EMAIL_USER = originalUser;
    if (originalPassword === undefined) delete process.env.EMAIL_PASS;
    else process.env.EMAIL_PASS = originalPassword;
  }
});

test('agreement schema accepts the audit lifecycle statuses and contract amounts', () => {
  const agreement = new RentalAgreement({
    agreementId: 'LEASE-2026-02',
    tenant: '507f1f77bcf86cd799439011',
    apartment: '507f1f77bcf86cd799439012',
    startDate: new Date('2026-01-01'),
    expiryDate: new Date('2027-01-01'),
    rentalCycle: 'Monthly',
    monthlyRent: 20000,
    maintenanceCharges: 1500,
    securityDeposit: 40000,
    status: 'Pending Signature',
  });
  assert.equal(agreement.validateSync(), undefined);
  assert.equal(agreement.signatureStatus, 'not_started');
});

test('tenant and admin tokens are rejected by the other role guard', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-role-guard';
  const request = (role) => ({
    headers: {
      authorization: `Bearer ${jwt.sign({ id: '507f1f77bcf86cd799439011', role }, process.env.JWT_SECRET)}`,
    },
  });

  try {
    let tenantAsAdmin;
    await protect(request('tenant'), {}, (error) => { tenantAsAdmin = error; });
    assert.equal(tenantAsAdmin.statusCode, 401);

    let adminAsTenant;
    await protectTenant(request('admin'), {}, (error) => { adminAsTenant = error; });
    assert.equal(adminAsTenant.statusCode, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
