document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  loadNotifications();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

async function loadNotifications() {
  try {
    const response = await apiRequest('/notifications');
    const container = document.getElementById('notificationsList');
    container.innerHTML = response.data.map((notification) => `
      <div class="activity-row">
        <div><strong>${notification.type}</strong><p>${notification.message}</p></div>
        <div class="activity-meta"><span>${notification.priority}</span><small>${new Date(notification.createdAt).toLocaleString()}</small><button class="button small" onclick="markRead('${notification._id}')">Mark Read</button></div>
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

window.markRead = async function (id) {
  try {
    await apiRequest(`/notifications/${id}/read`, 'PUT');
    loadNotifications();
  } catch (error) {
    console.error(error);
  }
};

