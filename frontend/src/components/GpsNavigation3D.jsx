import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Globe, Navigation } from 'lucide-react';

export default function GpsNavigation3D({ packet }) {
  const mountRef = useRef(null);
  const canvasRef = useRef(null);
  const threeRef = useRef(null);

  const [mode, setMode] = useState('demo'); // 'demo' | 'live'
  const [followMode, setFollowMode] = useState(true);
  const [eventLogs, setEventLogs] = useState([
    { time: 'T+00:00', type: 'INFO', text: 'Mission dashboard initialized in simulation mode.' },
    { time: 'T+00:01', type: 'INFO', text: 'Environmental telemetry channels nominal.' },
    { time: 'T+00:02', type: 'GPS', text: 'Receiver standby · 3D orbital trajectory tracking active.' }
  ]);

  const hasLiveFix = packet?.gps_fix && packet?.lat !== null && packet?.lon !== null;

  // Track event logs on telemetry state changes
  const prevAlertRef = useRef({ highTemp: false, highPress: false, fix: false });
  useEffect(() => {
    if (!packet) return;
    const nowSec = Math.floor(performance.now() / 1000);
    const m = Math.floor(nowSec / 60).toString().padStart(2, '0');
    const s = (nowSec % 60).toString().padStart(2, '0');
    const tStr = `T+${m}:${s}`;

    // Temperature Alert Event
    if (packet.temp > 32.0 && !prevAlertRef.current.highTemp) {
      prevAlertRef.current.highTemp = true;
      setEventLogs(prev => [
        { time: tStr, type: 'WARN', text: `High Temperature Alert: ${packet.temp.toFixed(1)}°C (Exceeded 32°C)` },
        ...prev.slice(0, 5)
      ]);
    } else if (packet.temp <= 32.0 && prevAlertRef.current.highTemp) {
      prevAlertRef.current.highTemp = false;
      setEventLogs(prev => [
        { time: tStr, type: 'INFO', text: `Temperature returned to nominal (${packet.temp.toFixed(1)}°C)` },
        ...prev.slice(0, 5)
      ]);
    }

    // Pressure Alert Event
    if (packet.press > 1020.0 && !prevAlertRef.current.highPress) {
      prevAlertRef.current.highPress = true;
      setEventLogs(prev => [
        { time: tStr, type: 'WARN', text: `High Pressure Alert: ${packet.press.toFixed(1)} hPa (Exceeded 1020 hPa)` },
        ...prev.slice(0, 5)
      ]);
    } else if (packet.press <= 1020.0 && prevAlertRef.current.highPress) {
      prevAlertRef.current.highPress = false;
      setEventLogs(prev => [
        { time: tStr, type: 'INFO', text: `Pressure returned to nominal (${packet.press.toFixed(1)} hPa)` },
        ...prev.slice(0, 5)
      ]);
    }

    // GPS Fix Acquired Event
    if (packet.gps_fix && !prevAlertRef.current.fix) {
      prevAlertRef.current.fix = true;
      setEventLogs(prev => [
        { time: tStr, type: 'GPS', text: `3D Satellite fix locked: ${packet.lat?.toFixed(4)}°, ${packet.lon?.toFixed(4)}°` },
        ...prev.slice(0, 5)
      ]);
    } else if (!packet.gps_fix && prevAlertRef.current.fix) {
      prevAlertRef.current.fix = false;
      setEventLogs(prev => [
        { time: tStr, type: 'GPS', text: 'GPS satellite signal lost · Reverted to search' },
        ...prev.slice(0, 5)
      ]);
    }
  }, [packet]);

  // Three.js 3D Earth Globe and Orbital Track
  useEffect(() => {
    const container = mountRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 320;
    const height = 240;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 3.4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Ambient and point light
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(amb);
    const pLight = new THREE.PointLight(0x00d2ff, 1.6, 10);
    pLight.position.set(2, 3, 2);
    scene.add(pLight);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // 1. Dark Core Globe
    const sphereGeo = new THREE.SphereGeometry(1.0, 36, 36);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x060f1e,
      roughness: 0.8,
      metalness: 0.25
    });
    const globeSphere = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(globeSphere);

    // 2. Glowing Electric Cyan Wireframe Grid
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.2
    });
    const wireMesh = new THREE.Mesh(sphereGeo, wireMat);
    globeGroup.add(wireMesh);

    // 3. Latitude & Longitude Reference Rings
    const ringMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.5 });
    const equatorGeo = new THREE.BufferGeometry();
    const equatorPts = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      equatorPts.push(Math.cos(theta) * 1.002, 0, Math.sin(theta) * 1.002);
    }
    equatorGeo.setAttribute('position', new THREE.Float32BufferAttribute(equatorPts, 3));
    const equator = new THREE.Line(equatorGeo, ringMat);
    globeGroup.add(equator);

    // 4. Inclined Orbital Ellipse (ISS ~51.6 degrees inclination)
    const orbitRadius = 1.35;
    const orbitPts = [];
    const inclination = (51.6 * Math.PI) / 180;
    for (let i = 0; i <= 128; i++) {
      const u = (i / 128) * Math.PI * 2;
      const x = orbitRadius * Math.cos(u);
      const y = orbitRadius * Math.sin(u) * Math.sin(inclination);
      const z = orbitRadius * Math.sin(u) * Math.cos(inclination);
      orbitPts.push(x, y, z);
    }
    const orbitGeo = new THREE.BufferGeometry();
    orbitGeo.setAttribute('position', new THREE.Float32BufferAttribute(orbitPts, 3));
    const orbitLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const orbitLine = new THREE.Line(orbitGeo, orbitLineMat);
    globeGroup.add(orbitLine);

    // 5. Satellite Dot 'ORB-01'
    const satGroup = new THREE.Group();
    const satDotGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const satDotMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const satDot = new THREE.Mesh(satDotGeo, satDotMat);
    satGroup.add(satDot);

    // Glow ring around satellite
    const glowGeo = new THREE.RingGeometry(0.06, 0.08, 16);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const glowRing = new THREE.Mesh(glowGeo, glowMat);
    satGroup.add(glowRing);

    globeGroup.add(satGroup);

    // 6. Ground Station Blip 'GKP' (Golden Dot)
    const gsGeo = new THREE.SphereGeometry(0.035, 12, 12);
    const gsMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const gsDot = new THREE.Mesh(gsGeo, gsMat);
    // Position on earth surface (lat ~26.7°, lon ~83.3°)
    const gsLat = (26.7 * Math.PI) / 180;
    const gsLon = (83.3 * Math.PI) / 180;
    gsDot.position.set(
      1.01 * Math.cos(gsLat) * Math.cos(gsLon),
      1.01 * Math.sin(gsLat),
      1.01 * Math.cos(gsLat) * Math.sin(gsLon)
    );
    globeGroup.add(gsDot);

    threeRef.current = {
      scene,
      camera,
      renderer,
      globeGroup,
      satGroup,
      satDot,
      orbitRadius,
      inclination
    };

    let animId;
    let t = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.008;

      // Slow globe rotation
      globeGroup.rotation.y += 0.0015;

      // Satellite orbital movement
      const x = orbitRadius * Math.cos(t);
      const y = orbitRadius * Math.sin(t) * Math.sin(inclination);
      const z = orbitRadius * Math.sin(t) * Math.cos(inclination);
      satGroup.position.set(x, y, z);
      glowRing.lookAt(camera.position);

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !threeRef.current) return;
      const w = container.clientWidth;
      const h = 240;
      threeRef.current.camera.aspect = w / h;
      threeRef.current.camera.updateProjectionMatrix();
      threeRef.current.renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      sphereGeo.dispose();
      wireMat.dispose();
    };
  }, []);

  // Compute displayed coordinates (Real vs Simulated)
  const isReal = mode === 'live' && hasLiveFix;
  const displayLat = isReal
    ? `${packet.lat.toFixed(4)}° N`
    : `48.8928° N`;
  const displayLon = isReal
    ? `${packet.lon.toFixed(4)}° E`
    : `127.0653° E`;
  const displayAlt = isReal
    ? (packet.alt ? `${packet.alt.toFixed(0)} m` : '408 km')
    : `408 km`;

  return (
    <div className="glass-card gps-3d-card">
      <div className="card-header">
        <div className="card-title">
          <Globe size={16} /> NAVIGATION / GPS · 3D
        </div>
        <span className="card-tag">NEO-6M</span>
      </div>

      <div className="gps-3d-body">
        {/* 3D Globe Canvas Container */}
        <div className="globe-viewport" ref={mountRef}>
          <canvas className="globe-canvas" ref={canvasRef} />

          {/* Satellite Overlay Label */}
          <div className="sat-overlay-tag">
            <span className="dot-pulse-green"></span>
            <span>ORB-01</span>
          </div>

          <div className="ground-overlay-tag">
            <span className="dot-gold"></span>
            <span>GKP</span>
          </div>

          <div className="globe-status-bar">
            <span>{isReal ? 'LIVE GPS FIX' : 'SIMULATED ORBIT'}</span>
            <span>{isReal ? 'REAL SENSOR DATA' : 'DEMO DATA'}</span>
          </div>
        </div>

        {/* Telemetry Metric Cards */}
        <div className="nav-metric-grid">
          <div className="nav-metric-box">
            <span className="nav-label">LATITUDE</span>
            <span className="nav-val">{displayLat}</span>
          </div>
          <div className="nav-metric-box">
            <span className="nav-label">LONGITUDE</span>
            <span className="nav-val">{displayLon}</span>
          </div>
          <div className="nav-metric-box">
            <span className="nav-label">ALTITUDE</span>
            <span className="nav-val">{displayAlt}</span>
          </div>
        </div>

        {/* Orbit Mode Controls */}
        <div className="nav-control-bar">
          <select
            className="nav-select"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="demo">Demo orbit (ISS-like, 51.6°)</option>
            <option value="live">Live ESP32 GPS Source</option>
          </select>
          <button className="nav-btn apply-btn" onClick={() => setMode(mode)}>
            APPLY
          </button>
          <button
            className={`nav-btn follow-btn ${followMode ? 'active' : ''}`}
            onClick={() => setFollowMode(!followMode)}
          >
            FOLLOW: {followMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <p className="nav-subnote">
          Demo orbit is simulated (ISS-like, 51.6° inclination). Select an ESP32 source to plot real GPS data.
        </p>

        {/* Event Log Section */}
        <div className="event-log-container">
          <div className="event-header">
            <span>RECENT EVENT LOG</span>
            <span className="event-count">{eventLogs.length} EVENTS</span>
          </div>
          <div className="event-list">
            {eventLogs.map((log, idx) => (
              <div key={idx} className="event-item">
                <span className="event-time">{log.time}</span>
                <span className={`event-badge badge-${log.type.toLowerCase()}`}>
                  {log.type}
                </span>
                <span className="event-text">{log.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

