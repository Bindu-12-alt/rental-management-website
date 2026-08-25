document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  setupDepositPage();
  loadDeposits();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function setupDepositPage() {
  const createBtn = document.getElementById('createDepositBtn');
  const cancelBtn = document.getElementById('cancelDepositBtn');
  if (createBtn) createBtn.addEventListener('click', () => showDepositForm());
  if (cancelBtn) cancelBtn.addEventListener('click', hideDepositForm);
  const form = document.getElementById('depositForm');
  if (form) form.addEventListener('submit', submitDepositForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadDeposits);
}

let editingDepositId = null;

function showDepositForm(deposit = null) {
  const section = document.getElementById('depositFormSection');
  section.classList.remove('hidden');
  document.getElementById('depositFormTitle').textContent = deposit ? 'Edit Deposit' : 'Record Deposit';
  document.getElementById('depositFormError').textContent = '';
  if (deposit) {
    editingDepositId = deposit._id;
    document.getElementById('depTenant').value = deposit.tenant._id;
    document.getElementById('depApartment').value = deposit.apartment._id;
    document.getElementById('depAmount').value = deposit.amount;
    document.getElementById('depPaidDate').value = deposit.paidDate.split('T')[0];
    document.getElementById('depStatus').value = deposit.paymentStatus;
    document.getElementById('depCondition').value = deposit.conditionDetails || '';
  } else {
    editingDepositId = null;
    document.getElementById('depositForm').reset();
  }
}

function hideDepositForm() {
  document.getElementById('depositFormSection').classList.add('hidden');
  document.getElementById('depositForm').reset();
  editingDepositId = null;
}

async function submitDepositForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('depositFormError');
  const data = {
    tenant: document.getElementById('depTenant').value.trim(),
    apartment: document.getElementById('depApartment').value.trim(),
    amount: Number(document.getElementById('depAmount').value),
    paidDate: document.getElementById('depPaidDate').value,
    paymentStatus: document.getElementById('depStatus').value,
    conditionDetails: document.getElementById('depCondition').value.trim(),
  };
  if (!data.tenant || !data.apartment || !data.amount || !data.paidDate) {
    errorEl.textContent = 'Please fill in all required fields.';
    return;
  }
  try {
    if (editingDepositId) {
      await apiRequest(`/deposits/${editingDepositId}/refund`, 'PUT', data);
    } else {
      await apiRequest('/deposits', 'POST', data);
    }
    hideDepositForm();
    loadDeposits();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadDeposits() {
  try {
    const query = new URLSearchParams();
    const search = document.getElementById('searchInput')?.value.trim();
    if (search) query.append('search', search);
    const response = await apiRequest(`/deposits?${query.toString()}`);
    const tbody = document.getElementById('depositsTableBody');
    tbody.innerHTML = response.data.map((deposit) => `
      <tr>
        <td>${deposit.tenant?.fullName || '—'}</td>
        <td>${deposit.apartment?.apartmentNumber || '—'}</td>
        <td>₹${deposit.amount.toFixed(2)}</td>
        <td>${deposit.paidDate.split('T')[0]}</td>
        <td>${deposit.paymentStatus}</td>
        <td>₹${deposit.refundAmount.toFixed(2)}</td>
        <td>
          <button class="button small" onclick="editDeposit('${deposit._id}')">Edit</button>
          ${deposit.refundStatus === 'Pending' ? `<button class="button small" style="background:#7B3F00" onclick="refundDeposit('${deposit._id}', ${deposit.amount})">Refund</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

window.refundDeposit = async function (id, maxAmount) {
  const refundAmount = prompt(`Refund amount (max ₹${maxAmount}):`);
  if (!refundAmount) return;
  const deductions = prompt('Deduction reason (optional):') || '';
  try {
    await apiRequest(`/deposits/${id}/refund`, 'PUT', { refundAmount: Number(refundAmount), deductions: deductions ? [deductions] : [], refundDate: new Date().toISOString().split('T')[0] });
    alert('Deposit refund processed!');
    loadDeposits();
  } catch (error) { alert(error.message); }
};

window.editDeposit = async function (id) {
  try {
    const response = await apiRequest(`/deposits/${id}`);
    showDepositForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

