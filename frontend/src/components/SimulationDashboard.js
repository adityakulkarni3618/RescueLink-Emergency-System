import React, { useState, useEffect } from 'react';

export default function SimulationDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [vitalsDeteriorating, setVitalsDeteriorating] = useState(false);
  const [gpsDrift, setGpsDrift] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [greenCorridor, setGreenCorridor] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerVitalsDeterioration = (activate) => {
    setVitalsDeteriorating(activate);
    window.dispatchEvent(new CustomEvent('demo:vitals-deteriorate', { detail: { active: activate } }));
  };

  const triggerGpsDrift = (activate) => {
    setGpsDrift(activate);
    window.dispatchEvent(new CustomEvent('demo:gps-drift', { detail: { active: activate } }));
  };

  const triggerOfflineMode = (activate) => {
    setOfflineMode(activate);
    window.dispatchEvent(new CustomEvent('demo:network-offline', { detail: { active: activate } }));
  };

  const triggerGreenCorridor = (activate) => {
    setGreenCorridor(activate);
    window.dispatchEvent(new CustomEvent('demo:green-corridor', { detail: { active: activate } }));
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 999999,
      fontFamily: "'Rajdhani', sans-serif",
    }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'linear-gradient(135deg, #ff0055 0%, #990033 100%)',
          color: '#fff',
          border: '2px solid #ff3385',
          borderRadius: '50%',
          width: 50,
          height: 50,
          fontSize: 24,
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(255,0,85,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse 2s infinite',
        }}
        title="RescueLink Demo Control Panel (Ctrl+Shift+D)"
      >
        ⚙️
      </button>

      {/* Control Panel Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: 60,
          right: 0,
          width: 320,
          background: 'rgba(10, 20, 40, 0.95)',
          border: '2px solid #ff0055',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.8), 0 0 30px rgba(255,0,85,0.2)',
          backdropFilter: 'blur(10px)',
          color: '#e0eaff',
        }}>
          <div style={{
            fontFamily: "'Orbitron'",
            fontSize: 14,
            fontWeight: 'bold',
            color: '#ff0055',
            borderBottom: '1px solid rgba(255,0,85,0.3)',
            paddingBottom: 8,
            marginBottom: 15,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>⚙️ DEMO CONTROLLER</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: "'Share Tech Mono'" }}>v2.0</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Vitals Deterioration */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>🔴 CRITICAL PATIENT VITALS DRIFT</div>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8 }}>Slowly deteriorates Heart Rate & SpO2 to trigger red triage warnings.</div>
              <button
                onClick={() => triggerVitalsDeterioration(!vitalsDeteriorating)}
                style={{
                  width: '100%',
                  padding: 8,
                  background: vitalsDeteriorating ? '#ff4444' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${vitalsDeteriorating ? '#ff4444' : 'rgba(255,255,255,0.2)'}`,
                  color: vitalsDeteriorating ? '#000' : '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: 10,
                }}
              >
                {vitalsDeteriorating ? '⏹️ STOP VITALS DETERIORATION' : '▶️ TRIGGER VITALS DETERIORATION'}
              </button>
            </div>

            {/* GPS Telemetry Drift */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>📍 GPS TELEMETRY DRIFT</div>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8 }}>Simulates ambulance moving transit on the Leaflet route map.</div>
              <button
                onClick={() => triggerGpsDrift(!gpsDrift)}
                style={{
                  width: '100%',
                  padding: 8,
                  background: gpsDrift ? '#ffb800' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${gpsDrift ? '#ffb800' : 'rgba(255,255,255,0.2)'}`,
                  color: gpsDrift ? '#000' : '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: 10,
                }}
              >
                {gpsDrift ? '⏹️ STOP GPS DRIFT' : '▶️ TRIGGER GPS DRIFT'}
              </button>
            </div>

            {/* Signal drop (Offline Mode) */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>📶 AMBULANCE OFFLINE MODE</div>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8 }}>Force ambulance offline to verify local/IndexedDB data queueing.</div>
              <button
                onClick={() => triggerOfflineMode(!offlineMode)}
                style={{
                  width: '100%',
                  padding: 8,
                  background: offlineMode ? '#ff3333' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${offlineMode ? '#ff3333' : 'rgba(255,255,255,0.2)'}`,
                  color: offlineMode ? '#fff' : '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: 10,
                }}
              >
                {offlineMode ? '⏹️ RESTORE SIGNAL' : '▶️ TRIGGER SIGNAL LOSS'}
              </button>
            </div>

            {/* Green Corridor Override */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>🚦 TRAFFIC GREEN CORRIDOR</div>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8 }}>Activate smart municipal traffic light preemption along the route.</div>
              <button
                onClick={() => triggerGreenCorridor(!greenCorridor)}
                style={{
                  width: '100%',
                  padding: 8,
                  background: greenCorridor ? '#00ff88' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${greenCorridor ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                  color: greenCorridor ? '#000' : '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: 10,
                }}
              >
                {greenCorridor ? '⏹️ DEACTIVATE GREEN CORRIDOR' : '▶️ ACTIVATE GREEN CORRIDOR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
