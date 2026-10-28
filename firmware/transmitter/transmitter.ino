/*
 * ======================================================================================
 * CubeSat 1U Onboard Telemetry Transmitter (ESP32)
 * ======================================================================================
 * Hardware Sensors:
 *   - MPU6050 (6-DOF IMU: Accel + Gyro): I2C (SDA=GPIO21, SCL=GPIO22)
 *   - BMP280 (Barometer & Altimeter):    I2C (SDA=GPIO21, SCL=GPIO22, Addr: 0x76 or 0x77)
 *   - DHT11 (Temperature & Humidity):   GPIO4
 *   - NEO-6M GPS (UART Serial2):        GPS TX -> ESP32 RX2 (GPIO16)
 *                                       GPS RX -> ESP32 TX2 (GPIO17)
 *
 * Telemetry Protocol:
 *   - Transmits packed struct via ESP-NOW broadcast (FF:FF:FF:FF:FF:FF)
 *   - Transmission rate: 10 packets per second (10 Hz)
 *   - Non-blocking: DHT11 is sampled every 2000 ms, values are reused between reads.
 * ======================================================================================
 */

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <TinyGPSPlus.h>

// --------------------------------------------------
// Pin Definitions
// --------------------------------------------------
#define I2C_SDA_PIN      21
#define I2C_SCL_PIN      22
#define DHT_PIN          4
#define DHT_TYPE         DHT11
#define GPS_RX_PIN       16   // ESP32 RX2 connects to GPS TX
#define GPS_TX_PIN       17   // ESP32 TX2 connects to GPS RX
#define GPS_BAUD         9600

#define WIFI_CHANNEL     1
#define TELEMETRY_HZ     10
#define PACKET_INTERVAL  (1000 / TELEMETRY_HZ) // 100 ms

// Sea-level standard pressure in hPa.
// IMPORTANT: For true local elevation above sea level, update this value with your
// local current meteorological pressure (QNH) from your nearest airport or weather station.
#define SEALEVELPRESSURE_HPA (1013.25)

// --------------------------------------------------
// Telemetry Packet Structure (Must match Receiver ESP32)
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

// --------------------------------------------------
// Hardware Objects
// --------------------------------------------------
Adafruit_MPU6050 mpu;
Adafruit_BMP280 bmp; // Uses default I2C Wire
DHT dht(DHT_PIN, DHT_TYPE);
TinyGPSPlus gps;

HardwareSerial SerialGPS(2);

// Broadcast MAC address (FF:FF:FF:FF:FF:FF broadcasts to all listeners)
uint8_t broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// State Variables
TelemetryPacket txPacket;
uint32_t packetCounter = 0;
unsigned long lastPacketTime = 0;
unsigned long lastDhtTime = 0;
float cachedDhtTemp = NAN;
float cachedDhtHum = NAN;

bool mpuAvailable = false;
bool bmpAvailable = false;

// --------------------------------------------------
// Setup
// --------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n===========================================");
  Serial.println("  ORBITRA CUBESAT TRANSMITTER (ESP-NOW)    ");
  Serial.println("===========================================");

  // Initialize I2C bus
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  // 1. Initialize MPU6050
  if (!mpu.begin(0x68, &Wire) && !mpu.begin(0x69, &Wire)) {
    Serial.println("[WARN] MPU6050 not detected at 0x68 or 0x69!");
    mpuAvailable = false;
  } else {
    Serial.println("[OK] MPU6050 IMU initialized.");
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    mpuAvailable = true;
  }

  // 2. Initialize BMP280
  if (!bmp.begin(0x76) && !bmp.begin(0x77)) {
    Serial.println("[WARN] BMP280 not detected at 0x76 or 0x77!");
    bmpAvailable = false;
  } else {
    Serial.println("[OK] BMP280 Barometer/Altimeter initialized.");
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                    Adafruit_BMP280::SAMPLING_X2,     // Temperature oversampling
                    Adafruit_BMP280::SAMPLING_X16,    // Pressure oversampling
                    Adafruit_BMP280::FILTER_X16,      // Filtering
                    Adafruit_BMP280::STANDBY_MS_63);  // Standby time
    bmpAvailable = true;
  }

  // 3. Initialize DHT11
  dht.begin();
  Serial.println("[OK] DHT11 sensor initialized.");

  // 4. Initialize NEO-6M GPS on Serial2
  SerialGPS.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[OK] GPS Serial2 initialized at 9600 baud.");

  // 5. Initialize WiFi in Station Mode for ESP-NOW
  WiFi.mode(WIFI_STA);
  esp_wifi_set_ps(WIFI_PS_NONE); // Disable WiFi power saving for ultra-low latency
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("[FAIL] Error initializing ESP-NOW!");
    return;
  }
  Serial.println("[OK] ESP-NOW initialized successfully.");

  // Register broadcast peer
  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = WIFI_CHANNEL;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[FAIL] Failed to register broadcast peer!");
  } else {
    Serial.println("[OK] Broadcast peer registered (FF:FF:FF:FF:FF:FF).");
  }

  Serial.println("Starting 10 Hz telemetry loop...\n");
}

