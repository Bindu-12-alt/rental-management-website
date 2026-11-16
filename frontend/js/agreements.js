document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupAgreementPage();
  populateSelect('agrTenant', '/tenants', '_id', (tenant) => `${tenant.fullName} (${tenant.email})`, 'Select Tenant');
  populateSelect('agrApartment', '/apartments', '_id', (apartment) => `${apartment.apartmentNumber} — ${apartment.buildingDetails}`, 'Select Apartment');
  loadAgreements();
  checkEmailConfiguration();
  checkSignatureConfiguration();
});

function escapeAgreementText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function setupAgreementPage() {
  document.getElementById('createAgreementBtn')?.addEventListener('click', () => showAgreementForm());
  document.getElementById('cancelAgreementBtn')?.addEventListener('click', hideAgreementForm);
  document.getElementById('agreementForm')?.addEventListener('submit', submitAgreementForm);
  document.getElementById('searchInput')?.addEventListener('input', loadAgreements);
  document.getElementById('statusFilter')?.addEventListener('change', loadAgreements);
  document.getElementById('agrApartment')?.addEventListener('change', async (event) => {
    const apartmentId = event.target.value;
    if (!apartmentId) return;
    try {
      const { data } = await apiRequest(`/apartments/${apartmentId}`);
      if (!editingAgreementId) {
        document.getElementById('agrRent').value = data.monthlyRent;
        document.getElementById('agrDeposit').value = data.securityDeposit;
      }
    } catch (error) {
      document.getElementById('agreementFormError').textContent = error.message;
    }
  });
}

let editingAgreementId = null;
let signatureConfiguration = { configured: false, missing: [] };

function showAgreementForm(agreement = null) {
  const section = document.getElementById('agreementFormSection');
  section.classList.remove('hidden');
  document.getElementById('agreementFormTitle').textContent = agreement ? 'Edit Agreement' : 'New Agreement';
  document.getElementById('agreementFormError').textContent = '';
  const statuses = agreement
    ? ['Draft', 'Generated', 'Pending Signature', 'Active', 'Expiring Soon', 'Expired', 'Ending', 'Renewed', 'Terminated']
    : ['Draft', 'Generated'];
  if (agreement?.signatureStatus === 'completed') statuses.push('Signed');
  document.getElementById('agrStatus').innerHTML = statuses
    .map((status) => `<option>${escapeAgreementText(status)}</option>`).join('');
  if (agreement) {
    editingAgreementId = agreement._id;
    document.getElementById('agrId').value = agreement.agreementId;
    document.getElementById('agrTenant').value = agreement.tenant._id;
    document.getElementById('agrApartment').value = agreement.apartment._id;
    document.getElementById('agrStart').value = agreement.startDate.split('T')[0];
    document.getElementById('agrExpiry').value = agreement.expiryDate.split('T')[0];
    document.getElementById('agrCycle').value = agreement.rentalCycle;
    document.getElementById('agrRent').value = agreement.monthlyRent;
    document.getElementById('agrMaintenance').value = agreement.maintenanceCharges || 0;
    document.getElementById('agrDeposit').value = agreement.securityDeposit || 0;
    document.getElementById('agrStatus').value = agreement.status;
    document.getElementById('agrRenewalTerms').value = agreement.renewalTerms || '';
    document.getElementById('agrLegalConditions').value = agreement.legalConditions || '';
    document.getElementById('agrDetails').value = agreement.agreementDetails || '';
  } else {
    editingAgreementId = null;
    document.getElementById('agreementForm').reset();
    document.getElementById('agrStatus').value = 'Generated';
  }
}

function hideAgreementForm() {
  document.getElementById('agreementFormSection').classList.add('hidden');
  document.getElementById('agreementForm').reset();
  editingAgreementId = null;
}

