/**
 * URUGO VOICE SYSTEM — voice.js (v5)
 * Build: 2024-PROD-V5
 * Zero permission probing. Zero popups on load. Gesture-safe mic flow.
 */

'use strict';

/* Silence browser-extension message-channel noise */
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason && e.reason.message) || e.reason || '');
  if (
    msg.includes('message channel closed') ||
    msg.includes('asynchronous response') ||
    msg.includes('Extension context')
  ) { e.preventDefault(); }
});

/* ── CONFIG ──────────────────────────────────────────────── */
const CONFIG = {
  deepseek: {
    apiKey: 'sk-ed7b6e548220489c934ae......',//your LLM AI API
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    systemPrompt:
      'You are a smart home voice command interpreter. ' +
      'Analyze the user speech and return ONLY one of these exact tokens ' +
      '(nothing else, no punctuation, no explanation): ' +
      'AC_ON, AC_OFF, LIGHT_ON, LIGHT_OFF, TV_ON, TV_OFF, ' +
      'FRIDGE_ON, FRIDGE_OFF, SOCKET_ON, SOCKET_OFF, UNKNOWN'
  },
  mqtt: {
    brokers: [
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://broker.hivemq.com:8000/mqtt',
      'wss://test.mosquitto.org:8081/mqtt',
      'wss://mqtt.eclipseprojects.io:443/mqtt'
    ],
    topicBase: 'bms/device1/cmd/',
    clientIdPrefix: 'urugo_',
    reconnectPeriod: 0,
    connectTimeout: 7000
  },
  speech: {
    lang: 'en-US',
    interimResults: true,
    silenceTimeout: 2200
  },
  commandMap: {
    LIGHT_ON:   { channel: 1, device: 'LIGHT',  action: 'ON'  },
    LIGHT_OFF:  { channel: 1, device: 'LIGHT',  action: 'OFF' },
    TV_ON:      { channel: 2, device: 'TV',     action: 'ON'  },
    TV_OFF:     { channel: 2, device: 'TV',     action: 'OFF' },
    FRIDGE_ON:  { channel: 3, device: 'FRIDGE', action: 'ON'  },
    FRIDGE_OFF: { channel: 3, device: 'FRIDGE', action: 'OFF' },
    AC_ON:      { channel: 4, device: 'AC',     action: 'ON'  },
    AC_OFF:     { channel: 4, device: 'AC',     action: 'OFF' },
    SOCKET_ON:  { channel: 5, device: 'SOCKET', action: 'ON'  },
    SOCKET_OFF: { channel: 5, device: 'SOCKET', action: 'OFF' }
  }
};

/* ── STATE ───────────────────────────────────────────────── */
const State = {
  micState: 'idle',
  isProcessing: false,
  mqttConnected: false,
  mqttClient: null,
  mqttBrokerIndex: 0,
  mqttRetryTimer: null,
  recognition: null,
  silenceTimer: null,
  deviceStates: { 1:'OFF', 2:'OFF', 3:'OFF', 4:'OFF', 5:'OFF' }
};

