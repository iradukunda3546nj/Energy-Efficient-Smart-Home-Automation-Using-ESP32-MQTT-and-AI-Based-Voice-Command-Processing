# Urugo BMS — Frontend README

This README describes the front-end of the Urugo Building Management System (BMS). It explains how the dashboard subscribes to MQTT topics, how the voice subsystem implements VAD (voice activity detection) and STT (speech-to-text) flows, and how interpreted commands are published to devices.

## Project layout (frontend)
- **Files:** See [assets/js/mqtt.js](assets/js/mqtt.js), [assets/js/config.js](assets/js/config.js), [assets/js/state.js](assets/js/state.js), [assets/js/ui.js](assets/js/ui.js), and [assets/js/dashboard.js](assets/js/dashboard.js).
- **Voice UI:** Voice system lives in `assets/urugo/` — see [assets/urugo/voicever2.js](assets/urugo/voicever2.js) and [assets/urugo/voice.html](assets/urugo/voice.html).

## How the dashboard communicates (MQTT)

Overview
- The dashboard uses a WebSocket-based MQTT client (Paho in the main dashboard, and `mqtt.js` library in the voice page) to connect to brokers over WSS and subscribe to device topics.
- Broker configuration and topic forms are defined in [assets/js/config.js](assets/js/config.js).

Topics and subscriptions
- Device ID: configured as `DEVICE_ID` in `config.js` (default `device1`).
- The dashboard subscribes to these topics (see `MQTTClient._onConnectSuccess` in [assets/js/mqtt.js](assets/js/mqtt.js)):
  - `bms/${DEVICE_ID}/state/+` — wildcard for per-channel state updates.
  - `bms/${DEVICE_ID}/status` — general device status messages.
  - `bms/${DEVICE_ID}/temp` — temperature sensor readings.
  - `bms/${DEVICE_ID}/humidity` — humidity sensor readings.

Message handling
- Incoming messages are handled in `mqtt.js` (_handleIncomingMessage). Key behaviors:
  - Temperature and humidity messages are parsed as numbers and forwarded to `State.setTemperature()` / `State.setHumidity()`.
  - State messages under `bms/${DEVICE_ID}/state/{ch}` are normalized (accepts JSON with `state` or raw payloads like `ON`/`OFF`/`1`/`0`) and used to update `State.updateChannel(channel, isOn)`.
  - Unrecognized topics are logged for debugging.

Publishing commands
- The dashboard publishes user commands using the `CONFIG.TOPICS.CMD(channel)` topic helper and payloads `ON` / `OFF` (see [assets/js/config.js](assets/js/config.js) and [assets/js/dashboard.js](assets/js/dashboard.js)).
- The publish call is optimistic: when a command is sent successfully, the UI performs an immediate optimistic update (`State.updateChannel`) to provide instant feedback.

## State & UI wiring
- `State` is a small centralized store in [assets/js/state.js](assets/js/state.js). Components subscribe to keys (`channels`, `temperature`, `humidity`).
- `UI` (in [assets/js/ui.js](assets/js/ui.js)) renders device cards, sensor values, MQTT connection status, and the modal used to send commands.
- `dashboard.js` is the entrypoint that wires `UI`, `State`, and `MQTTClient` together and exposes `handleCommandPublish()` for user actions.

## Voice system: VAD, STT, and command flow

Location
- Voice system files: [assets/urugo/voicever2.js](assets/urugo/voicever2.js) and [assets/urugo/voice.html](assets/urugo/voice.html).

High-level flow
1. User gesture (click the mic button or press Space) triggers `Speech.start()`.
2. `Speech.start()` performs `navigator.mediaDevices.getUserMedia({ audio:true })` as the first and only awaited call to ensure a valid user gesture for browser permission.
3. A fresh `SpeechRecognition` instance is created on each start (via `_buildRec()`), `onresult` collects interim and final transcripts, and a silence timer drives VAD.
4. When speech ends (silence timeout or recognition end), the final transcript is sent for interpretation.

VAD mechanics
- Silence-based VAD: `Speech` uses a silence timer (`_resetSilenceTimer`) set to `CONFIG.speech.silenceTimeout` (default 2200 ms). Each `onresult` resets the timer. When timer fires, `Speech._stop()` is invoked to finalize capture.
- The implementation honors several robustness rules:
  - `Speech.init()` is synchronous only — no permission checks on load.
  - `Speech.start()` must be invoked directly from a user gesture (click/keydown) and calls `getUserMedia()` first to obtain a valid gesture-based permission.
  - A fresh SpeechRecognition instance is built on every `start()` to avoid stale/errored instances.

STT (Speech-to-Text)
- The in-browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) is used for live transcription (interim and final results).
- Transcripts accumulate in `Speech._finalTranscript`; interim text is shown while listening.

Command interpretation (NLP)
- After capturing speech, the system calls `DeepSeek.interpret(text)` (see `voicever2.js`). This issues a POST to a configured endpoint (configured under `CONFIG.deepseek`) sending a system prompt that instructs the model to return exactly one token such as `LIGHT_ON`, `TV_OFF`, `AC_ON`, etc.
- The result is normalized and mapped against `CONFIG.commandMap` which contains the mapping from tokens to `channel`, `device`, and `action`.
- If the token maps to a known command, the voice page publishes the command over MQTT (via the local `MQTT.publish(channel, payload)` helper in `voicever2.js`) and updates the UI (`DeviceUI.update`) on success.

Security & deployment notes
- Microphone and the Web Speech API require a secure context (HTTPS or localhost). `Speech._isSecure()` enforces this requirement.
- The voice system intentionally defers `getUserMedia()` until a user gesture to avoid permission popups at page load.
- The `DeepSeek` API key and endpoint in `voicever2.js` are placeholders — replace them with your own service and secure the key in production.

How to run locally (developer quick-start)
1. Serve the site over HTTPS or run on `localhost`. Opening the voice page over plain `file://` or insecure HTTP will break microphone access.
2. Open the dashboard: `dashboard.html` in your browser to view the UI and device cards.
3. Open the voice UI: `assets/urugo/voice.html` and tap the microphone to start a voice command flow.

Customization
- Change MQTT broker and topic settings in [assets/js/config.js](assets/js/config.js) for the dashboard, and in `assets/urugo/voicever2.js` for the voice page's MQTT settings.
- Update `CONFIG.commandMap` in `voicever2.js` to change recognized commands and their mapping to channels/actions.

Files of interest
- Dashboard: [dashboard.html](dashboard.html)
- MQTT client (dashboard): [assets/js/mqtt.js](assets/js/mqtt.js)
- Config / Topics: [assets/js/config.js](assets/js/config.js)
- State store: [assets/js/state.js](assets/js/state.js)
- UI bindings: [assets/js/ui.js](assets/js/ui.js)
- Voice system: [assets/urugo/voicever2.js](assets/urugo/voicever2.js) and [assets/urugo/voice.html](assets/urugo/voice.html)

If you want, I can also:
- Add a short developer guide for deploying the voice system securely.
- Extract the DeepSeek call into a pluggable adapter for swapping NLP backends.

---
Created for the frontend of the Urugo BMS dashboard and voice UI.
