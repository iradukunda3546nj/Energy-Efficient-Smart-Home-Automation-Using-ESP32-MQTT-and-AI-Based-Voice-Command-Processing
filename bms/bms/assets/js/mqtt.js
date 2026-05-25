/**
 * mqtt.js — MQTT client (Paho WebSocket over WSS)
 * Urugo Management System
 */

const MQTTClient = (() => {
  let _client = null;
  let _reconnectTimer = null;
  let _onConnect = null;
  let _onDisconnect = null;

  function connect(onConnect, onDisconnect) {
    _onConnect = onConnect;
    _onDisconnect = onDisconnect;

    console.log(`[MQTT] Connecting to wss://${CONFIG.MQTT.HOST}:${CONFIG.MQTT.PORT}${CONFIG.MQTT.PATH} as ${CONFIG.MQTT.CLIENT_ID}`);
    _createClient();
  }

  function _createClient() {
    const { HOST, PORT, PATH, CLIENT_ID, USE_SSL, KEEPALIVE, CLEAN_SESSION } = CONFIG.MQTT;

    _client = new Paho.MQTT.Client(HOST, PORT, PATH, CLIENT_ID);
    _client.onConnectionLost = _onConnectionLost;
    _client.onMessageArrived = _onMessageArrived;

    const opts = {
      useSSL: USE_SSL,
      keepAliveInterval: KEEPALIVE,
      cleanSession: CLEAN_SESSION,
      onSuccess: _onConnectSuccess,
      onFailure: _onConnectFailure,
      timeout: 10,
    };

    try {
      _client.connect(opts);
    } catch (err) {
      console.error('[MQTT] Connect error:', err);
      _scheduleReconnect();
    }
  }

  function _onConnectSuccess() {
    console.log('[MQTT] Connected');
    clearTimeout(_reconnectTimer);

    const topics = CONFIG.TOPICS;
    const subs = [
      topics.STATE_WILDCARD,
      topics.STATUS,
      topics.TEMP,
      topics.HUMIDITY,
    ];

    subs.forEach(topic => {
      _client.subscribe(topic, {
        qos: 0,
        onSuccess: () => console.log(`[MQTT] Subscribed: ${topic}`),
        onFailure: err => console.warn(`[MQTT] Subscribe failed: ${topic}`, err),
      });
    });

    if (typeof _onConnect === 'function') {
      _onConnect();
    }
  }

  function _onConnectFailure(err) {
    const message = err && err.errorMessage ? err.errorMessage : err;
    console.warn('[MQTT] Connection failed:', message);
    if (typeof _onDisconnect === 'function') {
      _onDisconnect();
    }
    _scheduleReconnect();
  }

  function _onConnectionLost(resp) {
    if (resp && resp.errorCode !== 0) {
      console.warn('[MQTT] Connection lost:', resp.errorMessage);
    }
    if (typeof _onDisconnect === 'function') {
      _onDisconnect();
    }
    _scheduleReconnect();
  }

  function _onMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString.trim();

    console.log(`[MQTT] Rx: ${topic} → ${payload}`);
    _handleIncomingMessage(topic, payload);
  }

  function _handleIncomingMessage(topic, payload) {
    const topics = CONFIG.TOPICS;

    if (topic === topics.TEMP) {
      const value = _parseNumeric(payload);
      State.setTemperature(value);
      return;
    }

    if (topic === topics.HUMIDITY) {
      const value = _parseNumeric(payload);
      State.setHumidity(value);
      return;
    }

    if (topic === topics.STATUS) {
      console.log(`[MQTT] Device status: ${payload}`);
      return;
    }

    const statePrefix = `bms/${CONFIG.DEVICE_ID}/state/`;
    if (topic.startsWith(statePrefix)) {
      const channel = parseInt(topic.slice(statePrefix.length), 10);
      if (!Number.isFinite(channel) || !CONFIG.CHANNELS[channel]) {
        console.warn(`[MQTT] Invalid state topic: ${topic}`);
        return;
      }

      const isOn = _normalizeStatePayload(payload);
      State.updateChannel(channel, isOn);
      return;
    }

    console.log(`[MQTT] Unhandled topic: ${topic}`);
  }

  function _normalizeStatePayload(payload) {
    let normalized = payload;

    try {
      const json = JSON.parse(payload);
      if (json && typeof json === 'object' && json.state !== undefined) {
        normalized = String(json.state);
      }
    } catch (err) {
      // Not JSON; use raw payload.
    }

    normalized = String(normalized).trim().toUpperCase();

    if (['ON', '1', 'TRUE', 'YES'].includes(normalized)) return true;
    if (['OFF', '0', 'FALSE', 'NO'].includes(normalized)) return false;
    return false;
  }

  function _parseNumeric(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function publish(topic, payload) {
    console.log('[MQTT] Attempting publish:', { connected: _client?.isConnected(), topic, payload });

    if (!_client || !_client.isConnected()) {
      console.error('[MQTT] Cannot publish — client not connected');
      return false;
    }

    try {
      const payloadStr = String(payload);
      const msg = new Paho.MQTT.Message(payloadStr);
      msg.destinationName = topic;
      msg.qos = 0;
      msg.retained = false;

      _client.send(msg);
      console.log(`[MQTT] Tx: ${topic} → ${payloadStr}`);
      return true;
    } catch (err) {
      console.error('[MQTT] Publish error:', err);
      return false;
    }
  }

  function _scheduleReconnect() {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      console.log('[MQTT] Attempting reconnect...');
      _createClient();
    }, CONFIG.MQTT.RECONNECT_DELAY);
  }

  function disconnect() {
    clearTimeout(_reconnectTimer);
    if (_client && _client.isConnected()) {
      _client.disconnect();
    }
  }

  return {
    connect,
    publish,
    disconnect,
  };
})();
