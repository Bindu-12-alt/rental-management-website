document.addEventListener('DOMContentLoaded', () => {
  ensureAuth();
  attachLogout();
  initHistoryPage();
  loadHistory();
});

function attachLogout() {
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) logoutLink.addEventListener('click', (event) => { event.preventDefault(); logout(); });
}

function initHistoryPage() {
  const typeFilter = document.getElementById('typeFilter');
  const searchInput = document.getElementById('historySearch');
  if (typeFilter) typeFilter.addEventListener('change', loadHistory);
  if (searchInput) searchInput.addEventListener('input', loadHistory);
}

async function loadHistory() {
  try {
    const type = document.getElementById('typeFilter')?.value;
    const search = document.getElementById('historySearch')?.value.trim();
    const query = new URLSearchParams();
    if (type) query.append('type', type);
    const data = await apiRequest(`/history?${query.toString()}`);
    const list = document.getElementById('historyList');
    const filtered = search ? data.data.filter((item) => {
      return item.title.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase()) || item.tenant?.fullName.toLowerCase().includes(search.toLowerCase()) || item.apartment?.apartmentNumber.toLowerCase().includes(search.toLowerCase());
    }) : data.data;
    list.innerHTML = filtered.map((history) => `
      <div class="activity-row">
        <div><strong>${history.type} - ${history.title}</strong><p>${history.description || ''}</p></div>
        <div class="activity-meta"><span>${history.apartment?.apartmentNumber || history.tenant?.fullName || ''}</span><small>${new Date(history.createdAt).toLocaleString()}</small></div>
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

