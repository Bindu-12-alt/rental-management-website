document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupVacatingPage();
  loadVacatingRequests();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function setupVacatingPage() {
  const createBtn = document.getElementById('createVacatingBtn');
  const cancelBtn = document.getElementById('cancelVacatingBtn');
  if (createBtn) createBtn.addEventListener('click', () => showVacatingForm());
  if (cancelBtn) cancelBtn.addEventListener('click', hideVacatingForm);
  const form = document.getElementById('vacatingForm');
  if (form) form.addEventListener('submit', submitVacatingForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadVacatingRequests);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadVacatingRequests);
  populateSelect('vacTenant', '/tenants', '_id', (tenant) => `${tenant.fullName} (${tenant.email})`, 'Select Tenant');
  populateSelect('vacApartment', '/apartments', '_id', (apartment) => `${apartment.apartmentNumber} — ${apartment.buildingDetails}`, 'Select Apartment');
}

let editingVacatingId = null;

function showVacatingForm(request = null) {
  const section = document.getElementById('vacatingFormSection');
  section.classList.remove('hidden');
  document.getElementById('vacatingFormTitle').textContent = request ? 'Edit Vacating Request' : 'New Vacating Request';
  document.getElementById('vacatingFormError').textContent = '';
  if (request) {
    editingVacatingId = request._id;
    document.getElementById('vacTenant').value = request.tenant._id;
    document.getElementById('vacApartment').value = request.apartment._id;
    document.getElementById('vacRequestDate').value = request.requestDate.split('T')[0];
    document.getElementById('vacExpectedDate').value = request.expectedVacatingDate.split('T')[0];
    document.getElementById('vacComments').value = request.adminComments || '';
  } else {
    editingVacatingId = null;
    document.getElementById('vacatingForm').reset();
  }
}

function hideVacatingForm() {
  document.getElementById('vacatingFormSection').classList.add('hidden');
  document.getElementById('vacatingForm').reset();
  editingVacatingId = null;
}

async function submitVacatingForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('vacatingFormError');
  const data = {
    tenant: document.getElementById('vacTenant').value.trim(),
    apartment: document.getElementById('vacApartment').value.trim(),
    requestDate: document.getElementById('vacRequestDate').value,
    expectedVacatingDate: document.getElementById('vacExpectedDate').value,
    adminComments: document.getElementById('vacComments').value.trim(),
  };
  if (!data.tenant || !data.apartment || !data.requestDate || !data.expectedVacatingDate) {
    errorEl.textContent = 'Please complete all required fields.';
    return;
  }
  try {
    await apiRequest('/vacating', 'POST', data);
    hideVacatingForm();
    loadVacatingRequests();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadVacatingRequests() {
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    const response = await apiRequest(`/vacating?${query.toString()}`);
    const body = document.getElementById('vacatingTableBody');
    body.innerHTML = response.data.map((request) => {
      const emailStatus = request.decisionEmailStatus || 'not_sent';
      const emailSendingAt = new Date(request.decisionEmailSendingAt).getTime();
      const staleEmailSend = emailStatus === 'sending'
        && (!Number.isFinite(emailSendingAt) || Date.now() - emailSendingAt > 10 * 60 * 1000);
      const retryEmail = ['Approved', 'Rejected'].includes(request.status)
        && emailStatus !== 'sent' && (emailStatus !== 'sending' || staleEmailSend)
        ? `<button class="button small outline" onclick="retryVacatingEmail('${request._id}')">Retry email</button>`
        : '';
      return `<tr>
        <td>${escapeVacatingText(request.tenant?.fullName || '—')}</td>
        <td>${escapeVacatingText(request.apartment?.apartmentNumber || '—')}</td>
        <td>${escapeVacatingText(request.requestDate.split('T')[0])}</td>
        <td>${escapeVacatingText(request.expectedVacatingDate.split('T')[0])}</td>
        <td>${Number(request.noticePeriodDays)}</td>
        <td><span class="status-badge">${escapeVacatingText(request.status)}</span></td>
        <td title="${escapeVacatingText(request.decisionEmailError || '')}">${escapeVacatingText(emailStatus)}</td>
        <td>
          <button class="button small" onclick="editVacating('${escapeVacatingText(request._id)}')">Edit</button>
          ${request.status === 'Pending' ? `<button class="button small" style="background:#16A34A" onclick="approveVacating('${escapeVacatingText(request._id)}')">Approve</button> <button class="button small" style="background:#DC2626" onclick="rejectVacating('${escapeVacatingText(request._id)}')">Reject</button>` : ''}
          ${request.status === 'Approved' ? `<button class="button small" style="background:#7B3F00" onclick="completeVacating('${escapeVacatingText(request._id)}')">Complete</button>` : ''}
          ${retryEmail}
        </td>
      </tr>`;
    }).join('');
  } catch (error) {
    console.error(error);
  }
}

function escapeVacatingText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

window.approveVacating = async function (id) {
  if (!confirm('Approve this vacating request?')) return;
  try {
    const result = await apiRequest(`/vacating/${id}/approve`, 'PUT');
    if (result.emailDelivery?.status !== 'sent') window.alert(`Request approved. Tenant email status: ${result.emailDelivery?.status || 'unknown'}.`);
    await loadVacatingRequests();
  } catch (error) { alert(error.message); }
};

window.rejectVacating = async function (id) {
  const comments = prompt('Reason for rejection (optional):') || '';
  try {
    const result = await apiRequest(`/vacating/${id}/reject`, 'PUT', { adminComments: comments });
    if (result.emailDelivery?.status !== 'sent') window.alert(`Request rejected. Tenant email status: ${result.emailDelivery?.status || 'unknown'}.`);
    await loadVacatingRequests();
  } catch (error) { alert(error.message); }
};

window.retryVacatingEmail = async function (id) {
  try {
    const result = await apiRequest(`/vacating/${encodeURIComponent(id)}/email`, 'POST');
    window.alert(result.message);
    await loadVacatingRequests();
  } catch (error) { window.alert(error.message); }
};

window.completeVacating = async function (id) {
  if (!confirm('Mark this vacating as completed? This will free the apartment.')) return;
  try {
    await apiRequest(`/vacating/${id}/complete`, 'PUT');
    loadVacatingRequests();
  } catch (error) { alert(error.message); }
};

window.editVacating = async function (id) {
  try {
    const response = await apiRequest(`/vacating/${id}`);
    showVacatingForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

