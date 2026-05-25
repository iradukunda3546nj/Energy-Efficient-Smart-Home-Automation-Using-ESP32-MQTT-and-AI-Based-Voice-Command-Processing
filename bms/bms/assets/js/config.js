/**
 * config.js — MQTT broker configuration & device definitions
 * Urugo Management System
 */

const CONFIG = Object.freeze({

  // ── MQTT Broker ──────────────────────────────────────
  MQTT: {
    HOST:       'broker.hivemq.com',
    PORT:       8884,
    USE_SSL:    true,
    PATH:       '/mqtt',
    CLIENT_ID:  'urugo-dashboard-' + Math.random().toString(16).slice(2, 10),
    KEEPALIVE:  60,
    CLEAN_SESSION: true,
    RECONNECT_DELAY: 4000,      // ms before reconnect attempt
  },

  // ── Device (ESP32) ───────────────────────────────────
  DEVICE_ID: 'device1',

  // ── Channels ─────────────────────────────────────────
  CHANNELS: {
    1: { name: 'Lamp',   image: 'assets/photos/lamp.jpg' },
    2: { name: 'TV',     image: 'assets/photos/tv.png'   },
    3: { name: 'Fridge', image: 'assets/photos/fridge.jpg' },
    4: { name: 'AC',     image: 'assets/photos/ac.jpg'   },
    5: { name: 'Socket', image: 'assets/photos/socket.jpg' },
  },

  // ── Topics ────────────────────────────────────────────
  get TOPICS() {
    const d = this.DEVICE_ID;
    return {
      STATE_WILDCARD: `bms/${d}/state/+`,
      STATUS:         `bms/${d}/status`,
      TEMP:           `bms/${d}/temp`,
      HUMIDITY:       `bms/${d}/humidity`,
      CMD:            (ch) => `bms/${d}/cmd/${ch}`,
      STATE:          (ch) => `bms/${d}/state/${ch}`,
    };
  },

  // ── Payload values ────────────────────────────────────
  CMD: {
    ON:  'ON',
    OFF: 'OFF',
  },
});
