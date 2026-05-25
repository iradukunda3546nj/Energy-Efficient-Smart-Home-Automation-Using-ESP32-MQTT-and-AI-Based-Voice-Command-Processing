/**
 * Urugo Management System — Dashboard Auth Guard
 * Include this script at the TOP of dashboard.html (inside <head>)
 * <script src="assets/login/js/auth-guard.js"></script>
 */

(function () {
  'use strict';

  const LOGIN_URL  = 'assets/login/login.html';
  const CHECK_URL  = 'assets/login/php/session_check.php';
  const LOGOUT_URL = 'assets/login/php/logout.php';

  // ── Show a blocking overlay while we verify session ──────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'authOverlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#080e1a',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:1rem',
  ].join(';');
  overlay.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;width:40px;height:40px">
      <span style="background:#22c55e;border-radius:4px;display:block"></span>
      <span style="background:#15803d;border-radius:4px;display:block"></span>
      <span style="background:#15803d;border-radius:4px;display:block"></span>
      <span style="background:#22c55e;border-radius:4px;display:block"></span>
    </div>
    <div style="color:#4a6080;font-family:sans-serif;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">
      Authenticating…
    </div>`;
  document.documentElement.appendChild(overlay);

  // ── Check session via PHP ─────────────────────────────────────────────────
  fetch(CHECK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({}),
    credentials: 'same-origin',
  })
    .then(r => r.json())
    .then(data => {
      if (!data.authenticated) {
        window.location.replace(LOGIN_URL);
        return;
      }
      // Session OK — show dashboard
      overlay.remove();
      injectUserMenu(data.user_name || 'User');
    })
    .catch(() => {
      // If PHP isn't set up yet, remove overlay (dev mode)
      console.warn('[AuthGuard] Backend not reachable — running in dev mode');
      overlay.remove();
    });

  // ── Inject logout button into dashboard ───────────────────────────────────
  function injectUserMenu(name) {
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => injectUserMenu(name));
      return;
    }

    // Try to find a navbar/header to attach to; fall back to fixed button
    const navbar = document.querySelector('nav, header, .navbar, .topbar, #navbar, #header');

    const btn = document.createElement('button');
    btn.id = 'logoutBtn';
    btn.title = `Signed in as ${name}`;
    btn.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:.45rem',
      'background:rgba(34,197,94,.1)', 'border:1px solid rgba(34,197,94,.25)',
      'color:#22c55e', 'padding:.4rem .85rem', 'border-radius:8px',
      'font-size:.78rem', 'font-weight:600', 'font-family:inherit',
      'cursor:pointer', 'transition:all .2s', 'white-space:nowrap',
      navbar ? '' : 'position:fixed;top:1rem;right:1rem;z-index:9000',
    ].join(';');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>${escapeHtml(name.split(' ')[0])}</span>`;

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(34,197,94,.18)';
      btn.style.borderColor = 'rgba(34,197,94,.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(34,197,94,.1)';
      btn.style.borderColor = 'rgba(34,197,94,.25)';
    });

    btn.addEventListener('click', handleLogout);

    if (navbar) {
      navbar.style.position = navbar.style.position || 'relative';
      btn.style.marginLeft = 'auto';
      navbar.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
  }

  async function handleLogout() {
    try {
      await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({}),
        credentials: 'same-origin',
      });
    } catch (_) { /* session already gone */ }
    window.location.replace(LOGIN_URL);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
})();
