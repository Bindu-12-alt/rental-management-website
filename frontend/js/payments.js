document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  initializePaymentPage();
  loadPayments();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function initializePaymentPage() {
  const createBtn = document.getElementById('createPaymentBtn');
  const cancelBtn = document.getElementById('cancelPaymentBtn');
  if (createBtn) createBtn.addEventListener('click', () => showPaymentForm());
  if (cancelBtn) cancelBtn.addEventListener('click', hidePaymentForm);
  const form = document.getElementById('paymentForm');
  if (form) form.addEventListener('submit', submitPaymentForm);
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.addEventListener('input', loadPayments);
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) statusFilter.addEventListener('change', loadPayments);
}

let editingPaymentId = null;

function showPaymentForm(payment = null) {
  const section = document.getElementById('paymentFormSection');
  if (!section) return;
  section.classList.remove('hidden');
  document.getElementById('paymentFormTitle').textContent = payment ? 'Edit Payment' : 'Add Payment';
  document.getElementById('paymentFormError').textContent = '';
  if (payment) {
    editingPaymentId = payment._id;
    document.getElementById('payTenant').value = payment.tenant._id;
    document.getElementById('payApartment').value = payment.apartment._id;
    document.getElementById('payAmount').value = payment.amount;
    document.getElementById('payDueDate').value = payment.dueDate.split('T')[0];
    document.getElementById('payPaymentDate').value = payment.paymentDate.split('T')[0];
    document.getElementById('payMethod').value = payment.method;
    document.getElementById('payTransaction').value = payment.transactionId || '';
    document.getElementById('payStatus').value = payment.status;
  } else {
    editingPaymentId = null;
    document.getElementById('paymentForm').reset();
  }
}

function hidePaymentForm() {
  document.getElementById('paymentFormSection').classList.add('hidden');
  document.getElementById('paymentForm').reset();
  editingPaymentId = null;
}

async function submitPaymentForm(event) {
  event.preventDefault();
  const errorEl = document.getElementById('paymentFormError');
  const data = {
    tenant: document.getElementById('payTenant').value.trim(),
    apartment: document.getElementById('payApartment').value.trim(),
    amount: Number(document.getElementById('payAmount').value),
    dueDate: document.getElementById('payDueDate').value,
    paymentDate: document.getElementById('payPaymentDate').value,
    method: document.getElementById('payMethod').value.trim(),
    transactionId: document.getElementById('payTransaction').value.trim(),
    status: document.getElementById('payStatus').value,
  };
  if (!data.tenant || !data.apartment || !data.amount || !data.dueDate || !data.paymentDate || !data.method) {
    errorEl.textContent = 'Please complete all required fields.';
    return;
  }
  try {
    if (editingPaymentId) {
      await apiRequest(`/payments/${editingPaymentId}`, 'PUT', data);
    } else {
      await apiRequest('/payments', 'POST', data);
    }
    hidePaymentForm();
    loadPayments();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

async function loadPayments() {
  try {
    const search = document.getElementById('searchInput')?.value.trim();
    const status = document.getElementById('statusFilter')?.value;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (status) query.append('status', status);
    const response = await apiRequest(`/payments?${query.toString()}`);
    const body = document.getElementById('paymentsTableBody');
    body.innerHTML = response.data.map((payment) => `
      <tr>
        <td>${payment.tenant?.fullName || '—'}</td>
        <td>${payment.apartment?.apartmentNumber || '—'}</td>
        <td>₹${payment.amount.toFixed(2)}</td>
        <td>${payment.dueDate.split('T')[0]}</td>
        <td>${payment.paymentDate.split('T')[0]}</td>
        <td><span class="status-badge ${payment.status.toLowerCase()}">${payment.status}</span></td>
        <td><button class="button small" onclick="editPayment('${payment._id}')">Edit</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

window.editPayment = async function (id) {
  try {
    const response = await apiRequest(`/payments/${id}`);
    showPaymentForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

