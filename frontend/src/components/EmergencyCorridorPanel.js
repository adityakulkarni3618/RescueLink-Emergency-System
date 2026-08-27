import React, { useState, useEffect } from 'react';

const getCityJunctions = (lat, lng) => {
  if (!lat || !lng) return {
    cityName: 'VIJAYAWADA',
    junctions: [
      { id: 'junc_pcr', name: 'PCR Junction' },
      { id: 'junc_labbipet', name: 'Labbipet Junction' },
      { id: 'junc_benz_circle', name: 'Benz Circle' },
      { id: 'junc_rameswaram', name: 'Aster Ramesh Cross' }
    ]
  };

  const lats = parseFloat(lat);
  const lngs = parseFloat(lng);

  // Vijayawada: approx 16.5
  if (Math.abs(lats - 16.5) < 0.7 && Math.abs(lngs - 80.6) < 0.7) {
    return {
      cityName: 'VIJAYAWADA',
      junctions: [
        { id: 'junc_pcr', name: 'PCR Junction' },
        { id: 'junc_labbipet', name: 'Labbipet Junction' },
        { id: 'junc_benz_circle', name: 'Benz Circle' },
        { id: 'junc_rameswaram', name: 'Aster Ramesh Cross' }
      ]
    };
  }
  // Bangalore: approx 12.97
  if (Math.abs(lats - 12.97) < 0.7 && Math.abs(lngs - 77.59) < 0.7) {
    return {
      cityName: 'BENGALURU',
      junctions: [
        { id: 'junc_silkboard', name: 'Silk Board Crossing' },
        { id: 'junc_koramangala', name: 'Koramangala 80ft Crossing' },
        { id: 'junc_indiranagar', name: 'Indiranagar 100ft Junction' },
        { id: 'junc_mgroad', name: 'MG Road Preemption Gate' }
      ]
    };
  }
  // Hyderabad: approx 17.38
  if (Math.abs(lats - 17.38) < 0.7 && Math.abs(lngs - 78.48) < 0.7) {
    return {
      cityName: 'HYDERABAD',
      junctions: [
        { id: 'junc_gachibowli', name: 'Gachibowli X Roads' },
        { id: 'junc_jubilee', name: 'Jubilee Hills Checkpost' },
        { id: 'junc_begumpet', name: 'Begumpet Command Link' },
        { id: 'junc_secunderabad', name: 'Secunderabad Station Gate' }
      ]
    };
  }
  // Mumbai: approx 19.07
  if (Math.abs(lats - 19.07) < 0.7 && Math.abs(lngs - 72.87) < 0.7) {
    return {
      cityName: 'MUMBAI',
      junctions: [
        { id: 'junc_dadar', name: 'Dadar TT Circle' },
        { id: 'junc_bandra', name: 'Bandra Toll Preemption' },
        { id: 'junc_andheri', name: 'Andheri Kurla Intersection' },
        { id: 'junc_gateway', name: 'Gateway Command Crossing' }
      ]
    };
  }
  // Delhi: approx 28.61
  if (Math.abs(lats - 28.61) < 0.7 && Math.abs(lngs - 77.20) < 0.7) {
    return {
      cityName: 'NEW DELHI',
      junctions: [
        { id: 'junc_cp', name: 'Connaught Place Outer Ring' },
        { id: 'junc_aiims', name: 'AIIMS Circle Crossing' },
        { id: 'junc_dhaulakuan', name: 'Dhaula Kuan Preemption' },
        { id: 'junc_noida', name: 'Noida Expressway Gate' }
      ]
    };
  }

  // Fallback
  return {
    cityName: 'METRO COMMUTE',
    junctions: [
      { id: 'junc_alpha', name: 'Intersection Alpha' },
      { id: 'junc_beta', name: 'Metro Center Crossing' },
      { id: 'junc_gamma', name: 'Highway Toll Link' },
      { id: 'junc_delta', name: 'Hospital Entrance Gate' }
    ]
  };
};

