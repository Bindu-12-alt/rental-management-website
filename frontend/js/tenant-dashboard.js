document.addEventListener('DOMContentLoaded', () => {
  tenantEnsureAuth();
  attachLogout();
  loadTenantDashboard();
  setupContactAdmin();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); tenantLogout(); });
}

async function loadTenantDashboard() {
  try {
    const [meRes, paymentsRes, notifRes, maintenanceRes, historyRes] = await Promise.allSettled([
      tenantRequest('/tenant-portal/me'),
      tenantRequest('/tenant-portal/payments'),
      tenantRequest('/tenant-portal/notifications'),
      tenantRequest('/tenant-portal/maintenance'),
      tenantRequest('/tenant-portal/history'),
    ]);

    // Profile
    if (meRes.status === 'fulfilled' && meRes.value.success) {
      const tenant = meRes.value.data;
      const nameEl = document.getElementById('tenantName');
      const profileEl = document.getElementById('profileName');
      const firstName = tenant.fullName.split(' ')[0];
      if (nameEl) nameEl.textContent = firstName;
      if (profileEl) profileEl.textContent = firstName;

      // Store for contact admin
      window._tenantData = tenant;

      renderApartmentCard(tenant.apartment);
    }

    // Payments stats
    let paidCount = 0, pendingCount = 0, overdueCount = 0;
    if (paymentsRes.status === 'fulfilled' && paymentsRes.value.success) {
      const payments = paymentsRes.value.data;
      paidCount = payments.filter(p => p.status === 'Paid').length;
      pendingCount = payments.filter(p => p.status === 'Pending').length;
      overdueCount = payments.filter(p => p.status === 'Overdue').length;
    }

    // Notifications
    let unreadCount = 0;
    if (notifRes.status === 'fulfilled' && notifRes.value.success) {
      unreadCount = notifRes.value.unreadCount || 0;
      renderRecentNotifications(notifRes.value.data.slice(0, 5));
    }

    // Maintenance
    if (maintenanceRes.status === 'fulfilled' && maintenanceRes.value.success) {
      const active = maintenanceRes.value.data.filter(r => r.status !== 'Resolved' && r.status !== 'Closed' && r.status !== 'Rejected');
      renderActiveMaintenance(active.slice(0, 4));
    }

    // History
    if (historyRes.status === 'fulfilled' && historyRes.value.success) {
      renderRecentHistory(historyRes.value.data.slice(0, 5));
    }

    // Stat cards
    renderStatCards({ paidCount, pendingCount, overdueCount, unreadCount });

    // Notification badge
    const badge = document.getElementById('notificationBadge');
    const navBadge = document.getElementById('navNotifBadge');
    if (badge) { badge.textContent = unreadCount; badge.classList.toggle('hidden', unreadCount === 0); }
    if (navBadge) { navBadge.textContent = unreadCount; navBadge.classList.toggle('hidden', unreadCount === 0); }

  } catch (error) {
    console.error('[Dashboard] Load error:', error);
  }
}

