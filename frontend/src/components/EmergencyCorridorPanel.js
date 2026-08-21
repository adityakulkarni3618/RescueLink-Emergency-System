import React, { useState, useEffect } from 'react';

const PREDEFINED_JUNCTIONS = [
  { id: 'junc_pcr', name: 'PCR Junction' },
  { id: 'junc_labbipet', name: 'Labbipet Junction' },
  { id: 'junc_benz_circle', name: 'Benz Circle' },
  { id: 'junc_rameswaram', name: 'Aster Ramesh Cross' }
];

export default function EmergencyCorridorPanel({ socket, incidentId, isControlPanel = false }) {
  const [junctions, setJunctions] = useState(
    PREDEFINED_JUNCTIONS.map(j => ({ ...j, status: 'SCHEDULED', eta: 0 }))
  );
  const [logs, setLogs] = useState([]);
  const [speed, setSpeed] = useState(65);
  const [eta, setEta] = useState(380); // seconds

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${text}`, ...prev.slice(0, 19)]);
  };

  useEffect(() => {
    addLog('AI Emergency Corridor System Initialized in Vijayawada.');

    if (!socket || !incidentId) return;

    const onStatusUpdate = (data) => {
      if (data.incidentId !== incidentId) return;

      setJunctions(prev => prev.map(j => {
        if (j.id === data.junctionId) {
          addLog(`Junction ${data.name} status updated to: ${data.status.replace('_', ' ')}`);
          return { ...j, status: data.status, eta: data.eta_seconds || j.eta };
        }
        return j;
      }));
    };

    const onPreemptJunction = (data) => {
      if (data.incidentId !== incidentId) return;
      addLog(`🚨 AI preemption active for ${data.name}. Distance: ${data.distance}m. Establishing green wave.`);
    };

    const onRouteCleared = (data) => {
      if (data.incidentId !== incidentId) return;
      addLog(`✓ Ambulance cleared ${data.name}. Releasing green wave lock.`);
    };

    const onLocationUpdate = (data) => {
      if (data.reqId !== incidentId) return;
      if (data.speed) setSpeed(Math.round(data.speed));
      if (data.etaMinutes) setEta(Math.round(data.etaMinutes * 60));
    };

    socket.on('corridor:status_update', onStatusUpdate);
    socket.on('corridor:preempt_junction', onPreemptJunction);
    socket.on('corridor:route_cleared', onRouteCleared);
    socket.on('location-update', onLocationUpdate);

    return () => {
      socket.off('corridor:status_update', onStatusUpdate);
      socket.off('corridor:preempt_junction', onPreemptJunction);
      socket.off('corridor:route_cleared', onRouteCleared);
      socket.off('location-update', onLocationUpdate);
    };
  }, [socket, incidentId]);

  const handleManualOverride = (junctionId, name) => {
    if (!socket || !incidentId) return;
    if (window.confirm(`Force manual override green signal preemption lock for ${name}?`)) {
      socket.emit('corridor:manual-override', {
        incidentId,
        junctionId,
        forceStatus: 'CORRIDOR_ACTIVE'
      });
      addLog(`[MANUAL COMMAND] Triggered emergency preemption override for ${name}`);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  return (
    <div style={{
      background: 'rgba(10, 16, 32, 0.75)',
      border: '1px solid rgba(0, 200, 255, 0.2)',
      borderRadius: 12,
      padding: 20,
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
    }}>
      {/* Real-time Status Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 200, 255, 0.15)', paddingBottom: 12, marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 10, fontFamily: "'Orbitron'", color: '#00ff88', letterSpacing: '0.1em' }}>🚨 AI EMERGENCY CORRIDOR ACTIVE</span>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron'" }}>VIJAYAWADA CORRIDOR #108</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>SPEED / ETA</span>
          <div style={{ fontSize: 15, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>{speed} km/h | {formatTime(eta)}</div>
        </div>
      </div>

      {/* Junction Corridor Stepper */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {junctions.map((j, i) => {
          let badgeColor = 'rgba(255,255,255,0.05)';
          let textColor = '#aaa';
          let borderStyle = '1px solid rgba(255,255,255,0.1)';
          let glow = 'none';

          if (j.status === 'PREEMPTING') {
            badgeColor = 'rgba(255, 230, 0, 0.15)';
            textColor = '#ffe600';
            borderStyle = '1px solid #ffe600';
            glow = '0 0 10px rgba(255, 230, 0, 0.2)';
          } else if (j.status === 'CORRIDOR_ACTIVE') {
            badgeColor = 'rgba(0, 255, 136, 0.15)';
            textColor = '#00ff88';
            borderStyle = '1px solid #00ff88';
            glow = '0 0 12px rgba(0, 255, 136, 0.3)';
          } else if (j.status === 'PASSED') {
            badgeColor = 'rgba(160, 200, 255, 0.05)';
            textColor = 'rgba(160, 200, 255, 0.4)';
          }

          return (
            <div key={j.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 8,
              border: '1px solid rgba(160,200,255,0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.4)' }}>[J{i+1}]</span>
                <span style={{ fontSize: 14, fontWeight: 'bold' }}>{j.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold',
                  padding: '3px 8px', borderRadius: 4, background: badgeColor,
                  color: textColor, border: borderStyle, boxShadow: glow
                }}>
                  {j.status}
                </span>
                {isControlPanel && j.status !== 'PASSED' && (
                  <button
                    onClick={() => handleManualOverride(j.id, j.name)}
                    style={{
                      background: 'rgba(0, 200, 255, 0.1)', border: '1px solid rgba(0, 200, 255, 0.3)',
                      borderRadius: 4, color: '#00c8ff', padding: '3px 8px', fontSize: 10,
                      fontFamily: "'Orbitron'", cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    OVERRIDE
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Operational Monospace Terminal Log */}
      <div>
        <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 6, fontFamily: "'Share Tech Mono'" }}>OPERATIONAL REAL-TIME SYSTEM LOG</span>
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(160,200,255,0.1)',
          borderRadius: 6, padding: 12, height: 110, overflowY: 'auto',
          fontFamily: "'Share Tech Mono'", fontSize: 11, color: '#7cfc00',
          lineHeight: '1.5em', display: 'flex', flexDirection: 'column'
        }}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
