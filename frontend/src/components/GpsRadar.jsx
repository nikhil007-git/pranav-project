import React, { useEffect, useRef } from 'react';
import { Radio } from 'lucide-react';

export default function GpsRadar({ packet }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    sweepAngle: 0,
    originLat: null,
    originLon: null,
    trail: [] // [{x, y}] in relative meters
  });

  const hasFix = packet?.gps_fix && packet?.lat !== null && packet?.lon !== null;

  // Track position history relative to first fix
  useEffect(() => {
    if (hasFix) {
      const st = stateRef.current;
      if (st.originLat === null || st.originLon === null) {
        st.originLat = packet.lat;
        st.originLon = packet.lon;
      }
      // Simple local equirectangular displacement (meters)
      const dLat = (packet.lat - st.originLat) * 111320;
      const dLon = (packet.lon - st.originLon) * 111320 * Math.cos((st.originLat * Math.PI) / 180);
      st.trail.push({ x: dLon, y: dLat });
      if (st.trail.length > 50) st.trail.shift();
    }
  }, [hasFix, packet?.lat, packet?.lon]);

  // Radar drawing loop (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const renderRadar = () => {
      animId = requestAnimationFrame(renderRadar);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const r = cx - 8;

      ctx.clearRect(0, 0, w, h);

      // Concentric range rings
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.lineWidth = 1;
      [0.33, 0.66, 1.0].forEach(factor => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * factor, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.stroke();

      // Bearing Labels
      ctx.fillStyle = '#495670';
      ctx.font = "9px 'Orbitron', monospace";
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - r + 12);
      ctx.fillText('S', cx, cy + r - 4);
      ctx.fillText('E', cx + r - 10, cy + 3);
      ctx.fillText('W', cx - r + 10, cy + 3);

      // Sweep animation
      const st = stateRef.current;
      st.sweepAngle = (st.sweepAngle + 0.04) % (Math.PI * 2);

      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
      sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, st.sweepAngle - 0.5, st.sweepAngle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      // Sweep frontier line
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(st.sweepAngle), cy + r * Math.sin(st.sweepAngle));
      ctx.stroke();

      // Position trail
      if (st.trail.length > 0) {
        st.trail.forEach((pt, idx) => {
          const alpha = (idx + 1) / st.trail.length;
          // Scale: 100 meters mapped to radius
          const scale = r / 100;
          const px = cx + pt.x * scale;
          const py = cy - pt.y * scale;

          ctx.fillStyle = `rgba(0, 255, 157, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, idx === st.trail.length - 1 ? 4 : 2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        // Center blip
        ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    renderRadar();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="glass-card">
      <div className="card-header">
        <div className="card-title">
          <Radio size={16} /> Tactical GPS Tracking (NEO-6M)
        </div>
        <span className="card-tag">UART Serial2</span>
      </div>

      <div className="gps-body">
        <div className="radar-wrapper">
          <canvas className="radar-canvas" ref={canvasRef} width={190} height={190} />
        </div>
        <div className="gps-details">
          <div className={`gps-fix-pill ${hasFix ? 'gps-fix-active' : 'gps-fix-waiting'}`}>
            <span>●</span>
            <span>{hasFix ? '3D FIX ACQUIRED' : 'WAITING FOR FIX'}</span>
          </div>
          <div className="gps-coord-grid">
            <div className="coord-box">
              <div className="coord-label">LATITUDE</div>
              <div className="coord-val">
                {hasFix ? `${Number(packet.lat).toFixed(6)}°` : '-'}
              </div>
            </div>
            <div className="coord-box">
              <div className="coord-label">LONGITUDE</div>
              <div className="coord-val">
                {hasFix ? `${Number(packet.lon).toFixed(6)}°` : '-'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

