const API_BASE = 'http://localhost:5000/api';

async function tenantRequest(path, method = 'GET', body = null) {
  const token = localStorage.getItem('tenant_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function tenantEnsureAuth() {
  const token = localStorage.getItem('tenant_token');
  if (!token) window.location.href = '../tenant-login.html';
}

function tenantLogout() {
  localStorage.removeItem('tenant_token');
  localStorage.removeItem('tenant_info');
  window.location.href = '../tenant-login.html';
}
