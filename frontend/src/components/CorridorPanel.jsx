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
  unitId = 'AMB-001',
  mode = 'hospital', // 'driver' | 'hospital' | 'warroom'
  onBack = null
}) {
  const [cityName, setCityName] = useState('METROPOLITAN REGION');
  const [junctions, setJunctions] = useState([]);
  const [readiness, setReadiness] = useState({ status: 'READY', score: 98, details: ['All preemption nodes nominal.'] });
  const [routeRecommendation, setRouteRecommendation] = useState(null);
  const [logs, setLogs] = useState(['[System Boot] Emergency Corridor Coordination Layer initialized with Simulated Traffic Controller Adapter.']);
  const [realRoutePath, setRealRoutePath] = useState(null);
  const [overrideConfirm, setOverrideConfirm] = useState(null);
  const [gpsConfidence, setGpsConfidence] = useState('HIGH CONFIDENCE');

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const originMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const junctionMarkersRef = useRef([]);

  const addLog = (text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${text}`, ...prev.slice(0, 29)]);
  };

  // Dynamically compute region city from mission coordinates via reverse geocoding
  useEffect(() => {
    const targetLoc = isValidLatLng(ambulanceLoc) ? ambulanceLoc : (isValidLatLng(hospitalLoc) ? hospitalLoc : (isValidLatLng(patientLoc) ? patientLoc : null));
    if (!targetLoc) return;

    const lat = targetLoc.lat !== undefined ? targetLoc.lat : targetLoc[0];
    const lng = targetLoc.lng !== undefined ? targetLoc.lng : targetLoc[1];
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

    let isMounted = true;
    const reverseGeocodeRegion = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        if (res.ok) {
          const data = await res.json();
          const detectedCity = data.address?.city || data.address?.town || data.address?.city_district || data.address?.county || data.address?.state_district || data.address?.state || 'METROPOLITAN REGION';
          if (isMounted && detectedCity) {
            setCityName(detectedCity.toUpperCase());
          }
        }
      } catch (err) {
        console.warn('Reverse geocode for corridor region failed:', err);
      }
    };

    reverseGeocodeRegion();
    return () => { isMounted = false; };
  }, [ambulanceLoc, hospitalLoc, patientLoc]);

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
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          setRealRoutePath(coords);

          const steps = route.legs[0].steps || [];
          const extractedJunctions = [];
          
          steps.forEach((step, idx) => {
            const name = step.name ? step.name.trim() : '';
            if (name && name !== '' && !extractedJunctions.some(j => j.name === name)) {
              extractedJunctions.push({
                id: `step_junc_${idx}`,
                junction_id: `step_junc_${idx}`,
                name: name,
                coord: [step.maneuver.location[1], step.maneuver.location[0]],
                status: 'NORMAL',
                corridor_state: 'NORMAL',
                approach_direction: idx % 2 === 0 ? 'South → North' : 'West → East',
                required_movement: 'Through',
                controller_status: 'ONLINE',
                distance: 9999,
                eta_seconds: 0
              });
            }
          });

          if (extractedJunctions.length === 0) {
            const sampleNames = ['PCR Junction', 'Labbipet Junction', 'Benz Circle', 'Aster Ramesh Cross'];
            sampleNames.forEach((n, idx) => {
              const fraction = (idx + 1) / (sampleNames.length + 1);
              const ptIdx = Math.floor(coords.length * fraction);
              const pt = coords[ptIdx] || coords[coords.length - 1];
              extractedJunctions.push({
                id: `sim_junc_${idx}`,
                junction_id: `sim_junc_${idx}`,
                name: n,
                coord: pt,
                status: 'NORMAL',
                corridor_state: 'NORMAL',
                approach_direction: idx % 2 === 0 ? 'South → North' : 'West → East',
                required_movement: 'Through',
                controller_status: 'ONLINE',
                distance: 9999,
                eta_seconds: 0
              });
            });
          }

          setJunctions(extractedJunctions);
          addLog(`🗺️ Loaded OSRM Route: ${coords.length} waypoints, ${extractedJunctions.length} preemption junctions.`);
        }
      } catch (err) {
        addLog(`⚠️ Fallback to local junction list: ${err.message}`);
        const fallbackList = [
          { id: 'junc_1', junction_id: 'junc_1', name: 'PCR Junction', coord: [sLat + 0.002, sLng + 0.003], status: 'NORMAL', corridor_state: 'NORMAL', approach_direction: 'South → North', required_movement: 'Through', controller_status: 'ONLINE', distance: 9999, eta_seconds: 0 },
          { id: 'junc_2', junction_id: 'junc_2', name: 'Labbipet Junction', coord: [sLat + 0.004, sLng + 0.006], status: 'NORMAL', corridor_state: 'NORMAL', approach_direction: 'West → East', required_movement: 'Through', controller_status: 'ONLINE', distance: 9999, eta_seconds: 0 },
          { id: 'junc_3', junction_id: 'junc_3', name: 'Benz Circle', coord: [sLat + 0.006, sLng + 0.009], status: 'NORMAL', corridor_state: 'NORMAL', approach_direction: 'South → North', required_movement: 'Through', controller_status: 'ONLINE', distance: 9999, eta_seconds: 0 },
          { id: 'junc_4', junction_id: 'junc_4', name: 'Aster Ramesh Cross', coord: [sLat + 0.008, sLng + 0.012], status: 'NORMAL', corridor_state: 'NORMAL', approach_direction: 'East → West', required_movement: 'Through', controller_status: 'ONLINE', distance: 9999, eta_seconds: 0 }
        ];
        setJunctions(fallbackList);
      }
    };

    fetchRouteAndSteps();
  }, [ambulanceLoc, patientLoc, hospitalLoc]);

  // Dynamic distance & ETA simulation logic on client
  useEffect(() => {
    if (!isValidLatLng(ambulanceLoc) || junctions.length === 0) return;

    setJunctions(prev =>
      prev.map(j => {
        const dist = calcDistMeters(ambulanceLoc, j.coord);
        let cState = j.corridor_state || 'NORMAL';
        let controllerStatus = j.controller_status || 'ONLINE';

        if (j.corridor_state !== 'CONTROLLER_FAIL' && j.corridor_state !== 'MANUAL_INTERVENTION') {
          if (dist < 40) {
            cState = 'AMBULANCE_PASSING';
            controllerStatus = 'ACTIVE';
          } else if (dist < 80 && cState === 'AMBULANCE_PASSING') {
            cState = 'CLEARING';
          } else if (dist < 150) {
            cState = 'PREEMPT_ACTIVE';
            controllerStatus = 'ACTIVE';
          } else if (dist < 350) {
            cState = 'PREEMPT_REQUESTED';
            controllerStatus = 'ACKNOWLEDGED';
          } else if (dist < 600) {
            cState = 'APPROACHING';
            controllerStatus = 'ACKNOWLEDGED';
          } else if (dist < 1000) {
            cState = 'ARMED';
            controllerStatus = 'ONLINE';
          }
        }

        const estEtaSec = Math.max(0, Math.round(dist / (Math.max(20, speedKmh) / 3.6)));
        return { ...j, corridor_state: cState, controller_status: controllerStatus, distance: dist, eta_seconds: estEtaSec };
      })
    );
  }, [ambulanceLoc, speedKmh, junctions.length]);

  // Sync WebSocket preemption events & readiness updates
  useEffect(() => {
    if (!socket || !activeMissionId) return;

    const onCorridorUpdate = (data) => {
      if (data.incidentId && data.incidentId !== activeMissionId) return;
      setJunctions(prev =>
        prev.map(j => {
          if (j.id === data.junctionId || j.junction_id === data.junctionId || j.name.toLowerCase().includes(data.name?.toLowerCase())) {
            const newState = data.corridor_state || data.status || j.corridor_state;
            addLog(`🚦 Junction ${data.name} State -> ${newState} (${data.controller_status || 'ONLINE'})`);
            return { ...j, ...data, corridor_state: newState };
          }
          return j;
        })
      );
    };

    const onPreemptAlert = (data) => {
      if (data.incidentId && data.incidentId !== activeMissionId) return;
      addLog(`🚨 Preemption active for ${data.name}. Distance: ${data.distance}m.`);
    };

    const onControllerFail = (data) => {
      if (data.incidentId && data.incidentId !== activeMissionId) return;
      addLog(`⚠️ CONTROLLER FAILURE at ${data.name}: ${data.reason}. Switching node to MANUAL FALLBACK.`);
      setJunctions(prev =>
        prev.map(j => (j.name.toLowerCase().includes(data.name?.toLowerCase()) ? { ...j, corridor_state: 'CONTROLLER_FAIL', controller_status: 'FAILED' } : j))
      );
    };

    const onReadinessUpdate = (data) => {
      if (data.incidentId && data.incidentId !== activeMissionId) return;
      setReadiness({ status: data.status, score: data.score, details: data.details || [] });
    };

    const onRouteRecommendation = (data) => {
      if (data.incidentId && data.incidentId !== activeMissionId) return;
      setRouteRecommendation(data);
      addLog(`🚧 ROUTE OBSTRUCTION DETECTED: Recommendation -> ${data.recommendation}`);
    };

    socket.on('corridor:status_update', onCorridorUpdate);
    socket.on('corridor:junction_updated', onCorridorUpdate);
    socket.on('corridor:preempt_junction', onPreemptAlert);
    socket.on('corridor:controller_failure', onControllerFail);
    socket.on('corridor:readiness_updated', onReadinessUpdate);
    socket.on('corridor:route_recommendation', onRouteRecommendation);

    return () => {
      socket.off('corridor:status_update', onCorridorUpdate);
      socket.off('corridor:junction_updated', onCorridorUpdate);
      socket.off('corridor:preempt_junction', onPreemptAlert);
      socket.off('corridor:controller_failure', onControllerFail);
      socket.off('corridor:readiness_updated', onReadinessUpdate);
      socket.off('corridor:route_recommendation', onRouteRecommendation);
    };
  }, [socket, activeMissionId]);

  // Leaflet Map Lifecycle
  useEffect(() => {
    if (mode === 'driver' || !mapContainerRef.current) return;

    let center = [16.5062, 80.6480];
    if (isValidLatLng(ambulanceLoc)) {
      center = [ambulanceLoc.lat !== undefined ? ambulanceLoc.lat : ambulanceLoc[0], ambulanceLoc.lng !== undefined ? ambulanceLoc.lng : ambulanceLoc[1]];
    }

    const map = L.map(mapContainerRef.current, {
      center: center,
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-map-tiles'
    }).addTo(map);

    mapRef.current = map;

    let coords = [];
    if (realRoutePath) {
      coords = realRoutePath;
    } else if (routePath) {
      coords = routePath.map(p => [p.lat !== undefined ? p.lat : p[0], p.lng !== undefined ? p.lng : p[1]]);
    }

    if (coords.length > 0) {
      L.polyline(coords, { color: '#00ff88', weight: 12, opacity: 0.35 }).addTo(map);
      const poly = L.polyline(coords, { color: '#00ff88', weight: 4, opacity: 0.95 }).addTo(map);
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

    junctionMarkersRef.current.forEach(m => m.remove());
    junctionMarkersRef.current = [];

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

    junctions.forEach((j) => {
      let color = '#7f8c8d';
      const cState = j.corridor_state || j.status || 'NORMAL';
      if (['PREEMPT_ACTIVE', 'AMBULANCE_PASSING'].includes(cState)) color = '#00ff88';
      else if (['APPROACHING', 'PREEMPT_REQUESTED'].includes(cState)) color = '#ffea00';
      else if (['CLEARING', 'RESTORING', 'PASSED'].includes(cState)) color = '#00c8ff';
      else if (cState === 'CONTROLLER_FAIL') color = '#ff4d63';

      const iconHtml = `<div style="width: 16px; height: 16px; border-radius: 50%; background: ${color}; border: 2px solid #fff; box-shadow: 0 0 14px ${color};"></div>`;
      const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [16, 16] });
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
      forceStatus: 'PREEMPT_ACTIVE'
    });
    addLog(`[OVERRIDE COMMAND] Forced signal preemption ACTIVE for: ${overrideConfirm.name}`);
    setJunctions(prev =>
      prev.map(j => (j.id === overrideConfirm.junctionId || j.junction_id === overrideConfirm.junctionId ? { ...j, corridor_state: 'PREEMPT_ACTIVE', controller_status: 'ACTIVE' } : j))
    );
    setOverrideConfirm(null);
  };

  const nextJunction = junctions.find(j => !['CLEARING', 'RESTORING', 'PASSED'].includes(j.corridor_state)) || junctions[0];

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
        .readiness-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          font-family: 'Orbitron', sans-serif;
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
              Force green preemption state for <strong style={{ color: '#fff' }}>{overrideConfirm.name}</strong>?<br/>
              This overrides standard signal cycle timer.
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
        ⚠️ RescueLink Emergency Corridor Coordination Layer — Operating with Simulated Traffic Controller Adapter.
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
              EMERGENCY CORRIDOR COORDINATION LAYER
            </h2>
            <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
              CORRIDOR STATUS: ACTIVE ROUTE PRIORITY PREEMPTION
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="readiness-badge" style={{
            background: readiness.status === 'READY' ? 'rgba(0,255,136,0.15)' : 'rgba(255,184,0,0.15)',
            color: readiness.status === 'READY' ? '#00ff88' : '#ffb800',
            border: `1px solid ${readiness.status === 'READY' ? '#00ff88' : '#ffb800'}`
          }}>
            READINESS: {readiness.status} ({readiness.score}%)
          </div>
          <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono'", color: '#ffb800', background: 'rgba(255,184,0,0.1)', padding: '4px 10px', borderRadius: 4 }}>
            REGION: {cityName}
          </div>
        </div>
      </div>

      {/* ROUTE RECOMMENDATION ALERT BANNER */}
      {routeRecommendation && (
        <div style={{
          background: 'rgba(255, 77, 99, 0.12)', borderBottom: '1px solid #ff4d63',
          padding: '8px 20px', color: '#ff4d63', fontSize: 11, fontFamily: "'Share Tech Mono'",
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>🚧 <strong>TRAFFIC OBSTRUCTION DETECTED:</strong> {routeRecommendation.details}</span>
          <span style={{ fontWeight: 700, textDecoration: 'underline' }}>REC: {routeRecommendation.recommendation}</span>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT COLUMN: JUNCTION CARDS & SEQUENCE */}
        <aside style={{
          width: mode === 'driver' ? '50%' : 320, background: 'rgba(6, 12, 28, 0.96)',
          borderRight: '1px solid rgba(0, 200, 255, 0.15)', display: 'flex', flexDirection: 'column',
          padding: 16, overflowY: 'auto'
        }}>
          {/* SEQUENCE SUMMARY PIPES */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", marginBottom: 6 }}>
              CORRIDOR SEQUENCE
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {junctions.map((j, idx) => {
                const cState = j.corridor_state || 'NORMAL';
                const isCleared = ['CLEARING', 'RESTORING', 'PASSED'].includes(cState);
                const isActive = ['PREEMPT_ACTIVE', 'AMBULANCE_PASSING'].includes(cState);
                const isNext = j.id === nextJunction?.id || j.junction_id === nextJunction?.junction_id;

                let pillColor = 'rgba(255,255,255,0.2)';
                let pillText = `J${idx + 1} ○`;
                if (isCleared) { pillColor = '#00ff88'; pillText = `J${idx + 1} ✓`; }
                else if (isActive) { pillColor = '#00ff88'; pillText = `J${idx + 1} ⚡`; }
                else if (isNext) { pillColor = '#ffea00'; pillText = `J${idx + 1} → NEXT`; }

                return (
                  <span key={j.id} style={{
                    padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${pillColor}`, color: pillColor, fontSize: 10, fontFamily: "'Share Tech Mono'"
                  }}>
                    {pillText}
                  </span>
                );
              })}
            </div>
          </div>

          <h3 style={{ margin: '0 0 12px 0', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'" }}>
            🚦 PREEMPTION JUNCTION NODES
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {junctions.map((j, idx) => {
              const cState = j.corridor_state || j.status || 'NORMAL';
              let icon = '⚪';
              let color = '#7f8c8d';
              let bg = 'rgba(255, 255, 255, 0.02)';
              let label = cState;

              if (['PREEMPT_ACTIVE', 'AMBULANCE_PASSING'].includes(cState)) {
                icon = '🟢';
                color = '#00ff88';
                bg = 'rgba(0, 255, 136, 0.06)';
                label = `PREEMPT ACTIVE (${j.controller_status || 'ACTIVE'})`;
              } else if (['APPROACHING', 'PREEMPT_REQUESTED'].includes(cState)) {
                icon = '🟡';
                color = '#ffea00';
                bg = 'rgba(255, 234, 0, 0.06)';
                label = `APPROACHING (${j.controller_status || 'ACKNOWLEDGED'})`;
              } else if (['CLEARING', 'RESTORING', 'PASSED'].includes(cState)) {
                icon = '⚫';
                color = 'rgba(160, 200, 255, 0.4)';
                bg = 'rgba(255, 255, 255, 0.01)';
                label = 'PASSED & RESTORED';
              } else if (cState === 'CONTROLLER_FAIL') {
                icon = '🔴';
                color = '#ff4d63';
                bg = 'rgba(255, 77, 99, 0.08)';
                label = 'CONTROLLER FAIL - MANUAL FALLBACK';
              }

              return (
                <div key={j.id} className="junc-card" style={{ background: bg, border: `1px solid ${color}33` }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: cState === 'PASSED' ? 'rgba(255,255,255,0.4)' : '#fff' }}>
                      {j.name}
                    </div>
                    <div style={{ fontSize: 9, color: color, fontFamily: "'Share Tech Mono'", marginTop: 3 }}>
                      {label} {j.distance ? `· ${Math.round(j.distance)}m` : ''}
                    </div>
                    <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>
                      Approach: {j.approach_direction || 'South → North'} · Req: {j.required_movement || 'Through'}
                    </div>
                  </div>
                  {j.corridor_state !== 'PASSED' && (
                    <button
                      onClick={() => handleManualOverride(j.id, j.name)}
                      style={{
                        background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.4)',
                        color: '#ffb800', borderRadius: 4, padding: '4px 8px', fontSize: 9,
                        fontFamily: "'Orbitron'", cursor: 'pointer'
                      }}
                    >
                      OVERRIDE
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

        {/* RIGHT COLUMN: TELEMETRY & NEXT JUNCTION SPOTLIGHT */}
        <aside style={{
          width: mode === 'driver' ? '50%' : 300, background: 'rgba(6, 12, 28, 0.96)',
          borderLeft: '1px solid rgba(0, 200, 255, 0.15)', display: 'flex', flexDirection: 'column',
          padding: 16, overflowY: 'auto'
        }}>
          {/* NEXT JUNCTION SPOTLIGHT CARD */}
          {nextJunction && (
            <div style={{
              background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.3)',
              borderRadius: 8, padding: 14, marginBottom: 20
            }}>
              <div style={{ fontSize: 8, color: '#00c8ff', fontFamily: "'Orbitron'", letterSpacing: '0.1em' }}>
                NEXT JUNCTION SPOTLIGHT
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 4 }}>
                {nextJunction.name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)' }}>DISTANCE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffb800', fontFamily: "'Orbitron'" }}>
                    {nextJunction.distance ? `${Math.round(nextJunction.distance)} m` : '--'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)' }}>JUNCTION ETA</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#00ff88', fontFamily: "'Orbitron'" }}>
                    {nextJunction.eta_seconds ? `${nextJunction.eta_seconds} sec` : '15 sec'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.7)', marginTop: 10, fontFamily: "'Share Tech Mono'" }}>
                Approach: <strong>{nextJunction.approach_direction || 'South → North'}</strong>
              </div>
              <div style={{ fontSize: 9, color: '#00ff88', marginTop: 4, fontFamily: "'Share Tech Mono'" }}>
                Preemption: <strong>{nextJunction.corridor_state || 'APPROACHING'}</strong>
              </div>
            </div>
          )}

          <h3 style={{ margin: '0 0 16px 0', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'" }}>
            📊 AMBULANCE & MISSION TELEMETRY
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>AMBULANCE UNIT</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Orbitron'", color: '#fff', marginTop: 2 }}>
                {unitId}
              </div>
              <div style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>
                GPS: {gpsConfidence}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>VELOCITY</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#ff3333', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3333', display: 'inline-block', animation: 'pulse-banner 1s infinite' }} />
                EN ROUTE · {speedKmh} KM/H
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ESTIMATED TRANSIT ETA</div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Orbitron'", color: '#fff', marginTop: 2 }}>
                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
              </div>
            </div>

            <div>
              <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>DESTINATION HOSPITAL</div>
              <div style={{ border: '1px solid rgba(0, 200, 255, 0.15)', borderRadius: 6, padding: 8, marginTop: 4, background: 'rgba(5, 15, 35, 0.4)' }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#00ff88' }}>{hospitalName}</div>
                <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>
                  Trauma Bay preemption lock confirmed
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* TIMELINE / SYSTEM LOG TAIL */}
      <footer style={{
        height: 115, background: '#02050f', borderTop: '1px solid rgba(0, 200, 255, 0.2)',
        display: 'flex', flexDirection: 'column', padding: 10, boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: 9, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.5)', letterSpacing: '0.1em', marginBottom: 4 }}>
          PREEMPTION TIMELINE & EVENT TAIL
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0, 200, 255, 0.1)',
          borderRadius: 4, padding: 8, fontFamily: "'Share Tech Mono'", fontSize: 10, color: '#00ff88',
          display: 'flex', flexDirection: 'column', gap: 3
        }}>
          {logs.map((log, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: 'rgba(160,200,255,0.4)' }}>[TIMELINE]</span>
              <span style={{ color: log.includes('🚨') || log.includes('⚠️') ? '#ff4d63' : '#00ff88' }}>{log}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
