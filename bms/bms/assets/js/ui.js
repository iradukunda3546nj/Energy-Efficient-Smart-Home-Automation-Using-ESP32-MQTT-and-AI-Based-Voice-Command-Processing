/**
 * ui.js — DOM rendering, card updates, modal, toast, theme toggle
 * Urugo Management System
 */

const UI = (() => {
  const els = {};
  let _onCmdPublish = null;
  let _modalChannel = null;

  function _cache() {
    els.deviceGrid = document.getElementById('deviceGrid');
    els.statusDot = document.getElementById('statusDot');
    els.statusLabel = document.getElementById('statusLabel');
    els.tempValue = document.getElementById('tempValue');
    els.humidityValue = document.getElementById('humidityValue');
    els.activeCount = document.getElementById('activeCount');
    els.modalOverlay = document.getElementById('modalOverlay');
    els.modal = document.getElementById('modal');
    els.modalClose = document.getElementById('modalClose');
    els.modalImage = document.getElementById('modalImage');
    els.modalDeviceName = document.getElementById('modalDeviceName');
    els.modalDeviceChannel = document.getElementById('modalDeviceChannel');
    els.modalStatusDot = document.getElementById('modalStatusDot');
    els.modalStatusText = document.getElementById('modalStatusText');
    els.modalStatusBadge = document.getElementById('modalStatusBadge');
    els.btnOn = document.getElementById('btnOn');
    els.btnOff = document.getElementById('btnOff');
    els.toastContainer = document.getElementById('toastContainer');
    els.themeToggle = document.getElementById('themeToggle');
  }

  function buildDeviceGrid(channels, channelConfig) {
    if (!els.deviceGrid) return;
    els.deviceGrid.innerHTML = '';

    Object.entries(channels).forEach(([ch, data]) => {
      const cfg = channelConfig[ch];
      const isOn = data.status === 'ON';
      const card = document.createElement('div');

      card.className = 'device-card' + (isOn ? ' is-on' : '');
      card.dataset.channel = ch;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${data.name} — ${isOn ? 'Running' : 'Stopped'}`);

      card.innerHTML = `
        <div class="device-image-wrap">
          <img class="device-image"
               src="${cfg.image}"
               alt="${data.name}"
               loading="lazy"
               onerror="this.style.opacity='0.3'" />
          <span class="device-status-badge"></span>
        </div>
        <div class="device-body">
          <div class="device-name">${data.name}</div>
          <div class="device-status-line">
            <span class="device-indicator"></span>
            <span class="device-status-text">${isOn ? 'Running' : 'Stopped'}</span>
          </div>
          <div class="device-channel-tag">CH${ch}</div>
        </div>
      `;

      card.addEventListener('click', () => openModal(parseInt(ch, 10)));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal(parseInt(ch, 10));
        }
      });

      els.deviceGrid.appendChild(card);
    });
  }

  function updateDeviceCard(channel, status) {
    if (!els.deviceGrid) return;
    const card = els.deviceGrid.querySelector(`[data-channel="${channel}"]`);
    if (!card) return;

    const isOn = status === 'ON';
    card.classList.toggle('is-on', isOn);
    card.setAttribute('aria-label', `${card.querySelector('.device-name').textContent} — ${isOn ? 'Running' : 'Stopped'}`);

    const txt = card.querySelector('.device-status-text');
    if (txt) txt.textContent = isOn ? 'Running' : 'Stopped';
  }

  function updateActiveCount(count) {
    if (els.activeCount) {
      els.activeCount.textContent = `${count} of 5 active`;
    }
  }

  function updateMqttStatus(connected) {
    if (!els.statusDot || !els.statusLabel) return;
    if (connected) {
      els.statusDot.className = 'status-dot connected';
      els.statusLabel.textContent = 'Connected';
    } else {
      els.statusDot.className = 'status-dot disconnected';
      els.statusLabel.textContent = 'Disconnected';
    }
  }

  function updateSensor(type, value) {
    if (type === 'temperature' && els.tempValue) {
      els.tempValue.textContent = value !== null ? parseFloat(value).toFixed(1) : '--';
    }
    if (type === 'humidity' && els.humidityValue) {
      els.humidityValue.textContent = value !== null ? parseFloat(value).toFixed(0) : '--';
    }
  }

  function openModal(channel) {
    _modalChannel = channel;
    _refreshModal();
    els.modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function _refreshModal() {
    if (_modalChannel === null) return;

    const state = State.getState();
    const ch = _modalChannel;
    const data = state.channels[ch];
    const cfg = CONFIG.CHANNELS[ch];
    const isOn = data.status === 'ON';

    els.modalImage.src = cfg.image;
    els.modalImage.alt = data.name;
    els.modalDeviceName.textContent = data.name;
    els.modalDeviceChannel.textContent = `Channel ${ch} — ESP32 device1`;

    els.modalStatusDot.className = 'modal-status-dot ' + (isOn ? 'on' : 'off');
    els.modalStatusText.textContent = isOn ? 'Running' : 'Stopped';

    els.modalStatusBadge.className = 'modal-status-badge ' + (isOn ? 'on' : 'off');
    els.modalStatusBadge.textContent = isOn ? 'ON' : 'OFF';
  }

  function closeModal() {
    els.modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    _modalChannel = null;
  }

  function refreshOpenModal(channel) {
    if (_modalChannel === channel) _refreshModal();
  }

  function showToast(message, type = 'info') {
    if (!els.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-dot"></span><span>${message}</span>`;
    els.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function initThemeToggle() {
    if (!els.themeToggle) return;
    els.themeToggle.addEventListener('click', () => {
      const current = State.getTheme();
      State.setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  function init(onCmdPublish) {
    _cache();
    _onCmdPublish = onCmdPublish;

    els.modalClose.addEventListener('click', closeModal);
    els.modalOverlay.addEventListener('click', e => {
      if (e.target === els.modalOverlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });

    els.btnOn.addEventListener('click', () => {
      if (_modalChannel === null) return;
      _onCmdPublish(_modalChannel, CONFIG.CMD.ON);
    });

    els.btnOff.addEventListener('click', () => {
      if (_modalChannel === null) return;
      _onCmdPublish(_modalChannel, CONFIG.CMD.OFF);
    });

    initThemeToggle();
  }

  function renderDevices(payload) {
    if (!payload) {
      buildDeviceGrid(State.getChannels(), CONFIG.CHANNELS);
      updateActiveCount(State.getActiveCount());
      console.log('[UI] Rendering devices...');
      return;
    }

    if (payload.channel !== undefined) {
      updateDeviceCard(payload.channel, payload.status);
      updateActiveCount(payload.activeCount ?? State.getActiveCount());
      refreshOpenModal(payload.channel);
      return;
    }

    buildDeviceGrid(payload.channels || State.getChannels(), CONFIG.CHANNELS);
    updateActiveCount(State.getActiveCount());
    console.log('[UI] Rendering devices...');
  }

  return {
    init,
    renderDevices,
    updateDeviceCard,
    updateActiveCount,
    updateMqttStatus,
    updateSensor,
    openModal,
    closeModal,
    refreshOpenModal,
    showToast,
  };
})();