/* ── DOM ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const DOM = {
  micBtn:           () => $('micBtn'),
  micBorderWrapper: () => $('micBorderWrapper'),
  micStateLabel:    () => $('micStateLabel'),
  waveVisualizer:   () => $('waveVisualizer'),
  transcriptText:   () => $('transcriptText'),
  commandDisplay:   () => $('commandDisplay'),
  commandMeta:      () => $('commandMeta'),
  statusLog:        () => $('statusLog'),
  mqttDot:          () => $('mqttDot'),
  mqttLabel:        () => $('mqttLabel'),
  liveRecordDot:    () => $('liveRecordDot'),
  successOverlay:   () => $('successOverlay'),
  successMsg:       () => $('successMsg'),
  initTime:         () => $('initTime'),
  particleCanvas:   () => $('particleCanvas')
};

/* ── UTILS ───────────────────────────────────────────────── */
const Utils = {
  timeNow() {
    return new Date().toLocaleTimeString('en-US',
      { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  },
  clientId() {
    return CONFIG.mqtt.clientIdPrefix + Math.random().toString(36).slice(2, 9);
  },
  sleep: ms => new Promise(r => setTimeout(r, ms))
};

/* ── LOGGER ──────────────────────────────────────────────── */
const Logger = {
  add(msg, type = 'info') {
    const log = DOM.statusLog();
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML =
      `<span class="log-time">${Utils.timeNow()}</span>` +
      `<span class="log-msg">${msg}</span>`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 30) log.removeChild(log.firstChild);
  }
};

/* ── MIC UI ──────────────────────────────────────────────── */
const MicUI = {
  setState(state) {
    State.micState = state;
    const btn    = DOM.micBtn();
    const wrap   = DOM.micBorderWrapper();
    const label  = DOM.micStateLabel();
    const wave   = DOM.waveVisualizer();
    const dot    = DOM.liveRecordDot();
    if (!btn || !wrap || !label) return;

    btn.classList.remove('idle','listening','processing');
    wrap.classList.remove('idle','listening','processing');
    if (wave) wave.classList.remove('active');
    if (dot)  dot.classList.remove('recording');

    switch (state) {
      case 'listening':
        btn.classList.add('listening');
        wrap.classList.add('listening');
        if (wave) wave.classList.add('active');
        if (dot)  dot.classList.add('recording');
        label.textContent = 'LISTENING…';
        btn.setAttribute('aria-pressed','true');
        break;
      case 'processing':
        btn.classList.add('processing');
        wrap.classList.add('processing');
        label.textContent = 'PROCESSING…';
        btn.setAttribute('aria-pressed','false');
        break;
      default:
        label.textContent = 'TAP TO SPEAK';
        btn.setAttribute('aria-pressed','false');
    }
  }
};

/* ── TRANSCRIPT ──────────────────────────────────────────── */
const Transcript = {
  set(text, interim = false) {
    const el = DOM.transcriptText();
    if (!el) return;
    if (!text) {
      el.innerHTML = '<span class="transcript-placeholder">Waiting for voice input…</span>';
    } else {
      el.innerHTML = interim
        ? `<em style="color:var(--clr-text-faint)">${text}</em>`
        : text;
    }
  }
};

/* ── COMMAND UI ──────────────────────────────────────────── */
const CommandUI = {
  set(command, meta = '') {
    const el     = DOM.commandDisplay();
    const metaEl = DOM.commandMeta();
    if (!el) return;
    if (!command || command === '—') {
      el.innerHTML = '<span class="command-placeholder">—</span>';
      if (metaEl) metaEl.textContent = '';
      return;
    }
    if (command === 'UNKNOWN') {
      el.innerHTML = '<span class="command-unknown">UNKNOWN COMMAND</span>';
      if (metaEl) metaEl.textContent = 'No matching device action found';
    } else {
      el.className = 'command-display';
      el.textContent = command;
      if (metaEl) metaEl.textContent = meta;
    }
  }
};

/* ── DEVICE UI ───────────────────────────────────────────── */
const DeviceUI = {
  update(channel, action) {
    const card  = $(`dev-${channel}`);
    const badge = $(`badge-${channel}`);
    if (!card || !badge) return;
    State.deviceStates[channel] = action;
    card.classList.toggle('active', action === 'ON');
    badge.textContent = action;
  }
};

/* ── SUCCESS TOAST ───────────────────────────────────────── */
const SuccessToast = {
  async show(message) {
    const overlay = DOM.successOverlay();
    const msg     = DOM.successMsg();
    if (!overlay || !msg) return;
    msg.textContent = message;
    overlay.classList.add('show');
    await Utils.sleep(2400);
    overlay.classList.remove('show');
  }
};

/* ── MQTT ────────────────────────────────────────────────── */
const MQTT = {
  init() {
    if (typeof mqtt === 'undefined') {
      Logger.add('MQTT library not loaded', 'error');
      this._setStatus('error', 'LIB ERR');
      return;
    }
    State.mqttBrokerIndex = 0;
    this._connect();
  },

  _connect() {
    if (State.mqttClient) {
      try { State.mqttClient.end(true); } catch (_) {}
      State.mqttClient = null;
    }
    const brokers = CONFIG.mqtt.brokers;
    if (State.mqttBrokerIndex >= brokers.length) {
      Logger.add('All MQTT brokers failed — retrying in 15s', 'warn');
      this._setStatus('error', 'ALL FAILED');
      State.mqttRetryTimer = setTimeout(() => {
        State.mqttBrokerIndex = 0;
        this._connect();
      }, 15000);
      return;
    }
    const url = brokers[State.mqttBrokerIndex];
    Logger.add(`MQTT → ${url.replace('wss://','').split(':')[0]}`, 'info');
    this._setStatus('connecting', 'CONNECTING');

    const options = {
      clientId: Utils.clientId(),
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: CONFIG.mqtt.connectTimeout
    };

    let timer = setTimeout(() => {
      Logger.add('Broker timeout — trying next', 'warn');
      State.mqttBrokerIndex++;
      this._connect();
    }, CONFIG.mqtt.connectTimeout + 1000);

    try { State.mqttClient = mqtt.connect(url, options); }
    catch (err) {
      clearTimeout(timer);
      Logger.add(`Connect error: ${err.message}`, 'error');
      State.mqttBrokerIndex++;
      this._connect();
      return;
    }

    State.mqttClient.on('connect', () => {
      clearTimeout(timer);
      State.mqttConnected = true;
      this._setStatus('connected', 'CONNECTED');
      Logger.add('MQTT connected ✓', 'success');
    });
    State.mqttClient.on('error', (err) => {
      clearTimeout(timer);
      State.mqttConnected = false;
      Logger.add(`Broker error: ${err.message}`, 'error');
      State.mqttBrokerIndex++;
      setTimeout(() => this._connect(), 800);
    });
    State.mqttClient.on('close', () => {
      clearTimeout(timer);
      if (State.mqttConnected) {
        State.mqttConnected = false;
        this._setStatus('error', 'LOST');
        Logger.add('MQTT lost — reconnecting', 'warn');
        State.mqttBrokerIndex = 0;
        setTimeout(() => this._connect(), 2000);
      }
    });
    State.mqttClient.on('offline', () => {
      clearTimeout(timer);
      State.mqttConnected = false;
      this._setStatus('error', 'OFFLINE');
    });
  },

  publish(channel, payload) {
    if (!State.mqttClient || !State.mqttConnected) {
      Logger.add('MQTT not ready — command dropped', 'warn');
      return Promise.resolve(false);
    }
    const topic = `${CONFIG.mqtt.topicBase}${channel}`;
    return new Promise((resolve) => {
      State.mqttClient.publish(topic, payload, { qos:1, retain:false }, (err) => {
        if (err) { Logger.add(`Publish failed: ${err.message}`, 'error'); resolve(false); }
        else      { Logger.add(`→ ${topic} : ${payload}`, 'exec');        resolve(true);  }
      });
    });
  },

  _setStatus(state, label) {
    const dot = DOM.mqttDot();
    const lbl = DOM.mqttLabel();
    if (!dot || !lbl) return;
    dot.className = 'status-dot';
    if (state === 'connected') dot.classList.add('connected');
    if (state === 'error')     dot.classList.add('error');
    lbl.textContent = label;
  }
};

/* ── DEEPSEEK ────────────────────────────────────────────── */
const DeepSeek = {
  async interpret(text) {
    if (!text.trim()) return 'UNKNOWN';
    try {
      const res = await fetch(CONFIG.deepseek.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.deepseek.apiKey}`
        },
        body: JSON.stringify({
          model: CONFIG.deepseek.model,
          max_tokens: 20,
          temperature: 0,
          messages: [
            { role: 'system', content: CONFIG.deepseek.systemPrompt },
            { role: 'user',   content: text }
          ]
        })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body.slice(0,120)}`);
      }
      const data = await res.json();
      const raw  = data?.choices?.[0]?.message?.content?.trim() || 'UNKNOWN';
      const cmd  = raw.toUpperCase().replace(/[^A-Z_]/g, '');
      Logger.add(`AI → "${cmd}"`, 'info');
      return cmd;
    } catch (err) {
      Logger.add(`DeepSeek error: ${err.message}`, 'error');
      return 'UNKNOWN';
    }
  }
};

