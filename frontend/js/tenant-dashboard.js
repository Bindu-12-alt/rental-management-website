document.addEventListener('DOMContentLoaded', async () => {
  tenantEnsureAuth();
  document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); tenantLogout(); });

  const info = JSON.parse(localStorage.getItem('tenant_info') || '{}');
  document.getElementById('tenantName').textContent = info.fullName || 'Tenant';
  document.getElementById('profileName').textContent = info.fullName || 'Tenant';

  try {
    const [meRes, paymentsRes, notifRes, historyRes] = await Promise.all([
      tenantRequest('/tenant-portal/me'),
      tenantRequest('/tenant-portal/payments'),
      tenantRequest('/tenant-portal/notifications'),
      tenantRequest('/tenant-portal/history'),
    ]);

    const tenant = meRes.data;
    const payments = paymentsRes.data;
    const notifications = notifRes.data;

    // Notification badge
    if (notifRes.unreadCount > 0) {
      const badge = document.getElementById('notificationBadge');
      badge.textContent = notifRes.unreadCount;
      badge.classList.remove('hidden');
    }

    // Stat cards
    const paid = payments.filter(p => p.status === 'Paid').length;
    const pending = payments.filter(p => p.status === 'Pending').length;
    const overdue = payments.filter(p => p.status === 'Overdue').length;
    const cards = [
      { label: 'Total Payments', value: payments.length, icon: 'fa-money-bill-wave', color: 'blue' },
      { label: 'Paid', value: paid, icon: 'fa-circle-check', color: 'success' },
      { label: 'Pending', value: pending, icon: 'fa-clock', color: 'warning' },
      { label: 'Overdue', value: overdue, icon: 'fa-triangle-exclamation', color: 'danger' },
      { label: 'Unread Notifications', value: notifRes.unreadCount, icon: 'fa-bell', color: 'warning' },
    ];
    document.getElementById('tenantCards').innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="card-icon ${c.color}"><i class="fa-solid ${c.icon}"></i></div>
        <div><p>${c.label}</p><h3>${c.value}</h3></div>
      </div>`).join('');

    // Apartment info
    if (tenant.apartment) {
      const apt = tenant.apartment;
      document.getElementById('apartmentInfo').innerHTML = `
        <div style="display:grid; gap:0.5rem;">
          <p><strong>Apartment:</strong> ${apt.apartmentNumber}</p>
          <p><strong>Building:</strong> ${apt.buildingDetails}</p>
          <p><strong>Floor:</strong> ${apt.floorDetails}</p>
          <p><strong>Monthly Rent:</strong> ₹${apt.monthlyRent?.toFixed(2)}</p>
          <p><strong>Status:</strong> <span class="status-badge ${apt.status?.replace(' ','-').toLowerCase()}">${apt.status}</span></p>
        </div>`;
    }

    // Recent notifications
    if (notifications.length) {
      document.getElementById('recentNotifications').innerHTML = notifications.slice(0, 4).map(n => `
        <div class="activity-row">
          <div><strong>${n.type}</strong><p>${n.message}</p></div>
          <div class="activity-meta"><small>${new Date(n.createdAt).toLocaleDateString()}</small></div>
        </div>`).join('');
    }

    // Recent history
    if (historyRes.data.length) {
      document.getElementById('recentHistory').innerHTML = historyRes.data.slice(0, 5).map(h => `
        <div class="activity-row">
          <div><strong>${h.type} — ${h.title}</strong><p>${h.description || ''}</p></div>
          <div class="activity-meta"><small>${new Date(h.createdAt).toLocaleDateString()}</small></div>
        </div>`).join('');
    } else {
      document.getElementById('recentHistory').innerHTML = '<p style="color:var(--muted); padding:1rem;">No activity yet.</p>';
    }

  } catch (err) {
    console.error(err);
  }
});
