document.addEventListener('DOMContentLoaded', () => {
  tenantEnsureAuth();
  document.getElementById('logoutLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    tenantLogout();
  });
  document.getElementById('documentUploadForm')?.addEventListener('submit', uploadTenantDocument);
  document.getElementById('tenantDocumentsBody')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="download"]');
    if (button) window.downloadOwnTenantDocument(button.dataset.id, button.dataset.filename);
  });
  loadTenantDocuments();
});

function escapeTenantDocumentText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

async function loadTenantDocuments() {
  const body = document.getElementById('tenantDocumentsBody');
  try {
    const { data } = await tenantRequest('/tenant-portal/documents');
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">No documents uploaded yet.</td></tr>';
      return;
    }
    body.innerHTML = data.map((document) => {
      const emailStatus = document.emailNotificationStatus || 'not_sent';
      const emailLabel = emailStatus === 'sent'
        ? 'Accepted by SMTP'
        : emailStatus === 'not_sent' || emailStatus === 'not_configured'
          ? 'Not sent'
          : emailStatus === 'failed' ? 'Failed; admin can retry' : 'Sending';
      return `<tr>
        <td>${escapeTenantDocumentText(document.documentType)}<br><small>${escapeTenantDocumentText(document.originalName)}</small></td>
        <td>${escapeTenantDocumentText(new Date(document.createdAt).toLocaleString())}</td>
        <td>${escapeTenantDocumentText(document.status)}</td>
        <td>${escapeTenantDocumentText(document.reviewComment || '—')}</td>
        <td>${escapeTenantDocumentText(emailLabel)}</td>
        <td><button class="button small outline" data-action="download" data-id="${escapeTenantDocumentText(document._id)}" data-filename="${escapeTenantDocumentText(document.originalName)}">Download</button></td>
      </tr>`;
    }).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:1rem">${escapeTenantDocumentText(error.message)}</td></tr>`;
  }
}

async function uploadTenantDocument(event) {
  event.preventDefault();
  const message = document.getElementById('documentFormMessage');
  const button = document.getElementById('documentUploadButton');
  const file = document.getElementById('documentFile').files[0];
  if (!file) {
    message.textContent = 'Choose a document to upload.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    message.textContent = 'The file must be 5 MB or smaller.';
    return;
  }

  button.disabled = true;
  message.textContent = '';
  try {
    const formData = new FormData();
    formData.append('documentType', document.getElementById('documentType').value);
    formData.append('document', file);
    await tenantFormRequest('/tenant-portal/documents', 'POST', formData);
    document.getElementById('documentUploadForm').reset();
    message.textContent = 'Document uploaded for review. Email notification status will appear after the administrator makes a decision.';
    await loadTenantDocuments();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

window.downloadOwnTenantDocument = async function (id, filename) {
  try {
    await window.rentEaseAgreementDocuments.download(
      `${TENANT_API_BASE}/tenant-portal/documents/${encodeURIComponent(id)}/download`,
      'tenant_token',
      filename,
      'Tenant document download failed',
    );
  } catch (error) {
    window.alert(error.message);
  }
};
