const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
let SerialPort, ReadlineParser;
try {
  const sp = require('serialport');
  SerialPort = sp.SerialPort;
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (e) {
  // SerialPort native bindings might be unavailable on some cloud platforms
  console.log('[INFO] SerialPort native bindings not available, running in cloud-bridge mode.');
}

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Serve static dashboard files (prioritize React build if present)
const reactDistPath = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(reactDistPath)) {
  console.log(`[SERVER] Serving React Mission Control from: ${reactDistPath}`);
  app.use(express.static(reactDistPath));
} else {
  app.use(express.static(path.join(__dirname, 'public')));
}

// Broadcast helper for WebSocket clients
function broadcastPacket(data) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  }
}

// Track when real hardware telemetry was last ingested
let lastLiveTelemetryTime = 0;

// HTTP Telemetry Ingestion Endpoint (Allows local ESP32 Ground Station to stream to Cloud)
app.post('/api/telemetry', (req, res) => {
  const packet = req.body;
  if (packet && typeof packet.pkt !== 'undefined') {
    lastLiveTelemetryTime = Date.now();
    broadcastPacket(packet);
    return res.status(200).json({ status: 'ok', received: packet.pkt });
  }
  res.status(400).json({ error: 'Invalid packet payload' });
});

// Health check endpoint for cloud hosts (Render / Railway / AWS ALB)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    clients: wss.clients.size,
    uptime: process.uptime()
  });
});

// WebSocket connection lifecycle
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp} (Total clients: ${wss.clients.size})`);

  ws.on('close', () => {
    console.log(`[WS] Client disconnected (Remaining clients: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
  });
});

