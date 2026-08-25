document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupMaintenancePage();
  loadMaintenanceRequests();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function setupMaintenancePage() {
  const createBtn = document.getElementById('createMaintenanceBtn');
  const cancelBtn = document.getElementById('cancelMaintenanceBtn');
  if (createBtn) createBtn.addEventListener('click', () => showMaintenanceForm());
  if (cancelBtn) cancelBtn.addEventListener('click', hideMaintenanceForm);
  const form = document.getElementById('maintenanceForm');
  if (form) form.addEventListener('submit', submitMaintenanceForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadMaintenanceRequests);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadMaintenanceRequests);
}

let editingMaintenanceId = null;

function showMaintenanceForm(request = null) {
  const section = document.getElementById('maintenanceFormSection');
  section.classList.remove('hidden');
  document.getElementById('maintenanceFormTitle').textContent = request ? 'Edit Request' : 'New Maintenance Request';
  document.getElementById('maintenanceFormError').textContent = '';
  if (request) {
    editingMaintenanceId = request._id;
    document.getElementById('maintApartment').value = request.apartment._id;
    document.getElementById('maintTenant').value = request.tenant._id;
    document.getElementById('maintTitle').value = request.title;
    document.getElementById('maintDescription').value = request.description;
    document.getElementById('maintPriority').value = request.priority;
    document.getElementById('maintDate').value = request.requestDate.split('T')[0];
  } else {
    editingMaintenanceId = null;
    document.getElementById('maintenanceForm').reset();
  }
}

function hideMaintenanceForm() {
  document.getElementById('maintenanceFormSection').classList.add('hidden');
  document.getElementById('maintenanceForm').reset();
  editingMaintenanceId = null;
}

async function submitMaintenanceForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('maintenanceFormError');
  const data = {
    apartment: document.getElementById('maintApartment').value.trim(),
    tenant: document.getElementById('maintTenant').value.trim(),
    title: document.getElementById('maintTitle').value.trim(),
    description: document.getElementById('maintDescription').value.trim(),
    priority: document.getElementById('maintPriority').value,
    requestDate: document.getElementById('maintDate').value,
  };
  if (!data.apartment || !data.tenant || !data.title || !data.description || !data.requestDate) {
    errorEl.textContent = 'Please fill out all required fields.';
    return;
  }
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
  }
}

async function loadMaintenanceRequests() {
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    const response = await apiRequest(`/maintenance?${query.toString()}`);
    const body = document.getElementById('maintenanceTableBody');
    body.innerHTML = response.data.map((req) => `
      <tr>
        <td>${req.apartment?.apartmentNumber || '—'}</td>
        <td>${req.tenant?.fullName || '—'}</td>
        <td>${req.title}</td>
        <td>${req.priority}</td>
        <td>${req.requestDate.split('T')[0]}</td>
        <td><span class="status-badge ${req.status.replace(' ', '-').toLowerCase()}">${req.status}</span></td>
        <td><button class="button small" onclick="editMaintenance('${req._id}')">Edit</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

window.editMaintenance = async function (id) {
  try {
    const response = await apiRequest(`/maintenance/${id}`);
    showMaintenanceForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

