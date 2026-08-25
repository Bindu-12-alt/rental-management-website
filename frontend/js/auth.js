document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const pageMessage = document.getElementById('pageMessage');
  if (pageMessage) {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('message');
    if (message) pageMessage.textContent = message;
  }
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorEl = document.getElementById('loginError');

    errorEl.textContent = '';
    if (!email || !password) {
      errorEl.textContent = 'Email and password are required.';
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Invalid login credentials');
      }
      localStorage.setItem('rentease_token', data.token);
      localStorage.setItem('rentease_admin', JSON.stringify(data.admin));
      window.location.href = 'pages/dashboard.html';
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });
});

