import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Compass } from 'lucide-react';

export default function CubeSatViewer({ packet }) {
  const mountRef = useRef(null);
  const canvasRef = useRef(null);
  const threeRef = useRef(null);

  // Attitude state in radians
  const filterState = useRef({
    roll: 0,
    pitch: 0,
    yaw: 0,
    lastTime: null
  });

  const [displayAngles, setDisplayAngles] = useState({ roll: 0, pitch: 0, yaw: 0 });

  // 1. Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.8, 2.2, 3.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00ff66, 1.2);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 0.7);
    dirLight2.position.set(-5, -5, -5);
    scene.add(dirLight2);

    // CubeSat Root Group
    const cubesat = new THREE.Group();
    scene.add(cubesat);

    // Procedural solar panel texture
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 256;
    texCanvas.height = 256;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#08142b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 16; i <= 256; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    }
    const solarTexture = new THREE.CanvasTexture(texCanvas);

    const solarMaterial = new THREE.MeshStandardMaterial({
      map: solarTexture,
      roughness: 0.25,
      metalness: 0.85
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.95
    });

    // Materials order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
    const materials = [
      solarMaterial, // +X
      solarMaterial, // -X
      goldMaterial,  // +Y Top
      goldMaterial,  // -Y Bottom
      solarMaterial, // +Z
      solarMaterial  // -Z
    ];

    const cubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const cubeMesh = new THREE.Mesh(cubeGeo, materials);
    cubesat.add(cubeMesh);

    // Neon cyan edges
    const edgesGeo = new THREE.EdgesGeometry(cubeGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00ff66, linewidth: 2 });
    const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
    cubesat.add(edgeLines);

    // Gold Antenna
    const antennaGroup = new THREE.Group();
    const rodGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 16);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 });
    const antennaRod = new THREE.Mesh(rodGeo, rodMat);
    antennaRod.position.set(0, 0.425, 0);
    antennaGroup.add(antennaRod);

    const tipGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, roughness: 0.3 });
    const antennaTip = new THREE.Mesh(tipGeo, tipMat);
    antennaTip.position.set(0, 0.85, 0);
    antennaGroup.add(antennaTip);

    antennaGroup.position.set(0.35, 0.6, 0.35);
    antennaGroup.rotation.z = -0.15;
    cubesat.add(antennaGroup);

    // Axes helper (RGB)
    const axesHelper = new THREE.AxesHelper(1.1);
    cubesat.add(axesHelper);

    const targetQuaternion = new THREE.Quaternion();

    threeRef.current = {
      scene,
      camera,
      renderer,
      cubesat,
      targetQuaternion
    };

    // Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (threeRef.current) {
        threeRef.current.cubesat.quaternion.slerp(threeRef.current.targetQuaternion, 0.25);
        threeRef.current.renderer.render(threeRef.current.scene, threeRef.current.camera);
      }
    };
    animate();

    const handleResize = () => {
      if (!container || !threeRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      threeRef.current.camera.aspect = w / h;
      threeRef.current.camera.updateProjectionMatrix();
      threeRef.current.renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      cubeGeo.dispose();
      edgesGeo.dispose();
      rodGeo.dispose();
      tipGeo.dispose();
    };
  }, []);

  // 2. Update attitude filter on packet arrival
  useEffect(() => {
    if (!packet || packet.ax === null || packet.ay === null || packet.az === null) return;
    const three = threeRef.current;
    if (!three) return;

    const now = performance.now();
    const st = filterState.current;
    const dt = st.lastTime ? Math.min((now - st.lastTime) / 1000, 0.2) : 0.1;
    st.lastTime = now;

    // Accelerometer angles
    const rollAcc = Math.atan2(packet.ay, packet.az);
    const pitchAcc = Math.atan2(-packet.ax, Math.hypot(packet.ay, packet.az));

    // Gyro rates to rad/s
    const gxRad = ((packet.gx || 0) * Math.PI) / 180;
    const gyRad = ((packet.gy || 0) * Math.PI) / 180;
    const gzRad = ((packet.gz || 0) * Math.PI) / 180;

    // Complementary filter (alpha = 0.98)
    const ALPHA = 0.98;
    st.roll = ALPHA * (st.roll + gxRad * dt) + (1 - ALPHA) * rollAcc;
    st.pitch = ALPHA * (st.pitch + gyRad * dt) + (1 - ALPHA) * pitchAcc;
    st.yaw = st.yaw + gzRad * dt; // Integrated gyro Z only

    // Sensor axes mapped to Three.js: Euler(roll, yaw, -pitch, 'YZX')
    const euler = new THREE.Euler(st.roll, st.yaw, -st.pitch, 'YZX');
    three.targetQuaternion.setFromEuler(euler);

    const RAD_TO_DEG = 180 / Math.PI;
    setDisplayAngles({
      roll: Number((st.roll * RAD_TO_DEG).toFixed(1)),
      pitch: Number((st.pitch * RAD_TO_DEG).toFixed(1)),
      yaw: Number((st.yaw * RAD_TO_DEG).toFixed(1))
    });
  }, [packet]);

  const handleResetYaw = () => {
    filterState.current.yaw = 0;
    setDisplayAngles(prev => ({ ...prev, yaw: 0 }));
  };

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title">
          <Compass size={16} /> 1U Altitude Determination (ADCS)
        </div>
        <span className="card-tag">MPU6050 Fusion</span>
      </div>

      <div className="cubesat-viewport" ref={mountRef}>
        <div className="attitude-overlay">
          Euler Mapping: [YZX] | Filter: α=0.98 Slerp
        </div>
        <canvas className="threejs-canvas" ref={canvasRef} />
      </div>

      <div className="attitude-footer">
        <div className="attitude-metrics">
          <div className="att-item">
            <span className="att-label">ROLL (X)</span>
            <span className="att-value accent-cyan">
              {displayAngles.roll >= 0 ? '+' : ''}{displayAngles.roll}°
            </span>
          </div>
          <div className="att-item">
            <span className="att-label">PITCH (Y)</span>
            <span className="att-value accent-green">
              {displayAngles.pitch >= 0 ? '+' : ''}{displayAngles.pitch}°
            </span>
          </div>
          <div className="att-item">
            <span className="att-label">YAW (Z)</span>
            <span className="att-value accent-amber">
              {displayAngles.yaw >= 0 ? '+' : ''}{displayAngles.yaw}°
            </span>
            <span className="yaw-warning">relative, drifts over time</span>
          </div>
        </div>
        <button
          className="reset-yaw-btn"
          onClick={handleResetYaw}
          title="Reset relative yaw integration to zero"
        >
          RESET YAW
        </button>
      </div>
    </div>
  );
}

