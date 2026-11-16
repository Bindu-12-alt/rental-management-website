document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  const logoutLink = document.getElementById('logoutLink');
  logoutLink?.addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
  document.getElementById('documentStatusFilter')?.addEventListener('change', loadTenantDocuments);
  document.getElementById('documentsTableBody')?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id, status, filename } = button.dataset;
    if (action === 'download') window.downloadTenantDocument(id, filename);
    if (action === 'review') window.reviewTenantDocument(id, status);
    if (action === 'retry') window.retryDocumentDecisionEmail(id);
  });
  loadTenantDocuments();
});

function escapeDocumentText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

async function loadTenantDocuments() {
  const body = document.getElementById('documentsTableBody');
  const errorEl = document.getElementById('documentsPageError');
  errorEl.textContent = '';
  try {
    const status = document.getElementById('documentStatusFilter').value;
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const { data } = await apiRequest(`/documents${query}`);
    if (!data.length) {
      body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem">No tenant documents found.</td></tr>';
      return;
    }
    body.innerHTML = data.map((document) => {
      const emailStatus = document.emailNotificationStatus || 'not_sent';
      const sentAt = new Date(document.emailNotificationSendingAt).getTime();
      const staleSending = emailStatus === 'sending'
        && (!Number.isFinite(sentAt) || Date.now() - sentAt > 10 * 60 * 1000);
      const canRetry = ['failed', 'not_configured'].includes(emailStatus) || staleSending;
      const reviewActions = document.status === 'Pending'
        ? `<button class="button small" data-action="review" data-id="${escapeDocumentText(document._id)}" data-status="Approved">Approve</button>
           <button class="button small outline" data-action="review" data-id="${escapeDocumentText(document._id)}" data-status="Rejected">Reject</button>`
        : '';
      const retryAction = ['Approved', 'Rejected'].includes(document.status) && canRetry
        ? `<button class="button small outline" data-action="retry" data-id="${escapeDocumentText(document._id)}">Retry email</button>`
        : '';
      return `<tr>
        <td>${escapeDocumentText(document.tenant?.fullName || '—')}<br><small>${escapeDocumentText(document.tenant?.email || '')}</small></td>
        <td>${escapeDocumentText(document.apartment?.apartmentNumber || '—')}</td>
        <td>${escapeDocumentText(document.documentType)}<br><small>${escapeDocumentText(document.originalName)}</small></td>
        <td>${escapeDocumentText(new Date(document.createdAt).toLocaleString())}</td>
        <td title="${escapeDocumentText(document.reviewComment || '')}">${escapeDocumentText(document.status)}</td>
        <td title="${escapeDocumentText(document.emailNotificationError || '')}">${escapeDocumentText(emailStatus)}</td>
        <td>
          <button class="button small" data-action="download" data-id="${escapeDocumentText(document._id)}" data-filename="${escapeDocumentText(document.originalName)}">Download</button>
          ${reviewActions}${retryAction}
        </td>
      </tr>`;
    }).join('');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem">Failed to load documents.</td></tr>';
    errorEl.textContent = error.message;
  }
}

window.downloadTenantDocument = async function (id, filename) {
  try {
    await window.rentEaseAgreementDocuments.download(
      `${API_BASE_URL}/documents/${encodeURIComponent(id)}/download`,
      'rentease_token',
      filename,
      'Tenant document download failed',
    );
  } catch (error) {
    window.alert(error.message);
  }
};

window.reviewTenantDocument = async function (id, status) {
  const promptText = status === 'Rejected' ? 'Reason for rejection (required):' : 'Review notes (optional):';
  const reviewComment = window.prompt(promptText, '');
  if (reviewComment === null || (status === 'Rejected' && !reviewComment.trim())) return;
  try {
    const result = await apiRequest(`/documents/${encodeURIComponent(id)}/review`, 'PATCH', { status, reviewComment });
    window.alert(result.message);
    await loadTenantDocuments();
  } catch (error) {
    window.alert(error.message);
  }
};

window.retryDocumentDecisionEmail = async function (id) {
  try {
    const result = await apiRequest(`/documents/${encodeURIComponent(id)}/notification/retry`, 'POST');
    window.alert(result.message);
  } catch (error) {
    window.alert(error.message);
  } finally {
    await loadTenantDocuments();
  }
};