function renderStatCards({ paidCount, pendingCount, overdueCount, unreadCount }) {
  const container = document.getElementById('tenantCards');
  if (!container) return;
  const cards = [
    { label: 'Payments Made', value: paidCount, icon: 'fa-circle-check', color: 'success' },
    { label: 'Pending Payments', value: pendingCount, icon: 'fa-clock', color: 'warning' },
    { label: 'Overdue Payments', value: overdueCount, icon: 'fa-triangle-exclamation', color: 'danger' },
    { label: 'Unread Notifications', value: unreadCount, icon: 'fa-bell', color: 'blue' },
  ];
  container.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="card-icon ${c.color}"><i class="fa-solid ${c.icon}"></i></div>
      <div><p>${c.label}</p><h3>${c.value}</h3></div>
    </div>
  `).join('');
}

function renderApartmentCard(apartment) {
  const container = document.getElementById('apartmentInfo');
  const badge = document.getElementById('aptStatusBadge');
  if (!container) return;

  if (!apartment) {
    container.innerHTML = `
      <div class="apt-not-assigned">
        <i class="fa-solid fa-building-circle-xmark"></i>
        <p>No apartment assigned yet. Please contact your property manager.</p>
      </div>`;
    return;
  }

  if (badge) {
    badge.innerHTML = `<span class="status-badge ${apartment.status.toLowerCase().replace(' ', '-')}">${apartment.status}</span>`;
  }

  const address = [apartment.locality, apartment.city, apartment.state].filter(Boolean).join(', ');
  const mapsUrl = apartment.latitude && apartment.longitude
    ? `https://www.google.com/maps?q=${apartment.latitude},${apartment.longitude}`
    : apartment.address
      ? `https://www.google.com/maps/search/${encodeURIComponent(apartment.address)}`
      : null;

  container.innerHTML = `
    <div class="apt-info-row">
      <i class="fa-solid fa-hashtag"></i>
      <div><strong>Unit</strong><span>${apartment.apartmentNumber}</span></div>
    </div>
    <div class="apt-info-row">
      <i class="fa-solid fa-building"></i>
      <div><strong>Building</strong><span>${apartment.buildingDetails}</span></div>
    </div>
    <div class="apt-info-row">
      <i class="fa-solid fa-stairs"></i>
      <div><strong>Floor</strong><span>${apartment.floorDetails}</span></div>
    </div>
    <div class="apt-info-row">
      <i class="fa-solid fa-tag"></i>
      <div><strong>Type</strong><span>${apartment.apartmentType}</span></div>
    </div>
    <div class="apt-info-row">
      <i class="fa-solid fa-money-bill-wave"></i>
      <div><strong>Monthly Rent</strong><span>₹${Number(apartment.monthlyRent).toLocaleString('en-IN')}</span></div>
    </div>
    ${address ? `<div class="apt-info-row"><i class="fa-solid fa-location-dot"></i><div><strong>Location</strong><span>${address}</span></div></div>` : ''}
    ${mapsUrl ? `<div style="margin-top:12px"><a href="${mapsUrl}" target="_blank" rel="noopener" class="button small outline" style="font-size:13px"><i class="fa-solid fa-map-location-dot"></i> View on Map</a></div>` : ''}
  `;
}

function renderRecentNotifications(notifications) {
  const container = document.getElementById('recentNotifications');
  if (!container) return;
  if (!notifications.length) { container.innerHTML = '<p class="muted-text">No notifications yet.</p>'; return; }
  container.innerHTML = notifications.map(n => `
    <div class="notif-item">
      <div class="notif-dot ${n.read ? 'read' : ''}"></div>
      <div>
        <div class="notif-text">${n.message}</div>
        <div class="notif-time">${new Date(n.createdAt).toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

function renderActiveMaintenance(requests) {
  const container = document.getElementById('activeMaintenance');
  if (!container) return;
  if (!requests.length) { container.innerHTML = '<p class="muted-text">No active maintenance requests.</p>'; return; }
  const statusColor = { 'Pending': '#F59E0B', 'In Progress': '#2563EB', 'Resolved': '#16A34A', 'Rejected': '#DC2626' };
  container.innerHTML = requests.map(r => `
    <div class="maint-item">
      <div class="maint-cat-icon"><i class="fa-solid fa-wrench"></i></div>
      <div class="maint-info">
        <div class="maint-title">${r.title}</div>
        <div class="maint-sub">${r.category || 'Other'} · ${r.priority} priority</div>
      </div>
      <span class="status-badge" style="background:${statusColor[r.status] || '#64748B'}">${r.status}</span>
    </div>
  `).join('');
}

function renderRecentHistory(history) {
  const container = document.getElementById('recentHistory');
  if (!container) return;
  if (!history.length) { container.innerHTML = '<p class="muted-text">No activity yet.</p>'; return; }
  container.innerHTML = history.map(h => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div>
        <div class="history-title">${h.title}</div>
        ${h.description ? `<div class="history-desc">${h.description}</div>` : ''}
        <div class="history-date">${new Date(h.createdAt).toLocaleDateString()} · ${h.type}</div>
      </div>
    </div>
  `).join('');
}

function setupContactAdmin() {
  const form = document.getElementById('contactAdminForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('contactAdminMsg');
    const input = document.getElementById('adminMsgInput');
    const message = input?.value.trim();
    if (!message) return;
    const channel = document.getElementById('adminMessageChannel')?.value || 'email';
    if (msgEl) { msgEl.classList.add('hidden'); msgEl.className = 'form-msg hidden'; }

    try {
      const response = await tenantRequest('/tenant-portal/contact-admin', 'POST', { message, channel });
      input.value = '';
      if (msgEl) {
        msgEl.textContent = `✓ ${response.message}`;
        msgEl.className = 'form-msg success';
        msgEl.classList.remove('hidden');
        setTimeout(() => msgEl.classList.add('hidden'), 4000);
      }
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || 'Failed to send message.';
        msgEl.className = 'form-msg error';
        msgEl.classList.remove('hidden');
      }
    }
  });
}
