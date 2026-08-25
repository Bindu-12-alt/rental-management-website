document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  loadTenants();
  initializeTenantForm();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

async function loadTenants() {
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    const response = await apiRequest(`/tenants?${query.toString()}`);
    const tbody = document.getElementById('tenantsTableBody');
    tbody.innerHTML = response.data.map((tenant) => {
      return `
        <tr>
          <td>${tenant.fullName}</td>
          <td>${tenant.email}</td>
          <td>${tenant.phone}</td>
          <td>${tenant.address}</td>
          <td>${tenant.apartment?.apartmentNumber || '—'}</td>
          <td>${tenant.status}</td>
          <td><button class="button small" onclick="editTenant('${tenant._id}')">Edit</button></td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
  }
}

function initializeTenantForm() {
  const createBtn = document.getElementById('createTenantBtn');
  if (createBtn) createBtn.addEventListener('click', () => {
    populateSelect('tenantApartment', '/apartments', '_id', a => `${a.apartmentNumber} — ${a.buildingDetails} (${a.status})`, 'No Apartment');
    showTenantForm();
  });
  const cancelBtn = document.getElementById('cancelTenantBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', hideTenantForm);
  const form = document.getElementById('tenantForm');
  if (form) form.addEventListener('submit', submitTenantForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadTenants);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadTenants);
}

let editingTenantId = null;

function showTenantForm(tenant = null) {
  const section = document.getElementById('tenantFormSection');
  if (!section) return;
  section.classList.remove('hidden');
  document.getElementById('tenantFormTitle').textContent = tenant ? 'Edit Tenant' : 'Add Tenant';
  document.getElementById('tenantFormError').textContent = '';

  if (tenant) {
    editingTenantId = tenant._id;
    document.getElementById('tenantName').value = tenant.fullName;
    document.getElementById('tenantEmail').value = tenant.email;
    document.getElementById('tenantPhone').value = tenant.phone;
    document.getElementById('tenantAddress').value = tenant.address;
    document.getElementById('tenantId').value = tenant.identification || '';
    document.getElementById('tenantEmergency').value = tenant.emergencyContact || '';
    document.getElementById('tenantApartment').value = tenant.apartment?._id || '';
    document.getElementById('tenantStartDate').value = tenant.rentalStartDate ? tenant.rentalStartDate.split('T')[0] : '';
    document.getElementById('tenantStatus').value = tenant.status;
  } else {
    editingTenantId = null;
    document.getElementById('tenantForm').reset();
  }
}

function hideTenantForm() {
  document.getElementById('tenantFormSection').classList.add('hidden');
  document.getElementById('tenantForm').reset();
}

async function submitTenantForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('tenantFormError');
  const data = {
    fullName: document.getElementById('tenantName').value.trim(),
    email: document.getElementById('tenantEmail').value.trim(),
    phone: document.getElementById('tenantPhone').value.trim(),
    address: document.getElementById('tenantAddress').value.trim(),
    identification: document.getElementById('tenantId').value.trim(),
    emergencyContact: document.getElementById('tenantEmergency').value.trim(),
    apartment: document.getElementById('tenantApartment').value || null,
    rentalStartDate: document.getElementById('tenantStartDate').value || null,
    status: document.getElementById('tenantStatus').value,
  };
  if (!data.fullName || !data.email || !data.phone || !data.address) {
    errorEl.textContent = 'Required fields must be completed.';
    return;
  }
  try {
    if (editingTenantId) {
      await apiRequest(`/tenants/${editingTenantId}`, 'PUT', data);
    } else {
      await apiRequest('/tenants', 'POST', data);
    }
    hideTenantForm();
    loadTenants();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

window.editTenant = async function (id) {
  try {
    await populateSelect('tenantApartment', '/apartments', '_id', a => `${a.apartmentNumber} — ${a.buildingDetails} (${a.status})`, 'No Apartment');
    const response = await apiRequest(`/tenants/${id}`);
    showTenantForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

