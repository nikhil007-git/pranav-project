# CubeSat 1U Telemetry & Mission Control System

A complete real-time telemetry mission control ground station, bridge backend, and ESP32 Arduino firmware for a 1U CubeSat project.

Inspired by NASA Open MCT, the dashboard combines a space-themed glassmorphism UI with real-time 3D attitude determination (ADCS), 6-DOF inertial graphs, barometric & environmental telemetry, and tactical GPS tracking.

---

## System Architecture

```
[Onboard 1U CubeSat]
  MPU6050 (6-DOF IMU)  \
  BMP280  (Baro/Alt)    -- [ESP32 Transmitter] 
  DHT11   (Temp/Hum)    /         |
  NEO-6M  (GPS UART)   /    (ESP-NOW 10 Hz Broadcast)
                                  v
                        [ESP32 Ground Station Receiver]
                                  |
                            (USB Serial @ 115200 baud)
                                  v
                        [Node.js Telemetry Server / Bridge]
                                  |
                            (WebSocket @ port 3000)
                                  v
                        [Mission Control Web Dashboard]
```

---

## Project Structure

```
pranav-project/
├── package.json                   # Node scripts ("start", "sim", "build", "dev:frontend") & dependencies
├── server.js                      # Express static server, WebSocket broadcaster, & 10 Hz flight simulator
├── frontend/                      # React 18 + Vite mission control frontend source
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                # Telemetry state, WebSocket client, & watchdog
│       ├── index.css              # Space-grade glassmorphic stylesheet
│       └── components/
│           ├── Header.jsx         # Mission status bar, link badge, & mission controls
│           ├── CubeSatViewer.jsx  # Three.js 3D 1U CubeSat attitude model (ADCS)
│           ├── GpsRadar.jsx       # Tactical GPS radar canvas & coordinates
│           └── TelemetryCharts.jsx # Chart.js 60-packet rolling telemetry charts
├── public/                        # Static assets & production fallback build
├── firmware/
│   ├── transmitter/
│   │   └── transmitter.ino        # ESP32 onboard CubeSat transmitter (ESP-NOW broadcast)
│   └── receiver/
│       └── receiver.ino           # ESP32 ground station receiver (ESP-NOW to USB Serial JSON)
└── README.md                      # Complete installation, hardware, and operational guide
```

---

## Quickstart: Simulator Mode (No Hardware Needed)

You can run and test the complete mission control dashboard immediately using the built-in 10 Hz physics flight simulator:

