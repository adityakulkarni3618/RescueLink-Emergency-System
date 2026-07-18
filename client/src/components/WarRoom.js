import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MassCasualtyPanel from './MassCasualtyPanel';
import BloodEmergencyNetwork from './BloodEmergencyNetwork';
import VideoCall from './VideoCall';
import { generateMonthlyReport } from '../utils/reportGenerator';
import { exportMetricsToExcel } from '../utils/excelExporter';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ambulanceIcon = L.divIcon({
  className: '',
  html: `<div style="width:26px;height:26px;background:rgba(0,255,136,0.9);border:2px solid #00ff88;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 12px #00ff88;">🚑</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13]
});

function MapCenterer({ center }) {
  const map = useMap();
  const doneRef = useRef(false);
  useEffect(() => {
    if (center && !doneRef.current) {
      map.setView(center, 12, { animate: true });
      doneRef.current = true;
    }
  }, [center, map]);
  return null;
}

function KpiCard({ label, value, unit, color, icon }) {
  return (
    <div style={{
      background: `rgba(${color},0.07)`, border: `1px solid rgba(${color},0.25)`,
      borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 20, marginBottom: 5 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: `rgb(${color})`, fontFamily: "'Orbitron'" }}>{value}</div>
      <div style={{ fontSize: 9, color: `rgba(${color},0.7)`, fontFamily: "'Orbitron'", letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
      {unit && <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.3)', marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

export default function WarRoom({ socket, connected }) {
  const [ambulances, setAmbulances] = useState({});
  const [analyticsData, setAnalyticsData] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [hazards, setHazards] = useState([]);
  const [aiAlert, setAiAlert] = useState(null);
  const [kpis, setKpis] = useState({ total: 0, completed: 0, active: 0, cancelled: 0, successRate: 0 });
  const [connectedRoles, setConnectedRoles] = useState({ user: 0, ambulance: 0, hospital: 0 });
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem('warroom_auth') === '1');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('map'); // map, mass_casualty, blood_bank
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);

  useEffect(() => {
    if (liveIncidents.length > 0 && !selectedIncidentId) {
      setSelectedIncidentId(liveIncidents[0].id);
    }
  }, [liveIncidents, selectedIncidentId]);

  const handleLogin = async () => {
    try {
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'admin@rescuelink.com', password: loginPass, role: 'admin', bypassMFA: true })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        sessionStorage.setItem('rescuelink_token', data.token);
        setIsAuthenticated(true);
        sessionStorage.setItem('warroom_auth', '1');
        setLoginError('');
      } else {
        setLoginError(data.error || 'INVALID GOVERNMENT CREDENTIALS');
      }
    } catch (err) {
      console.error('[ADMIN AUTH ERROR]', err);
      setLoginError('AUTHENTICATION SERVER OFFLINE');
    }
  };

  const exportCSV = () => {
    const headers = 'Mission ID,Type,Time,Response,Outcome,Hospital\n';
    const rows = liveIncidents.map(i =>
      `"${i.id}","${i.type}","${i.time}","${i.response}","${i.outcome}","${i.hospital}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rescuelink_incidents_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const bloodBankMock = [
      { name: 'City Blood Bank & Research Centre', phone: '+91-80-22222222', emergency24x7: true, inventory: {'A+':12,'A-':2,'B+':8,'B-':1,'O+':15,'O-':3,'AB+':5,'AB-':1} },
      { name: 'Red Cross Blood Bank', phone: '+91-80-33333333', emergency24x7: true, inventory: {'A+':6,'A-':0,'B+':14,'B-':3,'O+':9,'O-':0,'AB+':7,'AB-':2} }
    ];
    const paymentsMock = [
      { id: 'TXN-90211', incidentId: 'REQ-101', patientName: 'Suresh Kumar', hospitalName: 'Apollo Hospital', amount: 25000, status: 'Success', timestamp: new Date().toISOString() },
      { id: 'TXN-90212', incidentId: 'REQ-102', patientName: 'Amina Begum', hospitalName: 'City General ER', amount: 18000, status: 'Success', timestamp: new Date().toISOString() }
    ];
    exportMetricsToExcel({
      incidents: liveIncidents.map(i => ({ id: i.id, patientName: i.type, ambulanceId: i.response, hospitalName: i.hospital, status: i.outcome, createdAt: i.time })),
      bloodInventory: bloodBankMock,
      payments: paymentsMock
    });
  };

  const handleExportPDF = () => {
    generateMonthlyReport({
      totalIncidents: `${liveIncidents.length} Cases`,
      avgResponseTime: '8.2 Minutes',
      alsStatus: '98.8%',
      bloodFulfillments: '12 Units',
      insuranceApprovals: '95.1%',
      redTriage: `${liveIncidents.filter(i => (i.type || '').includes('Cardiac') || (i.type || '').includes('Accident')).length} Cases`,
      yellowTriage: `${liveIncidents.filter(i => (i.type || '').includes('Respiratory') || (i.type || '').includes('General')).length} Cases`,
      greenTriage: '4 Cases'
    });
  };

  // Generate traffic/weather hazards near ambulances
  useEffect(() => {
    if (!isAuthenticated) return;
    const newHazards = [];
    Object.values(ambulances).forEach((amb, i) => {
      if (amb.location && i % 2 === 0) {
        newHazards.push({
          id: `haz-${i}`,
          lat: amb.location.lat + (Math.random() - 0.5) * 0.05,
          lng: amb.location.lng + (Math.random() - 0.5) * 0.05,
          radius: 1000 + Math.random() * 2000,
          type: Math.random() > 0.5 ? 'SEVERE TRAFFIC DELAY' : 'WEATHER ALERT',
          color: Math.random() > 0.5 ? '#ff4444' : '#ffb800',
        });
      }
    });
    if (newHazards.length > 0 && hazards.length === 0) setHazards(newHazards);
  }, [ambulances, hazards.length, isAuthenticated]);

  useEffect(() => {
    if (!socket || !connected || !isAuthenticated) return;

    const onAiAlert = (data) => { setAiAlert(data); setTimeout(() => setAiAlert(null), 10000); };
    socket.on('ai-prediction-alert', onAiAlert);
    socket.on('ambulances-update', (data) => setAmbulances(data));
    socket.on('roles-update', (data) => setConnectedRoles(data));

    const token = sessionStorage.getItem('rescuelink_token');
    socket.emit('register-admin', { id: 'ADMIN', token });

    const poll = async () => {
      try {
        const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
        const headers = { 'Authorization': `Bearer ${token || ''}` };
        const [statusRes, analyticsRes] = await Promise.all([
          fetch(`${SERVER_URL}/api/status`, { headers }),
          fetch(`${SERVER_URL}/api/analytics`, { headers }),
        ]);
        const statusData = await statusRes.json();
        const analytics = await analyticsRes.json();
        setKpis({
          total: analytics.totalMissions || 0,
          completed: analytics.completedMissions || 0,
          active: analytics.activeMissions || statusData.activeMissionsCount || 0,
          cancelled: analytics.cancelledMissions || 0,
          successRate: analytics.successRate || 0,
        });
        if (analytics.mockIncidents) setLiveIncidents(analytics.mockIncidents);
        if (analytics.responseData) setAnalyticsData(analytics.responseData);
      } catch (_) { /* server may be temporarily unreachable */ }
    };
    poll();
    const interval = setInterval(poll, 8000);

    return () => {
      clearInterval(interval);
      socket.off('ambulances-update');
      socket.off('ai-prediction-alert');
      socket.off('roles-update');
    };
  }, [socket, connected, isAuthenticated]);

  /* ── Login screen ───────────────────────────────────────────────── */
  if (!isAuthenticated) {
    return (
      <div style={{ height: '100vh', background: '#020611', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani', sans-serif", color: '#e0eaff' }}>
        <div style={{ width: 380, padding: 48, background: 'rgba(5,15,40,0.9)', borderRadius: 16, border: '1px solid rgba(0,255,136,0.3)', textAlign: 'center', boxShadow: '0 0 60px rgba(0,255,136,0.08)' }}>
          <div style={{ fontSize: 52, marginBottom: 20 }}>🏛️</div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 20, color: '#00ff88', marginBottom: 8 }}>GOVERNMENT ACCESS</div>
          <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.4)', marginBottom: 32, letterSpacing: '0.2em' }}>SECURE WAR ROOM TERMINAL</div>
          <div style={{ marginBottom: 20, textAlign: 'left' }}>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 6, fontFamily: "'Orbitron'" }}>ADMIN PASSCODE</div>
            <input
              type="password" value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={{ width: '100%', padding: '14px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, color: '#e0eaff', fontSize: 18, textAlign: 'center', letterSpacing: '0.3em', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {loginError && <div style={{ color: '#ff4444', fontSize: 11, marginBottom: 16, fontWeight: 'bold' }}>{loginError}</div>}
          <button onClick={handleLogin} style={{ width: '100%', padding: 16, background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer', fontSize: 14, letterSpacing: '0.1em' }}>
            AUTHORIZE ACCESS
          </button>
          <div style={{ marginTop: 24, fontSize: 9, color: 'rgba(160,200,255,0.3)', fontStyle: 'italic' }}>
            WARNING: Unauthorized access to city emergency infrastructure is a federal offense.
          </div>
        </div>
      </div>
    );
  }

  const liveAmbs = Object.entries(ambulances).filter(([, a]) => !a.isSimulated);
  const mapCenter = Object.values(ambulances).find(a => a.location)?.location || { lat: 12.9716, lng: 77.5946 };

  /* ── Main dashboard ─────────────────────────────────────────────── */
  return (
    <div style={{ height: '100vh', background: '#020611', fontFamily: "'Rajdhani', sans-serif", color: '#e0eaff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 768px) {
          .warroom-grid {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
          }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: 'rgba(5,20,10,0.98)', borderBottom: '1px solid rgba(0,255,136,0.2)', padding: '10px 450px 10px 24px', display: 'flex', alignItems: 'center', gap: 16, minHeight: 62, height: 'auto', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ fontSize: 24 }}>🏛️</div>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, color: '#88ff88', letterSpacing: '0.1em' }}>GOVERNMENT WAR ROOM — CITY ADMINISTRATION</div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>RESCUELINK ENTERPRISE v2.0 — FLEET COMMAND & ANALYTICS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {[['USERS', connectedRoles.user, '0,255,136'], ['AMBULANCES', connectedRoles.ambulance, '255,107,53'], ['HOSPITALS', connectedRoles.hospital, '0,200,255']].map(([label, val, c]) => (
            <div key={label} style={{ textAlign: 'center', padding: '5px 12px', background: `rgba(${c},0.07)`, border: `1px solid rgba(${c},0.2)`, borderRadius: 6 }}>
              <div style={{ fontSize: 8, color: `rgba(${c},0.6)`, fontFamily: "'Orbitron'", letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: `rgb(${c})`, fontFamily: "'Orbitron'" }}>{val}</div>
            </div>
          ))}
          <button
            onClick={() => { sessionStorage.removeItem('warroom_auth'); window.location.reload(); }}
            style={{ padding: '6px 12px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer', fontWeight: 'bold' }}
          >🚪 LOGOUT</button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 18px', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(0,200,255,0.07)', flexShrink: 0 }}>
        <KpiCard label="TOTAL MISSIONS" value={kpis.total} icon="📋" color="0,200,255" />
        <KpiCard label="ACTIVE NOW" value={kpis.active} icon="🔴" color="255,107,53" />
        <KpiCard label="COMPLETED" value={kpis.completed} icon="✅" color="0,255,136" />
        <KpiCard label="CANCELLED" value={kpis.cancelled} icon="❌" color="255,68,68" />
        <KpiCard label="SUCCESS RATE" value={`${kpis.successRate}%`} icon="📈" color="180,100,255" unit="completed vs total" />
        <KpiCard label="LIVE UNITS" value={liveAmbs.length} icon="🚑" color="255,184,0" unit="real ambulances only" />
      </div>

      {/* ── Main Grid ── */}
      <div className="warroom-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, padding: 14, flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left column: Tabs + Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, borderBottom: '1px solid rgba(0,200,255,0.1)', paddingBottom: 10 }}>
            {[
              { id: 'map', label: '🌍 LIVE FLEET & HEATMAP' },
              { id: 'mass_casualty', label: '⚠️ DISASTER & MASS CASUALTY' },
              { id: 'blood_bank', label: '🩸 NATIONAL BLOOD NETWORK' },
              { id: 'telemedicine', label: '📹 TELEMEDICINE STATUS' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px', background: activeTab === tab.id ? 'rgba(0,200,255,0.15)' : 'transparent',
                  border: `1px solid ${activeTab === tab.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 8, color: activeTab === tab.id ? '#00c8ff' : 'rgba(160,200,255,0.6)',
                  fontFamily: "'Orbitron'", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'map' && (
            <>
              {/* Map */}
              <div style={{ flex: 1, background: 'rgba(5,15,40,0.8)', borderRadius: 10, border: '1px solid rgba(0,200,255,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '9px 14px', borderBottom: '1px solid rgba(0,200,255,0.12)', fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🌍 LIVE FLEET HEATMAP — Active Units & Incident Zones</span>
                  <button onClick={() => setHazards(prev => prev.length ? [] : [
                    { id: 1, lat: mapCenter.lat + 0.01, lng: mapCenter.lng + 0.01, radius: 2000, color: '#ff4444', type: 'High Incident Zone' },
                    { id: 2, lat: mapCenter.lat - 0.02, lng: mapCenter.lng - 0.01, radius: 1500, color: '#ff8800', type: 'Traffic Gridlock' }
                  ])} style={{ padding: '4px 10px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: 4, color: '#ff4444', fontSize: 9, cursor: 'pointer', fontWeight: 'bold' }}>
                    🔥 TOGGLE HOTSPOT HEATMAP
                  </button>
                </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap" />
                <MapCenterer center={mapCenter} />
                {Object.entries(ambulances).map(([id, amb]) => {
                  if (!amb.location) return null;
                  return (
                    <Marker key={id} position={[amb.location.lat, amb.location.lng]} icon={ambulanceIcon}>
                      <Popup>
                        <div style={{ color: '#000', minWidth: 140 }}>
                          <strong>{amb.unitId || id.slice(-8)}</strong><br />
                          {amb.driverName || 'On Duty'}<br />
                          <span style={{ color: amb.available ? 'green' : 'red', fontWeight: 'bold' }}>
                            {amb.available ? '🟢 AVAILABLE' : '🔴 DISPATCHED'}
                          </span>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                {hazards.map(h => (
                  <Circle key={h.id} center={[h.lat, h.lng]} radius={h.radius} pathOptions={{ color: h.color, fillColor: h.color, fillOpacity: 0.14 }}>
                    <Popup><div style={{ color: h.color, fontWeight: 'bold' }}>{h.type}</div><div style={{ fontSize: 11, color: '#000' }}>Radius: {(h.radius / 1000).toFixed(1)} km</div></Popup>
                  </Circle>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Incident Ledger */}
          <div style={{ height: 220, background: 'rgba(5,15,40,0.8)', borderRadius: 10, border: '1px solid rgba(0,200,255,0.15)', padding: 14, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff' }}>📼 INCIDENT LEDGER — Last 15 Missions</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleExportExcel} style={{ padding: '4px 8px', background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 4, color: '#ffb800', fontSize: 9, fontFamily: "'Orbitron'", cursor: 'pointer', fontWeight: 'bold' }}>
                  📊 EXPORT EXCEL
                </button>
                <button onClick={handleExportPDF} style={{ padding: '4px 8px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 4, color: '#00c8ff', fontSize: 9, fontFamily: "'Orbitron'", cursor: 'pointer', fontWeight: 'bold' }}>
                  📄 MINISTRY PDF
                </button>
                <button onClick={exportCSV} style={{ padding: '4px 8px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, color: '#00ff88', fontSize: 9, fontFamily: "'Orbitron'", cursor: 'pointer', fontWeight: 'bold' }}>
                  ⬇ EXPORT CSV
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'rgba(5,15,40,0.97)' }}>
                  <tr style={{ color: 'rgba(160,200,255,0.5)', borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
                    {['MISSION ID', 'INCIDENT TYPE', 'TIME', 'RESPONSE', 'OUTCOME', 'HOSPITAL'].map(h => (
                      <th key={h} style={{ padding: '5px 7px', fontFamily: "'Orbitron'", fontSize: 8, letterSpacing: '0.05em', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveIncidents.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'rgba(160,200,255,0.3)', padding: 20, fontStyle: 'italic' }}>No missions recorded yet. Start a dispatch to see data here.</td></tr>
                  )}
                  {liveIncidents.map((inc, i) => (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedIncidentId(inc.id)}
                      style={{ 
                        borderBottom: '1px solid rgba(0,200,255,0.04)',
                        cursor: 'pointer',
                        background: selectedIncidentId === inc.id ? 'rgba(0,200,255,0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '7px', color: '#00c8ff', fontFamily: "'Share Tech Mono'", fontSize: 9 }}>
                        {selectedIncidentId === inc.id ? '▶ ' : ''}{String(inc.id).slice(-12)}
                      </td>
                      <td style={{ padding: '7px', color: '#e0eaff', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.type}</td>
                      <td style={{ padding: '7px', color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>{inc.time}</td>
                      <td style={{ padding: '7px', color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>{inc.response}</td>
                      <td style={{ padding: '7px' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 'bold',
                          background: inc.outcome === 'Stabilised' ? 'rgba(0,255,136,0.15)' : inc.outcome === 'Cancelled' ? 'rgba(255,68,68,0.15)' : 'rgba(255,184,0,0.15)',
                          color: inc.outcome === 'Stabilised' ? '#00ff88' : inc.outcome === 'Cancelled' ? '#ff4444' : '#ffb800',
                        }}>{inc.outcome}</span>
                      </td>
                      <td style={{ padding: '7px', color: 'rgba(160,200,255,0.5)', fontSize: 9 }}>{String(inc.hospital).slice(0, 14)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
          )}

          {activeTab === 'mass_casualty' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <MassCasualtyPanel socket={socket} />
            </div>
          )}

          {activeTab === 'blood_bank' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <BloodEmergencyNetwork socket={socket} userLocation={mapCenter} />
            </div>
          )}

          {activeTab === 'telemedicine' && (
            <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(7,22,44,0.8)', borderRadius: 10, padding: 20, border: '1px solid rgba(0,200,255,0.15)' }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#8050ff', marginBottom: 12 }}>📹 SPECIALIST CONSULTATION LOGS & TELEMEDICINE STATUS</div>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', lineHeight: 1.6, marginBottom: 20 }}>
                This portal monitors active clinical consult requests routed to senior specialists across the city hospital network.
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 14 }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10 }}>⚡ ACTIVE TELEMEDICINE COMMAND LINK</div>
                {selectedIncidentId ? (
                  <VideoCall socket={socket} role="admin" missionId={selectedIncidentId} />
                ) : (
                  <div style={{ color: 'rgba(160,200,255,0.4)', fontStyle: 'italic', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                    Select an active mission from the ledger to establish a command link.
                  </div>
                )}
              </div>
            </div>
          )}


        </div>

        {/* Right column: Charts + Fleet */}
        <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 10, border: '1px solid rgba(0,200,255,0.15)', padding: 16, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', minHeight: 0 }}>

          {/* Response Time Area Chart */}
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10 }}>⏱ RESPONSE TIME TREND (Last 12 Hours)</div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="respGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ff4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
                  <XAxis dataKey="time" stroke="rgba(160,200,255,0.3)" tick={{ fontSize: 8 }} />
                  <YAxis stroke="rgba(160,200,255,0.3)" tick={{ fontSize: 8 }} unit="m" />
                  <RechartsTooltip
                    contentStyle={{ background: '#050d1a', border: '1px solid #ff4444', fontSize: 11, borderRadius: 6 }}
                    labelStyle={{ color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 9 }}
                  />
                  <Area type="monotone" dataKey="avgResponseTimeMin" stroke="#ff4444" fill="url(#respGrad)" strokeWidth={2} name="Avg Response (min)" dot={{ r: 2, fill: '#ff4444' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.3)', marginTop: 5, fontStyle: 'italic' }}>
              ⚠ Peak delays 17:00–19:00. Recommend pre-deployment to high-risk corridors.
            </div>
          </div>

          {/* Incident Frequency Bar Chart */}
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10 }}>📊 INCIDENT FREQUENCY (Last 12 Hours)</div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.06)" />
                  <XAxis dataKey="time" stroke="rgba(160,200,255,0.3)" tick={{ fontSize: 8 }} />
                  <YAxis stroke="rgba(160,200,255,0.3)" tick={{ fontSize: 8 }} />
                  <RechartsTooltip contentStyle={{ background: '#050d1a', border: '1px solid #00ff88', fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="incidents" fill="#00ff88" name="Incidents" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fleet Status */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10 }}>🚑 LIVE FLEET STATUS</div>
            {liveAmbs.length === 0 ? (
              <div style={{ color: 'rgba(160,200,255,0.3)', fontSize: 12, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
                No live ambulances connected yet.
              </div>
            ) : (
              liveAmbs.map(([id, amb]) => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(0,200,255,0.05)' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#e0eaff', fontWeight: 'bold' }}>{amb.unitId || id.slice(-8)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>{amb.driverName || 'On Duty'}</div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 'bold',
                    background: amb.available ? 'rgba(0,255,136,0.15)' : 'rgba(255,107,53,0.15)',
                    color: amb.available ? '#00ff88' : '#ff6b35',
                  }}>
                    {amb.available ? 'AVAILABLE' : 'DISPATCHED'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* AI Alert Toast */}
      {aiAlert && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 12000, width: 360, background: 'rgba(255,107,53,0.1)', border: '2px solid #ff6b35', borderRadius: 10, padding: 18, backdropFilter: 'blur(10px)', boxShadow: '0 0 30px rgba(255,107,53,0.25)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>🧠</div>
            <div>
              <div style={{ fontSize: 10, color: '#ff6b35', fontFamily: "'Orbitron'", fontWeight: 'bold', marginBottom: 4 }}>GLOBAL AI PREDICTION ALERT</div>
              <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{aiAlert.message}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
