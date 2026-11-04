document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  loadApartments();
  initializeApartmentForm();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
}

async function loadApartments() {
  const tbody = document.getElementById('apartmentsTableBody');
  try {
    const search = document.getElementById('searchInput').value.trim();
    const status = document.getElementById('statusFilter').value;
    const type = document.getElementById('typeFilter').value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    if (type) query.append('type', type);

    const response = await apiRequest(`/apartments?${query.toString()}`);
    if (!response.data.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:2rem">No apartments found.</td></tr>';
      return;
    }
    tbody.innerHTML = response.data.map((apt) => {
      const location = [apt.locality, apt.city].filter(Boolean).join(', ') || '—';
      const listedBadge = apt.isAvailableForListing
        ? '<span style="color:var(--success);font-size:12px"><i class="fa-solid fa-circle-check"></i> Yes</span>'
        : '<span style="color:var(--muted);font-size:12px"><i class="fa-solid fa-circle-xmark"></i> No</span>';
      return `
        <tr>
          <td><strong>${apt.apartmentNumber}</strong><br><small style="color:var(--muted)">${apt.buildingDetails}</small></td>
          <td>${apt.floorDetails}</td>
          <td>${apt.apartmentType}</td>
          <td style="font-size:13px">${location}</td>
          <td>₹${Number(apt.monthlyRent).toLocaleString('en-IN')}</td>
          <td>${apt.bedrooms || '—'}</td>
          <td><span class="status-badge ${apt.status.replace(' ', '-').toLowerCase()}">${apt.status}</span></td>
          <td style="font-size:13px">${apt.currentTenant?.fullName || '<span style="color:var(--muted)">—</span>'}</td>
          <td>${listedBadge}${apt.isFeatured ? ' <span style="color:var(--warning);font-size:11px"><i class="fa-solid fa-star"></i></span>' : ''}</td>
          <td>
            <button class="button small" onclick="editApartment('${apt._id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="button outline small" onclick="deleteApartment('${apt._id}')"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--danger);padding:1rem">${error.message}</td></tr>`;
  }
}

function initializeApartmentForm() {
  document.getElementById('createApartmentBtn').addEventListener('click', () => showApartmentForm());
  document.getElementById('cancelAptBtn').addEventListener('click', hideApartmentForm);
  document.getElementById('cancelAptBtn2')?.addEventListener('click', hideApartmentForm);
  document.getElementById('apartmentForm').addEventListener('submit', submitApartmentForm);
  document.getElementById('searchInput').addEventListener('input', loadApartments);
  document.getElementById('statusFilter').addEventListener('change', loadApartments);
  document.getElementById('typeFilter').addEventListener('change', loadApartments);
  ['aptAddress', 'aptLocality', 'aptCity', 'aptState', 'aptPincode', 'aptLat', 'aptLng'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateApartmentMapPreview);
  });
}

let editingApartmentId = null;

function showApartmentForm(apartment = null) {
  const section = document.getElementById('apartmentFormSection');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('apartmentFormTitle').textContent = apartment ? 'Edit Apartment' : 'Add Apartment';
  document.getElementById('apartmentFormError').classList.add('hidden');

  if (apartment) {
    editingApartmentId = apartment._id;
    document.getElementById('aptNumber').value = apartment.apartmentNumber || '';
    document.getElementById('aptBuilding').value = apartment.buildingDetails || '';
    document.getElementById('aptFloor').value = apartment.floorDetails || '';
    document.getElementById('aptType').value = apartment.apartmentType || '';
    document.getElementById('aptRent').value = apartment.monthlyRent || '';
    document.getElementById('aptDeposit').value = apartment.securityDeposit || '';
    document.getElementById('aptBedrooms').value = apartment.bedrooms || '';
    document.getElementById('aptBathrooms').value = apartment.bathrooms || '';
    document.getElementById('aptArea').value = apartment.areaSqFt || '';
    document.getElementById('aptStatus').value = apartment.status || 'Empty';
    // Location
    document.getElementById('aptAddress').value = apartment.address || '';
    document.getElementById('aptCity').value = apartment.city || '';
    document.getElementById('aptLocality').value = apartment.locality || '';
    document.getElementById('aptState').value = apartment.state || '';
    document.getElementById('aptPincode').value = apartment.pincode || '';
    document.getElementById('aptLat').value = apartment.latitude || '';
    document.getElementById('aptLng').value = apartment.longitude || '';
    // Listing
    document.getElementById('aptDescription').value = apartment.description || '';
    document.getElementById('aptAmenities').value = (apartment.amenities || []).join(', ');
    document.getElementById('aptPolicies').value = apartment.rentalPolicies || '';
    document.getElementById('aptFeatured').checked = apartment.isFeatured || false;
    document.getElementById('aptListed').checked = apartment.isAvailableForListing !== false;
  } else {
    editingApartmentId = null;
    document.getElementById('apartmentForm').reset();
    document.getElementById('aptListed').checked = true;
  }
  updateApartmentMapPreview();
}

