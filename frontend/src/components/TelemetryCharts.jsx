import React, { useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';

const MAX_HISTORY = 60;

function formatVal(val, decimals = 1, fallback = '-') {
  if (val === null || val === undefined || isNaN(val)) return fallback;
  return Number(val).toFixed(decimals);
}

export default function TelemetryCharts({ packet, isPaused }) {
  // Chart references
  const chartAccRef = useRef(null);
  const chartGyroRef = useRef(null);
  const chartPressRef = useRef(null);
  const chartAltRef = useRef(null);
  const chartTempRef = useRef(null);
  const chartHumRef = useRef(null);

  // Canvas elements
  const canvasAcc = useRef(null);
  const canvasGyro = useRef(null);
  const canvasPress = useRef(null);
  const canvasAlt = useRef(null);
  const canvasTemp = useRef(null);
  const canvasHum = useRef(null);

  // Helper to build line chart
  const setupChart = (canvas, datasets) => {
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: Array(MAX_HISTORY).fill(''),
        datasets: datasets.map(d => ({
          ...d,
          data: Array(MAX_HISTORY).fill(null),
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.25,
          fill: false
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(4, 12, 28, 0.9)',
            titleColor: '#00f0ff',
            bodyFont: { family: "'IBM Plex Mono', monospace" },
            borderColor: 'rgba(0, 240, 255, 0.3)',
            borderWidth: 1
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            position: 'right',
            ticks: { maxTicksLimit: 4, color: '#495670', font: { family: "'IBM Plex Mono', monospace", size: 9 } },
            grid: { color: 'rgba(0, 240, 255, 0.06)' }
          }
        }
      }
    });
  };

  // Initialize charts once on mount
  useEffect(() => {
    chartAccRef.current = setupChart(canvasAcc.current, [
      { label: 'Ax', borderColor: '#00f0ff' },
      { label: 'Ay', borderColor: '#ffb800' },
      { label: 'Az', borderColor: '#00ff9d' }
    ]);

    chartGyroRef.current = setupChart(canvasGyro.current, [
      { label: 'Gx', borderColor: '#00f0ff' },
      { label: 'Gy', borderColor: '#ff00ea' },
      { label: 'Gz', borderColor: '#ffb800' }
    ]);

    chartPressRef.current = setupChart(canvasPress.current, [
      { label: 'Press', borderColor: '#a855f7' }
    ]);

    chartAltRef.current = setupChart(canvasAlt.current, [
      { label: 'Alt', borderColor: '#00ff9d' }
    ]);

    chartTempRef.current = setupChart(canvasTemp.current, [
      { label: 'Temp', borderColor: '#ff7700' }
    ]);

    chartHumRef.current = setupChart(canvasHum.current, [
      { label: 'Hum', borderColor: '#00f0ff' }
    ]);

    return () => {
      [chartAccRef, chartGyroRef, chartPressRef, chartAltRef, chartTempRef, chartHumRef].forEach(ref => {
        if (ref.current) ref.current.dispose ? ref.current.dispose() : ref.current.destroy();
      });
    };
  }, []);

  // Push new packet data to charts
  useEffect(() => {
    if (!packet || isPaused) return;

    const pushData = (chart, values) => {
      if (!chart) return;
      chart.data.datasets.forEach((ds, i) => {
        ds.data.push(values[i] !== undefined && values[i] !== null ? values[i] : null);
        if (ds.data.length > MAX_HISTORY) {
          ds.data.shift();
        }
      });
      chart.update('none');
    };

    pushData(chartAccRef.current, [packet.ax, packet.ay, packet.az]);
    pushData(chartGyroRef.current, [packet.gx, packet.gy, packet.gz]);
    pushData(chartPressRef.current, [packet.press]);
    pushData(chartAltRef.current, [packet.alt]);
    pushData(chartTempRef.current, [packet.temp]);
    pushData(chartHumRef.current, [packet.hum]);
  }, [packet, isPaused]);

  // Derived magnitudes
  const accMag = (packet?.ax !== null && packet?.ay !== null && packet?.az !== null && packet?.ax !== undefined)
    ? Math.hypot(packet.ax, packet.ay, packet.az).toFixed(2)
    : '--';

  const gyroMag = (packet?.gx !== null && packet?.gy !== null && packet?.gz !== null && packet?.gx !== undefined)
    ? Math.hypot(packet.gx, packet.gy, packet.gz).toFixed(1)
    : '--';

  return (
    <div className="telemetry-grid">
      {/* 1. Linear Acceleration */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Acceleration XYZ</span>
            <span className="telem-val">
              {accMag} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>g</small>
            </span>
            <div className="telem-subval">
              <span style={{ color: '#00f0ff' }}>X: <b>{formatVal(packet?.ax, 2)}</b></span>
              <span style={{ color: '#ffb800' }}>Y: <b>{formatVal(packet?.ay, 2)}</b></span>
              <span style={{ color: '#00ff9d' }}>Z: <b>{formatVal(packet?.az, 2)}</b></span>
            </div>
          </div>
          <span className="card-tag">MPU6050</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasAcc} />
        </div>
      </div>

      {/* 2. Angular Velocity */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Angular Velocity XYZ</span>
            <span className="telem-val">
              {gyroMag} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>°/s</small>
            </span>
            <div className="telem-subval">
              <span style={{ color: '#00f0ff' }}>X: <b>{formatVal(packet?.gx, 1)}</b></span>
              <span style={{ color: '#ff00ea' }}>Y: <b>{formatVal(packet?.gy, 1)}</b></span>
              <span style={{ color: '#ffb800' }}>Z: <b>{formatVal(packet?.gz, 1)}</b></span>
            </div>
          </div>
          <span className="card-tag">MPU6050</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasGyro} />
        </div>
      </div>

      {/* 3. Barometric Pressure */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Barometric Pressure</span>
            <span className="telem-val">
              {formatVal(packet?.press, 1)} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>hPa</small>
            </span>
          </div>
          <span className="card-tag">BMP280</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasPress} />
        </div>
      </div>

      {/* 4. Estimated Altitude */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Estimated Altitude</span>
            <span className="telem-val">
              {formatVal(packet?.alt, 1)} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>m</small>
            </span>
          </div>
          <span className="card-tag">BMP280</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasAlt} />
        </div>
      </div>

      {/* 5. Core Bus Temperature */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Bus Temperature</span>
            <span className="telem-val">
              {formatVal(packet?.temp, 1)} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>°C</small>
            </span>
          </div>
          <span className="card-tag">DHT11 / BMP</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasTemp} />
        </div>
      </div>

      {/* 6. Relative Humidity */}
      <div className="glass-card telemetry-card">
        <div className="telem-top">
          <div className="telem-info">
            <span className="telem-title">Relative Humidity</span>
            <span className="telem-val">
              {packet?.hum !== null && packet?.hum !== undefined && !isNaN(packet.hum) ? Math.round(packet.hum) : '-'} <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</small>
            </span>
          </div>
          <span className="card-tag">DHT11</span>
        </div>
        <div className="chart-container">
          <canvas ref={canvasHum} />
        </div>
      </div>
    </div>
  );
}

