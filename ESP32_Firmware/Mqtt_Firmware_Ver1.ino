#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

/* =================Wi-Fi CONFIG ================= */


#define WIFI_SSID "..."//Put your wi-fi credentials
#define WIFI_PASS "...."

#define MQTT_HOST "broker.hivemq.com"
#define MQTT_PORT 1883
#define DEVICE_ID "device1"

#define NUM_CHANNELS 5

/* ================= GPIO ================= */

struct Channel {
  uint8_t relay;
  uint8_t button;
  bool state;

  // FSM
  uint8_t fsm;
  unsigned long tDebounce;
};

enum {
  BTN_IDLE,
  BTN_DEBOUNCE_PRESS,
  BTN_PRESSED,
  BTN_DEBOUNCE_RELEASE
};

Channel channels[NUM_CHANNELS] = {
  {23, 32, false, BTN_IDLE, 0},
  {22, 14, false, BTN_IDLE, 0},
  {21, 25, false, BTN_IDLE, 0},
  {19, 26, false, BTN_IDLE, 0},
  {18, 27, false, BTN_IDLE, 0}
};

/* ================= DHT ================= */

#define DHT_PIN 33
DHT dht(DHT_PIN, DHT11);

/* ================= MQTT ================= */

WiFiClient espClient;
PubSubClient mqtt(espClient);

/* ================= TIMERS ================= */

unsigned long tWiFi = 0;
unsigned long tMQTT = 0;
unsigned long tSensor = 0;

/* ================= APPLY ================= */

void publishState(uint8_t ch, bool state) {
  char topic[64];
  snprintf(topic, sizeof(topic), "bms/%s/state/%d", DEVICE_ID, ch);

  const char* payload = state ? "{\"state\":\"ON\"}" : "{\"state\":\"OFF\"}";
  mqtt.publish(topic, payload, true);
}

void applyChannel(uint8_t ch, bool state) {
  if (ch < 1 || ch > NUM_CHANNELS) return;

  Channel &c = channels[ch - 1];
  if (c.state == state) return;

  c.state = state;
  digitalWrite(c.relay, state ? HIGH : LOW);

  publishState(ch, state);

  Serial.printf("[CH%d] -> %s\n", ch, state ? "ON" : "OFF");
}

/* ================= MQTT ================= */

void mqttCallback(char* topic, byte* payload, unsigned int len) {

  char msg[8];
  if (len >= sizeof(msg)) len = sizeof(msg) - 1;

  memcpy(msg, payload, len);
  msg[len] = '\0';

  char base[64];
  snprintf(base, sizeof(base), "bms/%s/cmd/", DEVICE_ID);

  if (strncmp(topic, base, strlen(base)) == 0) {

    int ch = atoi(topic + strlen(base));
    if (ch < 1 || ch > NUM_CHANNELS) return;

    Serial.printf("MQTT CMD → CH%d : %s\n", ch, msg);

    if (strcmp(msg, "ON") == 0) applyChannel(ch, true);
    else if (strcmp(msg, "OFF") == 0) applyChannel(ch, false);
  }
}

/* ================= WIFI ================= */

void handleWiFi() {
  if (millis() - tWiFi < 2000) return;
  tWiFi = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi reconnect...");
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

/* ================= MQTT ================= */

void handleMQTT() {
  if (millis() - tMQTT < 2000) return;
  tMQTT = millis();

  if (!mqtt.connected()) {

    char clientId[20];
    snprintf(clientId, sizeof(clientId), "esp32-%04x", random(0xffff));

    if (mqtt.connect(clientId)) {

      mqtt.subscribe("bms/device1/cmd/+");

      // Sync states
      for (int i = 0; i < NUM_CHANNELS; i++) {
        publishState(i + 1, channels[i].state);
      }

      Serial.println("MQTT connected");
    }
  }
}

/* ================= BUTTON FSM ================= */

void handleButtons() {

  for (int i = 0; i < NUM_CHANNELS; i++) {

    Channel &c = channels[i];
    bool pressed = (digitalRead(c.button) == LOW);

    switch (c.fsm) {

      case BTN_IDLE:
        if (pressed) {
          c.fsm = BTN_DEBOUNCE_PRESS;
          c.tDebounce = millis();
        }
        break;

      case BTN_DEBOUNCE_PRESS:
        if (millis() - c.tDebounce > 50) {
          if (pressed) {
            c.fsm = BTN_PRESSED;

            // ACTION TRIGGER (ONLY ONCE)
            applyChannel(i + 1, !c.state);
          } else {
            c.fsm = BTN_IDLE;
          }
        }
        break;

      case BTN_PRESSED:
        if (!pressed) {
          c.fsm = BTN_DEBOUNCE_RELEASE;
          c.tDebounce = millis();
        }
        break;

      case BTN_DEBOUNCE_RELEASE:
        if (millis() - c.tDebounce > 50) {
          if (!pressed) {
            c.fsm = BTN_IDLE;
          } else {
            c.fsm = BTN_PRESSED;
          }
        }
        break;
    }
  }
}

/* ================= SENSOR ================= */

void handleSensor() {

  if (millis() - tSensor < 5000) return;
  tSensor = millis();

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h)) {

    char topic[64];
    char payload[16];

    snprintf(topic, sizeof(topic), "bms/%s/temp", DEVICE_ID);
    snprintf(payload, sizeof(payload), "%.1f", t);
    mqtt.publish(topic, payload, true);

    snprintf(topic, sizeof(topic), "bms/%s/humidity", DEVICE_ID);
    snprintf(payload, sizeof(payload), "%.1f", h);
    mqtt.publish(topic, payload, true);

    Serial.printf("Temp: %.1f | Hum: %.1f\n", t, h);
  }
}

/* ================= SETUP ================= */

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < NUM_CHANNELS; i++) {
    pinMode(channels[i].relay, OUTPUT);
    pinMode(channels[i].button, INPUT_PULLUP);
    digitalWrite(channels[i].relay, LOW);
  }

  dht.begin();

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
}

/* ================= LOOP ================= */

void loop() {

  handleWiFi();
  handleMQTT();

  mqtt.loop();   // critical

  handleButtons();
  handleSensor();

  delay(5); // CPU yield
}
