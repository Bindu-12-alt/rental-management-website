document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupMaintenancePage();
  loadMaintenanceRequests();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
}

function setupMaintenancePage() {
  document.getElementById('createMaintenanceBtn')?.addEventListener('click', () => showMaintenanceForm());
  document.getElementById('cancelMaintenanceBtn')?.addEventListener('click', hideMaintenanceForm);
  document.getElementById('cancelMaintenanceBtn2')?.addEventListener('click', hideMaintenanceForm);
  document.getElementById('maintenanceForm')?.addEventListener('submit', submitMaintenanceForm);
  document.getElementById('searchInput')?.addEventListener('input', loadMaintenanceRequests);
  document.getElementById('statusFilter')?.addEventListener('change', loadMaintenanceRequests);
  document.getElementById('priorityFilter')?.addEventListener('change', loadMaintenanceRequests);
  document.getElementById('categoryFilter')?.addEventListener('change', loadMaintenanceRequests);

  // Set today's date as default
  const dateInput = document.getElementById('maintDate');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
}

let editingMaintenanceId = null;

function showMaintenanceForm(request = null) {
  const section = document.getElementById('maintenanceFormSection');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('maintenanceFormTitle').textContent = request ? 'Edit Maintenance Request' : 'Log Maintenance Request';
  document.getElementById('maintenanceFormError').classList.add('hidden');

  // Populate dropdowns
  populateSelect('maintApartment', '/apartments', '_id', a => `${a.apartmentNumber} — ${a.buildingDetails}`, 'Select Apartment');
  populateSelect('maintTenant', '/tenants', '_id', t => `${t.fullName} (${t.email})`, 'Select Tenant');

  if (request) {
    editingMaintenanceId = request._id;
    document.getElementById('maintApartment').value = request.apartment?._id || request.apartment;
    document.getElementById('maintTenant').value = request.tenant?._id || request.tenant;
    document.getElementById('maintTitle').value = request.title;
    document.getElementById('maintDescription').value = request.description;
    document.getElementById('maintCategory').value = request.category || 'Other';
    document.getElementById('maintPriority').value = request.priority;
    document.getElementById('maintDate').value = request.requestDate.split('T')[0];
    document.getElementById('maintStatus').value = request.status;
    document.getElementById('maintAssigned').value = request.assignedTo || '';
    document.getElementById('maintAdminComments').value = request.adminComments || '';
    document.getElementById('maintResolution').value = request.resolutionDetails || '';
  } else {
    editingMaintenanceId = null;
    document.getElementById('maintenanceForm').reset();
    document.getElementById('maintDate').value = new Date().toISOString().split('T')[0];
  }
}

function hideMaintenanceForm() {
  document.getElementById('maintenanceFormSection').classList.add('hidden');
  editingMaintenanceId = null;
}

async function submitMaintenanceForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('maintenanceFormError');
  const submitBtn = document.getElementById('maintSubmitBtn');
  errorEl.classList.add('hidden');

  const data = {
    apartment: document.getElementById('maintApartment').value.trim(),
    tenant: document.getElementById('maintTenant').value.trim(),
    title: document.getElementById('maintTitle').value.trim(),
    description: document.getElementById('maintDescription').value.trim(),
    category: document.getElementById('maintCategory').value,
    priority: document.getElementById('maintPriority').value,
    requestDate: document.getElementById('maintDate').value,
    status: document.getElementById('maintStatus').value,
    assignedTo: document.getElementById('maintAssigned').value.trim() || undefined,
    adminComments: document.getElementById('maintAdminComments').value.trim() || undefined,
    resolutionDetails: document.getElementById('maintResolution').value.trim() || undefined,
  };

  if (!data.apartment || !data.tenant || !data.title || !data.description || !data.requestDate) {
    errorEl.textContent = 'Please fill in all required fields.';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

  try {
    if (editingMaintenanceId) {
      await apiRequest(`/maintenance/${editingMaintenanceId}`, 'PUT', data);
    } else {
      await apiRequest('/maintenance', 'POST', data);
    }
    hideMaintenanceForm();
    loadMaintenanceRequests();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Request';
  }
}

async function loadMaintenanceRequests() {
  const tbody = document.getElementById('maintenanceTableBody');
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const priority = document.getElementById('priorityFilter')?.value;
    const category = document.getElementById('categoryFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    if (priority) query.append('priority', priority);
    if (category) query.append('category', category);

    const response = await apiRequest(`/maintenance?${query.toString()}`);
    if (!response.data.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:2rem">No maintenance requests found.</td></tr>';
      return;
    }

    const priorityColor = { High: '#DC2626', Medium: '#F59E0B', Low: '#64748B' };
    const statusClass = { 'Pending': 'pending', 'In Progress': 'in-progress', 'Resolved': 'completed', 'Closed': 'completed', 'Rejected': 'overdue' };

    tbody.innerHTML = response.data.map((req) => `
      <tr>
        <td><strong>${req.apartment?.apartmentNumber || '—'}</strong></td>
        <td style="font-size:13px">${req.tenant?.fullName || '—'}</td>
        <td>
          <strong style="font-size:14px">${req.title}</strong>
          <br><small style="color:var(--muted)">${req.description.substring(0, 50)}${req.description.length > 50 ? '…' : ''}</small>
        </td>
        <td><span class="cat-badge">${req.category || 'Other'}</span></td>
        <td><span class="status-badge" style="background:${priorityColor[req.priority]}">${req.priority}</span></td>
        <td style="font-size:13px">${req.requestDate.split('T')[0]}</td>
        <td><span class="status-badge ${statusClass[req.status] || 'pending'}">${req.status}</span></td>
        <td style="font-size:13px">${req.assignedTo || '<span style="color:var(--muted)">Unassigned</span>'}</td>
        <td>${req.photos && req.photos.length ? `<a href="${req.photos[0]}" target="_blank" style="color:var(--primary)"><i class="fa-solid fa-image"></i> ${req.photos.length}</a>` : '—'}</td>
        <td>
          <button class="button small" onclick="editMaintenance('${req._id}')"><i class="fa-solid fa-pen"></i> Update</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--danger);padding:1rem">${error.message}</td></tr>`;
  }
}

window.editMaintenance = async function (id) {
  try {
    const response = await apiRequest(`/maintenance/${id}`);
    showMaintenanceForm(response.data);
  } catch (error) {
    alert('Failed to load request: ' + error.message);
  }
};
