const test = require('node:test');
const assert = require('node:assert/strict');
const TenantDocument = require('../models/TenantDocument');
const { documentMimeFromBuffer } = require('../services/tenantDocumentService');
const { resolveMaintenancePhoto } = require('../services/maintenancePhotoService');
const { templates } = require('../services/emailService');
const documentRouter = require('../routes/documentRoutes');
const tenantPortalRouter = require('../routes/tenantPortalRoutes');
const { protect, protectTenant } = require('../middleware/authMiddleware');

test('tenant document model validates lifecycle and records notification status', () => {
  const document = new TenantDocument({
    tenant: '507f1f77bcf86cd799439011',
    documentType: 'Identity',
    originalName: 'identity.pdf',
    mimeType: 'application/pdf',
    size: 100,
    documentData: Buffer.from('%PDF-1.7'),
    status: 'Approved',
    emailNotificationStatus: 'not_configured',
  });
  assert.equal(document.validateSync(), undefined);
});

test('document uploads are identified from file signatures, not names alone', () => {
  assert.equal(documentMimeFromBuffer(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(
    documentMimeFromBuffer(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/png',
  );
  assert.equal(documentMimeFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(documentMimeFromBuffer(Buffer.from('<html>not an image</html>')), null);
});

test('document decision email escapes review notes', () => {
  const email = templates.tenantDocumentDecisionEmail({
    fullName: 'Tenant',
    documentType: 'Identity',
    status: 'Rejected',
    reviewComment: '<img src=x onerror=alert(1)>',
  });
  assert.ok(!email.html.includes('<img src=x'));
  assert.ok(email.html.includes('&lt;img'));
});

test('maintenance photo path resolution rejects traversal and arbitrary files', () => {
  assert.equal(resolveMaintenancePhoto('../../.env'), null);
  assert.equal(resolveMaintenancePhoto('/uploads/maintenance/secret.pdf'), null);
  assert.equal(resolveMaintenancePhoto('maint_nonexistent.png'), null);
});

test('all administrator document endpoints use the admin authentication guard', () => {
  const routes = documentRouter.stack.filter((layer) => layer.route);
  assert.equal(routes.length, 4);
  for (const layer of routes) {
    assert.equal(layer.route.stack[0].handle, protect);
  }
});

test('tenant document endpoints use tenant authentication', () => {
  const routes = tenantPortalRouter.stack
    .filter((layer) => layer.route && layer.route.path.startsWith('/documents'));
  assert.equal(routes.length, 3);
  for (const layer of routes) {
    assert.equal(layer.route.stack[0].handle, protectTenant);
  }
});
