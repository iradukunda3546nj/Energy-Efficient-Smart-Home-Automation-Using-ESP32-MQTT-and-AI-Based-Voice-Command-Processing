/**
 * state.js — Centralized state store
 * Urugo Management System
 */

const State = (() => {
  const _state = {
    channels: {
      1: { name: 'Lamp',   status: 'OFF' },
      2: { name: 'TV',     status: 'OFF' },
      3: { name: 'Fridge', status: 'OFF' },
      4: { name: 'AC',     status: 'OFF' },
      5: { name: 'Socket', status: 'OFF' },
    },
    temperature: null,
    humidity: null,
  };

  const _subscribers = {
    channels: [],
    temperature: [],
    humidity: [],
  };

  function subscribe(key, callback) {
    if (!_subscribers[key]) {
      console.warn(`[STATE] Unknown subscription key: ${key}`);
      return;
    }

    if (typeof callback !== 'function') return;
    _subscribers[key].push(callback);
  }

  function _notify(key, payload) {
    const listeners = _subscribers[key] || [];
    listeners.forEach(fn => fn(payload));
  }

  function getChannels() {
    return JSON.parse(JSON.stringify(_state.channels));
  }

  function getState() {
    return {
      channels: getChannels(),
      temperature: _state.temperature,
      humidity: _state.humidity,
    };
  }

  function getActiveCount() {
    return Object.values(_state.channels).filter(ch => ch.status === 'ON').length;
  }

  function updateChannel(channel, isOn) {
    const ch = parseInt(channel, 10);
    const status = isOn ? 'ON' : 'OFF';

    if (!_state.channels[ch]) {
      console.warn(`[STATE] Invalid channel: ${channel}`);
      return;
    }

    const previous = _state.channels[ch].status;
    if (previous === status) return;

    _state.channels[ch].status = status;
    console.log(`[STATE] Channel ${ch} → ${status}`);

    _notify('channels', {
      channel: ch,
      status,
      name: _state.channels[ch].name,
      channels: getChannels(),
      activeCount: getActiveCount(),
    });
  }

  function setTemperature(value) {
    const next = value === null ? null : parseFloat(value);
    if (_state.temperature === next) return;
    _state.temperature = next;
    console.log(`[STATE] temperature → ${next}`);
    _notify('temperature', next);
  }

  function setHumidity(value) {
    const next = value === null ? null : parseFloat(value);
    if (_state.humidity === next) return;
    _state.humidity = next;
    console.log(`[STATE] humidity → ${next}`);
    _notify('humidity', next);
  }

  return {
    subscribe,
    getChannels,
    getState,
    getActiveCount,
    updateChannel,
    setTemperature,
    setHumidity,
  };
})();
