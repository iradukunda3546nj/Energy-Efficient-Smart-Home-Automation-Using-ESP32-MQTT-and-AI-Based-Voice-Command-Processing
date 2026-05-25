/* ============================================
   Urugo Auth — Shared Utilities
   ============================================ */

// ── Toast System ──────────────────────────────
const Toast = (() => {
  let container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`,
    error:   `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  };

  return {
    show(message, type = 'info', duration = 4000) {
      const c = getContainer();
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.innerHTML = `${ICONS[type] || ICONS.info}<span>${message}</span>`;
      c.appendChild(el);

      setTimeout(() => {
        el.classList.add('hide');
        el.addEventListener('animationend', () => el.remove());
      }, duration);
    },
    success: (m, d) => Toast.show(m, 'success', d),
    error:   (m, d) => Toast.show(m, 'error', d),
    info:    (m, d) => Toast.show(m, 'info', d),
    warning: (m, d) => Toast.show(m, 'warning', d),
  };
})();

// ── Form Helpers ──────────────────────────────
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function fieldError(inputEl, message) {
  inputEl.classList.add('error');
  const group = inputEl.closest('.form-group') || inputEl.closest('.input-wrap')?.parentElement;
  if (!group) return;
  let msg = group.querySelector('.field-msg');
  if (!msg) { msg = document.createElement('span'); msg.className = 'field-msg'; group.appendChild(msg); }
  msg.textContent = message;
  msg.classList.add('show');
}

function clearFieldError(inputEl) {
  inputEl.classList.remove('error');
  const group = inputEl.closest('.form-group') || inputEl.closest('.input-wrap')?.parentElement;
  if (!group) return;
  const msg = group.querySelector('.field-msg');
  if (msg) msg.classList.remove('show');
}

function clearAllErrors(form) {
  form.querySelectorAll('input').forEach(clearFieldError);
}

// ── Validation ────────────────────────────────
const Validate = {
  email(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
  phone(v) { return /^\d{9,13}$/.test(v.replace(/\s/g, '')); },
  password(v) {
    const checks = {
      length:  v.length >= 8,
      upper:   /[A-Z]/.test(v),
      lower:   /[a-z]/.test(v),
      number:  /\d/.test(v),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(v),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score, strong: score >= 4 };
  },
};

// ── Password Toggle ───────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = btn.closest('.input-wrap').querySelector('input');
      const isText = inp.type === 'text';
      inp.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? EYE_ICON : EYE_OFF_ICON;
    });
  });
}

const EYE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// ── AJAX helper ───────────────────────────────
async function apiPost(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(data),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Session check ─────────────────────────────
async function requireGuest(redirectTo = '/bms/dashboard.html') {
  try {
    const r = await apiPost('php/session_check.php', {});
    if (r.authenticated) window.location.href = redirectTo;
  } catch (_) {}
}

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  document.querySelectorAll('.toggle-pw').forEach(btn => { btn.innerHTML = EYE_ICON; });
});