document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  addLogoutHandler();
  loadDashboard();
  loadNotifications();
});

function addLogoutHandler() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

async function loadDashboard() {
  try {
    const statsResult = await apiRequest('/dashboard/stats');
    const stats = statsResult.data;
    const container = document.getElementById('dashboardCards');
    container.innerHTML = '';

    const cards = [
      { label: 'Total Apartments', value: stats.totalApartments, icon: 'fa-building', color: 'blue' },
      { label: 'Occupied Apartments', value: stats.occupiedApartments, icon: 'fa-house-chimney-user', color: 'success' },
      { label: 'Empty Apartments', value: stats.emptyApartments, icon: 'fa-door-open', color: 'gray' },
      { label: 'Vacating Soon', value: stats.vacatingSoon, icon: 'fa-hourglass-half', color: 'warning' },
      { label: 'Total Tenants', value: stats.totalTenants, icon: 'fa-users', color: 'blue' },
      { label: 'Pending Rent', value: stats.pendingRent, icon: 'fa-clock', color: 'warning' },
      { label: 'Overdue Rent', value: stats.overdueRent, icon: 'fa-triangle-exclamation', color: 'danger' },
      { label: 'Upcoming Renewals', value: stats.upcomingRenewals, icon: 'fa-calendar-days', color: 'blue' },
      { label: 'Pending Vacating', value: stats.pendingVacatingRequests, icon: 'fa-clipboard-list', color: 'warning' },
      { label: 'Pending Deposit Refunds', value: stats.pendingDepositRefunds, icon: 'fa-hand-holding-dollar', color: 'success' },
    ];

    cards.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'stat-card';
      cardEl.innerHTML = `
        <div class="card-icon ${card.color}"><i class="fa-solid ${card.icon}"></i></div>
        <div>
          <p>${card.label}</p>
          <h3>${card.value}</h3>
        </div>
      `;
      container.appendChild(cardEl);
    });

    const activityResult = await apiRequest('/dashboard/recent-activities');
    renderRecentActivities(activityResult.data);
    renderCharts(stats);
  } catch (error) {
    console.error(error);
  }
}

function renderRecentActivities(activities) {
  const container = document.getElementById('recentActivities');
  container.innerHTML = activities.map((item) => {
    const date = new Date(item.createdAt).toLocaleDateString();
    const target = item.apartment?.apartmentNumber || item.tenant?.fullName || '';
    return `
      <div class="activity-row">
        <div>
          <strong>${item.title}</strong>
          <p>${item.description || ''}</p>
        </div>
        <div class="activity-meta">
          <span>${target}</span>
          <small>${date}</small>
        </div>
      </div>
    `;
  }).join('');
}

function renderCharts(stats) {
  const occupancyCtx = document.getElementById('occupancyChart');
  const paymentCtx = document.getElementById('paymentChart');
  if (occupancyCtx) {
    new Chart(occupancyCtx, {
      type: 'doughnut',
      data: {
        labels: ['Occupied', 'Empty', 'Vacating Soon'],
        datasets: [{ data: [stats.occupiedApartments, stats.emptyApartments, stats.vacatingSoon], backgroundColor: ['#2563EB', '#94A3B8', '#F59E0B'] }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }
  if (paymentCtx) {
    new Chart(paymentCtx, {
      type: 'bar',
      data: {
        labels: ['Paid', 'Pending', 'Overdue'],
        datasets: [{ data: [0, stats.pendingRent, stats.overdueRent], backgroundColor: ['#16A34A', '#F59E0B', '#DC2626'] }],
      },
      options: { responsive: true, scales: { y: { beginAtZero: true } } },
    });
  }
}

async function loadNotifications() {
  try {
    const data = await apiRequest('/notifications');
    showNotificationBadge(data.unreadCount);
  } catch (error) {
    console.error(error);
  }
}


