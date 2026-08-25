document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  loadApartments();
  initializeApartmentForm();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

async function loadApartments() {
  try {
    const search = document.getElementById('searchInput').value.trim();
    const status = document.getElementById('statusFilter').value;
    const type = document.getElementById('typeFilter').value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    if (type) query.append('type', type);
    const response = await apiRequest(`/apartments?${query.toString()}`);
    const tbody = document.getElementById('apartmentsTableBody');
    tbody.innerHTML = response.data.map((apt) => {
      return `
        <tr>
          <td>${apt.apartmentNumber}</td>
          <td>${apt.buildingDetails}</td>
          <td>${apt.floorDetails}</td>
          <td>${apt.apartmentType}</td>
          <td>₹${apt.monthlyRent.toFixed(2)}</td>
          <td>₹${apt.securityDeposit.toFixed(2)}</td>
          <td><span class="status-badge ${apt.status.replace(' ', '-').toLowerCase()}">${apt.status}</span></td>
          <td>${apt.currentTenant?.fullName || '—'}</td>
          <td><button class="button small" onclick="editApartment('${apt._id}')">Edit</button> <button class="button outline small" onclick="deleteApartment('${apt._id}')">Delete</button></td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
  }
}

function initializeApartmentForm() {
  document.getElementById('createApartmentBtn').addEventListener('click', () => showApartmentForm());
  document.getElementById('cancelAptBtn').addEventListener('click', hideApartmentForm);
  document.getElementById('apartmentForm').addEventListener('submit', submitApartmentForm);
  document.getElementById('searchInput').addEventListener('input', loadApartments);
  document.getElementById('statusFilter').addEventListener('change', loadApartments);
  document.getElementById('typeFilter').addEventListener('change', loadApartments);
}

let editingApartmentId = null;

function showApartmentForm(apartment = null) {
  document.getElementById('apartmentFormSection').classList.remove('hidden');
  document.getElementById('apartmentFormTitle').textContent = apartment ? 'Edit Apartment' : 'Add Apartment';
  document.getElementById('apartmentFormError').textContent = '';
  if (apartment) {
    editingApartmentId = apartment._id;
    document.getElementById('aptNumber').value = apartment.apartmentNumber;
    document.getElementById('aptBuilding').value = apartment.buildingDetails;
    document.getElementById('aptFloor').value = apartment.floorDetails;
    document.getElementById('aptType').value = apartment.apartmentType;
    document.getElementById('aptRent').value = apartment.monthlyRent;
    document.getElementById('aptDeposit').value = apartment.securityDeposit;
    document.getElementById('aptStatus').value = apartment.status;
    document.getElementById('aptPolicies').value = apartment.rentalPolicies || '';
  } else {
    editingApartmentId = null;
    document.getElementById('apartmentForm').reset();
  }
}

function hideApartmentForm() {
  document.getElementById('apartmentFormSection').classList.add('hidden');
  document.getElementById('apartmentForm').reset();
  editingApartmentId = null;
}

async function submitApartmentForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('apartmentFormError');
  const apartmentData = {
    apartmentNumber: document.getElementById('aptNumber').value.trim(),
    buildingDetails: document.getElementById('aptBuilding').value.trim(),
    floorDetails: document.getElementById('aptFloor').value.trim(),
    apartmentType: document.getElementById('aptType').value,
    monthlyRent: Number(document.getElementById('aptRent').value),
    securityDeposit: Number(document.getElementById('aptDeposit').value),
    status: document.getElementById('aptStatus').value,
    rentalPolicies: document.getElementById('aptPolicies').value.trim(),
  };

  if (!apartmentData.apartmentNumber || !apartmentData.buildingDetails || !apartmentData.floorDetails || !apartmentData.apartmentType) {
    errorEl.textContent = 'All required fields must be filled.';
    return;
  }

  try {
    if (editingApartmentId) {
      await apiRequest(`/apartments/${editingApartmentId}`, 'PUT', apartmentData);
    } else {
      await apiRequest('/apartments', 'POST', apartmentData);
    }
    hideApartmentForm();
    loadApartments();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

window.editApartment = async function (id) {
  try {
    const result = await apiRequest(`/apartments/${id}`);
    showApartmentForm(result.data);
  } catch (error) {
    console.error(error);
  }
};

window.deleteApartment = async function (id) {
  if (!confirm('Delete this apartment? This cannot be undone if it has tenant data.')) return;
  try {
    await apiRequest(`/apartments/${id}`, 'DELETE');
    loadApartments();
  } catch (error) {
    alert(error.message);
  }
};

