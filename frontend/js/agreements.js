document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupAgreementPage();
  loadAgreements();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function setupAgreementPage() {
  const createBtn = document.getElementById('createAgreementBtn');
  if (createBtn) createBtn.addEventListener('click', () => showAgreementForm());
  const cancelBtn = document.getElementById('cancelAgreementBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', hideAgreementForm);
  const form = document.getElementById('agreementForm');
  if (form) form.addEventListener('submit', submitAgreementForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadAgreements);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadAgreements);
}

let editingAgreementId = null;

function showAgreementForm(agreement = null) {
  const section = document.getElementById('agreementFormSection');
  section.classList.remove('hidden');
  document.getElementById('agreementFormTitle').textContent = agreement ? 'Edit Agreement' : 'New Agreement';
  document.getElementById('agreementFormError').textContent = '';
  if (agreement) {
    editingAgreementId = agreement._id;
    document.getElementById('agrId').value = agreement.agreementId;
    document.getElementById('agrTenant').value = agreement.tenant._id;
    document.getElementById('agrApartment').value = agreement.apartment._id;
    document.getElementById('agrStart').value = agreement.startDate.split('T')[0];
    document.getElementById('agrExpiry').value = agreement.expiryDate.split('T')[0];
    document.getElementById('agrCycle').value = agreement.rentalCycle;
    document.getElementById('agrRent').value = agreement.monthlyRent;
    document.getElementById('agrDetails').value = agreement.agreementDetails || '';
  } else {
    editingAgreementId = null;
    document.getElementById('agreementForm').reset();
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
    tenant: document.getElementById('agrTenant').value.trim(),
    apartment: document.getElementById('agrApartment').value.trim(),
    startDate: document.getElementById('agrStart').value,
    expiryDate: document.getElementById('agrExpiry').value,
    rentalCycle: document.getElementById('agrCycle').value.trim(),
    monthlyRent: Number(document.getElementById('agrRent').value),
    agreementDetails: document.getElementById('agrDetails').value.trim(),
  };
  if (!data.agreementId || !data.tenant || !data.apartment || !data.startDate || !data.expiryDate || !data.rentalCycle || !data.monthlyRent) {
    errorEl.textContent = 'Please complete all required fields.';
    return;
  }
  try {
    if (editingAgreementId) {
      await apiRequest(`/agreements/${editingAgreementId}`, 'PUT', data);
    } else {
      await apiRequest('/agreements', 'POST', data);
    }
    hideAgreementForm();
    loadAgreements();
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
    const body = document.getElementById('agreementsTableBody');
    body.innerHTML = response.data.map((agreement) => `
      <tr>
        <td>${agreement.agreementId}</td>
        <td>${agreement.tenant?.fullName || '—'}</td>
        <td>${agreement.apartment?.apartmentNumber || '—'}</td>
        <td>${agreement.startDate.split('T')[0]}</td>
        <td>${agreement.expiryDate.split('T')[0]}</td>
        <td><span class="status-badge ${agreement.status.replace(' ', '-').toLowerCase()}">${agreement.status}</span></td>
        <td>₹${agreement.monthlyRent.toFixed(2)}</td>
        <td>
          <button class="button small" onclick="editAgreement('${agreement._id}')">Edit</button>
          ${agreement.status === 'Active' || agreement.status === 'Expiring Soon' ? `<button class="button small" style="background:#7B3F00" onclick="renewAgreement('${agreement._id}')">Renew</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

window.renewAgreement = async function (id) {
  const newExpiry = prompt('New expiry date (YYYY-MM-DD):');
  if (!newExpiry) return;
  const newRent = prompt('New monthly rent:');
  if (!newRent) return;
  const newCycle = prompt('Rental cycle (e.g. Monthly):') || 'Monthly';
  try {
    await apiRequest(`/agreements/${id}/renew`, 'PUT', { newExpiryDate: newExpiry, newMonthlyRent: Number(newRent), newRentalCycle: newCycle });
    alert('Agreement renewed successfully!');
    loadAgreements();
  } catch (error) { alert(error.message); }
};

window.editAgreement = async function (id) {
  try {
    const response = await apiRequest(`/agreements/${id}`);
    showAgreementForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