### 1. Install Node.js
If Node.js is not already installed on your system:
- **Ubuntu/Debian**: `sudo apt install nodejs npm`
- **macOS (Homebrew)**: `brew install node`
- **Windows**: Download the LTS installer from [nodejs.org](https://nodejs.org/)

Verify your installation:
```bash
node -v
npm -v
```

### 2. Install Project Dependencies
In the root directory of this project, run:
```bash
npm install
```

### 3. Run the Flight Simulator
```bash
npm run sim
```

This launches the telemetry server on port `3000` and serves the production React build while generating realistic CubeSat flight dynamics:
- Smooth continuous attitude motion: $\text{roll} = 0.6\sin(t)$, $\text{pitch} = 0.4\sin(0.7t)$
- Matching 3-axis accelerometer vectors under gravity and corresponding gyro rates
- Smooth barometric pressure, altitude, temperature, and humidity drift
- GPS satellite fix toggling every 15 seconds to simulate orbital acquisition/loss

### 4. Optional: React Frontend Development
If you want to modify or develop the React frontend with Vite Hot Module Replacement (HMR):
```bash
# In one terminal, run the backend simulator:
npm run sim

# In a second terminal, start the Vite development server:
npm run dev:frontend
```
Then open `http://localhost:5173`. Any changes to `frontend/src/` will hot-reload instantly. To rebuild the production bundle served by Express:
```bash
npm run build
```

### 4. Open the Mission Control Dashboard
Open your web browser and navigate to:
```
http://localhost:3000
```
- The link indicator will glow **LINK OK** (green).
- The 3D 1U CubeSat rotates smoothly in real-time according to the simulated IMU.
- All 6 sensor charts update synchronously at 10 Hz (rolling 60 packets).
- The tactical GPS radar sweeps and displays incoming position blips.

---

## Hardware Setup & Pinout Wiring

### Transmitter Board (Onboard CubeSat ESP32)

| Sensor / Module | Sensor Pin | ESP32 Pin | Interface / Notes |
| :--- | :--- | :--- | :--- |
| **MPU6050** (6-DOF IMU) | VCC | 3.3V (3V3) | Power |
| | GND | GND | Ground |
| | SDA | **GPIO 21 (D21)** | Primary I2C Data (`Wire`) |
| | SCL | **GPIO 22 (D22)** | Primary I2C Clock (`Wire`) |
| **BMP280** (Pressure & Temp) | VCC (VIN) | 3.3V (3V3) | Power |
| | GND | GND | Ground |
| | SDA | **GPIO 25 (D25)** | Secondary I2C Data (`TwoWire(1)`) |
| | SCL | **GPIO 26 (D26)** | Secondary I2C Clock (`TwoWire(1)`) |
| **DHT11** (Temp & Humidity) | VCC | 3.3V (3V3) | Power |
| | GND | GND | Ground |
| | DATA | **GPIO 4 (D4)** | Digital I/O |
| **NEO-6M GPS** (Position & Speed) | VCC | 3.3V / 5V | Power |
| | GND | GND | Ground |
| | TX (module) | **GPIO 15 (D15)** | ESP32 Hardware `Serial2` RX |
| | RX (module) | *Not connected* | Unconnected (GPS TX only) |

> [!NOTE]
> **DHT11 Sampling Speed**: The DHT11 hardware has an internal capacitive humidity sensor that requires ~1 to 2 seconds between consecutive measurements. The transmitter firmware queries the DHT11 every 2000 ms and reuses the cached value between reads so the main ESP-NOW loop runs at a steady 10 Hz without blocking.

> [!NOTE]
> **GPS Satellite Lock**: The NEO-6M GPS module requires a clear, unobstructed line of sight to open sky to acquire an initial 3D fix (typically 30–90 seconds cold start). Indoors near windows, satellite reception may be degraded or unavailable (`gps_fix: false`).

### Receiver Board (Ground Station ESP32)

| Component | Pin | Connection |
| :--- | :--- | :--- |
| **ESP32 Dev Module** | Micro-USB / Type-C | Plug directly into Ground Station Laptop USB port |

No external sensors are wired to the receiver board. It acts purely as a radio bridge, capturing ESP-NOW packets and streaming clean JSON lines over USB Serial at 115200 baud.

---

## Arduino IDE Setup & Flashing

### 1. ESP32 Board Support
1. In Arduino IDE, open **Settings / Preferences** (`File -> Preferences` or `Ctrl+,`).
2. Add the following URL to **Additional Boards Manager URLs**:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Open **Boards Manager** (`Tools -> Board -> Boards Manager...`), search for `esp32` by Espressif Systems, and click **Install** (Core version 3.x recommended; 2.x is also supported).
4. Under `Tools -> Board -> ESP32 Arduino`, select **ESP32 Dev Module** (or your specific ESP32 board).

### 2. Required Libraries
Install the following libraries via the Arduino IDE Library Manager (`Sketch -> Include Library -> Manage Libraries...`):
- `Adafruit MPU6050` (by Adafruit)
- `Adafruit BMP280 Library` (by Adafruit)
- `Adafruit Unified Sensor` (by Adafruit, dependency)
- `DHT sensor library` (by Adafruit)
- `TinyGPSPlus` (by Mikal Hart)

### 3. Sea-Level Pressure Calibration (Altimeter)
In `firmware/transmitter/transmitter.ino`:
```cpp
#define SEALEVELPRESSURE_HPA (1013.25)
```
Change `1013.25` to the current local barometric sea-level pressure (QNH) from your local airport or weather report to get exact absolute elevation in meters above sea level.

### 4. Flashing Both Boards
1. Connect the **Transmitter ESP32** via USB. Select its COM port in `Tools -> Port`, open `firmware/transmitter/transmitter.ino`, and click **Upload**.
2. Connect the **Receiver ESP32** via USB. Select its COM port in `Tools -> Port`, open `firmware/receiver/receiver.ino`, and click **Upload**.

---

## Running with Live Hardware

### 1. Identify the Receiver's Serial Port
Run `server.js` with no arguments to list all connected serial devices:
```bash
node server.js
```
Sample output:
```
Available Serial Ports:
  [1] /dev/ttyUSB0     Silicon Labs     (CP2102 USB to UART)
```
On Windows, it will show ports such as `COM3`, `COM5`, etc.

### 2. Launch the Ground Station Bridge
Start `server.js` by providing the serial port path:
```bash
# Linux / macOS:
node server.js /dev/ttyUSB0

# Windows:
node server.js COM5
```

> [!IMPORTANT]
> **Single Serial Port Ownership**: An operating system allows only ONE program to open a COM port at a time. Make sure the **Arduino IDE Serial Monitor**, PuTTY, or any other serial terminal is **CLOSED** before running `node server.js <port>`. If another program is holding the port, `server.js` will output a clear error message.

### 3. Open the Dashboard
Navigate to `http://localhost:3000` in your web browser.

---

## Ground Testing & Validation Checklist

1. **Stationary Gravity Vector Check**:
   Place the CubeSat flat on a level table with the Z-axis pointing straight up:
   - $a_x \approx 0.00\ g$
   - $a_y \approx 0.00\ g$
   - $a_z \approx 1.00\ g$
   - Angular velocities ($g_x, g_y, g_z$) should hover around $0.0\ ^\circ/\text{s}$.
2. **Mounting Orientation & Signs**:
   If the 3D model tilts in the opposite direction when physically tilting the satellite, the MPU6050 might be mounted inverted or rotated on your chassis. You can flip the sign of $a_x$, $a_y$, or $a_z$ directly in `transmitter.ino` lines 180–186 to align with your mechanical CAD model.
3. **Yaw Gyro Integration**:
   Because the system uses an MPU6050 (6-DOF) without an onboard 3-axis magnetometer, yaw is integrated from gyro-Z. Over extended missions, gyro drift causes the yaw angle to slowly accumulate offset. Click the **RESET YAW** button anytime on the dashboard to re-zero the azimuth heading.
4. **Mission Recording & CSV Export**:
   - Click **RECORD** in the top navigation bar to start buffering telemetry frames with high-resolution ISO timestamps.
   - Click **DOWNLOAD CSV** to export the recorded session to your downloads folder.

---

## Troubleshooting Guide

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| `[SERIAL ERROR] Failed to open port` | Port already in use by Arduino IDE or another app | Close the Arduino IDE Serial Monitor, Cura, PuTTY, or other terminal windows and rerun `node server.js <port>`. |
| `[SERIAL ERROR] Permission denied` (Linux) | User account lacks `dialout` group permissions | Run `sudo usermod -a -G dialout $USER`, log out and log back in, or run with appropriate device permissions. |
| Dashboard says `LINK LOST` (blinking red) | No packets received for over 3 seconds | 1. Ensure the transmitter board is powered up.<br>2. Confirm both ESP32 boards are set to the same WiFi channel (`WIFI_CHANNEL 1`).<br>3. Check transmitter serial monitor to verify sensors are initializing properly. |
| Telemetry shows `null` or `-` for MPU / BMP | Sensor I2C communication failed or loose jumper wires | Verify SDA is connected to GPIO 21 and SCL to GPIO 22. Check that the BMP280 I2C address is `0x76` or `0x77`. |
| GPS Coordinates show `-` and `WAITING FOR FIX` | GPS has not yet acquired satellite lock | Move the CubeSat outdoors or near a window with an open view of the sky. Wait 1–2 minutes for the tiny PPS LED on the GPS module to start blinking. |
| Yaw drifts continuously | Natural drift inherent to rate gyroscopes | Click **RESET YAW** to re-zero the heading. Keep the satellite still on startup so gyro bias is minimal. |
| Core 2.x compile error in `receiver.ino` | Espressif changed the `onDataRecv` callback signature in Core 3.x | In `firmware/receiver/receiver.ino`, follow the comment in the code to switch to the 3-argument Core 2.x callback signature (`const uint8_t *mac_addr, const uint8_t *incomingData, int len`). |

---

## Cloud Deployment (Render, Railway, VPS, Docker)

You can host your CubeSat mission control dashboard on a permanent, public HTTPS/WSS web URL.

### Option A: Free Deployment on Render
1. Push this project to GitHub.
2. Sign in to [render.com](https://render.com) and click **New + -> Web Service**.
3. Select your repository.
4. Render will automatically detect the settings from `render.yaml`, or you can enter:
   - **Runtime:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
5. Click **Deploy Web Service**. You will get a permanent public URL (e.g. `https://cubesat-mission-control.onrender.com`).

### Option B: 1-Click Deployment on Railway
1. Sign in to [railway.app](https://railway.app).
2. Click **New Project -> Deploy from GitHub repo**.
3. Railway detects the `Dockerfile` and builds both the React frontend and Node backend automatically.
4. Go to **Settings -> Generate Domain** to get your public `.up.railway.app` URL.

### Option C: Custom VPS (Ubuntu / AWS EC2 / DigitalOcean) using Docker
```bash
# Build and run with Docker
docker build -t cubesat-mission-control .
docker run -d -p 80:3000 --name cubesat cubesat-mission-control
```

---

## Streaming Real ESP32 Hardware to your Cloud URL

When running on the cloud, your server cannot physically touch your laptop's USB COM port. To bridge live hardware from your desk to your cloud dashboard:

1. Plug your ESP32 Ground Station receiver into your computer.
2. Run the included telemetry forwarder:
   ```bash
   # Linux / macOS
   node telemetry-forwarder.js /dev/ttyUSB0 https://your-app.onrender.com

   # Windows
   node telemetry-forwarder.js COM5 https://your-app.onrender.com
   ```
The forwarder reads each packet from USB Serial and POSTs it to `https://your-app.onrender.com/api/telemetry`, which broadcasts it live via WebSockets to everyone viewing your cloud dashboard!

---

## License & Credits
- Built for CubeSat 1U sub-orbital and educational missions.
- Visual style inspired by NASA Open MCT.
- Powered by Three.js, Chart.js, Express, ws, and SerialPort.
