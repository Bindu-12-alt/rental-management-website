const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const OAUTH_HOST = 'account-d.docusign.com';
const API_BASE_URL = 'https://demo.docusign.net/restapi';
const HTTP_TIMEOUT_MS = 15000;
let cachedToken;

function getPrivateKeyPath() {
  const configuredPath = process.env.DOCUSIGN_PRIVATE_KEY_PATH;
  if (!configuredPath) return null;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, '..', configuredPath);
}

function getConfigurationStatus() {
  const missing = [];
  if (!process.env.DOCUSIGN_INTEGRATION_KEY) missing.push('DOCUSIGN_INTEGRATION_KEY');
  if (!process.env.DOCUSIGN_USER_ID) missing.push('DOCUSIGN_USER_ID');
  if (!process.env.DOCUSIGN_ACCOUNT_ID) missing.push('DOCUSIGN_ACCOUNT_ID');

  const privateKeyPath = getPrivateKeyPath();
  if (!privateKeyPath) {
    missing.push('DOCUSIGN_PRIVATE_KEY_PATH');
  } else {
    try {
      fs.accessSync(privateKeyPath, fs.constants.R_OK);
    } catch {
      missing.push('readable DocuSign private key file');
    }
  }

  return {
    configured: missing.length === 0,
    sandbox: true,
    provider: 'DocuSign',
    missing,
  };
}

function getPrivateKey() {
  const configuration = getConfigurationStatus();
  if (!configuration.configured) {
    throw new Error(`DocuSign sandbox is not configured: ${configuration.missing.join(', ')}`);
  }
  return fs.readFileSync(getPrivateKeyPath(), 'utf8');
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.value;
  }

  const assertion = jwt.sign(
    { scope: 'signature impersonation' },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      issuer: process.env.DOCUSIGN_INTEGRATION_KEY,
      subject: process.env.DOCUSIGN_USER_ID,
      audience: OAUTH_HOST,
      expiresIn: '1h',
    },
  );
  const response = await fetch(`https://${OAUTH_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`DocuSign sandbox authentication failed (HTTP ${response.status})`);
  }

  const tokenData = await response.json();
  if (!tokenData.access_token || !Number.isFinite(Number(tokenData.expires_in))) {
    throw new Error('DocuSign sandbox returned an invalid access token response');
  }
  cachedToken = {
    value: tokenData.access_token,
    expiresAt: Date.now() + Number(tokenData.expires_in) * 1000,
  };
  return cachedToken.value;
}

function signHereTab(anchorString) {
  return {
    documentId: '1',
    pageNumber: '1',
    anchorString,
    anchorUnits: 'pixels',
    anchorXOffset: '0',
    anchorYOffset: '0',
  };
}

async function sendSignatureEnvelope({ agreement, tenant, admin, pdfBuffer }) {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('A valid agreement PDF is required for DocuSign');
  }
  if (!tenant?.email || !tenant?.fullName || !admin?.email || !admin?.name) {
    throw new Error('Tenant and admin names and email addresses are required for signing');
  }

  const accessToken = await getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/v2.1/accounts/${encodeURIComponent(process.env.DOCUSIGN_ACCOUNT_ID)}/envelopes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionId: `rentease-${agreement._id}`,
        emailSubject: `RentEase rental agreement ${agreement.agreementId} - please sign`,
        status: 'sent',
        documents: [{
          documentBase64: pdfBuffer.toString('base64'),
          name: `${agreement.agreementId}.pdf`,
          fileExtension: 'pdf',
          documentId: '1',
        }],
        recipients: {
          signers: [
            {
              email: tenant.email,
              name: tenant.fullName,
              recipientId: '1',
              routingOrder: '1',
              tabs: { signHereTabs: [signHereTab('Tenant signature:')] },
            },
            {
              email: admin.email,
              name: admin.name,
              recipientId: '2',
              routingOrder: '2',
              tabs: { signHereTabs: [signHereTab('Property manager signature:')] },
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`DocuSign sandbox could not create the signing envelope (HTTP ${response.status})`);
  }

  const envelope = await response.json();
  if (!envelope.envelopeId) {
    throw new Error('DocuSign sandbox did not return an envelope ID');
  }
  return { envelopeId: envelope.envelopeId, status: normalizeEnvelopeStatus(envelope.status) };
}

async function getEnvelopeStatus(envelopeId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/v2.1/accounts/${encodeURIComponent(process.env.DOCUSIGN_ACCOUNT_ID)}/envelopes/${encodeURIComponent(envelopeId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`DocuSign sandbox status check failed (HTTP ${response.status})`);
  }
  const envelope = await response.json();
  return normalizeEnvelopeStatus(envelope.status);
}

async function downloadCompletedPdf(envelopeId) {
  const accessToken = await getAccessToken();
  const response = await fetch(
    `${API_BASE_URL}/v2.1/accounts/${encodeURIComponent(process.env.DOCUSIGN_ACCOUNT_ID)}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`DocuSign sandbox could not download the signed agreement (HTTP ${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function normalizeEnvelopeStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['sent', 'delivered', 'completed', 'declined', 'voided'].includes(normalized)) {
    return normalized;
  }
  return 'unknown';
}

module.exports = {
  getConfigurationStatus,
  sendSignatureEnvelope,
  getEnvelopeStatus,
  downloadCompletedPdf,
  normalizeEnvelopeStatus,
};
