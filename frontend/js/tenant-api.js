const TENANT_API_BASE = 'https://rentease-m4ev.onrender.com/api';

async function tenantRequest(path, method = 'GET', body = null) {
  const token = localStorage.getItem('tenant_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${TENANT_API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function tenantFormRequest(path, method = 'POST', formData) {
  const token = localStorage.getItem('tenant_token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${TENANT_API_BASE}${path}`, {
    method, headers, body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function tenantEnsureAuth() {
  const token = localStorage.getItem('tenant_token');
  if (!token) window.location.href = '/tenant-login.html';
}

function tenantLogout() {
  localStorage.removeItem('tenant_token');
  localStorage.removeItem('tenant_info');
  window.location.href = '/';
}

function getTenantInfo() {
  try {
    return JSON.parse(localStorage.getItem('tenant_info') || '{}');
  } catch { return {}; }
}
