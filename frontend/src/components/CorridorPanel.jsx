import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Helper to check for valid latitude and longitude
const isValidLatLng = (loc) => {
  if (!loc) return false;
  const lat = loc.lat !== undefined ? loc.lat : (Array.isArray(loc) ? loc[0] : undefined);
  const lng = loc.lng !== undefined ? loc.lng : (Array.isArray(loc) ? loc[1] : undefined);
  return lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng);
};

// Calculate distance in meters between two points
const calcDistMeters = (p1, p2) => {
  if (!isValidLatLng(p1) || !isValidLatLng(p2)) return 0;
  const lat1 = p1.lat !== undefined ? p1.lat : p1[0];
  const lng1 = p1.lng !== undefined ? p1.lng : p1[1];
  const lat2 = p2.lat !== undefined ? p2.lat : p2[0];
  const lng2 = p2.lng !== undefined ? p2.lng : p2[1];

  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // meters
};

export default function CorridorPanel({
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
  mode = 'hospital', // 'driver' | 'hospital' | 'warroom'
  onBack = null
}) {
  const [cityName, setCityName] = useState('VIJAYAWADA');
  const [junctions, setJunctions] = useState([]);
  const [logs, setLogs] = useState(['[System Boot] Preemption link established.']);
  const [realRoutePath, setRealRoutePath] = useState(null); // coordinates from OSRM
  const [overrideConfirm, setOverrideConfirm] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const junctionMarkersRef = useRef([]);

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${text}`, ...prev.slice(0, 24)]);
  };

  // Fetch real route from OSRM public API with steps
  useEffect(() => {
    if (!isValidLatLng(ambulanceLoc)) return;

    const fetchRouteAndSteps = async () => {
      const start = ambulanceLoc;
      const end = isValidLatLng(hospitalLoc) ? hospitalLoc : (isValidLatLng(patientLoc) ? patientLoc : null);
      if (!end) return;

      const sLat = start.lat !== undefined ? start.lat : start[0];
      const sLng = start.lng !== undefined ? start.lng : start[1];
      const eLat = end.lat !== undefined ? end.lat : end[0];
      const eLng = end.lng !== undefined ? end.lng : end[1];

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM Route fetch failed');
        const data = await res.json();
        
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]); // [lat, lng]
          setRealRoutePath(coords);

          // Extract steps for real street names
          const steps = route.legs[0].steps || [];
          const extractedJunctions = [];
          
          steps.forEach((step, idx) => {
            const name = step.name ? step.name.trim() : '';
            if (name && name !== '' && !extractedJunctions.some(j => j.name === name)) {
              extractedJunctions.push({
                id: `step_junc_${idx}`,
                name: name,
                coord: [step.maneuver.location[1], step.maneuver.location[0]], // [lat, lng]
                status: 'STANDBY',
                distance: 9999
              });
            }
          });

          // Fallback if no named steps
          if (extractedJunctions.length === 0) {
            const sampleNames = ['PCR Junction', 'Labbipet Junction', 'Benz Circle', 'Aster Ramesh Cross'];
            sampleNames.forEach((n, idx) => {
              const fraction = (idx + 1) / (sampleNames.length + 1);
              const ptIdx = Math.floor(coords.length * fraction);
              const pt = coords[ptIdx] || coords[coords.length - 1];
              extractedJunctions.push({
                id: `sim_junc_${idx}`,
                name: n,
                coord: pt,
                status: 'STANDBY',
                distance: 9999
              });
            });
          }

          setJunctions(extractedJunctions);
          addLog(`🗺️ Loaded OSRM Route: ${coords.length} waypoints, ${extractedJunctions.length} preemption junctions.`);
        }
      } catch (err) {
        addLog(`⚠️ Fallback to local junction list: ${err.message}`);
        // Fallback static list
        const fallbackList = [
          { id: 'junc_1', name: 'PCR Junction', coord: [sLat + 0.002, sLng + 0.003], status: 'STANDBY', distance: 9999 },
          { id: 'junc_2', name: 'Labbipet Junction', coord: [sLat + 0.004, sLng + 0.006], status: 'STANDBY', distance: 9999 },
          { id: 'junc_3', name: 'Benz Circle', coord: [sLat + 0.006, sLng + 0.009], status: 'STANDBY', distance: 9999 },
          { id: 'junc_4', name: 'Aster Ramesh Cross', coord: [sLat + 0.008, sLng + 0.012], status: 'STANDBY', distance: 9999 }
        ];
        setJunctions(fallbackList);
      }
    };

    fetchRouteAndSteps();
  }, [ambulanceLoc, patientLoc, hospitalLoc]);

  // Update dynamic status of junctions based on real-time distance from moving ambulance
  useEffect(() => {
    if (!isValidLatLng(ambulanceLoc) || junctions.length === 0) return;

    setJunctions(prev =>
      prev.map(j => {
        const dist = calcDistMeters(ambulanceLoc, j.coord);
        let newStatus = 'STANDBY';

        // Check if ambulance already passed the junction coordinate (using routing progression or simplified direction checks)
        // For simplicity: if distance is very small or increases after being very small, we mark as CLEARED
        if (j.status === 'CLEARED') {
          newStatus = 'CLEARED';
        } else if (dist < 40) {
          newStatus = 'CLEARED';
          addLog(`✓ Ambulance cleared ${j.name}. Releasing green corridor lock.`);
        } else if (dist < 150) {
          newStatus = 'CORRIDOR_ACTIVE';
        } else if (dist < 500) {
          newStatus = 'APPROACHING';
        }

        return { ...j, status: newStatus, distance: dist };
      })
    );
  }, [ambulanceLoc, junctions.length]);

  // Sync WebSocket preemption events
  useEffect(() => {
    if (!socket || !activeMissionId) return;

    const onCorridorUpdate = (data) => {
      if (data.incidentId !== activeMissionId) return;
      setJunctions(prev =>
        prev.map(j => {
          if (j.id === data.junctionId || j.name.toLowerCase().includes(data.name?.toLowerCase())) {
            addLog(`Junction ${data.name} Preemption Lock: ${data.status}`);
            return { ...j, status: data.status };
          }
          return j;
        })
      );
    };

    const onPreemptAlert = (data) => {
      if (data.incidentId !== activeMissionId) return;
      addLog(`🚨 Preemption signal established for ${data.name}. Distance: ${data.distance}m.`);
    };

    socket.on('corridor:status_update', onCorridorUpdate);
    socket.on('corridor:preempt_junction', onPreemptAlert);

    return () => {
      socket.off('corridor:status_update', onCorridorUpdate);
      socket.off('corridor:preempt_junction', onPreemptAlert);
    };
  }, [socket, activeMissionId]);

  // Leaflet Map Lifecycle
  useEffect(() => {
    if (mode === 'driver' || !mapContainerRef.current) return;

    let center = [16.5062, 80.6480]; // [lat, lng]
    if (isValidLatLng(ambulanceLoc)) {
      center = [ambulanceLoc.lat !== undefined ? ambulanceLoc.lat : ambulanceLoc[0], ambulanceLoc.lng !== undefined ? ambulanceLoc.lng : ambulanceLoc[1]];
    }

    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    mapRef.current = map;

    let coords = [];
    if (realRoutePath) {
      coords = realRoutePath;
    } else if (routePath) {
      coords = routePath.map(p => [p.lat !== undefined ? p.lat : p[0], p.lng !== undefined ? p.lng : p[1]]);
    }

    if (coords.length > 0) {
      L.polyline(coords, { color: '#FF4D63', weight: 12, opacity: 0.35 }).addTo(map);
      const poly = L.polyline(coords, { color: '#FF4D63', weight: 4, opacity: 0.95 }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding: [40, 40] });
    }

    updateMarkers();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mode, realRoutePath, routePath]);

  // Update Markers
  const updateMarkers = () => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old junction markers
    junctionMarkersRef.current.forEach(m => m.remove());
    junctionMarkersRef.current = [];

    // Add destination
    if (isValidLatLng(hospitalLoc)) {
      const lat = hospitalLoc.lat !== undefined ? hospitalLoc.lat : hospitalLoc[0];
      const lng = hospitalLoc.lng !== undefined ? hospitalLoc.lng : hospitalLoc[1];
      const icon = L.divIcon({ html: '<div style="font-size: 28px; filter: drop-shadow(0 0 10px #00ff88);">🏥</div>', className: '', iconSize: [36, 36] });
      if (!destinationMarkerRef.current) {
        destinationMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      } else {
        destinationMarkerRef.current.setLatLng([lat, lng]);
      }
    }

    // Add Patient origin
    if (isValidLatLng(patientLoc)) {
      const lat = patientLoc.lat !== undefined ? patientLoc.lat : patientLoc[0];
      const lng = patientLoc.lng !== undefined ? patientLoc.lng : patientLoc[1];
      const icon = L.divIcon({ html: '<div style="font-size: 26px; filter: drop-shadow(0 0 8px #ffb800);">🧍</div>', className: '', iconSize: [32, 32] });
      if (!originMarkerRef.current) {
        originMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      } else {
        originMarkerRef.current.setLatLng([lat, lng]);
      }
    }

    // Add Moving Ambulance
    if (isValidLatLng(ambulanceLoc)) {
      const lat = ambulanceLoc.lat !== undefined ? ambulanceLoc.lat : ambulanceLoc[0];
      const lng = ambulanceLoc.lng !== undefined ? ambulanceLoc.lng : ambulanceLoc[1];
      const icon = L.divIcon({ html: '<div style="font-size: 32px; filter: drop-shadow(0 0 12px #ff4d63); transform: scale(1.15);">🚑</div>', className: '', iconSize: [36, 36] });
      if (!ambulanceMarkerRef.current) {
        ambulanceMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      } else {
        ambulanceMarkerRef.current.setLatLng([lat, lng]);
      }
    }

    // Add Junction Markers dynamically colored by status
    junctions.forEach((j) => {
      let color = '#7f8c8d'; // grey
      if (j.status === 'CORRIDOR_ACTIVE') color = '#00ff88';
      else if (j.status === 'APPROACHING') color = '#ffea00';
      else if (j.status === 'CLEARED') color = '#2c3e50';

      const iconHtml = `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2px solid #fff; box-shadow: 0 0 12px ${color};"></div>`;
      const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [14, 14] });
      const m = L.marker([j.coord[0], j.coord[1]], { icon }).addTo(map);
      
      junctionMarkersRef.current.push(m);
    });
  };

  useEffect(() => {
    updateMarkers();
  }, [ambulanceLoc, junctions, hospitalLoc, patientLoc]);

  // Handle Manual preemption overrides
  const handleManualOverride = (junctionId, name) => {
    setOverrideConfirm({ junctionId, name });
  };

  const executeManualOverride = () => {
    if (!overrideConfirm || !socket || !activeMissionId) return;
    socket.emit('corridor:manual-override', {
      incidentId: activeMissionId,
      junctionId: overrideConfirm.junctionId,
      forceStatus: 'CORRIDOR_ACTIVE'
    });
    addLog(`[OVERRIDE COMMAND] Forced green preemption active for: ${overrideConfirm.name}`);
    setJunctions(prev =>
      prev.map(j => (j.id === overrideConfirm.junctionId ? { ...j, status: 'CORRIDOR_ACTIVE' } : j))
    );
    setOverrideConfirm(null);
  };

  const progressPct = Math.min(
    100,
    Math.round((junctions.filter(j => j.status === 'CLEARED').length / (junctions.length || 1)) * 100)
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
      background: '#040814', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif",
      overflow: 'hidden', boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes pulse-banner {
          0% { opacity: 0.7; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }
        .junc-card {
          padding: 12px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.3s ease;
        }
        .disclosure-banner {
          background: rgba(255, 184, 0, 0.08);
          border: 1px solid rgba(255, 184, 0, 0.25);
          color: #ffb800;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          padding: 8px 16px;
          text-align: center;
          animation: pulse-banner 2s infinite ease-in-out;
        }
      `}</style>

      {/* Manual Override Confirmation Overlay */}
      {overrideConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(2, 6, 18, 0.9)',
          backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#0b132b', border: '1px solid rgba(255,184,0,0.4)',
            borderRadius: 12, padding: 24, maxWidth: 400, width: '90%', textAlign: 'center'
          }}>
            <h3 style={{ margin: 0, fontFamily: "'Orbitron'", color: '#ffb800' }}>⚠️ INITIATE MANUAL PREEMPTION</h3>
            <p style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', margin: '14px 0 24px 0', lineHeight: 1.6 }}>
              Are you sure you want to force green preemption corridor for <strong style={{ color: '#fff' }}>{overrideConfirm.name}</strong>?<br/>
              This will bypass municipal routing logic.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={executeManualOverride}
                style={{ flex: 1, padding: 12, background: '#ffb800', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontFamily: "'Orbitron'" }}
              >
                PROCEED OVERRIDE
              </button>
              <button
                onClick={() => setOverrideConfirm(null)}
                style={{ flex: 1, padding: 12, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCLOSURE BANNER */}
      <div className="disclosure-banner">
        ⚠️ AI corridor computed from live route data. Signal infrastructure integration requires municipal partnership — not yet connected.
      </div>

      {/* HEADER CONTROLS */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 20px', borderBottom: '1px solid rgba(0, 200, 255, 0.2)',
        background: 'rgba(6, 12, 28, 0.95)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'transparent', border: '1px solid rgba(0,200,255,0.4)', color: '#00c8ff',
                padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
              }}
            >
              ◀ BACK
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "'Orbitron'", letterSpacing: '0.1em' }}>
              AI EMERGENCY CORRIDOR COMMAND
            </h2>
            <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
              STATUS: ACTIVE ROUTE PRIORITY PREEMPTION
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono'", color: '#ffb800', background: 'rgba(255,184,0,0.1)', padding: '4px 10px', borderRadius: 4 }}>
            REGION: {cityName}
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT COLUMN: JUNCTION CARDS */}
        <aside style={{
          width: mode === 'driver' ? '50%' : 300, background: 'rgba(6, 12, 28, 0.96)',
          borderRight: '1px solid rgba(0, 200, 255, 0.15)', display: 'flex', flexDirection: 'column',
          padding: 16, overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'" }}>
            🚦 PREEMPTION NODES
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {junctions.map((j, idx) => {
              let icon = '⚪';
              let color = '#7f8c8d';
              let bg = 'rgba(255, 255, 255, 0.02)';
              let label = 'STANDBY';

              if (j.status === 'CORRIDOR_ACTIVE') {
                icon = '🟢';
                color = '#00ff88';
                bg = 'rgba(0, 255, 136, 0.06)';
                label = 'AI CONTROL ACTIVE';
              } else if (j.status === 'APPROACHING') {
                icon = '🟡';
                color = '#ffea00';
                bg = 'rgba(255, 234, 0, 0.06)';
                label = 'APPROACHING';
              } else if (j.status === 'CLEARED') {
                icon = '⚫';
                color = 'rgba(160, 200, 255, 0.3)';
                bg = 'rgba(255, 255, 255, 0.01)';
                label = 'CLEARED';
              }

              return (
                <div key={j.id} className="junc-card" style={{ background: bg, border: `1px solid ${color}33` }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: j.status === 'CLEARED' ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                      {j.name}
                    </div>
                    <div style={{ fontSize: 8, color: color, fontFamily: "'Share Tech Mono'", marginTop: 3 }}>
                      {label} {j.distance ? `· ${Math.round(j.distance)}m` : ''}
                    </div>
                  </div>
                  {mode === 'driver' && j.status !== 'CLEARED' && (
                    <button
                      onClick={() => handleManualOverride(j.id, j.name)}
                      style={{
                        background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.4)',
                        color: '#ffb800', borderRadius: 4, padding: '4px 8px', fontSize: 9,
                        fontFamily: "'Orbitron'", cursor: 'pointer'
                      }}
                    >
                      FORCE
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* MIDDLE MAP (HIDDEN IN DRIVER MODE) */}
        {mode !== 'driver' && (
          <main style={{ flex: 1, position: 'relative', background: '#090d1a' }}>
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
          </main>
        )}

        {/* RIGHT COLUMN: TELEMETRY & PROGRESS */}
        <aside style={{
          width: mode === 'driver' ? '50%' : 280, background: 'rgba(6, 12, 28, 0.96)',
          borderLeft: '1px solid rgba(0, 200, 255, 0.15)', display: 'flex', flexDirection: 'column',
          padding: 16, overflowY: 'auto'
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'" }}>
            📊 LIVE TELEMETRY
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ESTIMATED TRANSIT ETA</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Orbitron'", color: '#fff', marginTop: 4 }}>
                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>REMAINING DISTANCE</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Orbitron'", color: '#fff', marginTop: 4 }}>
                {distanceKm} KM
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL STATUS</div>
              <div style={{ border: '1px solid rgba(0, 200, 255, 0.15)', borderRadius: 6, padding: 10, marginTop: 4, background: 'rgba(5, 15, 35, 0.4)' }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#00ff88' }}>{hospitalName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(160,200,255,0.5)', marginTop: 4 }}>
                  <span>ER Capacity: 80%</span>
                  <span style={{ color: '#00ff88' }}>READY</span>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>
                <span>CORRIDOR PROGRESS</span>
                <span>{progressPct}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #ff4d63, #00ff88)', borderRadius: 3 }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>AMBULANCE VELOCITY</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ff3333', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3333', display: 'inline-block', animation: 'pulse-banner 1s infinite' }} />
                EN ROUTE · {speedKmh} KPH
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* SYSTEM LOG TAIL */}
      <footer style={{
        height: 120, background: '#02050f', borderTop: '1px solid rgba(0, 200, 255, 0.2)',
        display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: 9, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.5)', letterSpacing: '0.1em', marginBottom: 6 }}>
          SYSTEM LOG TAIL
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0, 200, 255, 0.1)',
          borderRadius: 4, padding: 8, fontFamily: "'Share Tech Mono'", fontSize: 10, color: '#00ff88',
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'rgba(160,200,255,0.4)' }}>[LOG]</span>
              <span style={{ color: log.includes('🚨') || log.includes('warning') ? '#ff4d63' : '#00ff88' }}>{log}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