// --------------------------------------------------
// Main Loop
// --------------------------------------------------
void loop() {
  // Feed GPS characters continuously into TinyGPSPlus parser
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }

  unsigned long currentMillis = millis();

  // Read DHT11 every 2000 ms (DHT11 is slow, maximum ~1 Hz sampling)
  if (currentMillis - lastDhtTime >= 2000 || lastDhtTime == 0) {
    lastDhtTime = currentMillis;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) cachedDhtTemp = t;
    if (!isnan(h)) cachedDhtHum = h;
  }

  // 10 Hz Telemetry Broadcast
  if (currentMillis - lastPacketTime >= PACKET_INTERVAL) {
    lastPacketTime = currentMillis;
    packetCounter++;

    txPacket.pkt = packetCounter;

    // Read MPU6050
    if (mpuAvailable) {
      sensors_event_t a, g, temp_mpu;
      mpu.getEvent(&a, &g, &temp_mpu);
      // Convert acceleration from m/s^2 to g (1 g = 9.80665 m/s^2)
      txPacket.ax = a.acceleration.x / 9.80665f;
      txPacket.ay = a.acceleration.y / 9.80665f;
      txPacket.az = a.acceleration.z / 9.80665f;
      // Convert angular velocity from rad/s to deg/s
      txPacket.gx = g.gyro.x * (180.0f / PI);
      txPacket.gy = g.gyro.y * (180.0f / PI);
      txPacket.gz = g.gyro.z * (180.0f / PI);
    } else {
      txPacket.ax = NAN;
      txPacket.ay = NAN;
      txPacket.az = NAN;
      txPacket.gx = NAN;
      txPacket.gy = NAN;
      txPacket.gz = NAN;
    }

    // BMP280 readings
    if (bmpAvailable) {
      txPacket.press = bmp.readPressure() / 100.0f; // Convert Pa to hPa
      // Calculate altitude against reference sea-level pressure
      txPacket.alt = bmp.readAltitude(SEALEVELPRESSURE_HPA);
      // If DHT reading is not available, use BMP280 temperature as fallback
      if (isnan(cachedDhtTemp)) {
        txPacket.temp = bmp.readTemperature();
      } else {
        txPacket.temp = cachedDhtTemp;
      }
    } else {
      txPacket.press = NAN;
      txPacket.alt = NAN;
      txPacket.temp = cachedDhtTemp;
    }

    // Humidity from DHT11
    txPacket.hum = cachedDhtHum;

    // GPS telemetry
    if (gps.location.isValid() && gps.location.age() < 2000) {
      txPacket.lat = (float)gps.location.lat();
      txPacket.lon = (float)gps.location.lng();
      txPacket.fix = 1;
    } else {
      txPacket.lat = NAN;
      txPacket.lon = NAN;
      txPacket.fix = 0;
    }

    // Send packet over ESP-NOW
    esp_err_t result = esp_now_send(broadcastAddress, (uint8_t *)&txPacket, sizeof(TelemetryPacket));
    if (result != ESP_OK) {
      // Transmission dropped or buffer full
    }
  }
}
