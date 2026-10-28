/*
 * ======================================================================================
 * CubeSat 1U Ground Station Receiver (ESP32)
 * ======================================================================================
 * Operation:
 *   - Listens for ESP-NOW broadcast telemetry packets from the CubeSat.
 *   - Verifies packet size and integrity.
 *   - Serializes packet into single-line JSON and transmits to PC over USB Serial @ 115200 baud.
 *   - Strictly handles missing/invalid values as JSON `null`.
 *
 * Compatible with Arduino-ESP32 Core 3.x (with fallback notes for Core 2.x).
 * ======================================================================================
 */

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#define WIFI_CHANNEL 1

// --------------------------------------------------
// Telemetry Packet Structure (Must match Transmitter ESP32)
// --------------------------------------------------
typedef struct __attribute__((packed)) {
  uint32_t pkt;       // Packet sequence counter
  float ax;           // Acceleration X (g)
  float ay;           // Acceleration Y (g)
  float az;           // Acceleration Z (g)
  float gx;           // Angular rate X (deg/s)
  float gy;           // Angular rate Y (deg/s)
  float gz;           // Angular rate Z (deg/s)
  float temp;         // Temperature (°C)
  float hum;          // Relative Humidity (%)
  float press;        // Barometric Pressure (hPa)
  float alt;          // Altitude above sea level (m)
  float lat;          // GPS Latitude (deg)
  float lon;          // GPS Longitude (deg)
  uint8_t fix;        // GPS Fix Status (1 = fix valid, 0 = no fix)
} TelemetryPacket;

TelemetryPacket rxPacket;
volatile bool newPacketReceived = false;

// Helper function to print float or JSON null
void printFloatOrNull(float val, int decimals) {
  if (isnan(val) || isinf(val)) {
    Serial.print("null");
  } else {
    Serial.print(val, decimals);
  }
}

// --------------------------------------------------
// ESP-NOW Receive Callback
// --------------------------------------------------
// Arduino-ESP32 Core 3.x signature:
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *incomingData, int len) {
  if (len != sizeof(TelemetryPacket)) {
    // Drop invalid or corrupt packet
    return;
  }
  memcpy(&rxPacket, incomingData, sizeof(TelemetryPacket));
  newPacketReceived = true;
}

/*
 * NOTE FOR ARDUINO-ESP32 CORE 2.x USERS:
 * If compiling on legacy ESP32 Core 2.x, comment out the above callback and uncomment this one:
 *
 * void onDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
 *   if (len != sizeof(TelemetryPacket)) return;
 *   memcpy(&rxPacket, incomingData, sizeof(TelemetryPacket));
 *   newPacketReceived = true;
 * }
 */

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize WiFi in Station Mode
  WiFi.mode(WIFI_STA);
  esp_wifi_set_ps(WIFI_PS_NONE); // Disable WiFi power saving for ultra-low latency
  WiFi.disconnect();

  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("{\"error\":\"ESP-NOW initialization failed\"}");
    return;
  }

  // Register Core 3.x Receive Callback
  esp_now_register_recv_cb(onDataRecv);

  // Ready message as JSON comment / diagnostic
  Serial.println("{\"status\":\"ESP32 Ground Station Ready - Listening for ESP-NOW telemetry\"}");
}

// --------------------------------------------------
// Main Loop
// --------------------------------------------------
void loop() {
  if (newPacketReceived) {
    newPacketReceived = false;

    // Format and print exactly ONE JSON line per packet:
    // {"pkt":1042,"ax":0.01,"ay":0.02,"az":0.98,"gx":0.1,"gy":0.0,"gz":-0.1,"temp":28.5,"hum":61,"press":1008.2,"alt":12.4,"lat":null,"lon":null,"gps_fix":false}

    Serial.print("{\"pkt\":");
    Serial.print(rxPacket.pkt);

    Serial.print(",\"ax\":");
    printFloatOrNull(rxPacket.ax, 2);

    Serial.print(",\"ay\":");
    printFloatOrNull(rxPacket.ay, 2);

    Serial.print(",\"az\":");
    printFloatOrNull(rxPacket.az, 2);

    Serial.print(",\"gx\":");
    printFloatOrNull(rxPacket.gx, 1);

    Serial.print(",\"gy\":");
    printFloatOrNull(rxPacket.gy, 1);

    Serial.print(",\"gz\":");
    printFloatOrNull(rxPacket.gz, 1);

    Serial.print(",\"temp\":");
    printFloatOrNull(rxPacket.temp, 1);

    Serial.print(",\"hum\":");
    if (isnan(rxPacket.hum) || isinf(rxPacket.hum)) {
      Serial.print("null");
    } else {
      Serial.print((int)round(rxPacket.hum));
    }

    Serial.print(",\"press\":");
    printFloatOrNull(rxPacket.press, 1);

    Serial.print(",\"alt\":");
    printFloatOrNull(rxPacket.alt, 1);

    Serial.print(",\"lat\":");
    if (rxPacket.fix && !isnan(rxPacket.lat)) {
      Serial.print(rxPacket.lat, 6);
    } else {
      Serial.print("null");
    }

    Serial.print(",\"lon\":");
    if (rxPacket.fix && !isnan(rxPacket.lon)) {
      Serial.print(rxPacket.lon, 6);
    } else {
      Serial.print("null");
    }

    Serial.print(",\"gps_fix\":");
    Serial.print(rxPacket.fix ? "true" : "false");

    Serial.println("}");
  }
}
