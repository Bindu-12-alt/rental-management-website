document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  loadNotifications();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function escapeNotificationText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

async function loadNotifications() {
  try {
    const response = await apiRequest('/notifications');
    const container = document.getElementById('notificationsList');
    container.innerHTML = response.data.map((notification) => `
      <div class="activity-row">
        <div><strong>${escapeNotificationText(notification.type)}</strong><p>${escapeNotificationText(notification.message)}</p></div>
        <div class="activity-meta"><span>${escapeNotificationText(notification.priority)}</span><small>${escapeNotificationText(new Date(notification.createdAt).toLocaleString())}</small><button class="button small" onclick="markRead('${escapeNotificationText(notification._id)}')">Mark Read</button></div>
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

