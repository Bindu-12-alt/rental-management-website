const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const docusignService = require('../services/docusignService');

const credentialKeys = [
  'DOCUSIGN_INTEGRATION_KEY',
  'DOCUSIGN_USER_ID',
  'DOCUSIGN_ACCOUNT_ID',
  'DOCUSIGN_PRIVATE_KEY_PATH',
];

test('DocuSign sandbox stays unavailable when credentials are missing', () => {
  const originalValues = Object.fromEntries(credentialKeys.map((key) => [key, process.env[key]]));
  credentialKeys.forEach((key) => delete process.env[key]);

  try {
    const configuration = docusignService.getConfigurationStatus();
    assert.equal(configuration.configured, false);
    assert.equal(configuration.sandbox, true);
    assert.deepEqual(configuration.missing, credentialKeys);
  } finally {
    for (const key of credentialKeys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  }
});

test('DocuSign does not contact the provider when a sandbox key is missing', async () => {
  const originalValues = Object.fromEntries(credentialKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  credentialKeys.forEach((key) => delete process.env[key]);
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called without credentials');
  };

  try {
    await assert.rejects(
      docusignService.sendSignatureEnvelope({
        agreement: { _id: 'audit-agreement', agreementId: 'AUDIT-1' },
        tenant: { fullName: 'Test Tenant', email: 'tenant@example.invalid' },
        admin: { name: 'Test Admin', email: 'admin@example.invalid' },
        pdfBuffer: Buffer.from('%PDF-1.4'),
      }),
      /DocuSign sandbox is not configured/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
    for (const key of credentialKeys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  }
});

test('DocuSign envelope statuses preserve completion and keep unknown values explicit', () => {
  assert.equal(docusignService.normalizeEnvelopeStatus('completed'), 'completed');
  assert.equal(docusignService.normalizeEnvelopeStatus('declined'), 'declined');
  assert.equal(docusignService.normalizeEnvelopeStatus('unexpected-provider-state'), 'unknown');
});

test('DocuSign signing routes require admin authentication', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../routes/agreementRoutes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/signature\/config',\s*protect,\s*signatureConfiguration\)/);
  assert.match(routes, /router\.post\('\/:id\/signature',\s*protect,\s*sendAgreementForSignature\)/);
  assert.match(routes, /router\.post\('\/:id\/signature\/refresh',\s*protect,\s*refreshAgreementSignature\)/);
});