function updateApartmentMapPreview() {
  const preview = document.getElementById('aptMapPreview');
  if (!preview) return;

  const latitude = document.getElementById('aptLat').value.trim();
  const longitude = document.getElementById('aptLng').value.trim();
  const location = [
    document.getElementById('aptAddress').value.trim(),
    document.getElementById('aptLocality').value.trim(),
    document.getElementById('aptCity').value.trim(),
    document.getElementById('aptState').value.trim(),
    document.getElementById('aptPincode').value.trim(),
  ].filter(Boolean).join(', ');
  const hasCoordinates = latitude && longitude
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const query = hasCoordinates ? `${latitude},${longitude}` : location;

  if (!query) {
    preview.href = 'https://www.google.com/maps';
    preview.setAttribute('aria-disabled', 'true');
    return;
  }

  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  preview.href = url.href;
  preview.removeAttribute('aria-disabled');
}

function hideApartmentForm() {
  document.getElementById('apartmentFormSection').classList.add('hidden');
  document.getElementById('apartmentForm').reset();
  editingApartmentId = null;
}

async function submitApartmentForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('apartmentFormError');
  errorEl.classList.add('hidden');

  const amenitiesRaw = document.getElementById('aptAmenities').value.trim();
  const amenities = amenitiesRaw ? amenitiesRaw.split(',').map(a => a.trim()).filter(Boolean) : [];

  const apartmentData = {
    apartmentNumber: document.getElementById('aptNumber').value.trim(),
    buildingDetails: document.getElementById('aptBuilding').value.trim(),
    floorDetails: document.getElementById('aptFloor').value.trim(),
    apartmentType: document.getElementById('aptType').value,
    monthlyRent: Number(document.getElementById('aptRent').value),
    securityDeposit: Number(document.getElementById('aptDeposit').value),
    bedrooms: document.getElementById('aptBedrooms').value ? Number(document.getElementById('aptBedrooms').value) : undefined,
    bathrooms: document.getElementById('aptBathrooms').value ? Number(document.getElementById('aptBathrooms').value) : undefined,
    areaSqFt: document.getElementById('aptArea').value ? Number(document.getElementById('aptArea').value) : undefined,
    status: document.getElementById('aptStatus').value,
    // Location
    address: document.getElementById('aptAddress').value.trim() || undefined,
    city: document.getElementById('aptCity').value.trim() || undefined,
    locality: document.getElementById('aptLocality').value.trim() || undefined,
    state: document.getElementById('aptState').value.trim() || undefined,
    pincode: document.getElementById('aptPincode').value.trim() || undefined,
    latitude: document.getElementById('aptLat').value ? Number(document.getElementById('aptLat').value) : undefined,
    longitude: document.getElementById('aptLng').value ? Number(document.getElementById('aptLng').value) : undefined,
    // Listing
    description: document.getElementById('aptDescription').value.trim() || undefined,
    amenities,
    rentalPolicies: document.getElementById('aptPolicies').value.trim() || undefined,
    isFeatured: document.getElementById('aptFeatured').checked,
    isAvailableForListing: document.getElementById('aptListed').checked,
  };

  if (!apartmentData.apartmentNumber || !apartmentData.buildingDetails || !apartmentData.floorDetails || !apartmentData.apartmentType) {
    errorEl.textContent = 'Apartment number, building, floor, and type are required.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (apartmentData.isAvailableForListing && (!apartmentData.address || !apartmentData.city)) {
    errorEl.textContent = 'Enter the full address and city before publishing this apartment.';
    errorEl.classList.remove('hidden');
    return;
  }
  const hasLatitude = apartmentData.latitude !== undefined;
  const hasLongitude = apartmentData.longitude !== undefined;
  if (hasLatitude !== hasLongitude
    || (hasLatitude && (apartmentData.latitude < -90 || apartmentData.latitude > 90
      || apartmentData.longitude < -180 || apartmentData.longitude > 180))) {
    errorEl.textContent = 'Enter valid latitude and longitude coordinates, or leave both blank.';
    errorEl.classList.remove('hidden');
    return;
  }

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

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
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Apartment';
  }
}

window.editApartment = async function (id) {
  try {
    const result = await apiRequest(`/apartments/${id}`);
    showApartmentForm(result.data);
  } catch (error) {
    alert('Failed to load apartment: ' + error.message);
  }
};

window.deleteApartment = async function (id) {
  if (!confirm('Delete this apartment? This is permanent and only works if the apartment is empty.')) return;
  try {
    await apiRequest(`/apartments/${id}`, 'DELETE');
    loadApartments();
  } catch (error) {
    alert(error.message);
  }
};