const PREDEFINED_JUNCTIONS = [
  { id: 'junc_pcr', name: 'PCR Junction' },
  { id: 'junc_labbipet', name: 'Labbipet Junction' },
  { id: 'junc_benz_circle', name: 'Benz Circle' },
  { id: 'junc_rameswaram', name: 'Aster Ramesh Cross' }
];

export default function EmergencyCorridorPanel({ socket, incidentId, isControlPanel = false }) {
  const [cityName, setCityName] = useState('VIJAYAWADA');
  const [junctions, setJunctions] = useState(
    PREDEFINED_JUNCTIONS.map(j => ({ ...j, status: 'SCHEDULED', eta: 0 }))
  );
  const [logs, setLogs] = useState([]);
  const [speed, setSpeed] = useState(65);
  const [eta, setEta] = useState(380); // seconds
  const [overrideConfirm, setOverrideConfirm] = useState(null);

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
      if (data.lat && data.lng) {
        const cityData = getCityJunctions(data.lat, data.lng);
        setCityName(cityData.cityName);
        setJunctions(prev => cityData.junctions.map((j, idx) => {
          const old = prev[idx] || {};
          return { ...j, status: old.status || 'SCHEDULED', eta: old.eta || 0 };
        }));
      }
    };

    const onCorridorActivated = (data) => {
      addLog(`🟢 AI Green wave corridor activated towards destination: ${data.hospital?.name || 'Hospital'}`);
      if (data.route && data.route.steps) {
        const routeJunctions = data.route.steps.map((step, idx) => ({
          id: `junc_${idx}`,
          name: step.name || `Intersection #${idx + 1}`,
          status: 'SCHEDULED',
          eta: step.duration || 0
        }));
        setJunctions(routeJunctions);
      }
    };

    socket.on('corridor:status_update', onStatusUpdate);
    socket.on('corridor:preempt_junction', onPreemptJunction);
    socket.on('corridor:route_cleared', onRouteCleared);
    socket.on('location-update', onLocationUpdate);
    socket.on('corridor:activated', onCorridorActivated);

    return () => {
      socket.off('corridor:status_update', onStatusUpdate);
      socket.off('corridor:preempt_junction', onPreemptJunction);
      socket.off('corridor:route_cleared', onRouteCleared);
      socket.off('location-update', onLocationUpdate);
      socket.off('corridor:activated', onCorridorActivated);
    };
  }, [socket, incidentId]);

  const handleManualOverride = (junctionId, name) => {
    if (!socket || !incidentId) return;
    setOverrideConfirm({ junctionId, name });
  };

  const doManualOverride = () => {
    if (!overrideConfirm || !socket || !incidentId) return;
    socket.emit('corridor:manual-override', {
      incidentId,
      junctionId: overrideConfirm.junctionId,
      forceStatus: 'CORRIDOR_ACTIVE'
    });
    addLog(`[MANUAL COMMAND] Triggered emergency preemption override for ${overrideConfirm.name}`);
    setOverrideConfirm(null);
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
    }}>
      
      {/* ── OVERRIDE CONFIRM MODAL ── */}
      {overrideConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOverrideConfirm(null)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%', boxShadow: '0 0 40px rgba(255,184,0,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 15, color: '#ffb800', fontWeight: 900, marginBottom: 10 }}>🚦 MANUAL PREEMPTION OVERRIDE</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 22, lineHeight: 1.7 }}>
              Force green signal preemption lock for <strong style={{ color: '#ffb800' }}>{overrideConfirm.name}</strong>?<br /><br />
              This will manually activate the AI emergency corridor for this junction.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={doManualOverride}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.5)', borderRadius: 8, color: '#ffb800', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                🚦 FORCE OVERRIDE
              </button>
              <button onClick={() => setOverrideConfirm(null)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Status Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 200, 255, 0.15)', paddingBottom: 12, marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 10, fontFamily: "'Orbitron'", color: '#00ff88', letterSpacing: '0.1em' }}>🚨 AI EMERGENCY CORRIDOR ACTIVE</span>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron'" }}>{cityName} CORRIDOR #108</div>
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
