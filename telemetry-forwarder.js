/*
 * ======================================================================================
 * CubeSat Ground Station - Cloud Telemetry Forwarder
 * ======================================================================================
 * Usage:
 *   node telemetry-forwarder.js <PORT> <CLOUD_URL>
 *
 * Examples:
 *   node telemetry-forwarder.js COM5 https://my-cubesat-dashboard.onrender.com
 *   node telemetry-forwarder.js /dev/ttyUSB0 https://cubesat.railway.app
 * ======================================================================================
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const portPath = args[0];
const targetUrlStr = args[1];

if (!portPath || !targetUrlStr) {
  console.log('====================================================');
  console.log('   CUBESAT HARDWARE-TO-CLOUD TELEMETRY FORWARDER    ');
  console.log('====================================================');
  console.log('Usage:');
  console.log('  node telemetry-forwarder.js <SERIAL_PORT> <CLOUD_URL>\n');
  console.log('Examples:');
  console.log('  node telemetry-forwarder.js COM5 https://my-cubesat.onrender.com');
  console.log('  node telemetry-forwarder.js /dev/ttyUSB0 https://my-cubesat.up.railway.app\n');
  process.exit(1);
}

let targetUrl;
try {
  targetUrl = new URL('/api/telemetry', targetUrlStr);
} catch (e) {
  console.error('[ERROR] Invalid Cloud URL provided:', targetUrlStr);
  process.exit(1);
}

const client = targetUrl.protocol === 'https:' ? https : http;

console.log('====================================================');
console.log('   CUBESAT HARDWARE-TO-CLOUD TELEMETRY FORWARDER    ');
console.log('====================================================');
console.log(`Reading ESP32 Serial from : ${portPath} @ 115200 baud`);
console.log(`Forwarding Telemetry to   : ${targetUrl.href}\n`);

const serial = new SerialPort({
  path: portPath,
  baudRate: 115200,
  autoOpen: false
});

const parser = serial.pipe(new ReadlineParser({ delimiter: '\r\n' }));

serial.open((err) => {
  if (err) {
    console.error(`[SERIAL ERROR] Failed to open ${portPath}: ${err.message}`);
    process.exit(1);
  }
  console.log(`[CONNECTED] Ground Station ESP32 ready on ${portPath}. Forwarding live stream...`);
});

let packetCount = 0;

parser.on('data', (rawLine) => {
  const line = rawLine.trim();
  if (!line || !line.startsWith('{') || !line.endsWith('}')) return;

  try {
    const packet = JSON.parse(line);
    if (typeof packet.pkt === 'undefined') return;

    const payload = JSON.stringify(packet);

    const req = client.request(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 2000
      },
      (res) => {
        if (res.statusCode === 200) {
          packetCount++;
          process.stdout.write(`\r[STREAMING] Forwarded Packet #${packet.pkt} (Total: ${packetCount}) `);
        }
      }
    );

    req.on('error', (err) => {
      // Avoid spamming terminal on temporary network hiccup
    });

    req.write(payload);
    req.end();
  } catch (e) {
    // Ignore non-json lines
  }
});