// ==========================================
// 1. SIMULATOR MODE
// ==========================================
function startSimulator() {
  console.log('====================================================');
  console.log('  CUBESAT MISSION CONTROL - SIMULATOR MODE (10 Hz)  ');
  console.log('====================================================');
  console.log(`Web Dashboard: http://localhost:${PORT}`);
  console.log('Broadcasting synthetic CubeSat telemetry packets...\n');

  let pktCount = 1000;
  let startTime = Date.now();
  let fixCycleInterval = 15000; // 15 seconds on, 15 seconds off

  // Base coordinates for GPS (Satish Dhawan Space Centre / Sriharikota)
  const BASE_LAT = 13.7198;
  const BASE_LON = 80.2304;

  setInterval(() => {
    // If real hardware packets were posted in the last 3 seconds, pause simulator to let live data take over
    if (Date.now() - lastLiveTelemetryTime < 3000) {
      return;
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    const t = elapsedSec;
    pktCount++;

    const roll = 0.6 * Math.sin(t);
    const pitch = 0.4 * Math.sin(0.7 * t);

    const noise = () => (Math.random() - 0.5) * 0.01;
    const ax = Number((-Math.sin(pitch) + noise()).toFixed(3));
    const ay = Number((Math.sin(roll) * Math.cos(pitch) + noise()).toFixed(3));
    const az = Number((Math.cos(roll) * Math.cos(pitch) + noise()).toFixed(3));

    const RAD_TO_DEG = 180 / Math.PI;
    const gx = Number((0.6 * Math.cos(t) * RAD_TO_DEG + noise() * 5).toFixed(2));
    const gy = Number((0.28 * Math.cos(0.7 * t) * RAD_TO_DEG + noise() * 5).toFixed(2));
    const gz = Number((20 * Math.sin(0.3 * t) + noise() * 5).toFixed(2));

    const temp = Number((26.5 + 2.0 * Math.sin(0.05 * t) + (Math.random() - 0.5) * 0.1).toFixed(1));
    const hum = Math.round(58 + 8 * Math.sin(0.04 * t) + (Math.random() - 0.5) * 2);
    const press = Number((1012.2 + 2.5 * Math.cos(0.03 * t) + (Math.random() - 0.5) * 0.2).toFixed(1));
    const alt = Number((24.5 + 4.0 * Math.sin(0.035 * t) + (Math.random() - 0.5) * 0.3).toFixed(1));

    const cyclePos = (Date.now() - startTime) % (fixCycleInterval * 2);
    const gpsFix = cyclePos < fixCycleInterval;

    let lat = null;
    let lon = null;
    if (gpsFix) {
      lat = Number((BASE_LAT + 0.0008 * Math.sin(0.1 * t)).toFixed(6));
      lon = Number((BASE_LON + 0.0008 * Math.cos(0.1 * t)).toFixed(6));
    }

    const packet = {
      pkt: pktCount,
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
      temp,
      hum,
      press,
      alt,
      lat,
      lon,
      gps_fix: gpsFix
    };

    broadcastPacket(packet);
  }, 100); // 10 Hz
}

// ==========================================
// 2. REAL HARDWARE SERIAL PORT MODE
// ==========================================
function startSerialMode(portPath) {
  if (!SerialPort) {
    console.error('[ERROR] SerialPort is not supported in this environment.');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('  CUBESAT MISSION CONTROL - SERIAL TELEMETRY BRIDGE ');
  console.log('====================================================');
  console.log(`Connecting to Serial Port: ${portPath} @ 115200 baud...`);
  console.log(`Web Dashboard: http://localhost:${PORT}\n`);

  const port = new SerialPort({
    path: portPath,
    baudRate: 115200,
    autoOpen: false
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

  port.open((err) => {
    if (err) {
      console.error(`\n[SERIAL ERROR] Failed to open port "${portPath}": ${err.message}`);
      console.error('Troubleshooting Tips:');
      console.error(' 1. Check if the ESP32 Ground Station is firmly connected via USB.');
      console.error(' 2. Ensure Arduino IDE Serial Monitor or other serial terminals are CLOSED.');
      console.error(' 3. Run "node server.js" with no arguments to list active serial ports.');
      process.exit(1);
    }
    console.log(`[SERIAL] Successfully connected to ${portPath}. Listening for telemetry packets...`);
  });

  port.on('error', (err) => {
    console.error(`[SERIAL ERROR] Communication error on ${portPath}:`, err.message);
  });

  port.on('close', () => {
    console.warn(`[SERIAL] Port ${portPath} was closed.`);
  });

  parser.on('data', (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const packet = JSON.parse(line);
        if (typeof packet.pkt !== 'undefined') {
          lastLiveTelemetryTime = Date.now();
          broadcastPacket(packet);
        }
      } catch (e) {
        // Silently ignore malformed or partial serial lines
      }
    }
  });
}

// ==========================================
// 3. SERIAL PORT LISTER
// ==========================================
async function listSerialPortsAndExit() {
  console.log('====================================================');
  console.log('  CUBESAT MISSION CONTROL - GROUND STATION BRIDGE   ');
  console.log('====================================================\n');
  console.log('No serial port specified.');
  console.log('Scanning available serial ports on this system...\n');

  if (!SerialPort) {
    console.log('No serial ports available in this environment.');
    startSimulator();
    return;
  }

  try {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      console.log('No physical serial ports detected.');
      console.log('Defaulting to 10 Hz flight simulator mode...\n');
      startSimulator();
      return;
    } else {
      console.log('Available Serial Ports:');
      ports.forEach((p, index) => {
        console.log(`  [${index + 1}] ${p.path}\t${p.manufacturer || 'Unknown Manufacturer'}\t(${p.friendlyName || p.pnpId || ''})`);
      });
      console.log('\nUsage:');
      console.log(`  node server.js ${ports[0].path}`);
      console.log('  npm run sim               (to run the 10 Hz flight simulator)\n');
    }
  } catch (err) {
    console.error('Error listing serial ports:', err.message);
    startSimulator();
    return;
  }
  process.exit(0);
}

// ==========================================
// MAIN ENTRY POINT
// ==========================================
const args = process.argv.slice(2);
const isSim = args.includes('--sim') || args.includes('sim') || process.env.npm_lifecycle_event === 'sim' || process.env.SIMULATOR === 'true';
const isCloud = process.env.RENDER || process.env.RAILWAY_STATIC_URL || process.env.NODE_ENV === 'production';

server.listen(PORT, '0.0.0.0', async () => {
  if (isSim || isCloud) {
    startSimulator();
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    startSerialMode(args[0]);
  } else {
    await listSerialPortsAndExit();
  }
});
