/**
 * dashboard.js — App entry point, wires everything together
 * Urugo Management System
 */

(function init() {
  UI.init(handleCommandPublish);

  State.subscribe('channels', UI.renderDevices);
  State.subscribe('temperature', value => UI.updateSensor('temperature', value));
  State.subscribe('humidity', value => UI.updateSensor('humidity', value));

  State.subscribe('channels', payload => {
    if (payload && payload.channel !== undefined) {
      const verb = payload.status === 'ON' ? 'Running' : 'Stopped';
      UI.showToast(`${payload.name} is now ${verb}`, payload.status === 'ON' ? 'success' : 'info');
    }
  });

  UI.renderDevices({ channels: State.getChannels() });
  UI.updateMqttStatus(false);
  UI.updateSensor('temperature', State.getState().temperature);
  UI.updateSensor('humidity', State.getState().humidity);

  MQTTClient.connect(handleMqttConnect, handleMqttDisconnect);
})();

function handleMqttConnect() {
  UI.updateMqttStatus(true);
  UI.showToast('MQTT connected', 'success');
}

function handleMqttDisconnect() {
  UI.updateMqttStatus(false);
  UI.showToast('MQTT disconnected', 'error');
}

function handleCommandPublish(channel, cmd) {
  const topic = CONFIG.TOPICS.CMD(channel);
  const isOn = cmd === CONFIG.CMD.ON;

  console.log(`[Dashboard] Publishing command: ${topic} → ${cmd}`);

  // SEND MQTT COMMAND
  const sent = MQTTClient.publish(topic, cmd);

  if (sent) {
    console.log(`[Dashboard] Publish succeeded for channel ${channel}`);
    UI.showToast(`Command sent to CH${channel}`, 'info');
  } else {
    console.warn(`[Dashboard] Publish failed for channel ${channel}`);
    UI.showToast('MQTT not connected — command not sent', 'error');
    return;
  }

  // OPTIMISTIC UI UPDATE — immediate feedback to user
  State.updateChannel(channel, isOn);
}
