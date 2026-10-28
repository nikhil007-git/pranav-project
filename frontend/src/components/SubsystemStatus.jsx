import React from 'react';
import { Activity, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function SubsystemStatus({ packet, linkStatus }) {
  const isOnline = linkStatus === 'ok' && packet !== null;

  // Threshold calculations
  const temp = isOnline ? packet?.temp : null;
  const press = isOnline ? packet?.press : null;
  const hum = isOnline ? packet?.hum : null;
  const ax = isOnline ? packet?.ax : null;
  const ay = isOnline ? packet?.ay : null;
  const az = isOnline ? packet?.az : null;
  const hasGpsFix = isOnline ? packet?.gps_fix : false;

  // Temperature Status (> 32°C is HIGH, < 10°C is LOW, else NOMINAL)
  let tempStatus = isOnline
    ? { text: 'NOMINAL', color: 'nominal', isAlert: false }
    : { text: 'OFFLINE', color: 'simulated', isAlert: false };

  if (isOnline && temp !== null && temp !== undefined && !isNaN(temp)) {
    if (temp > 32.0) {
      tempStatus = { text: `HIGH (${Number(temp).toFixed(1)}°C)`, color: 'alert-high', isAlert: true };
    } else if (temp < 10.0) {
      tempStatus = { text: `LOW (${Number(temp).toFixed(1)}°C)`, color: 'alert-low', isAlert: true };
    }
  }

  // Pressure Status (> 1020 hPa is HIGH, < 980 hPa is LOW, else NOMINAL)
  let pressStatus = isOnline
    ? { text: 'NOMINAL', color: 'nominal', isAlert: false }
    : { text: 'OFFLINE', color: 'simulated', isAlert: false };

  if (isOnline && press !== null && press !== undefined && !isNaN(press)) {
    if (press > 1020.0) {
      pressStatus = { text: `HIGH (${Number(press).toFixed(1)} hPa)`, color: 'alert-high', isAlert: true };
    } else if (press < 980.0) {
      pressStatus = { text: `LOW (${Number(press).toFixed(1)} hPa)`, color: 'alert-low', isAlert: true };
    }
  }

  // Attitude Status
  let attStatus = isOnline
    ? { text: 'NOMINAL', color: 'nominal' }
    : { text: 'OFFLINE', color: 'simulated' };

  if (isOnline && ax !== null && ay !== null && az !== null && ax !== undefined) {
    const gMag = Math.hypot(ax, ay, az);
    if (gMag > 2.5) {
      attStatus = { text: `HIGH G-FORCE (${gMag.toFixed(1)}g)`, color: 'alert-high' };
    }
  }

  // Navigation Status
  let navStatus = isOnline
    ? (hasGpsFix ? { text: '3D FIX LOCKED', color: 'nominal' } : { text: 'SEARCHING', color: 'simulated' })
    : { text: 'OFFLINE', color: 'simulated' };

  // Controller overall health
  const hasAnyAlert = tempStatus.isAlert || pressStatus.isAlert;

  return (
    <div className="glass-card subsystem-card">
      <div className="card-header">
        <div className="card-title">
          <Activity size={16} /> SPACECRAFT SUBSYSTEM STATUS
        </div>
        <span className="card-tag">SYSTEM HEALTH</span>
      </div>

      <div className="subsystem-body">
        {/* Progress / Status Bars */}
        <div className="meter-grid">
          <div className="meter-item">
            <div className="meter-label-row">
              <span className="meter-title">ONBOARD CONTROLLER</span>
              <span className={`meter-status ${isOnline ? (hasAnyAlert ? 'text-amber' : 'text-cyan') : 'text-dim'}`}>
                {isOnline ? (hasAnyAlert ? 'ATTENTION' : 'NOMINAL') : 'STANDBY'}
              </span>
            </div>
            <div className="meter-track">
              <div
                className={`meter-bar ${isOnline ? (hasAnyAlert ? 'meter-amber' : 'meter-cyan') : 'meter-dim'}`}
                style={{ width: isOnline ? (hasAnyAlert ? '85%' : '100%') : '0%' }}
              />
            </div>
          </div>

          <div className="meter-item">
            <div className="meter-label-row">
              <span className="meter-title">TELEMETRY LINK</span>
              <span className={`meter-status ${isOnline ? 'text-green' : 'text-red'}`}>
                {isOnline ? 'CONNECTED (LIVE)' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="meter-track">
              <div
                className={`meter-bar ${isOnline ? 'meter-green' : 'meter-red'}`}
                style={{ width: isOnline ? '100%' : '5%' }}
              />
            </div>
          </div>

          <div className="meter-item">
            <div className="meter-label-row">
              <span className="meter-title">GPS RECEIVER</span>
              <span className={`meter-status ${isOnline ? (hasGpsFix ? 'text-green' : 'text-amber') : 'text-dim'}`}>
                {isOnline ? (hasGpsFix ? '3D FIX (LOCKED)' : 'SEARCHING') : 'OFFLINE'}
              </span>
            </div>
            <div className="meter-track">
              <div
                className={`meter-bar ${isOnline ? (hasGpsFix ? 'meter-green' : 'meter-amber') : 'meter-dim'}`}
                style={{ width: isOnline ? (hasGpsFix ? '100%' : '35%') : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="subsystem-table-wrapper">
          <table className="subsystem-table">
            <thead>
              <tr>
                <th>SUBSYSTEM</th>
                <th>SOURCE</th>
                <th>PARAMETER</th>
                <th style={{ textAlign: 'right' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sub-name">Environment</td>
                <td className="sub-source">DHT11</td>
                <td className="sub-param">Temperature / humidity</td>
                <td className="sub-status" style={{ textAlign: 'right' }}>
                  <span className={`status-pill pill-${tempStatus.color}`}>
                    ● {tempStatus.text}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sub-name">Barometer</td>
                <td className="sub-source">BMP280</td>
                <td className="sub-param">Pressure / altitude</td>
                <td className="sub-status" style={{ textAlign: 'right' }}>
                  <span className={`status-pill pill-${pressStatus.color}`}>
                    ● {pressStatus.text}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sub-name">Altitude / IMU</td>
                <td className="sub-source">MPU6050</td>
                <td className="sub-param">Acceleration / angular vel</td>
                <td className="sub-status" style={{ textAlign: 'right' }}>
                  <span className={`status-pill pill-${attStatus.color}`}>
                    ● {attStatus.text}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sub-name">Navigation</td>
                <td className="sub-source">NEO-6M</td>
                <td className="sub-param">Position / GPS time</td>
                <td className="sub-status" style={{ textAlign: 'right' }}>
                  <span className={`status-pill pill-${navStatus.color}`}>
                    ● {navStatus.text}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

