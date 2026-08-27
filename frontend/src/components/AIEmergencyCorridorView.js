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

  const getMappedJunctions = () => {
    const activePath = (routePath && routePath.length > 0)
      ? routePath.map(p => ({ lat: p.lat || p[0], lng: p.lng || p[1] }))
      : (realRoutePath ? realRoutePath.map(p => ({ lat: p[0], lng: p[1] })) : []);

    if (activePath.length < 5 || junctions.length === 0) return junctions;

    // Map each junction to a spaced waypoint on the real route
    return junctions.map((j, idx) => {
      const fraction = (idx + 1) / (junctions.length + 1);
      const ptIdx = Math.floor(activePath.length * fraction);
      const coord = activePath[ptIdx] || activePath[activePath.length - 1];
      return {
        ...j,
        lat: j.latitude || j.lat || coord.lat,
        lng: j.longitude || j.lng || coord.lng
      };
    });
  };

  // Auto-fetch real-world route from OSRM to map full path: ambulance -> patient -> hospital
  useEffect(() => {
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
      } else if (routePath && routePath.length > 1) {
        // Fallback to prop routePath if OSRM fetch failed
        const coords = routePath.map(p => [p.lat || p[0] || p.x, p.lng || p[1] || p.y]);
        setRealRoutePath(coords);
        addLog(`✅ Loaded fallback route geometry`);
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
        @keyframes blink-alert {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
        .rl-metric-val { font-size: 20px; font-weight: bold; fontFamily: "'Orbitron'"; color: #fff; margin-top: 4px; }
      `}</style>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', background: 'rgba(5, 12, 30, 0.9)',
        borderBottom: '1px solid rgba(0, 200, 255, 0.25)'
      }}>
        <div>
          <div style={{ fontSize: 14, fontFamily: "'Orbitron'", color: '#ff3333', letterSpacing: '0.12em', fontWeight: 900 }}>
            🚨 AI EMERGENCY CORRIDOR CONTROLLER
          </div>
          <span style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
            DYNAMIC PREEMPTION ENGINE ON (REGION: {cityName})
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            background: 'rgba(255,51,51,0.15)', border: '1px solid #ff3333', color: '#ff3333',
            fontSize: 9, fontWeight: 700, padding: '4px 10px', borderRadius: 4, fontFamily: "'Orbitron'",
            animation: 'blink-alert 1.5s ease-in-out infinite'
          }}>
            MISSION STATUS: ACTIVE - CRITICAL
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
          <h4 style={{ fontFamily: "'Orbitron'", fontSize: 10, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.07em', marginBottom: 12, marginTop: 0 }}>
            🚥 UPCOMING CARD
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {junctions.map((j, idx) => {
              let statusBg = 'rgba(255,255,255,0.02)';
              let statusBorder = 'rgba(255,255,255,0.06)';
              let statusText = '#888';
              let lightColor = '#ff3333';
              let lightIndicator = '🔴';
              let actionDesc = 'TRAFFIC REDIRECTED';

              if (j.status === 'PASSED') {
                statusBg = 'rgba(160,200,255,0.03)';
                statusBorder = 'rgba(160,200,255,0.15)';
                statusText = 'rgba(160,200,255,0.5)';
                lightColor = '#00c8ff';
                lightIndicator = '🔵';
                actionDesc = 'CLEARED / PASSED';
              } else if (j.status === 'PREEMPTING' || idx === 1) {
                statusBg = 'rgba(255,107,53,0.08)';
                statusBorder = 'rgba(255,107,53,0.3)';
                statusText = '#ff6b35';
                lightColor = '#ff6b35';
                lightIndicator = '🟠';
                actionDesc = 'TRAFFIC REDIRECTING...';
              } else if (j.status === 'CORRIDOR_ACTIVE' || idx === 0) {
                statusBg = 'rgba(0,255,136,0.08)';
                statusBorder = 'rgba(0,255,136,0.35)';
                statusText = '#00ff88';
                lightColor = '#00ff88';
                lightIndicator = '🟢';
                actionDesc = 'AI CONTROL ACTIVE';
              }

              return (
                <div key={j.id} style={{
                  padding: 10, background: statusBg, border: `1px solid ${statusBorder}`,
                  borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <div style={{ fontSize: 18 }}>{lightIndicator}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Junction {idx + 1}</div>
                    <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'" }}>{j.name || 'Broadway & Oak'}</div>
                    <div style={{ fontSize: 8, fontFamily: "'Share Tech Mono'", color: statusText, fontWeight: 'bold', marginTop: 2 }}>
                      {actionDesc}
                    </div>
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(0,255,136,0.8)', fontFamily: "'Orbitron'" }}>●●●●</div>
                </div>
              );
            })}
          </div>

          {/* TRAFFIC TREND CHART */}
          <div style={{ marginTop: 'auto', paddingTop: 15, borderTop: '1px solid rgba(0,200,255,0.1)' }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>TRAFFIC DENSITY TRENDS</div>
            <svg viewBox="0 0 100 45" style={{ width: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff3333" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="#ff3333" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffb800" stopOpacity="0.15"/>
                  <stop offset="100%" stopColor="#ffb800" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M 0 40 Q 25 15, 50 30 T 100 15 L 100 45 L 0 45 Z" fill="url(#grad1)" stroke="#ff3333" strokeWidth="1.5" />
              <path d="M 0 35 Q 30 10, 60 25 T 100 20 L 100 45 L 0 45 Z" fill="url(#grad2)" stroke="#ffb800" strokeWidth="1" strokeDasharray="2,2" />
            </svg>
          </div>
        </div>

        {/* MIDDLE COLUMN: MAP & SIMULATOR */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
          
          {/* TOP: Map Panel */}
          <div style={{ flex: 3, position: 'relative', background: '#040814' }}>
            {isValidLatLng(ambulanceLoc) || isValidLatLng(patientLoc) || isValidLatLng(hospitalLoc) ? (
              <LiveRouteMap
                routeGeometry={routePath ? { type: 'LineString', coordinates: routePath.map(p => [p.lng || p[1], p.lat || p[0]]) } : (realRoutePath ? { type: 'LineString', coordinates: realRoutePath.map(p => [p[1], p[0]]) } : null)}
                ambulancePosition={isValidLatLng(ambulanceLoc) ? { lat: ambulanceLoc.lat || ambulanceLoc[0], lng: ambulanceLoc.lng || ambulanceLoc[1] } : null}
                originMarker={isValidLatLng(patientLoc) ? { lat: patientLoc.lat || patientLoc[0], lng: patientLoc.lng || patientLoc[1] } : null}
                destinationMarker={isValidLatLng(hospitalLoc) ? { lat: hospitalLoc.lat || hospitalLoc[0], lng: hospitalLoc.lng || hospitalLoc[1] } : null}
                junctions={getMappedJunctions()}
                mode="hospital"
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <span style={{ fontSize: 14, fontFamily: "'Orbitron'", color: '#ff3333' }}>LOADING MAP TELEMETRY...</span>
              </div>
            )}

            {/* Route loading overlay */}
            {!routePath && !realRoutePath && isValidLatLng(ambulanceLoc) && (
              <div style={{
                position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(4,8,20,0.9)', border: '1px solid rgba(255,51,51,0.3)',
                borderRadius: 6, padding: '6px 14px', fontSize: 10,
                color: '#ff3333', fontFamily: "'Share Tech Mono'", zIndex: 1000
              }}>
                🗺️ Calculating Green Corridor...
              </div>
            )}
          </div>

          {/* BOTTOM: 3D Moving Ambulance Simulation HUD Feed */}
          <div style={{
            height: 190,
            background: 'linear-gradient(180deg, #020512 0%, #060d26 100%)',
            borderTop: '2px solid rgba(0, 200, 255, 0.25)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            boxSizing: 'border-box'
          }}>
            <style>{`
              @keyframes road-line-move {
                0% { background-position-y: 0px; }
                100% { background-position-y: 400px; }
              }
              @keyframes amb-sway {
                0% { transform: translateY(0px) rotate(0deg); }
                50% { transform: translateY(-3px) rotate(0.8deg); }
                100% { transform: translateY(0px) rotate(0deg); }
              }
              @keyframes siren-flash-blue {
                0%, 100% { filter: drop-shadow(0 0 2px rgba(0, 100, 255, 0.4)); background: #0064ff; }
                50% { filter: drop-shadow(0 0 15px rgba(0, 200, 255, 1)); background: #00c8ff; }
              }
              @keyframes siren-flash-red {
                0%, 100% { filter: drop-shadow(0 0 2px rgba(255, 0, 0, 0.4)); background: #990000; }
                50% { filter: drop-shadow(0 0 15px rgba(255, 51, 51, 1)); background: #ff3333; }
              }
              @keyframes gantry-slide {
                0% { transform: translate(-50%, -100px) scale(0.2); opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { transform: translate(-50%, 250px) scale(1.6); opacity: 0; }
              }
              .road-container {
                width: 100%;
                height: 100%;
                position: absolute;
                bottom: 0;
                left: 0;
                transform: perspective(250px) rotateX(45deg);
                transform-origin: center bottom;
                background: #0d1222;
                overflow: hidden;
              }
              .road-lane-divider {
                width: 6px;
                height: 100%;
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                background: repeating-linear-gradient(
                  to bottom,
                  transparent,
                  transparent 25px,
                  #00ff88 25px,
                  #00ff88 65px
                );
                background-size: 100% 90px;
                animation: road-line-move 0.75s linear infinite;
              }
              .road-edge-left {
                width: 4px;
                height: 100%;
                position: absolute;
                left: 20%;
                background: #ff5500;
                box-shadow: 0 0 10px #ff5500;
              }
              .road-edge-right {
                width: 4px;
                height: 100%;
                position: absolute;
                right: 20%;
                background: #ff5500;
                box-shadow: 0 0 10px #ff5500;
              }
              .sim-sign-gantry {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                top: 15px;
                background: rgba(3, 10, 24, 0.9);
                border: 1px solid #00c8ff;
                box-shadow: 0 0 12px rgba(0, 200, 255, 0.4);
                border-radius: 4px;
                padding: 4px 12px;
                font-family: 'Share Tech Mono', monospace;
                font-size: 10px;
                color: #00ff88;
                text-align: center;
                animation: gantry-slide 6s linear infinite;
                z-index: 10;
                pointer-events: none;
              }
              .hud-overlay-text {
                position: absolute;
                font-family: 'Orbitron', sans-serif;
                font-size: 8px;
                font-weight: bold;
                letter-spacing: 0.05em;
                color: #00c8ff;
                z-index: 20;
                background: rgba(4, 9, 24, 0.75);
                border: 1px solid rgba(0, 200, 255, 0.2);
                border-radius: 3px;
                padding: 3px 6px;
            `}</style>

            {/* Simulated perspective road */}
            <div className="road-container">
              <div className="road-lane-divider" />
              <div className="road-edge-left" />
              <div className="road-edge-right" />
            </div>

            {/* Flying Overhead Gantry Sign */}
            <div className="sim-sign-gantry">
              🚨 EMERGENCY CORRIDOR ACTIVE - YIELD 🚨
              <div style={{ fontSize: 8, color: '#ffea00', marginTop: 2 }}>AI ROUTING ENABLED / MUNICIPAL SYNCED</div>
            </div>

            {/* Moving Swaying Ambulance graphic */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 140,
              height: 70,
              animation: 'amb-sway 0.25s ease-in-out infinite',
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* Siren lights flashing */}
              <div style={{ display: 'flex', gap: 14, marginBottom: -2 }}>
                <div style={{ width: 12, height: 5, borderRadius: '2px 2px 0 0', animation: 'siren-flash-red 0.15s step-end infinite' }} />
                <div style={{ width: 12, height: 5, borderRadius: '2px 2px 0 0', animation: 'siren-flash-blue 0.15s step-end infinite' }} />
              </div>
              
              {/* Back profile SVG ambulance cabin cabin */}
              <svg width="85" height="54" viewBox="0 0 85 54" fill="none">
                <rect x="2" y="2" width="81" height="50" rx="6" fill="#fcfcfc" stroke="#e0e0e0" strokeWidth="3" />
                <rect x="10" y="10" width="28" height="18" rx="2" fill="#111c2e" />
                <rect x="47" y="10" width="28" height="18" rx="2" fill="#111c2e" />
                {/* Red paramedic stripes */}
                <rect x="2" y="34" width="81" height="8" fill="#ff3333" />
                <rect x="34" y="30" width="16" height="16" rx="8" fill="#ffffff" />
                {/* Cross symbol */}
                <path d="M 42 34 L 42 42 M 38 38 L 46 38" stroke="#ff3333" strokeWidth="2.5" strokeLinecap="round" />
              </svg>

              {/* Tires swaying */}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: 68, marginTop: -2 }}>
                <div style={{ width: 15, height: 6, background: '#111', borderRadius: '0 0 3px 3px' }} />
                <div style={{ width: 15, height: 6, background: '#111', borderRadius: '0 0 3px 3px' }} />
              </div>
            </div>

            {/* HUD text labels */}
            <div className="hud-overlay-text" style={{ top: 8, left: 8 }}>
              FEED: FRONT_CAM_AI
            </div>
            <div className="hud-overlay-text" style={{ top: 8, right: 8, color: '#00ff88' }}>
              GPS: LOCKED (METRO)
            </div>
            <div className="hud-overlay-text" style={{ bottom: 8, left: 8, color: '#ff3333' }}>
              LANE LIGHTS: ON_DUTY
            </div>
            <div className="hud-overlay-text" style={{ bottom: 8, right: 8, color: '#ffea00' }}>
              SPEED: {speedKmh} KM/H
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{
          width: 260, background: 'rgba(6,12,28,0.95)', borderLeft: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', flexDirection: 'column', padding: 14, overflowY: 'auto'
        }}>
          <h4 style={{ fontFamily: "'Orbitron'", fontSize: 10, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.07em', marginBottom: 12, marginTop: 0 }}>
            🛰️ DYNAMIC TELEMETRY
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {/* Big ETA Display */}
            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ESTIMATED ARRIVAL (ETA)</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Orbitron'" }}>
                  {String(Math.floor(etaSeconds / 60)).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", marginRight: 6 }}>MIN</span>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Orbitron'" }}>
                  {String(etaSeconds % 60).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'" }}>SEC</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>REMAINING DISTANCE</div>
              <div className="rl-metric-val">{distanceKm} KM</div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL DESTINATION</div>
              <div style={{ border: '1px solid rgba(0,200,255,0.15)', borderRadius: 6, padding: 8, marginTop: 4, background: 'rgba(5,15,35,0.4)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#00ff88' }}>{hospitalName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(160,200,255,0.4)', marginTop: 4 }}>
                  <span>ER Capacity: 75%</span>
                  <span style={{ color: '#00ff88' }}>Ready</span>
                </div>
              </div>
            </div>

            {/* Corridor Segment Progress */}
            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>EMERGENCY CORRIDOR PROGRESS</div>
              <div style={{ display: 'flex', gap: 4, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ flex: 1, background: '#00ff88', borderRadius: 2 }} />
                <div style={{ flex: 1, background: '#00ff88', borderRadius: 2 }} />
                <div style={{ flex: 1, background: '#ff9900', borderRadius: 2, animation: 'blink-alert 1s infinite' }} />
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 7, color: 'rgba(160,200,255,0.4)', marginTop: 4, fontFamily: 'monospace' }}>
                <span>Established</span>
                <span>Clear Path</span>
                <span>Signals Synced</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>CURRENT TRAFFIC STATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#ff3333' }}>HEAVY (ROUTE CLEARED)</span>
              </div>
              {/* Traffic color bar */}
              <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ flex: 1, background: '#00ff88' }} />
                <div style={{ flex: 1, background: '#ffea00' }} />
                <div style={{ flex: 2, background: '#ff3333' }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>EMERGENCY VEHICLE STATUS</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ff3333', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3333', display: 'inline-block', animation: 'blink-alert 0.8s step-end infinite' }} />
                EN ROUTE - SPEED {speedKmh} KPH
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SYSTEM LOGS & ALERTS */}
      <div style={{
        height: 120, background: '#03060f', borderTop: '1px solid rgba(0,200,255,0.25)',
        display: 'flex', flexDirection: 'column', padding: 8, boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: 9, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.6)', letterSpacing: '0.15em', marginBottom: 4 }}>
          SYSTEM LOGS & ALERTS
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.1)',
          borderRadius: 4, padding: 8, fontFamily: "'Share Tech Mono'", fontSize: 9, color: '#ffb800',
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'rgba(160,200,255,0.4)' }}>[LOG]</span>
              <span style={{ color: log.includes('🚨') || log.includes('warning') ? '#ff3333' : '#00ff88' }}>{log}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