/* ═══════════════════════════════════════════════════════════
   SPEECH MODULE  (v5 — final, permanent fix)

   RULES — never break these:
   1. init()  → synchronous only. No getUserMedia. No permissions.query.
   2. start() → getUserMedia is the FIRST await. Nothing else before it.
   3. Keep stream alive until recognition.onstart fires.
   4. Rebuild SpeechRecognition fresh on every start() call.
   5. No permission overlay on page load — only after a real error.
   6. Error overlay "Try Again" button calls start() directly (new gesture).
   ═══════════════════════════════════════════════════════════ */
const Speech = {
  _finalTranscript: '',
  _rec: null,
  _stream: null,
  _ready: false,

  _isSupported: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  _isSecure:    () =>
    window.isSecureContext ||
    location.protocol === 'https:' ||
    ['localhost','127.0.0.1','::1'].includes(location.hostname),

  /* ── init() ─────────────────────────────────────────────
     Synchronous only. Sets _ready flag. Nothing else.     */
  init() {
    if (!this._isSupported()) {
      Logger.add('Speech API not supported', 'error');
      this._disableMic('NOT SUPPORTED');
      return;
    }
    if (!this._isSecure()) {
      Logger.add('HTTPS required for microphone', 'error');
      this._disableMic('HTTPS REQUIRED');
      return;
    }
    this._ready = true;
    Logger.add('Voice system ready — tap mic to speak', 'success');
  },

  /* ── _buildRec() ─────────────────────────────────────────
     Destroys any previous SpeechRecognition instance and
     builds a fresh one. Called inside start() every time.
     A stale/errored SR instance silently fails on .start()
     in several Chrome versions — rebuilding fixes that.   */
  _buildRec() {
    if (this._rec) {
      try {
        this._rec.onstart = this._rec.onresult =
        this._rec.onspeechend = this._rec.onerror =
        this._rec.onend = null;
      } catch (_) {}
      try { this._rec.abort(); } catch (_) {}
      this._rec = null;
      State.recognition = null;
    }

    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang            = CONFIG.speech.lang;
    rec.continuous      = true;
    rec.interimResults  = CONFIG.speech.interimResults;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this._finalTranscript = '';
      Transcript.set('', false);
      MicUI.setState('listening');
      Logger.add('Listening…', 'info');
      this._resetSilenceTimer();
      this._releaseStream();   // recognition owns the track now — safe to release
    };

    rec.onresult = (e) => {
      this._resetSilenceTimer();
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this._finalTranscript += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      Transcript.set(
        (this._finalTranscript + interim).trim(),
        interim.length > 0 && !this._finalTranscript
      );
    };

    rec.onspeechend = () => { this._clearSilenceTimer(); this._stop(); };

    rec.onerror = (e) => {
      this._clearSilenceTimer();
      this._releaseStream();
      if (!['no-speech','aborted'].includes(e.error)) {
        Logger.add(`Mic error: ${e.error}`, 'error');
      }
      if (e.error === 'not-allowed') {
        this._showError();
      }
      MicUI.setState('idle');
      State.isProcessing = false;
    };

    rec.onend = () => {
      this._clearSilenceTimer();
      this._releaseStream();
      if (State.micState === 'listening') this._stop();
    };

    this._rec = rec;
    State.recognition = rec;
  },

  /* ── start() ─────────────────────────────────────────────
     Entry point. MUST be called directly from click/keydown.

     getUserMedia() MUST be the first and only await here.
     Any other async call before it breaks Chrome's
     user-gesture token on production HTTPS → not-allowed.  */
  async start() {
    if (!this._ready || State.micState !== 'idle' || State.isProcessing) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
    } catch (err) {
      const n = err.name || 'UnknownError';
      Logger.add(`Mic blocked: ${n}`, 'error');
      if (n === 'NotAllowedError' || n === 'PermissionDeniedError') {
        this._showError();
      } else if (n === 'NotFoundError') {
        Logger.add('No microphone device found', 'error');
        this._disableMic('NO MIC');
      } else {
        Logger.add(`Mic unavailable: ${n}`, 'error');
      }
      MicUI.setState('idle');
      return;
    }

    /* Hold stream open — Chrome needs an active audio track
       when .start() is called on production HTTPS.
       Releasing early forces a second out-of-gesture
       permission check → not-allowed.                       */
    this._stream = stream;
    this._finalTranscript = '';
    this._buildRec();

    try {
      this._rec.start();
      // _releaseStream() is called inside rec.onstart above
    } catch (err) {
      this._releaseStream();
      if (err.name !== 'InvalidStateError') {
        Logger.add(`SR start failed: ${err.message}`, 'error');
      }
      MicUI.setState('idle');
    }
  },

  /* ── _stop() ─────────────────────────────────────────────  */
  _stop() {
    if (State.isProcessing) return;
    State.isProcessing = true;
    const transcript = this._finalTranscript.trim();
    try { if (this._rec) this._rec.abort(); } catch (_) {}
    this._releaseStream();
    MicUI.setState('processing');

    if (!transcript) {
      Logger.add('No speech detected', 'warn');
      Transcript.set('');
      MicUI.setState('idle');
      State.isProcessing = false;
      return;
    }
    Transcript.set(transcript, false);
    Logger.add(`Heard: "${transcript}"`, 'info');
    VoiceController.handle(transcript);
  },

  _releaseStream() {
    if (this._stream) {
      try { this._stream.getTracks().forEach(t => t.stop()); } catch (_) {}
      this._stream = null;
    }
  },

  _resetSilenceTimer() {
    this._clearSilenceTimer();
    State.silenceTimer = setTimeout(() => {
      if (State.micState === 'listening') {
        Logger.add('Silence — stopping', 'info');
        this._stop();
      }
    }, CONFIG.speech.silenceTimeout);
  },

  _clearSilenceTimer() {
    if (State.silenceTimer) { clearTimeout(State.silenceTimer); State.silenceTimer = null; }
  },

  _disableMic(label) {
    const btn = DOM.micBtn();
    if (btn) btn.disabled = true;
    const lbl = DOM.micStateLabel();
    if (lbl) lbl.textContent = label;
  },

  /* ── _showError() ─────────────────────────────────────────
     Only shown after a real not-allowed error from the browser.
     Never shown on page load.
     The "Try Again" button IS a fresh user gesture so
     Speech.start() called inside it gets a valid gesture token. */
  _showError() {
    const id = 'micErrOverlay';
    if (document.getElementById(id)) return;

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'mic-permission-overlay';
    overlay.innerHTML = `
      <div class="mic-permission-modal">
        <div class="mic-permission-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z"/>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h3>Microphone Blocked</h3>
        <p>
          Your browser is blocking microphone access for
          <strong>${location.hostname}</strong>.
          Follow the steps below, then tap <em>Try Again</em>.
        </p>
        <div class="browser-instructions">
          <div class="instruction-group">
            <strong>Chrome / Edge:</strong>
            <ol>
              <li>Click the <em>lock</em> icon in the address bar</li>
              <li>Set Microphone → <strong>Allow</strong></li>
              <li>Hard-reload: <kbd>Ctrl+Shift+R</kbd> (Win) or <kbd>Cmd+Shift+R</kbd> (Mac)</li>
            </ol>
          </div>
          <div class="instruction-group">
            <strong>Firefox:</strong>
            <ol>
              <li>Click the microphone icon in the address bar</li>
              <li>Select <strong>Allow and Remember</strong></li>
            </ol>
          </div>
          <div class="instruction-group">
            <strong>Mobile (Chrome / Safari):</strong>
            <ol>
              <li>Browser Settings → Site Settings → Microphone</li>
              <li>Set this site → <strong>Allow</strong></li>
            </ol>
          </div>
        </div>
        <div class="mic-permission-actions">
          <button id="micErrRetry"  class="mic-retry-btn">Try Again</button>
          <button id="micErrCancel" class="mic-cancel-btn">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('micErrRetry').addEventListener('click', function h() {
      this.removeEventListener('click', h);
      document.getElementById(id)?.remove();
      Speech.start();   // this click IS the gesture
    });

    document.getElementById('micErrCancel').addEventListener('click', () => {
      document.getElementById(id)?.remove();
      MicUI.setState('idle');
    });
  }
};

/* ── VOICE CONTROLLER ────────────────────────────────────── */
const VoiceController = {
  async handle(transcript) {
    Logger.add('Sending to AI…', 'info');
    const command = await DeepSeek.interpret(transcript);
    CommandUI.set(command);

    if (command === 'UNKNOWN' || !CONFIG.commandMap[command]) {
      Logger.add('Unknown command — no action', 'warn');
      MicUI.setState('idle');
      State.isProcessing = false;
      return;
    }

    const { channel, device, action } = CONFIG.commandMap[command];
    CommandUI.set(command, `→ Ch${channel} / ${device} / ${action}`);
    Logger.add(`Executing: ${command}`, 'exec');

    const ok = await MQTT.publish(channel, action);
    if (ok !== false) {
      DeviceUI.update(channel, action);
      SuccessToast.show(`${device} ${action}`);
      Logger.add(`✓ ${device} ${action}`, 'success');
    }

    MicUI.setState('idle');
    State.isProcessing = false;
  }
};

/* ── PARTICLES ───────────────────────────────────────────── */
const Particles = {
  _canvas:null, _ctx:null, _parts:[], _raf:null,
  init() {
    this._canvas = DOM.particleCanvas();
    if (!this._canvas) return;
    this._ctx = this._canvas.getContext('2d');
    this._resize(); this._spawn(50); this._loop();
    window.addEventListener('resize', () => this._resize(), { passive:true });
  },
  _resize() {
    this._canvas.width  = window.innerWidth;
    this._canvas.height = window.innerHeight;
  },
  _spawn(n) {
    for (let i = 0; i < n; i++) {
      this._parts.push({
        x: Math.random()*window.innerWidth,  y: Math.random()*window.innerHeight,
        r: Math.random()*1.4+0.3,
        vx:(Math.random()-0.5)*0.28,         vy:(Math.random()-0.5)*0.28,
        alpha:Math.random()*0.45+0.1,        hue:Math.random()>0.5?155:192
      });
    }
  },
  _loop() {
    const {_ctx:ctx,_canvas:cv,_parts:pts} = this;
    ctx.clearRect(0,0,cv.width,cv.height);
    for (const p of pts) {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)        p.x=cv.width;
      if(p.x>cv.width) p.x=0;
      if(p.y<0)        p.y=cv.height;
      if(p.y>cv.height)p.y=0;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`hsla(${p.hue},88%,64%,${p.alpha})`;
      ctx.fill();
    }
    this._raf=requestAnimationFrame(()=>this._loop());
  }
};

/* ── EVENTS ──────────────────────────────────────────────── */
const Events = {
  bind() {
    const btn  = DOM.micBtn();
    const wrap = DOM.micBorderWrapper();

    const tryStart = () => {
      if (State.micState === 'idle' && !State.isProcessing) Speech.start();
    };

    if (btn)  btn.addEventListener('click', tryStart);
    if (wrap) wrap.addEventListener('click', (e) => {
      if (btn && btn.contains(e.target)) return;
      tryStart();
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' &&
          e.target.tagName !== 'BUTTON' &&
          e.target.tagName !== 'INPUT') {
        e.preventDefault();
        tryStart();
      }
    });
  }
};

/* ── BOOT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const initEl = DOM.initTime();
  if (initEl) initEl.textContent = Utils.timeNow();

  Particles.init();
  MQTT.init();

  /* Speech.init() is SYNCHRONOUS ONLY.
     No getUserMedia. No permissions.query. No async calls.
     All microphone access happens exclusively inside
     Speech.start() which is triggered by a direct user gesture. */
  Speech.init();

  Events.bind();

  Logger.add('Urugo Voice System v5 ready', 'success');
  Logger.add('Tap mic or press SPACE to speak', 'info');
});
