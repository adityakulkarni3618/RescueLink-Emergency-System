import React, { useState, useEffect, useRef } from 'react';
import LiveRouteMap from './LiveRouteMap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Custom glowing HTML markers for Leaflet map
const createAmbulanceIcon = () => L.divIcon({
  className: 'glowing-ambulance-marker',
  html: `<div style="
    width: 20px;
    height: 20px;
    background: #ff3333;
    border: 3px style solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 15px #ff3333, 0 0 25px #ff3333;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 10px;
    font-weight: bold;
    animation: pulse 1.2s infinite;
  ">🚑</div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const createPatientIcon = () => L.divIcon({
  className: 'glowing-patient-marker',
  html: `<div style="
    width: 16px;
    height: 16px;
    background: #ffe600;
    border: 2px solid #000;
    border-radius: 50%;
    box-shadow: 0 0 10px #ffe600, 0 0 20px #ffe600;
    animation: pulse 1.5s infinite;
  ">👤</div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const createHospitalIcon = () => L.divIcon({
  className: 'glowing-hospital-marker',
  html: `<div style="
    width: 22px;
    height: 22px;
    background: #00ff88;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 15px #00ff88, 0 0 25px #00ff88;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
  ">🏥</div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

// Dynamic junction solver based on coordinates
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

export default function AIEmergencyCorridorDashboard({ socket, connected, onLogout }) {
  const [activeMissions, setActiveMissions] = useState({});
  const [selectedMissionId, setSelectedMissionId] = useState(null);
  
  // Real-time states
  const [cityName, setCityName] = useState('VIJAYAWADA');
  const [junctions, setJunctions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [speed, setSpeed] = useState(62);
  const [eta, setEta] = useState(250); // seconds
  const [distance, setDistance] = useState(1.8); // km
  const [ambulancePos, setAmbulancePos] = useState(null);
  const [patientPos, setPatientPos] = useState(null);
  const [hospitalPos, setHospitalPos] = useState(null);
  const [routePath, setRoutePath] = useState(null);
  const [assignedHospitalName, setAssignedHospitalName] = useState('Hospital General');
  
  const selectedMissionIdRef = useRef(selectedMissionId);
  useEffect(() => {
    selectedMissionIdRef.current = selectedMissionId;
  }, [selectedMissionId]);

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${text}`, ...prev.slice(0, 24)]);
  };

  // Fetch active dispatches on load
  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const token = sessionStorage.getItem('rescuelink_token');
        const res = await fetch('/api/analytics/live-telemetry', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data && data.activeRequests) {
          setActiveMissions(data.activeRequests);
          const keys = Object.keys(data.activeRequests);
          if (keys.length > 0 && !selectedMissionIdRef.current) {
            setSelectedMissionId(keys[0]);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch active incidents:', err.message);
      }
    };
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update corridor metrics when selected mission changes
  useEffect(() => {
    if (!selectedMissionId) {
      setCityName('STANDBY');
      setJunctions([]);
      setAmbulancePos(null);
      setPatientPos(null);
      setHospitalPos(null);
      setRoutePath(null);
      setAssignedHospitalName('N/A');
      setLogs(['[System Boot] Standing by... Waiting for incoming live emergency SOS dispatch...']);
      return;
    }

    const m = activeMissions[selectedMissionId];
    if (m) {
      if (m.userLocation) setPatientPos([m.userLocation.lat, m.userLocation.lng]);
      if (m.assignedHospital) {
        setHospitalPos([m.assignedHospital.lat, m.assignedHospital.lng]);
        setAssignedHospitalName(m.assignedHospital.name);
      }
      if (m.routePath) {
        setRoutePath(m.routePath.map(p => [p.lat, p.lng]));
      }
      addLog(`Corridor Tracking started for Incident ID: ${selectedMissionId}`);
    }
  }, [selectedMissionId, activeMissions]);

  // Socket listener for real-time telemetry updates
  useEffect(() => {
    if (!socket) return;

    const onLocationUpdate = (data) => {
      if (data.reqId !== selectedMissionIdRef.current) return;
      if (data.lat && data.lng) {
        setAmbulancePos([data.lat, data.lng]);
        
        // Resolve dynamic city junctions
        const cityData = getCityJunctions(data.lat, data.lng);
        setCityName(cityData.cityName);
        setJunctions(prev => cityData.junctions.map((j, idx) => {
          const old = prev[idx] || {};
          return { ...j, status: old.status || 'SCHEDULED', eta: old.eta || 0 };
        }));
      }
      if (data.speed) setSpeed(Math.round(data.speed));
      if (data.etaMinutes) setEta(Math.round(data.etaMinutes * 60));
      if (data.distanceRemaining) setDistance(parseFloat(data.distanceRemaining.toFixed(2)));
    };

    const onCorridorUpdate = (data) => {
      if (data.incidentId !== selectedMissionIdRef.current) return;
      setJunctions(prev => prev.map(j => {
        if (j.id === data.junctionId) {
          addLog(`Junction ${data.name} Preemption Lock: ${data.status.replace('_', ' ')}`);
          return { ...j, status: data.status };
        }
        return j;
      }));
    };

    const onPreemptAlert = (data) => {
      if (data.incidentId !== selectedMissionIdRef.current) return;
      addLog(`🚨 Preemption lock established for ${data.name}. Distance: ${data.distance}m.`);
    };

    const onRouteUpdate = (data) => {
      if (data.reqId !== selectedMissionIdRef.current) return;
      if (data.routePath) {
        setRoutePath(data.routePath.map(p => [p.lat, p.lng]));
      }
    };

    socket.on('location-update', onLocationUpdate);
    socket.on('corridor:status_update', onCorridorUpdate);
    socket.on('corridor:preempt_junction', onPreemptAlert);
    socket.on('route-update', onRouteUpdate);

    return () => {
      socket.off('location-update', onLocationUpdate);
      socket.off('corridor:status_update', onCorridorUpdate);
      socket.off('corridor:preempt_junction', onPreemptAlert);
      socket.off('route-update', onRouteUpdate);
    };
  }, [socket, selectedMissionId]);

  const progressPercentage = Math.min(100, Math.round(((eta > 0 ? (300 - eta) : 0) / 300) * 100));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw',
      background: '#040814', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif",
      overflow: 'hidden', boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 5px rgba(255, 51, 51, 0.4); }
          50% { box-shadow: 0 0 20px rgba(255, 51, 51, 0.9); }
          100% { box-shadow: 0 0 5px rgba(255, 51, 51, 0.4); }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.01); }
        ::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.2); border-radius: 3px; }
      `}</style>

      {/* HEADER SECTION */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 24px', background: 'rgba(5, 12, 30, 0.9)',
        borderBottom: '1px solid rgba(0, 200, 255, 0.25)', backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            onClick={() => { window.location.hash = ''; }}
            style={{
              background: 'transparent', border: '1px solid rgba(0,200,255,0.4)', color: '#00c8ff',
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
            }}
          >
            ◀ BACK
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "'Orbitron'", color: '#fff', letterSpacing: '0.1em' }}>
              AI EMERGENCY CORRIDOR COMMAND
            </h1>
            <span style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
              DYNAMIC PREEMPTION ENGINE ONLINE (REGION: {cityName})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {Object.keys(activeMissions).length > 0 ? (
            <select
              value={selectedMissionId || ''}
              onChange={e => setSelectedMissionId(e.target.value)}
              style={{
                background: 'rgba(8,20,45,0.9)', border: '1px solid rgba(0,200,255,0.4)', color: '#00c8ff',
                fontFamily: "'Share Tech Mono'", padding: '6px 12px', borderRadius: 4, outline: 'none'
              }}
            >
              {Object.keys(activeMissions).map(id => (
                <option key={id} value={id}>MISSION: {id.slice(0, 8)}...</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, color: '#ff3333', fontFamily: "'Share Tech Mono'", background: 'rgba(255,51,51,0.1)', border: '1px solid rgba(255,51,51,0.2)', padding: '4px 10px', borderRadius: 4 }}>
              ⚠️ NO LIVE TELEMETRY
            </span>
          )}

          <div style={{
            background: 'rgba(255,51,51,0.15)', border: '1px solid #ff3333', color: '#ff3333',
            fontSize: 10, fontWeight: 700, padding: '6px 14px', borderRadius: 4, fontFamily: "'Orbitron'"
          }}>
            MISSION STATUS: ACTIVE - CRITICAL
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* LEFT SIDEBAR: UPCOMING NODES */}
        <aside style={{
          width: 320, background: 'rgba(6,12,28,0.95)', borderRight: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto'
        }}>
          <h2 style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.05em', marginBottom: 16 }}>
            🚥 UPCOMING PREEMPTION NODES
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {junctions.map((j, idx) => {
              let statusBg = 'rgba(255,255,255,0.02)';
              let statusBorder = 'rgba(255,255,255,0.06)';
              let statusText = '#888';
              let lightColor = '#555';

              if (j.status === 'PASSED') {
                statusBg = 'rgba(160,200,255,0.03)';
                statusBorder = 'rgba(160,200,255,0.15)';
                statusText = 'rgba(160,200,255,0.5)';
                lightColor = '#00c8ff';
              } else if (j.status === 'PREEMPTING') {
                statusBg = 'rgba(255,184,0,0.08)';
                statusBorder = 'rgba(255,184,0,0.3)';
                statusText = '#ffb800';
                lightColor = '#ffb800';
              } else if (j.status === 'CORRIDOR_ACTIVE') {
                statusBg = 'rgba(0,255,136,0.08)';
                statusBorder = 'rgba(0,255,136,0.35)';
                statusText = '#00ff88';
                lightColor = '#00ff88';
              }

              return (
                <div key={j.id} style={{
                  padding: 14, background: statusBg, border: `1px solid ${statusBorder}`,
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', background: lightColor,
                    boxShadow: j.status === 'CORRIDOR_ACTIVE' ? '0 0 10px #00ff88' : 'none'
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{j.name}</div>
                    <div style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: statusText, marginTop: 3 }}>
                      {j.status || 'SCHEDULED'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* MIDDLE VIEW: MAP */}
        <main style={{ flex: 1, position: 'relative', background: '#0a0d1a' }}>
          {!selectedMissionId ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', padding: 40, textAlign: 'center', background: 'radial-gradient(circle at center, #0c122b 0%, #030612 100%)'
            }}>
              <div style={{ fontSize: 50, animation: 'pulse-opacity 1s infinite', marginBottom: 20 }}>📡</div>
              <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
                STANDING BY FOR LIVE PREEMPTION TELEMETRY
              </h2>
              <p style={{ fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.6)', maxWidth: 450, fontSize: 13, lineHeight: 1.6 }}>
                No active emergency dispatch missions found on the national registry.
                Trigger an Emergency SOS from the patient portal or dispatch a unit to activate live preemption route tracking.
              </p>
            </div>
          ) : (
            <LiveRouteMap
              routeGeometry={routePath ? { type: 'LineString', coordinates: routePath.map(p => [p.lng || p.x || p[1], p.lat || p.y || p[0]]) } : null}
              ambulancePosition={ambulancePos ? { lat: ambulancePos[0], lng: ambulancePos[1] } : null}
              originMarker={patientPos ? { lat: patientPos[0], lng: patientPos[1] } : null}
              destinationMarker={hospitalPos ? { lat: hospitalPos[0], lng: hospitalPos[1] } : null}
              junctions={junctions.map((j, idx) => {
                if (routePath && routePath.length > 0) {
                  const fraction = (idx + 1) / (junctions.length + 1);
                  const ptIdx = Math.floor(routePath.length * fraction);
                  const coord = routePath[ptIdx] || routePath[routePath.length - 1];
                  return { ...j, lat: coord.lat || coord[0], lng: coord.lng || coord[1] };
                }
                return j;
              })}
              mode="hospital"
            />
          )}
        </main>

        {/* RIGHT SIDEBAR: METRICS */}
        <aside style={{
          width: 320, background: 'rgba(6,12,28,0.95)', borderLeft: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto'
        }}>
          <h2 style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.05em', marginBottom: 16 }}>
            📊 LIVE PREEMPTION METRICS
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ESTIMATED ARRIVAL (ETA)</div>
              <div style={{ fontSize: 24, fontWeight: 'bold', fontFamily: "'Orbitron'", color: '#fff' }}>
                {Math.floor(eta / 60)} MIN {eta % 60} SEC
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>REMAINING DISTANCE</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', fontFamily: "'Orbitron'", color: '#fff' }}>
                {distance} KM
              </div>
            </div>

            <div style={{ borderBottom: '1px solid rgba(0,200,255,0.15)', paddingBottom: 16 }}>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL DESTINATION</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#00ff88', marginTop: 3 }}>
                {assignedHospitalName}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>
                <span>EMERGENCY CORRIDOR PROGRESS</span>
                <span>{progressPercentage}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #ff3333, #00ff88)', borderRadius: 3 }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>CURRENT TRAFFIC STATUS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffb800', marginTop: 3 }}>
                HEAVY (ROUTE CLEARED)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>EMERGENCY VEHICLE STATUS</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#00ff88', marginTop: 3 }}>
                EN ROUTE - SPEED {speed} KM/H
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* BOTTOM CONSOLE LOGS */}
      <footer style={{
        height: 180, background: '#03060f', borderTop: '1px solid rgba(0,200,255,0.25)',
        display: 'flex', flexDirection: 'column', padding: 16, boxSizing: 'border-box'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: 10, fontFamily: "'Orbitron'", color: '#00c8ff', letterSpacing: '0.1em' }}>
          ⌨ SYSTEM LOGS & TELEMETRY ALERTS
        </h3>
        <div style={{
          flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.1)',
          borderRadius: 4, padding: 10, fontFamily: "'Share Tech Mono'", fontSize: 11, color: 'rgba(0,255,136,0.85)',
          display: 'flex', flexDirection: 'column', gap: 4
        }}>
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </footer>
    </div>
  );
}