async function submitAgreementForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('agreementFormError');
  const data = {
    agreementId: document.getElementById('agrId').value.trim(),
    tenant: document.getElementById('agrTenant').value,
    apartment: document.getElementById('agrApartment').value,
    startDate: document.getElementById('agrStart').value,
    expiryDate: document.getElementById('agrExpiry').value,
    rentalCycle: document.getElementById('agrCycle').value,
    monthlyRent: Number(document.getElementById('agrRent').value),
    maintenanceCharges: Number(document.getElementById('agrMaintenance').value),
    securityDeposit: Number(document.getElementById('agrDeposit').value),
    status: document.getElementById('agrStatus').value,
    renewalTerms: document.getElementById('agrRenewalTerms').value.trim(),
    legalConditions: document.getElementById('agrLegalConditions').value.trim(),
    agreementDetails: document.getElementById('agrDetails').value.trim(),
  };
  if (!data.agreementId || !data.tenant || !data.apartment || !data.startDate || !data.expiryDate
    || !data.rentalCycle || !Number.isFinite(data.monthlyRent) || data.monthlyRent < 0) {
    errorEl.textContent = 'Complete the required fields and enter valid amounts.';
    return;
  }
  try {
    const result = editingAgreementId
      ? await apiRequest(`/agreements/${editingAgreementId}`, 'PUT', data)
      : await apiRequest('/agreements', 'POST', data);
    hideAgreementForm();
    await loadAgreements();
    if (result.message) window.alert(result.message);
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadAgreements() {
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    const response = await apiRequest(`/agreements?${query.toString()}`);
    window.rentEaseAgreementDocuments.replace(response.data);
    const body = document.getElementById('agreementsTableBody');
    body.innerHTML = response.data.map((agreement) => {
      const id = escapeAgreementText(agreement._id);
      const deliveryStatus = escapeAgreementText(agreement.emailDeliveryStatus || 'not_sent');
      const statusLabel = agreement.status === 'Signed'
        ? agreement.signatureStatus === 'completed'
          ? 'Signed (DocuSign verified)'
          : 'Signed (not provider-verified)'
        : agreement.status;
      const signatureStatus = agreement.signatureStatus || 'not_started';
      const renewalStatus = agreement.renewalReminderSentAt
        ? `Renewal reminder sent ${new Date(agreement.renewalReminderSentAt).toLocaleString()}`
        : agreement.renewalReminderError ? `Renewal reminder failed: ${agreement.renewalReminderError}` : 'Renewal reminder: not due';
      const expiryStatus = agreement.expiryNotificationSentAt
        ? `Expiry notice sent ${new Date(agreement.expiryNotificationSentAt).toLocaleString()}`
        : agreement.expiryNotificationError ? `Expiry notice failed: ${agreement.expiryNotificationError}` : 'Expiry notice: not due';
      const actions = [
        `<button class="button small outline" onclick="downloadAgreement('${id}')">Download PDF</button>`,
      ];
      if (!Number(agreement.signatureAttempts) && agreement.status !== 'Signed') {
        actions.push(`<button class="button small outline" onclick="uploadAgreement('${id}')">Upload PDF</button>`);
        actions.push(`<button class="button small" onclick="editAgreement('${id}')">Edit</button>`);
      }
      if (['not_started', 'failed'].includes(signatureStatus)
        && ['Draft', 'Generated', 'Pending Signature'].includes(agreement.status)) {
        const label = signatureStatus === 'failed' ? 'Retry signature' : 'Send for signature';
        const disabled = signatureConfiguration.configured ? '' : 'disabled title="Configure DocuSign sandbox credentials first"';
        actions.push(`<button class="button small" ${disabled} onclick="sendAgreementForSignature('${id}')">${label}</button>`);
      } else if (['sent', 'delivered', 'unknown'].includes(signatureStatus)
        || (['completed', 'sandbox_completed'].includes(signatureStatus) && !agreement.signatureDocumentAvailable)) {
        actions.push(`<button class="button small" onclick="refreshAgreementSignature('${id}')">Refresh signature</button>`);
      }
      const signatureLabel = signatureStatus === 'sandbox_completed'
        ? 'DocuSign sandbox completed (test only)'
        : signatureStatus;
      if (agreement.emailDeliveryStatus !== 'sent') {
        const sendingAt = new Date(agreement.emailSendingAt).getTime();
        const staleSend = agreement.emailDeliveryStatus === 'sending'
          && (!Number.isFinite(sendingAt) || Date.now() - sendingAt > 10 * 60 * 1000);
        if (agreement.emailDeliveryStatus !== 'sending' || staleSend) {
          actions.push(`<button class="button small" onclick="sendAgreementEmail('${id}')">${agreement.emailDeliveryStatus === 'failed' || agreement.emailDeliveryStatus === 'not_configured' ? 'Retry email' : 'Send email'}</button>`);
        }
      }
      if (['Active', 'Expiring Soon', 'Signed'].includes(agreement.status)) {
        actions.push(`<button class="button small" style="background:#7B3F00" onclick="renewAgreement('${id}')">Renew</button>`);
      }
      return `<tr>
        <td>${escapeAgreementText(agreement.agreementId)}</td>
        <td>${escapeAgreementText(agreement.tenant?.fullName || '—')}</td>
        <td>${escapeAgreementText(agreement.apartment?.apartmentNumber || '—')}</td>
        <td>${escapeAgreementText(agreement.startDate.split('T')[0])}</td>
        <td>${escapeAgreementText(agreement.expiryDate.split('T')[0])}</td>
        <td><span class="status-badge">${escapeAgreementText(statusLabel)}</span></td>
        <td>₹${Number(agreement.monthlyRent).toFixed(2)}</td>
        <td><span title="${escapeAgreementText(agreement.emailError || '')}">${deliveryStatus}</span>${agreement.emailSentAt ? `<br><small>${escapeAgreementText(new Date(agreement.emailSentAt).toLocaleString())}</small>` : ''}<br><small>Signature: ${escapeAgreementText(signatureLabel)}</small>${agreement.signatureLastCheckedAt ? `<br><small>Checked ${escapeAgreementText(new Date(agreement.signatureLastCheckedAt).toLocaleString())}</small>` : ''}<br><small>${escapeAgreementText(renewalStatus)}</small><br><small>${escapeAgreementText(expiryStatus)}</small></td>
        <td>${actions.join(' ')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--muted)">No agreements found.</td></tr>';
  } catch (error) {
    console.error(error);
  }
}

async function checkSignatureConfiguration() {
  const statusElement = document.getElementById('signatureConfigurationStatus');
  try {
    const { data } = await apiRequest('/agreements/signature/config');
    signatureConfiguration = data;
    statusElement.textContent = data.configured
      ? 'DocuSign developer sandbox is test-only; credentials are present but API authentication is unverified. Use controlled test recipients.'
      : `DocuSign developer sandbox is test-only and not configured; missing: ${data.missing.join(', ')}. No signature requests can be sent.`;
    await loadAgreements();
  } catch (error) {
    statusElement.textContent = `DocuSign configuration check failed: ${error.message}`;
  }
}

async function checkEmailConfiguration() {
  const statusElement = document.getElementById('emailConfigurationStatus');
  try {
    const { data } = await apiRequest('/agreements/email/status');
    statusElement.textContent = data.verified
      ? `SMTP connection verified (${data.host}) as ${data.fromAddress}.`
      : `Email delivery unavailable: ${data.error || 'SMTP connection could not be verified'}.`;
  } catch (error) {
    statusElement.textContent = `Email configuration check failed: ${error.message}`;
  }
}

async function fetchAgreementFile(id, endpoint, filename) {
  const token = localStorage.getItem('rentease_token');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = 'Agreement file request failed';
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.downloadAgreement = async function (id) {
  try {
    const agreement = window.rentEaseAgreementDocuments.get(id);
    await fetchAgreementFile(id, `/agreements/${encodeURIComponent(id)}/document`, `${agreement?.agreementId || 'agreement'}.pdf`);
  } catch (error) { window.alert(error.message); }
};

window.uploadAgreement = function (id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.onchange = async () => {
    const [file] = input.files;
    if (!file) return;
    const formData = new FormData();
    formData.append('agreement', file);
    try {
      const token = localStorage.getItem('rentease_token');
      const response = await fetch(`${API_BASE_URL}/agreements/${encodeURIComponent(id)}/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Agreement upload failed');
      window.alert(result.message);
      await loadAgreements();
    } catch (error) { window.alert(error.message); }
  };
  input.click();
};

window.sendAgreementEmail = async function (id) {
  try {
    const result = await apiRequest(`/agreements/${encodeURIComponent(id)}/email`, 'POST');
    window.alert(result.message);
    await loadAgreements();
  } catch (error) {
    await loadAgreements();
    window.alert(error.message);
  }
};

window.sendAgreementForSignature = async function (id) {
  const agreement = window.rentEaseAgreementDocuments.get(id);
  const tenantEmail = agreement?.tenant?.email || 'the assigned tenant';
  if (!window.confirm(`Send this test-only DocuSign sandbox request to ${tenantEmail}, then to the currently signed-in admin? It will not mark the agreement production-signed. Use controlled test accounts only.`)) return;
  try {
    const result = await apiRequest(`/agreements/${encodeURIComponent(id)}/signature`, 'POST');
    window.alert(result.message);
    await loadAgreements();
  } catch (error) {
    await loadAgreements();
    window.alert(error.message);
  }
};

window.refreshAgreementSignature = async function (id) {
  try {
    const result = await apiRequest(`/agreements/${encodeURIComponent(id)}/signature/refresh`, 'POST');
    window.alert(result.message);
    await loadAgreements();
  } catch (error) {
    await loadAgreements();
    window.alert(error.message);
  }
};

window.renewAgreement = async function (id) {
  const newExpiry = prompt('New expiry date (YYYY-MM-DD):');
  if (!newExpiry) return;
  const newRent = prompt('New monthly rent:');
  if (newRent === null || newRent.trim() === '') return;
  const newCycle = prompt('Rental cycle (e.g. Monthly):') || 'Monthly';
  try {
    const result = await apiRequest(`/agreements/${id}/renew`, 'POST', {
      newExpiryDate: newExpiry,
      newMonthlyRent: Number(newRent),
      newRentalCycle: newCycle,
    });
    window.alert(result.message || 'Agreement renewed; check email delivery status in the agreement list.');
    await loadAgreements();
  } catch (error) { window.alert(error.message); }
};

window.editAgreement = async function (id) {
  try {
    const response = await apiRequest(`/agreements/${id}`);
    showAgreementForm(response.data);
  } catch (error) {
    window.alert(error.message);
  }
};
