// Detect API base URL: use same origin in production, configurable for dev
const API_BASE_URL = (() => {
  // If running from file:// or a live-server on a different port, use the backend URL
  if (window.location.protocol === 'file:') return 'http://localhost:5000/api';
  // Same-origin (served by Express)
  return '/api';
})();

async function apiRequest(path, method = 'GET', body = null) {
  const token = localStorage.getItem('rentease_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Server error');
  }
  return data;
}

function ensureAuth() {
  const token = localStorage.getItem('rentease_token');
  if (!token) {
    const message = encodeURIComponent('Please login first to access this page');
    window.location.href = '../login.html?message=' + message;
  }
}

function logout() {
  localStorage.removeItem('rentease_token');
  localStorage.removeItem('rentease_admin');
  window.location.href = '/';
}

function showNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

async function populateSelect(selectId, endpoint, valueField, labelFn, emptyLabel = 'Select') {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await apiRequest(endpoint);
    const current = select.value;
    select.innerHTML = `<option value="">${emptyLabel}</option>`;
    res.data.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item[valueField];
      opt.textContent = labelFn(item);
      select.appendChild(opt);
    });
    if (current) select.value = current;
  } catch (e) { console.error('Failed to populate', selectId, e); }
}
