import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import CubeSatViewer from './components/CubeSatViewer';
import GpsRadar from './components/GpsRadar';
import TelemetryCharts from './components/TelemetryCharts';

export default function App() {
  const [latestPacket, setLatestPacket] = useState(null);
  const [linkStatus, setLinkStatus] = useState('waiting'); // 'waiting' | 'ok' | 'lost'
  const [pps, setPps] = useState('0.0');
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);

  const recordedPacketsRef = useRef([]);
  const lastPacketTimeRef = useRef(0);
  const packetWindowCountRef = useRef(0);
  const lastWindowTimeRef = useRef(performance.now());
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // WebSocket connection & Watchdog
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let isUnmounted = false;

    const connect = () => {
      // In Vite dev mode (port 5173), direct WS to port 3000; in production, use same host
      const isDev = window.location.port === '5173';
      const wsUrl = isDev
        ? 'ws://localhost:3000'
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected to ground station telemetry bridge at', wsUrl);
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (typeof packet.pkt !== 'undefined') {
            const now = performance.now();
            lastPacketTimeRef.current = now;
            packetWindowCountRef.current++;

            setLatestPacket(packet);
            setLinkStatus('ok');

            if (isRecordingRef.current) {
              recordedPacketsRef.current.push({
                timestamp: new Date().toISOString(),
                ...packet
              });
              setRecordedCount(recordedPacketsRef.current.length);
            }
          }
        } catch (e) {
          console.warn('[WS] Malformed packet:', event.data);
        }
      };

      ws.onclose = () => {
        console.warn('[WS] Telemetry connection lost. Reconnecting in 1.5s...');
        setLinkStatus('waiting');
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 1500);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Socket error:', err);
        ws.close();
      };
    };

    connect();

    // Watchdog timer (every 250ms)
    const watchdogInterval = setInterval(() => {
      const now = performance.now();

      // PPS calculation every 1000ms
      if (now - lastWindowTimeRef.current >= 1000) {
        const computedPPS = (packetWindowCountRef.current / ((now - lastWindowTimeRef.current) / 1000)).toFixed(1);
        setPps(computedPPS);
        packetWindowCountRef.current = 0;
        lastWindowTimeRef.current = now;
      }

      // Check for link lost (> 3s without packet)
      if (lastPacketTimeRef.current > 0 && now - lastPacketTimeRef.current > 3000) {
        setLinkStatus('lost');
        setPps('0.0');
      }
    }, 250);

    return () => {
      isUnmounted = true;
      clearInterval(watchdogInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  const handleTogglePause = () => {
    setIsPaused(prev => !prev);
  };

  const handleToggleRecord = () => {
    setIsRecording(prev => !prev);
  };

  const handleDownloadCsv = () => {
    const list = recordedPacketsRef.current;
    if (list.length === 0) {
      alert('No telemetry packets recorded yet. Click "RECORD" to start capturing a mission session!');
      return;
    }

    const headers = [
      'timestamp', 'pkt', 'ax', 'ay', 'az', 'gx', 'gy', 'gz',
      'temp', 'hum', 'press', 'alt', 'lat', 'lon', 'gps_fix'
    ];

    const csvRows = [headers.join(',')];

    list.forEach(p => {
      const row = headers.map(h => {
        const val = p[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      });
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cubesat_telemetry_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header
        linkStatus={linkStatus}
        packet={latestPacket}
        pps={pps}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
        isRecording={isRecording}
        recordedCount={recordedCount}
        onToggleRecord={handleToggleRecord}
        onDownloadCsv={handleDownloadCsv}
      />

      <div className="dashboard-container">
        {/* Left Column: 3D ADCS & Tactical GPS */}
        <div className="column">
          <CubeSatViewer packet={latestPacket} />
          <GpsRadar packet={latestPacket} />
        </div>

        {/* Right Column: Telemetry Grids & Real-time Charts */}
        <div className="column">
          <TelemetryCharts packet={latestPacket} isPaused={isPaused} />
        </div>
      </div>

      <footer>
        ORBITRA-1 CUBESAT TELEMETRY // NASA OPEN MCT REACT DASHBOARD // BROADCAST VIA ESP-NOW & WEBSOCKETS
      </footer>
    </>
  );
}

