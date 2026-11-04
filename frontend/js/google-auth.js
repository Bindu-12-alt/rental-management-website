let googleIdentityServicesPromise;

function loadGoogleIdentityServices() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    return Promise.resolve(window.google);
  }
  if (!googleIdentityServicesPromise) {
    googleIdentityServicesPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve(window.google);
        } else {
          reject(new Error('Google sign-in could not be loaded. Please try again.'));
        }
      };
      script.onerror = () => reject(new Error('Google sign-in could not be loaded. Check your internet connection.'));
      document.head.appendChild(script);
    });
  }
  return googleIdentityServicesPromise;
}

async function initializeGoogleSignIn({ role, destination }) {
  const button = document.getElementById('googleSignInButton');
  const status = document.getElementById('googleAuthStatus');
  const error = document.getElementById('googleAuthError');
  if (!button || !status || !error) return;

  const showError = (message) => {
    error.textContent = message;
    error.classList.remove('hidden');
    status.textContent = '';
    status.classList.remove('is-loading');
  };

  try {
    const configResponse = await fetch(`${API_BASE_URL}/auth/google/config`);
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error || 'Google sign-in is unavailable.');
    if (!config.clientId) {
      status.textContent = 'Google sign-in is not configured. You can still use email and password.';
      return;
    }

    const google = await loadGoogleIdentityServices();
    google.accounts.id.initialize({
      client_id: config.clientId,
      callback: async ({ credential }) => {
        if (!credential) {
          showError('Google sign-in was cancelled. Select an account to try again.');
          return;
        }

        error.classList.add('hidden');
        status.textContent = 'Verifying your Google account…';
        status.classList.add('is-loading');
        button.setAttribute('aria-busy', 'true');

        try {
          const response = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential, role }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Google sign-in failed. Please try again.');
          if (!data.token) throw new Error('Sign-in completed without a session. Please try again.');

          if (role === 'admin') {
            if (!data.admin) throw new Error('The admin account could not be loaded. Please try again.');
            localStorage.setItem('rentease_token', data.token);
            localStorage.setItem('rentease_admin', JSON.stringify(data.admin));
          } else {
            if (!data.tenant) throw new Error('The tenant account could not be loaded. Please try again.');
            localStorage.setItem('tenant_token', data.token);
            localStorage.setItem('tenant_info', JSON.stringify(data.tenant));
          }
          window.location.assign(destination);
        } catch (authError) {
          showError(authError.message || 'Google sign-in failed. Please try again.');
          button.removeAttribute('aria-busy');
        }
      },
    });
    google.accounts.id.renderButton(button, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rect',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(200, Math.floor(button.clientWidth || 320))),
    });
  } catch (loadError) {
    showError(loadError.message || 'Google sign-in is unavailable. Please try again later.');
  }
}
