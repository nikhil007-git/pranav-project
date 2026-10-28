import React from 'react';
import { Pause, Play, Disc, Download } from 'lucide-react';

export default function Header({
  linkStatus,
  packet,
  pps,
  isPaused,
  onTogglePause,
  isRecording,
  recordedCount,
  onToggleRecord,
  onDownloadCsv
}) {
  const getBadgeClass = () => {
    switch (linkStatus) {
      case 'ok':
        return 'link-badge link-ok';
      case 'lost':
        return 'link-badge link-lost';
      default:
        return 'link-badge link-waiting';
    }
  };

  const getBadgeText = () => {
    switch (linkStatus) {
      case 'ok':
        return 'LINK OK';
      case 'lost':
        return 'LINK LOST';
      default:
        return 'WAITING FOR DATA';
    }
  };

  return (
    <header className="glass-card mission-header">
      <div className="header-branding">
        <div className="sat-icon-wrapper">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="var(--hud-green)">
            <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.2l6 3.75v7.1L12 18.8l-6-3.75v-7.1l6-3.75zM11 9h2v6h-2V9zm-5 1h2v4H6v-4zm10 0h2v4h-2v-4z"/>
          </svg>
        </div>
        <div>
          <div className="brand-title">
            ORBITRA // CUBESAT-1 <span className="react-badge">TEAM FAHRENHEIT-451</span>
          </div>
          <div className="brand-subtitle">
            Team Fahrenheit-451 // Telemetry & ADCS Mission Control
          </div>
        </div>
      </div>

      <div className="telemetry-status-bar">
        <div className="status-item">
          <span className="status-label">Ground Link</span>
          <div className={getBadgeClass()}>
            <span className="badge-dot"></span>
            <span>{getBadgeText()}</span>
          </div>
        </div>

        <div className="status-item">
          <span className="status-label">Frame Index</span>
          <span className="status-value accent-cyan">
            #{packet?.pkt !== undefined ? packet.pkt : '---'}
          </span>
        </div>

        <div className="status-item">
          <span className="status-label">Stream Rate</span>
          <span className="status-value accent-green">
            {pps} PPS
          </span>
        </div>
      </div>

      <div className="header-actions">
        <button
          className={`action-btn ${isPaused ? 'active' : ''}`}
          onClick={onTogglePause}
          title="Pause or resume live graphs"
        >
          {isPaused ? <Play size={13} /> : <Pause size={13} />}
          <span>{isPaused ? 'RESUME GRAPHS' : 'PAUSE GRAPHS'}</span>
        </button>

        <button
          className={`action-btn ${isRecording ? 'active' : ''}`}
          onClick={onToggleRecord}
          title="Toggle recording packet stream"
        >
          <Disc size={13} />
          <span>{isRecording ? `REC (${recordedCount})` : 'RECORD'}</span>
        </button>

        <button
          className="action-btn"
          onClick={onDownloadCsv}
          title="Download recorded session as CSV"
        >
          <Download size={13} />
          <span>DOWNLOAD CSV</span>
        </button>
      </div>
    </header>
  );
}

