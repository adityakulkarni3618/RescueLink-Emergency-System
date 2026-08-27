import React, { useState, useEffect, useRef } from 'react';
import LiveRouteMap from './LiveRouteMap';

const isValidLatLng = (loc) => {
  if (!loc) return false;
  const lat = loc.lat !== undefined ? loc.lat : (Array.isArray(loc) ? loc[0] : undefined);
  const lng = loc.lng !== undefined ? loc.lng : (Array.isArray(loc) ? loc[1] : undefined);
  return lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng);
};

// Fetch real-world route from OSRM public API (uses actual OSM road data)
const fetchRealRoute = async (origin, dest) => {
  if (!isValidLatLng(origin) || !isValidLatLng(dest)) return null;
  const oLat = origin.lat || origin[0];
  const oLng = origin.lng || origin[1];
  const dLat = dest.lat || dest[0];
  const dLng = dest.lng || dest[1];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    }
  } catch (err) {
    console.warn('[AI CORRIDOR] OSRM route fetch failed:', err.message);
  }
  return null;
};

// Custom glowing HTML markers for Leaflet map
const createAmbulanceIcon = () => L.divIcon({
  className: 'glowing-ambulance-marker',
  html: `<div style="
    width: 20px;
    height: 20px;
    background: #ff3333;
    border: 3px solid #fff;
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

// Map controller to adjust bounds dynamically
function SmartMapController({ userLoc, ambulanceLoc, hospitalLoc }) {
  const map = useMap();
  useEffect(() => {
    const coords = [];
    if (isValidLatLng(userLoc)) coords.push([userLoc.lat || userLoc[0], userLoc.lng || userLoc[1]]);
    if (isValidLatLng(ambulanceLoc)) coords.push([ambulanceLoc.lat || ambulanceLoc[0], ambulanceLoc.lng || ambulanceLoc[1]]);
    if (isValidLatLng(hospitalLoc)) coords.push([hospitalLoc.lat || hospitalLoc[0], hospitalLoc.lng || hospitalLoc[1]]);

    if (coords.length > 1) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    } else if (coords.length === 1) {
      map.setView(coords[0], 15, { animate: true });
    }
  }, [userLoc, ambulanceLoc, hospitalLoc, map]);
  return null;
}

export default function AIEmergencyCorridorView({
  socket,
  connected,
  activeMissionId,
  patientLoc,
  ambulanceLoc,
  hospitalLoc,
  hospitalName = 'Aster Ramesh Hospital',
  routePath = null,
  etaSeconds = 210,
  distanceKm = 1.8,
  speedKmh = 62,
  onBack = null
}) {
  const [cityName, setCityName] = useState('VIJAYAWADA');
  const [junctions, setJunctions] = useState([]);
  const [logs, setLogs] = useState(['[System Boot] Standing by... Preemption link established.']);
  const [realRoutePath, setRealRoutePath] = useState(null); // fetched from OSRM

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${text}`, ...prev.slice(0, 24)]);
  };

  // Auto-fetch real-world route from OSRM if no routePath provided
  useEffect(() => {
    // Use provided routePath if available
    if (routePath && routePath.length > 1) {
      setRealRoutePath(null); // use prop directly
      return;
    }
    if (!isValidLatLng(ambulanceLoc)) return;

    const fetchRoute = async () => {
      addLog('🗺️ Fetching real-world road route from OSRM...');
      const segments = [];

      // Segment 1: Ambulance → Patient
      if (isValidLatLng(patientLoc)) {
        const seg1 = await fetchRealRoute(ambulanceLoc, patientLoc);
        if (seg1) segments.push(...seg1);
      }

      // Segment 2: Patient → Hospital
      if (isValidLatLng(hospitalLoc)) {
        const fromPoint = isValidLatLng(patientLoc) ? patientLoc : ambulanceLoc;
        const seg2 = await fetchRealRoute(fromPoint, hospitalLoc);
        if (seg2) segments.push(...seg2);
      }

      if (segments.length > 0) {
        setRealRoutePath(segments);
        addLog(`✅ Real-world route loaded: ${segments.length} road waypoints`);
      } else {
        addLog('⚠️ OSRM routing unavailable. Using straight-line fallback.');
      }
    };

    fetchRoute();
  }, [ambulanceLoc, patientLoc, hospitalLoc, routePath]);

  // Sync junctions and coordinates
  useEffect(() => {
    const refLat = ambulanceLoc?.lat || patientLoc?.lat || 16.5062;
    const refLng = ambulanceLoc?.lng || patientLoc?.lng || 80.6480;
    const cityData = getCityJunctions(refLat, refLng);
    setCityName(cityData.cityName);
    setJunctions(cityData.junctions.map((j, idx) => ({
      ...j,
      status: idx === 0 ? 'CORRIDOR_ACTIVE' : (idx === 1 ? 'PREEMPTING' : 'SCHEDULED')
    })));

    addLog(`Initiated AI preemption path mapping for Region: ${cityData.cityName}`);
  }, [ambulanceLoc, patientLoc]);

  // Socket listener for live preemption state changes
  useEffect(() => {
    if (!socket || !activeMissionId) return;

    const onCorridorUpdate = (data) => {
      if (data.incidentId !== activeMissionId) return;
      setJunctions(prev => prev.map(j => {
        if (j.id === data.junctionId) {
          addLog(`Junction ${data.name} Preemption Lock: ${data.status.replace('_', ' ')}`);
          return { ...j, status: data.status };
        }
        return j;
      }));
    };

    const onPreemptAlert = (data) => {
      if (data.incidentId !== activeMissionId) return;
      addLog(`🚨 Preemption lock established for ${data.name}. Distance: ${data.distance}m.`);
    };

    socket.on('corridor:status_update', onCorridorUpdate);
    socket.on('corridor:preempt_junction', onPreemptAlert);

    return () => {
      socket.off('corridor:status_update', onCorridorUpdate);
      socket.off('corridor:preempt_junction', onPreemptAlert);
    };
  }, [socket, activeMissionId]);

  const progressPercentage = Math.min(100, Math.round(((etaSeconds > 0 ? (300 - etaSeconds) : 0) / 300) * 100));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      background: '#040814', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif",
      overflow: 'hidden', boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 5px rgba(255, 51, 51, 0.4); }
          50% { box-shadow: 0 0 20px rgba(255, 51, 51, 0.9); }
          100% { box-shadow: 0 0 5px rgba(255, 51, 51, 0.4); }
        }
        .rl-metric-val { font-size: 22px; font-weight: bold; fontFamily: "'Orbitron'"; color: #fff; margin-top: 4px; }
      `}</style>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: 'rgba(5, 12, 30, 0.9)',
        borderBottom: '1px solid rgba(0, 200, 255, 0.25)'
      }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: "'Orbitron'", color: '#00c8ff', letterSpacing: '0.12em', fontWeight: 900 }}>
            🛰️ AI EMERGENCY CORRIDOR ACTIVE
          </div>
          <span style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
            DYNAMIC PREEMPTION ENGINE ON (REGION: {cityName})
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            background: 'rgba(255,51,51,0.15)', border: '1px solid #ff3333', color: '#ff3333',
            fontSize: 9, fontWeight: 700, padding: '4px 10px', borderRadius: 4, fontFamily: "'Orbitron'"
          }}>
            MISSION: ACTIVE
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* LEFT UPCOMING JUNCTIONS */}
        <div style={{
          width: 250, background: 'rgba(6,12,28,0.95)', borderRight: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', flexDirection: 'column', padding: 12, overflowY: 'auto'
        }}>
          <h4 style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#00c8ff', letterSpacing: '0.05em', marginBottom: 12, marginTop: 0 }}>
            🚥 JUNCTION PREEMPTION STATUS
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  padding: 8, background: statusBg, border: `1px solid ${statusBorder}`,
                  borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: lightColor,
                    boxShadow: j.status === 'CORRIDOR_ACTIVE' ? '0 0 8px #00ff88' : 'none'
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{j.name}</div>
                    <div style={{ fontSize: 8, fontFamily: "'Share Tech Mono'", color: statusText }}>
                      {j.status || 'SCHEDULED'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* TRAFFIC TREND CHART */}
          <div style={{ marginTop: 'auto', paddingTop: 15, borderTop: '1px solid rgba(0,200,255,0.1)' }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>TRAFFIC DENSITY TREND</div>
            <svg viewBox="0 0 100 35" style={{ width: '100%', overflow: 'visible' }}>
              <path d="M 0 30 Q 25 10, 50 25 T 100 12 L 100 35 L 0 35 Z" fill="rgba(0,200,255,0.12)" stroke="#00c8ff" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* MIDDLE MAP */}
        <div style={{ flex: 1, position: 'relative', background: '#0a0d1a' }}>
          <LiveRouteMap
            routeGeometry={(() => {
              const activePath = (routePath && routePath.length > 0) ? routePath : realRoutePath;
              return activePath ? { type: 'LineString', coordinates: activePath.map(p => [p.lng || p[1], p.lat || p[0]]) } : null;
            })()}
            ambulancePosition={ambulanceLoc}
            originMarker={patientLoc}
            destinationMarker={hospitalLoc}
            junctions={[]}
            mode="hospital"
            theme="dark"
          />

          {/* Route loading overlay */}
          {!routePath && !realRoutePath && isValidLatLng(ambulanceLoc) && (
            <div style={{
              position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(4,8,20,0.9)', border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: 6, padding: '6px 14px', fontSize: 10,
              color: '#00c8ff', fontFamily: "'Share Tech Mono'", zIndex: 1000
            }}>
              🗺️ Fetching real road route...
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{
          width: 250, background: 'rgba(6,12,28,0.95)', borderLeft: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', flexDirection: 'column', padding: 12, overflowY: 'auto'
        }}>
          <h4 style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#00c8ff', letterSpacing: '0.05em', marginBottom: 12, marginTop: 0 }}>
            📊 DYNAMIC TELEMETRY
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ESTIMATED ARRIVAL (ETA)</div>
              <div className="rl-metric-val">
                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>DISTANCE REMAINING</div>
              <div className="rl-metric-val">{distanceKm} KM</div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL DESTINATION</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00ff88', marginTop: 3 }}>
                {hospitalName}
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(0,200,255,0.1)', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 4 }}>
                <span>CORRIDOR PROGRESS</span>
                <span>{progressPercentage}%</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'linear-gradient(90deg, #ff3333, #00ff88)', borderRadius: 3 }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>TRAFFIC DENSITY ENGINE</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ffb800', marginTop: 3 }}>
                HEAVY (ROUTE CLEARED)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>VEHICLE SPEED</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#00ff88', marginTop: 3 }}>
                {speedKmh} KM/H
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER LOGS */}
      <div style={{
        height: 110, background: '#03060f', borderTop: '1px solid rgba(0,200,255,0.25)',
        display: 'flex', flexDirection: 'column', padding: 8, boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: 9, fontFamily: "'Orbitron'", color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 4 }}>
          ⌨ PREEMPTION SYSTEM LOGS & TELEMETRY
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.1)',
          borderRadius: 4, padding: 6, fontFamily: "'Share Tech Mono'", fontSize: 10, color: 'rgba(0,255,136,0.85)',
          display: 'flex', flexDirection: 'column', gap: 2
        }}>
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
