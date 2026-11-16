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
  populateSelect('payTenant', '/tenants', '_id', (tenant) => `${tenant.fullName} (${tenant.email})`, 'Select Tenant');
  populateSelect('payApartment', '/apartments', '_id', (apartment) => `${apartment.apartmentNumber} — ${apartment.buildingDetails}`, 'Select Apartment');
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
  if (!data.tenant || !data.apartment || !Number.isFinite(data.amount) || data.amount < 0 || !data.dueDate || !data.paymentDate || !data.method) {
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
    body.innerHTML = response.data.map((payment) => {
      const emailStatus = payment.confirmationEmailStatus || 'not_sent';
      const emailSendingAt = new Date(payment.confirmationEmailSendingAt).getTime();
      const staleEmailSend = emailStatus === 'sending'
        && (!Number.isFinite(emailSendingAt) || Date.now() - emailSendingAt > 10 * 60 * 1000);
      const retryButton = payment.status === 'Paid' && emailStatus !== 'sent'
        && (emailStatus !== 'sending' || staleEmailSend)
        ? `<button class="button small outline" onclick="retryPaymentEmail('${payment._id}')">Retry email</button>`
        : '';
      const reminderStatus = payment.rentReminderSentAt
        ? `Sent ${new Date(payment.rentReminderSentAt).toLocaleString()}`
        : payment.rentReminderError ? `Failed: ${payment.rentReminderError}` : 'Not due';
      return `<tr>
        <td>${escapePaymentText(payment.tenant?.fullName || '—')}</td>
        <td>${escapePaymentText(payment.apartment?.apartmentNumber || '—')}</td>
        <td>₹${Number(payment.amount).toFixed(2)}</td>
        <td>${escapePaymentText(payment.dueDate.split('T')[0])}</td>
        <td>${escapePaymentText(payment.paymentDate.split('T')[0])}</td>
        <td><span class="status-badge">${escapePaymentText(payment.status)}</span></td>
        <td>${escapePaymentText(reminderStatus)}</td>
        <td title="${escapePaymentText(payment.confirmationEmailError || '')}">${escapePaymentText(emailStatus)}</td>
        <td>${retryButton}<button class="button small" onclick="editPayment('${escapePaymentText(payment._id)}')">Edit</button></td>
      </tr>`;
    }).join('');
  } catch (error) {
    console.error(error);
  }
}

function escapePaymentText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

window.retryPaymentEmail = async function (id) {
  try {
    const result = await apiRequest(`/payments/${encodeURIComponent(id)}/email`, 'POST');
    window.alert(result.message);
    await loadPayments();
  } catch (error) {
    await loadPayments();
    window.alert(error.message);
  }
};

window.editPayment = async function (id) {
  try {
    const response = await apiRequest(`/payments/${id}`);
    showPaymentForm(response.data);
  } catch (error) {
    console.error(error);
  }
};

