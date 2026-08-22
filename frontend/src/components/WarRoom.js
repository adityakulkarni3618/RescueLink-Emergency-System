import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, Polyline } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MassCasualtyPanel from './MassCasualtyPanel';
import BloodEmergencyNetwork from './BloodEmergencyNetwork';
import VideoCall from './VideoCall';
import EmergencyCorridorPanel from './EmergencyCorridorPanel';
import OfflineTileLayer from './OfflineTileLayer';
import { generateMonthlyReport } from '../utils/reportGenerator';
import { exportMetricsToExcel } from '../utils/excelExporter';
import PhysiologicalWaveforms from './PhysiologicalWaveforms';

try {
  if (typeof window !== 'undefined' && L && L.Icon && L.Icon.Default) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }
} catch (e) {
  console.warn('[LEAFLET ICON PATCH ERROR]', e);
}

let ambulanceIcon = null;
try {
  if (typeof window !== 'undefined' && L && L.divIcon) {
    ambulanceIcon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:rgba(0,255,136,0.9);border:2px solid #00ff88;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 12px #00ff88;">🚑</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
  }
} catch (e) {}

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

export default function WarRoom({ socket, connected, onLogout, onSwitchRole, onShowSecurity }) {
  const [ambulances, setAmbulances] = useState({});
  const [hospitals, setHospitals] = useState({});
  const [analyticsData, setAnalyticsData] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [hazards, setHazards] = useState([]);
  const [aiAlert, setAiAlert] = useState(null);
  const [kpis, setKpis] = useState({ total: 0, completed: 0, active: 0, cancelled: 0, successRate: 0 });
  const [connectedRoles, setConnectedRoles] = useState({ user: 0, ambulance: 0, hospital: 0 });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (sessionStorage.getItem('warroom_auth') === '1') return true;
    try {
      const userStr = sessionStorage.getItem('rescuelink_user');
      const token = sessionStorage.getItem('rescuelink_token');
      if (userStr && token) {
        const user = JSON.parse(userStr);
        if (user.role === 'city_admin') {
          return true;
        }
      }
    } catch (e) {
      console.error('[WARROOM AUTO-AUTH] Error parsed:', e);
    }
    return false;
  });
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('map'); // map, mass_casualty, blood_bank
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedIncidentDetails, setSelectedIncidentDetails] = useState(null);
  const [stuckMissions, setStuckMissions] = useState({});
  const [unresponsiveDrivers, setUnresponsiveDrivers] = useState(new Set());

  // AI Predictive Routing states
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  // OSRM Routing states
  const [routeToPatient, setRouteToPatient] = useState([]);
  const [routeToHospital, setRouteToHospital] = useState([]);

  // Fetch navigation path from OSRM public API
  const fetchOSRMRoute = async (start, end) => {
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        return data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
      }
    } catch (e) {
      console.error('[OSRM ERROR] Route generation failed:', e);
    }
    return [];
  };

  // NEWS2 scoring helper
  const calculateNews2Score = (vitals) => {
    if (!vitals) return 0;
    let score = 0;
    const hr = Number(vitals.heartRate);
    if (hr) {
      if (hr <= 40 || hr >= 131) score += 3;
      else if (hr <= 50 || hr >= 111) score += 1;
      else if (hr <= 90) score += 0;
      else if (hr <= 110) score += 1;
    }
    const spo2 = Number(vitals.spo2);
    if (spo2) {
      if (spo2 <= 91) score += 3;
      else if (spo2 <= 93) score += 2;
      else if (spo2 <= 95) score += 1;
    }
    const sys = Number(vitals.systolic);
    if (sys) {
      if (sys <= 90 || sys >= 220) score += 3;
      else if (sys <= 100) score += 2;
      else if (sys <= 110) score += 1;
    }
    return score;
  };

  useEffect(() => {
    if (!selectedIncidentDetails) {
      setAiRecommendations([]);
      return;
    }
    const fetchAiRouting = async () => {
      const loc = selectedIncidentDetails.userLocation;
      if (!loc || !loc.lat || !loc.lng) return;
      setAiLoading(true);
      try {
        const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
        const res = await fetch(`${SERVER_URL}/api/ai/predictive-hospital`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: loc.lat,
            lng: loc.lng,
            news2: selectedIncidentDetails.vitals ? calculateNews2Score(selectedIncidentDetails.vitals) : 0
          })
        });
        const data = await res.json();
        if (res.ok) {
          setAiRecommendations(data.recommendations);
        }
      } catch (err) {
        console.error('[WAR ROOM AI] Failed to fetch predictive routing:', err);
      } finally {
        setAiLoading(false);
      }
    };
    fetchAiRouting();
  }, [selectedIncidentDetails, selectedIncidentId]);

  // Compute road navigation paths using OSRM
  useEffect(() => {
    if (!selectedIncidentDetails) {
      setRouteToPatient([]);
      setRouteToHospital([]);
      return;
    }

    const computeRoutes = async () => {
      const userLoc = selectedIncidentDetails.userLocation;
      const ambLoc = selectedIncidentDetails.ambulanceLocation;
      const hospId = selectedIncidentDetails.hospitalId || selectedIncidentDetails.destinationId;

      // 1. Calculate path from ambulance to patient
      if (ambLoc && userLoc) {
        const path = await fetchOSRMRoute(ambLoc, userLoc);
        setRouteToPatient(path);
      } else {
        setRouteToPatient([]);
      }

      // 2. Calculate path from patient to assigned hospital
      let hospitalCoords = null;
      if (hospId) {
        const hosp = Object.values(hospitals).find(h => h.id === hospId);
        if (hosp) {
          hospitalCoords = { lat: hosp.latitude, lng: hosp.longitude };
        }
      }

      if (userLoc && hospitalCoords) {
        const path = await fetchOSRMRoute(userLoc, hospitalCoords);
        setRouteToHospital(path);
      } else {
        setRouteToHospital([]);
      }
    };

    computeRoutes();
  }, [selectedIncidentDetails, selectedIncidentId, hospitals]);

  useEffect(() => {
    if (!socket || !selectedIncidentId) {
      setSelectedIncidentDetails(null);
      return;
    }

    // Request active mission state
    socket.emit('get-mission-data', selectedIncidentId);

    const onRejoin = (data) => {
      if (data && (data.id === selectedIncidentId || data.reqId === selectedIncidentId)) {
        setSelectedIncidentDetails(data);
      }
    };

    const onVitals = (data) => {
      if (data && data.reqId === selectedIncidentId) {
        setSelectedIncidentDetails(prev => {
          if (!prev) return null;
          return { ...prev, vitals: data };
        });
      }
    };

    const onChecklist = (data) => {
      if (data && data.reqId === selectedIncidentId) {
        setSelectedIncidentDetails(prev => {
          if (!prev) return null;
          return { ...prev, checklist: data.checklist };
        });
      }
    };

    const onLocks = (data) => {
      if (data && data.reqId === selectedIncidentId) {
        setSelectedIncidentDetails(prev => {
          if (!prev) return null;
          return { ...prev, readyServices: data.locks };
        });
      }
    };

    const onPatient = (data) => {
      if (data && data.reqId === selectedIncidentId) {
        setSelectedIncidentDetails(prev => {
          if (!prev) return null;
          return { ...prev, patientDetails: { ...prev.patientDetails, ...data } };
        });
      }
    };

    const onHospitalResponse = (data) => {
      if (data && data.reqId === selectedIncidentId) {
        setSelectedIncidentDetails(prev => {
          if (!prev) return null;
          return {
            ...prev,
            attendingDoctorName: data.attendingDoctorName,
            attendingDoctorSpecialty: data.attendingDoctorSpecialty,
            attendingTeamDetails: data.attendingTeamDetails,
            readyServices: data.readyServices
          };
        });
      }
    };

    socket.on('rejoin-mission', onRejoin);
    socket.on('vitals-update', onVitals);
    socket.on('clinical-checklist-update', onChecklist);
    socket.on('hospital-resources-locked', onLocks);
    socket.on('patient-data', onPatient);
    socket.on('hospital-request-response', onHospitalResponse);

    return () => {
      socket.off('rejoin-mission', onRejoin);
      socket.off('vitals-update', onVitals);
      socket.off('clinical-checklist-update', onChecklist);
      socket.off('hospital-resources-locked', onLocks);
      socket.off('patient-data', onPatient);
      socket.off('hospital-request-response', onHospitalResponse);
    };
  }, [socket, selectedIncidentId]);

  useEffect(() => {
    if (liveIncidents.length > 0 && !selectedIncidentId) {
      setSelectedIncidentId(liveIncidents[0].id);
    }
  }, [liveIncidents, selectedIncidentId]);

  const handleLogin = async () => {
    try {
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const res = await fetch('/api/auth/login', {
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
    socket.on('hospitals-update', (data) => setHospitals(data));
    socket.on('roles-update', (data) => setConnectedRoles(data));

    const token = sessionStorage.getItem('rescuelink_token');
    socket.emit('register-admin', { id: 'ADMIN', token });

    const poll = async () => {
      try {
        const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
        const headers = { 'Authorization': `Bearer ${token || ''}` };
        const [statusRes, analyticsRes] = await Promise.all([
          fetch('/api/status', { headers }),
          fetch('/api/analytics', { headers }),
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

    const onStuckCase = (data) => {
      setStuckMissions(prev => ({ ...prev, [data.reqId]: data.duration }));
    };
    const onDriverUnresponsive = (data) => {
      setUnresponsiveDrivers(prev => {
        const next = new Set(prev);
        next.add(data.reqId);
        return next;
      });
      if ('speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('Warning. Paramedic heartbeat lost on active mission.'));
      }
    };
    const onMissionCompleted = (data) => {
      setStuckMissions(prev => {
        const next = { ...prev };
        delete next[data.reqId];
        return next;
      });
      setUnresponsiveDrivers(prev => {
        const next = new Set(prev);
        next.delete(data.reqId);
        return next;
      });
      if (selectedIncidentId === data.reqId) {
        setSelectedIncidentId(null);
      }
    };

    socket.on('warroom:stuck-case', onStuckCase);
    socket.on('warroom:driver-unresponsive', onDriverUnresponsive);
    socket.on('mission-completed', onMissionCompleted);

    return () => {
      clearInterval(interval);
      socket.off('ambulances-update');
      socket.off('hospitals-update');
      socket.off('ai-prediction-alert');
      socket.off('roles-update');
      socket.off('warroom:stuck-case', onStuckCase);
      socket.off('warroom:driver-unresponsive', onDriverUnresponsive);
      socket.off('mission-completed', onMissionCompleted);
    };
  }, [socket, connected, isAuthenticated, selectedIncidentId]);

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
      <div style={{ background: 'rgba(5,20,10,0.98)', borderBottom: '1px solid rgba(0,255,136,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16, minHeight: 62, height: 'auto', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ fontSize: 24 }}>🏛️</div>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, color: '#88ff88', letterSpacing: '0.1em' }}>GOVERNMENT WAR ROOM — CITY ADMINISTRATION</div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>RESCUELINK ENTERPRISE v2.0 — FLEET COMMAND & ANALYTICS</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['USERS', connectedRoles.user, '0,255,136'], ['AMBULANCES', connectedRoles.ambulance, '255,107,53'], ['HOSPITALS', connectedRoles.hospital, '0,200,255']].map(([label, val, c]) => (
            <div key={label} style={{ textAlign: 'center', padding: '5px 12px', background: `rgba(${c},0.07)`, border: `1px solid rgba(${c},0.2)`, borderRadius: 6 }}>
              <div style={{ fontSize: 8, color: `rgba(${c},0.6)`, fontFamily: "'Orbitron'", letterSpacing: '0.08em' }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: `rgb(${c})`, fontFamily: "'Orbitron'" }}>{val}</div>
            </div>
          ))}
          
          {/* Action buttons embedded natively in the flex layout */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 15 }}>
            <button onClick={onSwitchRole} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10, borderColor: 'rgba(0,255,136,0.3)', color: '#00ff88' }}>
              ROLE 🔄
            </button>
            <button onClick={onShowSecurity} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10, borderColor: 'rgba(0,255,136,0.3)', color: '#00ff88' }}>
              SECURITY 🛡️
            </button>
            <button onClick={onLogout} className="rl-btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 10, background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)', border: 'none', color: '#fff' }}>
              LOGOUT ⏻
            </button>
          </div>
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
          <div style={{ display: 'flex', gap: 10, flexShrink: 0, borderBottom: '1px solid rgba(0,200,255,0.1)', paddingBottom: 10, position: 'relative', alignItems: 'center' }}>
            <div className="desktop-nav-group" style={{ display: 'flex', gap: 10 }}>
              {[
                { id: 'map', label: '🌍 LIVE FLEET & HEATMAP' },
                { id: 'mass_casualty', label: '⚠️ DISASTER & MASS CASUALTY' },
                { id: 'blood_bank', label: '🩸 NATIONAL BLOOD NETWORK' },
                { id: 'telemedicine', label: '📹 TELEMEDICINE STATUS' },
                { id: 'privacy', label: '🔐 PRIVACY & ERASURE (DPDP)' },
                { id: 'approvals', label: '🛡️ REGISTRATION APPROVALS' },
                { id: 'authority', label: '👥 REGISTER AUTHORITY' },
                { id: 'ledger', label: '⛓️ CRYPTOGRAPHIC AUDIT LEDGER' },
                { id: 'registry', label: '📋 ENTITY REGISTRY' }
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
            
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button className="mobile-nav-trigger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                ☰ VIEW TABS
              </button>
              {mobileMenuOpen && (
                <div className="mobile-nav-dropdown" style={{ left: 0, right: 'auto' }}>
                  {[
                    { id: 'map', label: '🌍 LIVE FLEET & HEATMAP' },
                    { id: 'mass_casualty', label: '⚠️ DISASTER & MASS CASUALTY' },
                    { id: 'blood_bank', label: '🩸 NATIONAL BLOOD NETWORK' },
                    { id: 'telemedicine', label: '📹 TELEMEDICINE STATUS' },
                    { id: 'privacy', label: '🔐 PRIVACY & ERASURE (DPDP)' },
                    { id: 'approvals', label: '🛡️ REGISTRATION APPROVALS' },
                    { id: 'authority', label: '👥 REGISTER AUTHORITY' },
                    { id: 'ledger', label: '⛓️ CRYPTOGRAPHIC AUDIT LEDGER' },
                    { id: 'registry', label: '📋 ENTITY REGISTRY' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                      style={{
                        padding: '10px 16px', background: activeTab === tab.id ? 'rgba(0,200,255,0.15)' : 'transparent',
                        border: `1px solid ${activeTab === tab.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8, color: activeTab === tab.id ? '#00c8ff' : 'rgba(160,200,255,0.6)',
                        fontFamily: "'Orbitron'", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 400,
                        cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
                <OfflineTileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap" />
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
                {routeToPatient.length > 0 && (
                  <Polyline positions={routeToPatient} pathOptions={{ color: '#00ff88', weight: 4, opacity: 0.85, dashArray: '6, 12' }} />
                )}
                {routeToHospital.length > 0 && (
                  <Polyline positions={routeToHospital} pathOptions={{ color: '#00c8ff', weight: 4, opacity: 0.85 }} />
                )}
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
                        {selectedIncidentId === inc.id ? '▶ ' : ''}
                        {String(inc.id).slice(-12)}
                        {!!stuckMissions[inc.id] && (
                          <span className="blink-fast" style={{ marginLeft: 6, color: '#ff4444', fontSize: 8, background: 'rgba(255,68,68,0.15)', padding: '2px 4px', borderRadius: 4, fontWeight: 'bold' }}>
                            ⚠️ STUCK
                          </span>
                        )}
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

          {activeTab === 'privacy' && (
            <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(5,15,40,0.8)', borderRadius: 10, padding: 20, border: '1px solid rgba(0,200,255,0.15)', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00ff88', marginBottom: 12 }}>🔐 DPDP ACT 2023 - RIGHT TO ERASURE & AUDIT CENTER</div>
              
              {/* Review pending erasures */}
              <PendingErasureReviews SERVER_URL_CONST={process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com')} />
              
              {/* General Consent Access Logs */}
              <ConsentAccessLogs SERVER_URL_CONST={process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com')} />
            </div>
          )}

          {activeTab === 'ledger' && (
            <LedgerExplorer />
          )}

          {activeTab === 'approvals' && (
            <RegistrationApprovals />
          )}

          {activeTab === 'registry' && (
            <RegistryPanel />
          )}

          {activeTab === 'authority' && (() => {
            let isSuperAdmin = false;
            try {
              const u = JSON.parse(sessionStorage.getItem('rescuelink_user') || '{}');
              isSuperAdmin = u.email === 'admin@rescuelink.com';
            } catch (e) {}
            if (!isSuperAdmin) return (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 48 }}>🔒</div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ff4444' }}>SUPER ADMIN ACCESS ONLY</div>
                <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', textAlign: 'center', maxWidth: 320 }}>
                  Only the super administrator (admin@rescuelink.com) has permission to register new War Room authorities.
                </div>
              </div>
            );
            return (
              <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(5,15,40,0.8)', borderRadius: 10, padding: 24, border: '1px solid rgba(0,255,136,0.15)' }}>
                <h3 style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00ff88', borderBottom: '1px solid rgba(0,255,136,0.2)', paddingBottom: 10, margin: '0 0 20px', letterSpacing: '0.1em' }}>
                  🏛️ WAR ROOM — COMMAND AUTHORITY MANAGEMENT
                </h3>
                <p style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', lineHeight: 1.6, marginBottom: 24 }}>
                  As Super Admin, you can register official government authorities to access this War Room. Each registered commander will be able to log in with their personal credentials.
                </p>
                <AuthorityRegistrationForm />
              </div>
            );
          })()}


        </div>

        {/* Right column: Charts + Fleet */}
        <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 10, border: '1px solid rgba(0,200,255,0.15)', padding: 16, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', minHeight: 0 }}>

          {/* Selected Incident Telemetry Replica */}
          {selectedIncidentDetails && (
            <div style={{ background: 'rgba(0,10,30,0.6)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,200,255,0.15)', paddingBottom: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', fontWeight: 'bold' }}>📡 INCIDENT TELEMETRY REPLICA</span>
                <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.5)' }}>
                  CODE: {selectedIncidentDetails.id ? `RL-${selectedIncidentDetails.id.replace(/-/g, '').slice(-4).toUpperCase()}` : 'N/A'}
                </span>
              </div>

              {unresponsiveDrivers.has(selectedIncidentDetails.id) && (
                <div style={{
                  background: 'rgba(255,51,51,0.15)', border: '1px solid #ff3333', borderRadius: 6,
                  padding: '8px 10px', color: '#ff3333', fontSize: 10, fontWeight: 'bold',
                  marginBottom: 12, textAlign: 'center', animation: 'pulse-glow 1.5s infinite'
                }}>
                  ⚠️ PARAMEDIC HEARTBEAT LOST! Driver unresponsive.
                </div>
              )}

              {/* Vitals Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: "'Orbitron'" }}>HEART RATE</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4444', fontFamily: "'Share Tech Mono'" }}>
                    {selectedIncidentDetails.vitals?.heartRate || '---'} <span style={{ fontSize: 8 }}>BPM</span>
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: "'Orbitron'" }}>OXYGEN (SpO2)</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>
                    {selectedIncidentDetails.vitals?.spo2 || '---'}<span style={{ fontSize: 10 }}>%</span>
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: "'Orbitron'" }}>BLOOD PRESS.</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>
                    {selectedIncidentDetails.vitals?.systolic || '---'}/{selectedIncidentDetails.vitals?.diastolic || '---'}
                  </div>
                </div>
              </div>

              {/* Physiological Telemetry Streams */}
              {selectedIncidentDetails.vitals && (
                <div style={{ marginBottom: 12 }}>
                  <PhysiologicalWaveforms 
                    vitals={selectedIncidentDetails.vitals} 
                    news2Score={calculateNews2Score(selectedIncidentDetails.vitals)} 
                  />
                </div>
              )}

              {/* Medical Team Assignment */}
              <div style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.1)', padding: 10, borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#00c8ff', fontFamily: "'Orbitron'", fontWeight: 'bold', marginBottom: 4 }}>🏥 ASSIGNED MEDICAL TEAM</div>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
                  Attending: {selectedIncidentDetails.attendingDoctorName || 'Pending Assignment'}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginTop: 2 }}>
                  Specialty: {selectedIncidentDetails.attendingDoctorSpecialty || 'N/A'}
                </div>
                {selectedIncidentDetails.attendingTeamDetails?.nurses && selectedIncidentDetails.attendingTeamDetails.nurses.length > 0 && (
                  <div style={{ fontSize: 9, color: 'rgba(0,255,136,0.8)', marginTop: 4, fontFamily: "'Share Tech Mono'" }}>
                    Roster: {selectedIncidentDetails.attendingTeamDetails.nurses.join(', ')}
                  </div>
                )}
              </div>

              {/* Locked Resources */}
              {selectedIncidentDetails.readyServices && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                  {Object.entries(selectedIncidentDetails.readyServices).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, border: `1px solid ${val ? '#ffb800' : 'rgba(255,255,255,0.05)'}` }}>
                      <span style={{ fontSize: 10 }}>{val ? '🔒' : '○'}</span>
                      <span style={{ fontSize: 9, color: val ? '#ffb800' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                        {key.replace(/([A-Z])/g, ' $1')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Predictive Dispatch Recommendations */}
              <div style={{ background: 'rgba(0,10,35,0.7)', border: '1px solid rgba(0,255,136,0.2)', padding: 10, borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>🧠 AI PREDICTIVE ROUTING MATCH</span>
                  <span style={{ fontSize: 8, color: 'rgba(0,255,136,0.6)' }}>LIVE CAPACITY FLOW</span>
                </div>
                {aiLoading ? (
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontStyle: 'italic' }}>Computing optimal transit matching...</div>
                ) : aiRecommendations.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontStyle: 'italic' }}>No recommendations computed.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {aiRecommendations.slice(0, 2).map((rec, idx) => (
                      <div key={rec.id} style={{ background: idx === 0 ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${idx === 0 ? '#00ff8855' : 'rgba(255,255,255,0.05)'}`, borderRadius: 4, padding: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold' }}>
                          <span style={{ color: idx === 0 ? '#00ff88' : '#e0eaff' }}>{idx === 0 ? '🏆 ' : ''}{rec.name}</span>
                          <span style={{ color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>{rec.score} pts</span>
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', marginTop: 2 }}>
                          Distance: {rec.distanceKm} km | ICU: {rec.icuBeds} | Vent: {rec.ventilators}
                        </div>
                        <div style={{ fontSize: 8, color: idx === 0 ? '#00ff88cc' : 'rgba(160,200,255,0.5)', fontStyle: 'italic', marginTop: 2 }}>
                          {rec.rationale}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Checklist */}
              {selectedIncidentDetails.checklist && Object.keys(selectedIncidentDetails.checklist).length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 6 }}>📋 FIELD PROCEDURES IN PROGRESS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 100, overflowY: 'auto' }}>
                    {Object.entries(selectedIncidentDetails.checklist).map(([step, time]) => (
                      <div key={step} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                        <span style={{ color: '#00ff88' }}>✓ {step}</span>
                        <span style={{ color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginLeft: 'auto' }}>{time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Administrative Actions */}
              <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(0,200,255,0.15)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>🛡️ ADMIN OVERRIDES</div>
                
                {/* Ambulance Reassign Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)' }}>REASSIGN PARAMEDIC UNIT:</label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        socket.emit('reassign-ambulance', { reqId: selectedIncidentDetails.id, newAmbulanceId: e.target.value });
                        e.target.value = ''; // reset
                      }
                    }}
                    style={{
                      background: 'rgba(5,15,40,0.9)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 6,
                      color: '#fff', fontSize: 11, padding: 6, outline: 'none'
                    }}
                  >
                    <option value="">-- Choose Paramedic Unit --</option>
                    {Object.entries(ambulances).filter(([_, amb]) => amb.available && amb.is_active !== false).map(([id, amb]) => (
                      <option key={amb.unitId || id} value={amb.unitId || id}>
                        {amb.unitId || 'Paramedic Unit'} ({amb.driverName || 'On Duty'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Force Close Button */}
                <button
                  onClick={() => {
                    const reason = prompt('Enter mandatory reason for administrative closure:');
                    if (reason === null) return; // cancelled
                    if (!reason.trim()) {
                      alert('A reason is mandatory for auditing purposes!');
                      return;
                    }
                    socket.emit('force-close-mission', { reqId: selectedIncidentDetails.id, reason, operatorName: 'Command Operator' });
                  }}
                  style={{
                    background: 'rgba(255,51,51,0.1)', border: '1px solid #ff3333', borderRadius: 6,
                    color: '#ff3333', fontSize: 11, padding: '8px 12px', cursor: 'pointer', fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.background = 'rgba(255,51,51,0.2)'}
                  onMouseLeave={(e) => e.target.style.background = 'rgba(255,51,51,0.1)'}
                >
                  ⚠️ FORCE CLOSE MISSION (AUDITED)
                </button>
              </div>

              {/* AI Emergency Corridor Preemption Control Panel */}
              <div style={{ marginTop: 15 }}>
                <EmergencyCorridorPanel socket={socket} incidentId={selectedIncidentDetails.id} isControlPanel={true} />
              </div>
            </div>
          )}

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

function RegistryPanel() {
  const [entityTab, setEntityTab] = useState('hospitals'); // hospitals, ambulances, patients
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewModal, setViewModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
  const token = sessionStorage.getItem('rescuelink_token') || '';
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      let url = '';
      if (entityTab === 'hospitals') url = '/api/hospitals/all';
      else if (entityTab === 'ambulances') url = '/api/ambulances';
      else url = '/api/users';

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('Fetch failed');
      let list = await res.json();

      // Filter patients only
      if (entityTab === 'patients') {
        list = list.filter(u => u.role === 'patient');
      }

      setData(list);
    } catch (err) {
      console.error('[REGISTRY] Fetch error:', err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [entityTab]);

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filtering
  const filtered = data.filter(row => {
    const name = (row.name || row.vehicleNo || row.driverName || '').toLowerCase();
    const id = (row.id || '').toLowerCase();
    const email = (row.email || row.contactInfo || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || name.includes(q) || id.includes(q) || email.includes(q);

    const created = row.createdAt ? new Date(row.createdAt) : null;
    const matchFrom = !dateFrom || (created && created >= new Date(dateFrom));
    const matchTo = !dateTo || (created && created <= new Date(dateTo + 'T23:59:59'));

    return matchSearch && matchFrom && matchTo;
  });

  const handleSuspend = async (row) => {
    if (!window.confirm(`Suspend ${row.name || row.vehicleNo}? They will not be able to log in.`)) return;
    setActionLoading(row.id + '-suspend');
    try {
      let url = '';
      if (entityTab === 'hospitals') url = `/api/hospitals/${row.id}/suspend`;
      else if (entityTab === 'ambulances') url = `/api/ambulances/${row.id}/suspend`;
      else url = `/api/users/${row.id}/suspend`;
      const res = await fetch(url, { method: 'PUT', headers });
      if (!res.ok) throw new Error('Suspend failed');
      showToast(`${row.name || row.vehicleNo} suspended`);
      fetchData();
    } catch (err) { showToast('Suspend failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleRestore = async (row) => {
    setActionLoading(row.id + '-restore');
    try {
      let url = '';
      if (entityTab === 'hospitals') url = `/api/hospitals/${row.id}/restore`;
      else if (entityTab === 'ambulances') url = `/api/ambulances/${row.id}/restore`;
      else url = `/api/users/${row.id}/restore`;
      const res = await fetch(url, { method: 'PUT', headers });
      if (!res.ok) throw new Error('Restore failed');
      showToast(`${row.name || row.vehicleNo} restored`);
      fetchData();
    } catch (err) { showToast('Restore failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleRemove = async (row) => {
    const label = row.name || row.vehicleNo || row.email;
    if (!window.confirm(`PERMANENTLY REMOVE "${label}"? This cannot be undone.`)) return;
    setActionLoading(row.id + '-remove');
    try {
      let url = '';
      if (entityTab === 'hospitals') url = `/api/hospitals/${row.id}`;
      else if (entityTab === 'ambulances') url = `/api/ambulances/${row.id}`;
      else url = `/api/users/${row.id}`;
      const res = await fetch(url, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed');
      showToast(`${label} removed permanently`);
      fetchData();
    } catch (err) { showToast('Remove failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const handleEdit = async () => {
    if (!editModal) return;
    setActionLoading('edit');
    try {
      let url = '';
      let method = 'PUT';
      if (entityTab === 'hospitals') url = `/api/hospitals/${editModal.id}`;
      else if (entityTab === 'ambulances') { url = `/api/ambulances/${editModal.id}/settings`; method = 'PUT'; }
      else url = `/api/users/${editModal.id}`;
      const res = await fetch(url, { method, headers, body: JSON.stringify(editForm) });
      if (!res.ok) throw new Error('Update failed');
      showToast('Updated successfully');
      setEditModal(null);
      fetchData();
    } catch (err) { showToast('Update failed', 'error'); }
    finally { setActionLoading(null); }
  };

  const exportPDF = () => {
    try {
      const { jsPDF } = require('jspdf');
      const autoTable = require('jspdf-autotable').default;
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(`RescueLink — ${entityTab.toUpperCase()} REGISTRY`, 14, 16);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Exported: ${new Date().toLocaleString()} | Search: "${searchQuery}" | Range: ${dateFrom || 'all'} – ${dateTo || 'now'}`, 14, 23);

      let columns, rows;
      if (entityTab === 'hospitals') {
        columns = ['ID', 'Name', 'City', 'State', 'ICU Beds', 'Status', 'Registered'];
        rows = filtered.map(r => [r.id?.slice(-8), r.name, r.city, r.state, r.icu_beds, r.is_active ? 'ACTIVE' : 'SUSPENDED', r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-']);
      } else if (entityTab === 'ambulances') {
        columns = ['ID', 'Vehicle No', 'Driver', 'Type', 'Contact', 'Status', 'Registered'];
        rows = filtered.map(r => [r.id?.slice(-8), r.vehicleNo, r.driverName, r.type, r.contactInfo, r.is_active ? 'ACTIVE' : 'SUSPENDED', r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-']);
      } else {
        columns = ['ID', 'Name', 'Email', 'Blood Group', 'Status', 'Registered'];
        rows = filtered.map(r => [r.id?.slice(-8), r.name, r.email, r.blood_group || '-', r.is_active ? 'ACTIVE' : 'SUSPENDED', r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-']);
      }

      autoTable(doc, {
        startY: 28,
        head: [columns],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [0, 40, 80], textColor: [0, 200, 255], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [240, 245, 255] }
      });
      doc.save(`rescuelink_${entityTab}_${Date.now()}.pdf`);
    } catch (err) {
      console.error('[REGISTRY] PDF export failed:', err);
      showToast('PDF export failed', 'error');
    }
  };

  const exportExcel = () => {
    try {
      const XLSX = require('xlsx');
      let rows;
      if (entityTab === 'hospitals') {
        rows = filtered.map(r => ({ ID: r.id, Name: r.name, City: r.city, State: r.state, ICU_Beds: r.icu_beds, Total_Beds: r.total_beds, Ventilators: r.ventilators, Status: r.is_active ? 'ACTIVE' : 'SUSPENDED', Registered: r.createdAt }));
      } else if (entityTab === 'ambulances') {
        rows = filtered.map(r => ({ ID: r.id, VehicleNo: r.vehicleNo, Driver: r.driverName, Type: r.type, Contact: r.contactInfo, Status: r.is_active ? 'ACTIVE' : 'SUSPENDED', Registered: r.createdAt }));
      } else {
        rows = filtered.map(r => ({ ID: r.id, Name: r.name, Email: r.email, BloodGroup: r.blood_group, Gender: r.gender, Status: r.is_active ? 'ACTIVE' : 'SUSPENDED', Registered: r.createdAt }));
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, entityTab.charAt(0).toUpperCase() + entityTab.slice(1));
      XLSX.writeFile(wb, `rescuelink_${entityTab}_${Date.now()}.xlsx`);
    } catch (err) {
      console.error('[REGISTRY] Excel export failed:', err);
      showToast('Excel export failed', 'error');
    }
  };

  const S = {
    card: { background: 'rgba(5,15,40,0.9)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 },
    btn: (color) => ({ padding: '6px 14px', background: `rgba(${color},0.12)`, border: `1px solid rgba(${color},0.4)`, borderRadius: 6, color: `rgb(${color})`, fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }),
    input: { background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 6, padding: '7px 12px', color: '#e0eaff', fontSize: 12, fontFamily: "'Share Tech Mono'", outline: 'none' },
    th: { padding: '8px 10px', fontFamily: "'Orbitron'", fontSize: 9, color: 'rgba(0,200,255,0.7)', fontWeight: 700, letterSpacing: '0.08em', borderBottom: '1px solid rgba(0,200,255,0.1)', textAlign: 'left', whiteSpace: 'nowrap' },
    td: { padding: '9px 10px', fontSize: 11, color: '#e0eaff', borderBottom: '1px solid rgba(0,200,255,0.05)', verticalAlign: 'middle' },
    badge: (active) => ({ padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: active ? 'rgba(0,255,136,0.15)' : 'rgba(255,68,68,0.15)', color: active ? '#00ff88' : '#ff4444', display: 'inline-block' }),
  };

  const getColumns = () => {
    if (entityTab === 'hospitals') return ['#', 'NAME', 'CITY', 'STATE', 'ICU BEDS', 'TOTAL BEDS', 'STATUS', 'REGISTERED', 'ACTIONS'];
    if (entityTab === 'ambulances') return ['#', 'VEHICLE NO', 'DRIVER', 'TYPE', 'CONTACT', 'STATUS', 'REGISTERED', 'ACTIONS'];
    return ['#', 'NAME', 'EMAIL', 'BLOOD GRP', 'GENDER', 'STATUS', 'REGISTERED', 'ACTIONS'];
  };

  const renderRow = (row, idx) => {
    const isActive = row.is_active !== false;
    const regDate = row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—';
    const isLoadingS = actionLoading === row.id + '-suspend';
    const isLoadingR = actionLoading === row.id + '-restore';
    const isLoadingD = actionLoading === row.id + '-remove';

    const cells = entityTab === 'hospitals' ? [
      <span style={{ color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>{row.id?.slice(-8)}</span>,
      <strong>{row.name}</strong>,
      row.city || '—',
      row.state || '—',
      <span style={{ color: '#ffb800', fontWeight: 700 }}>{row.icu_beds || 0}</span>,
      row.total_beds || 0,
    ] : entityTab === 'ambulances' ? [
      <span style={{ color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>{row.vehicleNo}</span>,
      <strong>{row.driverName}</strong>,
      <span style={{ padding: '2px 6px', borderRadius: 4, background: row.type === 'ALS' ? 'rgba(180,100,255,0.15)' : 'rgba(0,200,255,0.1)', color: row.type === 'ALS' ? '#cc88ff' : '#00c8ff', fontSize: 9, fontWeight: 700 }}>{row.type}</span>,
      row.contactInfo || '—',
    ] : [
      <span style={{ color: '#00c8ff', fontFamily: "'Share Tech Mono'", fontSize: 10 }}>{row.id?.slice(-8)}</span>,
      <strong>{row.name}</strong>,
      <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.7)' }}>{row.email}</span>,
      row.blood_group || '—',
      row.gender || '—',
    ];

    return (
      <tr key={row.id} style={{ transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,200,255,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <td style={{ ...S.td, color: 'rgba(160,200,255,0.4)', fontSize: 10, textAlign: 'center' }}>{idx + 1}</td>
        {cells.map((cell, i) => <td key={i} style={S.td}>{cell}</td>)}
        <td style={S.td}><span style={S.badge(isActive)}>{isActive ? '● ACTIVE' : '⏸ SUSPENDED'}</span></td>
        <td style={{ ...S.td, fontSize: 10, color: 'rgba(160,200,255,0.5)' }}>{regDate}</td>
        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setViewModal(row)} style={{ ...S.btn('0,200,255'), padding: '4px 8px' }} title="View">👁</button>
            <button onClick={() => { setEditModal(row); setEditForm(entityTab === 'hospitals' ? { name: row.name, city: row.city, state: row.state, icu_beds: row.icu_beds, total_beds: row.total_beds, ventilators: row.ventilators, contact_number: row.contact_number } : entityTab === 'ambulances' ? { driverName: row.driverName, type: row.type, contactInfo: row.contactInfo } : { name: row.name, mobile: row.mobile, blood_group: row.blood_group, gender: row.gender }); }} style={{ ...S.btn('255,184,0'), padding: '4px 8px' }} title="Edit">✏️</button>
            {isActive
              ? <button disabled={isLoadingS} onClick={() => handleSuspend(row)} style={{ ...S.btn('255,68,68'), padding: '4px 8px', opacity: isLoadingS ? 0.5 : 1 }} title="Suspend">⏸</button>
              : <button disabled={isLoadingR} onClick={() => handleRestore(row)} style={{ ...S.btn('0,255,136'), padding: '4px 8px', opacity: isLoadingR ? 0.5 : 1 }} title="Restore">▶</button>
            }
            <button disabled={isLoadingD} onClick={() => handleRemove(row)} style={{ ...S.btn('255,40,40'), padding: '4px 8px', opacity: isLoadingD ? 0.5 : 1 }} title="Remove permanently">🗑</button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '0 0 20px' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, background: toast.type === 'error' ? 'rgba(255,40,40,0.15)' : 'rgba(0,255,136,0.12)', border: `1px solid ${toast.type === 'error' ? '#ff4444' : '#00ff88'}`, borderRadius: 8, padding: '12px 20px', color: toast.type === 'error' ? '#ff4444' : '#00ff88', fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, backdropFilter: 'blur(10px)' }}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}

      {/* View Modal */}
      {viewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#050d1a', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 12, padding: 28, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', fontWeight: 700 }}>👁 ENTITY DETAILS</div>
              <button onClick={() => setViewModal(null)} style={{ background: 'transparent', border: 'none', color: '#00c8ff', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
              {Object.entries(viewModal).filter(([k]) => !['password', 'totp_secret', 'backup_codes', 'refresh_token', 'fcm_token'].includes(k)).map(([k, v]) => (
                <div key={k} style={{ borderBottom: '1px solid rgba(0,200,255,0.06)', paddingBottom: 8 }}>
                  <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", letterSpacing: '0.08em', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 12, color: '#e0eaff', marginTop: 2, wordBreak: 'break-all' }}>
                    {typeof v === 'boolean' ? (v ? '✅ Yes' : '❌ No') : (v === null || v === undefined || v === '') ? <span style={{ color: 'rgba(160,200,255,0.3)' }}>—</span> : String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#050d1a', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 12, padding: 28, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ffb800', fontWeight: 700 }}>✏️ EDIT RECORD</div>
              <button onClick={() => setEditModal(null)} style={{ background: 'transparent', border: 'none', color: '#ffb800', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(editForm).map(([k, v]) => (
                <div key={k}>
                  <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</label>
                  <input
                    value={v ?? ''}
                    onChange={e => setEditForm(prev => ({ ...prev, [k]: e.target.value }))}
                    style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditModal(null)} style={S.btn('160,200,255')}>CANCEL</button>
              <button onClick={handleEdit} disabled={actionLoading === 'edit'} style={{ ...S.btn('255,184,0'), opacity: actionLoading === 'edit' ? 0.5 : 1 }}>
                {actionLoading === 'edit' ? 'SAVING...' : '💾 SAVE CHANGES'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00c8ff', fontWeight: 700, marginBottom: 4 }}>📋 ENTITY REGISTRY</div>
            <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>View, manage, suspend, or remove all registered entities. Refreshes every 30s.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportPDF} style={S.btn('0,200,255')}>📄 PDF</button>
            <button onClick={exportExcel} style={S.btn('255,184,0')}>📊 Excel</button>
            <button onClick={fetchData} style={S.btn('0,255,136')}>🔄 Refresh</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, borderBottom: '1px solid rgba(0,200,255,0.1)', paddingBottom: 12 }}>
          {[['hospitals', '🏥 HOSPITALS'], ['ambulances', '🚑 AMBULANCES'], ['patients', '🧍 PATIENTS']].map(([id, label]) => (
            <button key={id} onClick={() => { setEntityTab(id); setSearchQuery(''); }} style={{
              padding: '7px 16px', borderRadius: 6, fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
              background: entityTab === id ? 'rgba(0,200,255,0.18)' : 'transparent',
              border: `1px solid ${entityTab === id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
              color: entityTab === id ? '#00c8ff' : 'rgba(160,200,255,0.5)',
              transition: 'all 0.2s'
            }}>{label}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(160,200,255,0.4)', alignSelf: 'center', fontFamily: "'Share Tech Mono'" }}>
            {filtered.length} of {data.length} results
          </span>
        </div>

        {/* Search + Date Filters */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...S.input, minWidth: 220, flex: 1 }}
            placeholder={`Search ${entityTab} by name, ID, email…`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'" }}>FROM</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...S.input, padding: '6px 10px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'" }}>TO</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...S.input, padding: '6px 10px' }} />
          </div>
          {(dateFrom || dateTo || searchQuery) && (
            <button onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }} style={{ ...S.btn('255,68,68'), padding: '6px 10px' }}>✕ CLEAR</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(0,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 12 }}>
            ⏳ LOADING REGISTRY DATA…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(160,200,255,0.3)', fontFamily: "'Orbitron'", fontSize: 12 }}>
            NO RECORDS FOUND — TRY ADJUSTING YOUR SEARCH OR DATE RANGE
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ background: 'rgba(0,0,0,0.4)', position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  {getColumns().map(col => <th key={col} style={S.th}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PendingErasureReviews({ SERVER_URL_CONST }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const response = await fetch(`/api/erasure/pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleReview = async (id, status, notes) => {
    try {
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const response = await fetch(`/api/erasure/review/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, review_notes: notes })
      });
      if (response.ok) {
        alert(`Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'} successfully.`);
        fetchPending();
      } else {
        const err = await response.json();
        alert(err.error || "Failed to process review");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, border: '1px solid rgba(0,200,255,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ffb800' }}>⚠️ PENDING ERASURE REQUESTS (SECTION 12)</div>
        <button onClick={fetchPending} style={{ padding: '4px 8px', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', color: '#00c8ff', borderRadius: 4, fontSize: 9, cursor: 'pointer', fontFamily: "'Orbitron'" }}>REFRESH</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)' }}>Loading pending erasure requests...</div>
      ) : requests.length === 0 ? (
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontStyle: 'italic' }}>No pending erasure requests under Section 12.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(req => (
            <div key={req.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#e0eaff' }}>Patient Profile: <strong style={{ fontFamily: "'Share Tech Mono'" }}>{req.patient_id}</strong></div>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginTop: 4 }}>Reason: "{req.reason}"</div>
                <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', marginTop: 2 }}>Requested: {new Date(req.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={() => {
                    const notes = prompt("Enter rejection notes:");
                    if (notes !== null) handleReview(req.id, 'REJECTED', notes);
                  }}
                  style={{ padding: '6px 12px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', borderRadius: 4, color: '#ff4444', fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                >
                  REJECT
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm("Are you sure you want to approve? This will permanently wipe patient PII and cascade delete all incidents.")) {
                      handleReview(req.id, 'APPROVED', 'DPDP Compliance Purge');
                    }
                  }}
                  style={{ padding: '6px 12px', background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                >
                  APPROVE & PURGE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsentAccessLogs({ SERVER_URL_CONST }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = sessionStorage.getItem('rescuelink_token') || '';
        const response = await fetch(`/api/audit/consent-log`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, border: '1px solid rgba(0,200,255,0.1)' }}>
      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 12 }}>📜 CONSENT AUDIT TRAIL LOGS</div>
      <div style={{ overflowY: 'auto', maxHeight: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ color: 'rgba(160,200,255,0.5)', borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
              <th style={{ textAlign: 'left', padding: '5px' }}>ACTOR</th>
              <th style={{ textAlign: 'left' }}>ACTION</th>
              <th style={{ textAlign: 'left' }}>RESOURCE</th>
              <th style={{ textAlign: 'right' }}>DATE</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'rgba(160,200,255,0.3)', padding: 10 }}>No consent audit logs recorded.</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 5px', color: '#e0eaff' }}>{log.user?.name || 'SYSTEM'}</td>
                  <td style={{ color: '#00ff88' }}>{log.action}</td>
                  <td>{log.resource} ({log.resource_id})</td>
                  <td style={{ textAlign: 'right', color: 'rgba(160,200,255,0.5)' }}>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuthorityRegistrationForm() {
  const [name, setName] = useState('');
  const [authority, setAuthority] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [authorities, setAuthorities] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');

  const fetchAuthorities = async () => {
    setListLoading(true);
    try {
      const token = sessionStorage.getItem('rescuelink_token');
      const res = await fetch(`${SERVER_URL}/api/auth/war-room-authorities`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setAuthorities(data);
    } catch (err) {
      console.error('[WAR ROOM] Failed to fetch authorities:', err);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { fetchAuthorities(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const token = sessionStorage.getItem('rescuelink_token');
      const res = await fetch(`${SERVER_URL}/api/auth/register-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name, authority, email, mobile, password })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`✅ Authority registered: ${email} (${authority || 'N/A'}). They can now log in to the War Room.`);
        setName(''); setAuthority(''); setEmail(''); setMobile(''); setPassword('');
        fetchAuthorities();
      } else {
        setError(data.error || 'Failed to register authority');
      }
    } catch (err) {
      setError('Server connection offline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 900 }}>
      {/* Registration Form */}
      <div>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', marginBottom: 16, letterSpacing: '0.08em' }}>➕ REGISTER NEW AUTHORITY</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>FULL NAME</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. District Collector Ramesh Patil"
              style={{ padding: 11, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>DESIGNATION / AUTHORITY TITLE</label>
            <input
              type="text" value={authority} onChange={e => setAuthority(e.target.value)} required placeholder="e.g. District Collector, CMO, DCP"
              style={{ padding: 11, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>OFFICIAL EMAIL ADDRESS</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="officer@gov.in"
              style={{ padding: 11, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>MOBILE NUMBER (for OTP recovery)</label>
            <input
              type="text" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="+91-XXXXXXXXXX"
              style={{ padding: 11, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ACCESS PASSWORD</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ padding: 11, paddingRight: 38, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(160,200,255,0.5)', cursor: 'pointer', fontSize: 13 }}>
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {error && <div style={{ color: '#ff4444', fontSize: 11, fontWeight: 'bold', background: 'rgba(255,68,68,0.1)', padding: '8px 12px', borderRadius: 6 }}>⚠️ {error}</div>}
          {success && <div style={{ color: '#00ff88', fontSize: 11, fontWeight: 'bold', background: 'rgba(0,255,136,0.08)', padding: '8px 12px', borderRadius: 6 }}>{success}</div>}

          <button type="submit" disabled={loading}
            style={{ marginTop: 8, padding: 13, background: 'linear-gradient(135deg, rgba(0,255,136,0.1) 0%, rgba(0,255,136,0.25) 100%)',
              border: '1px solid #00ff88', borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'",
              fontSize: 11, fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.05em' }}
          >
            {loading ? 'REGISTERING...' : '🏛️ GRANT WAR ROOM ACCESS'}
          </button>
        </form>
      </div>

      {/* Registered Authorities List */}
      <div>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 16, letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 REGISTERED AUTHORITIES</span>
          <button onClick={fetchAuthorities} style={{ background: 'none', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 4, color: '#00c8ff', fontSize: 9, padding: '3px 8px', cursor: 'pointer' }}>↻ REFRESH</button>
        </div>
        {listLoading ? (
          <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, fontStyle: 'italic' }}>Loading...</div>
        ) : authorities.length === 0 ? (
          <div style={{ color: 'rgba(160,200,255,0.3)', fontSize: 12, fontStyle: 'italic' }}>No authorities registered yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {authorities.map(a => (
              <div key={a.id} style={{ background: a.email === 'admin@rescuelink.com' ? 'rgba(0,255,136,0.06)' : 'rgba(0,200,255,0.04)', border: `1px solid ${a.email === 'admin@rescuelink.com' ? 'rgba(0,255,136,0.25)' : 'rgba(0,200,255,0.15)'}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff' }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: '#00c8ff', marginTop: 2, fontFamily: "'Share Tech Mono'" }}>{a.authority || (a.email === 'admin@rescuelink.com' ? 'SUPER ADMINISTRATOR' : 'Authority')}</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>{a.email}</div>
                    {a.mobile && <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>{a.mobile}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {a.email === 'admin@rescuelink.com' && (
                      <span style={{ fontSize: 8, background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: '2px 7px', color: '#00ff88', fontFamily: "'Orbitron'" }}>SUPER ADMIN</span>
                    )}
                    <div style={{ fontSize: 9, color: a.is_active ? '#00ff88' : '#ff4444', marginTop: 4 }}>{a.is_active ? '● ACTIVE' : '○ INACTIVE'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LedgerExplorer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const res = await fetch(`${SERVER_URL}/api/audit/blockchain-explorer`);
      const data = await res.json();
      if (res.ok) {
        setLogs(data);
      }
    } catch (e) {
      console.error('[LEDGER EXPLORER] Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(5,15,40,0.85)', borderRadius: 10, padding: 24, border: '1px solid rgba(0,200,255,0.15)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,200,255,0.15)', paddingBottom: 10, marginBottom: 20 }}>
        <div>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00c8ff', margin: 0, letterSpacing: '0.1em' }}>
            ⛓️ CRYPTOGRAPHIC AUDIT LEDGER EXPLORER
          </h3>
          <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
            HIPAA-COMPLIANT SHA-256 HASH-CHAINED SECURITY LOGS
          </span>
        </div>
        <button onClick={fetchLogs} disabled={loading} style={{ padding: '6px 14px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 6, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 10, cursor: 'pointer' }}>
          {loading ? 'SYNCING...' : 'REFRESH LEDGER'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(160,200,255,0.4)', padding: 40 }}>
            No audit logs sealed in blockchain yet.
          </div>
        ) : (
          logs.map((log, index) => {
            return (
              <div key={log.id} style={{ background: 'rgba(0,10,30,0.5)', border: `1px solid ${log.severity === 'CRITICAL' ? 'rgba(255,51,51,0.2)' : 'rgba(0,255,136,0.15)'}`, borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: log.severity === 'CRITICAL' ? 'rgba(255,51,51,0.15)' : 'rgba(0,200,255,0.1)', color: log.severity === 'CRITICAL' ? '#ff3333' : '#00c8ff', border: `1px solid ${log.severity === 'CRITICAL' ? '#ff333355' : 'rgba(0,200,255,0.3)'}`, borderRadius: 4, padding: '2px 6px', fontSize: 9, fontFamily: "'Orbitron'" }}>
                      {log.action}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span style={{ color: '#00ff88', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>
                    ✓ SEALED BLOCK #{logs.length - index}
                  </span>
                </div>
                
                <p style={{ fontSize: 12, color: '#e0eaff', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  {log.details?.reason || log.details?.action || `Audit trail captured: ${log.action} for ${log.actorId}`}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, fontFamily: "'Share Tech Mono'", fontSize: 9 }}>
                  <div style={{ color: 'rgba(160,200,255,0.5)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>CURRENT HASH:</span>
                    <span style={{ color: '#00ff88' }}>{log.details?.hash ? `${log.details.hash.slice(0, 16)}...${log.details.hash.slice(-16)}` : 'N/A'}</span>
                  </div>
                  <div style={{ color: 'rgba(160,200,255,0.5)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>PREVIOUS HASH:</span>
                    <span style={{ color: 'rgba(160,200,255,0.8)' }}>{log.details?.prevHash ? `${log.details.prevHash.slice(0, 16)}...${log.details.prevHash.slice(-16)}` : 'N/A'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RegistrationApprovals() {
  const [hospitals, setHospitals] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const headers = { 'Authorization': `Bearer ${token}` };
      const [hospRes, ambRes] = await Promise.all([
        fetch('/api/hospitals/all', { headers }),
        fetch('/api/ambulances', { headers })
      ]);
      
      if (hospRes.ok && ambRes.ok) {
        const hospData = await hospRes.json();
        const ambData = await ambRes.json();
        setHospitals(hospData.filter(h => !h.is_active));
        setAmbulances(ambData.filter(a => !a.is_active));
      }
    } catch (err) {
      console.error('[APPROVALS] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApprove = async (type, id) => {
    try {
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const endpoint = type === 'hospital' ? `/api/hospitals/${id}` : `/api/ambulances/${id}/settings`;
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: true })
      });
      if (response.ok) {
        alert('Registration approved successfully!');
        fetchData();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to approve registration');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleReject = async (type, id) => {
    if (!window.confirm(`Are you sure you want to REJECT and delete this ${type} registration?`)) return;
    try {
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const endpoint = type === 'hospital' ? `/api/hospitals/${id}` : `/api/ambulances/${id}`;
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        alert('Registration rejected and removed from system.');
        fetchData();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to reject registration');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(5,15,40,0.8)', borderRadius: 10, padding: 24, border: '1px solid rgba(0,255,136,0.15)', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00ff88', borderBottom: '1px solid rgba(0,255,136,0.2)', paddingBottom: 10, margin: '0 0 20px', letterSpacing: '0.1em' }}>
        🛡️ REGISTRATION APPROVAL CENTER
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', lineHeight: 1.6, marginBottom: 24 }}>
        Review and authorize pending hospital and emergency ambulance registrations to prevent unauthorized system entries.
      </p>

      {loading ? (
        <div style={{ color: 'rgba(160,200,255,0.4)', fontStyle: 'italic', fontSize: 12 }}>Loading pending registrations...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          
          {/* Pending Hospitals */}
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🏥 PENDING HOSPITALS</span>
              <span style={{ fontSize: 9, background: 'rgba(0,200,255,0.15)', padding: '2px 6px', borderRadius: 10, color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>{hospitals.length}</span>
            </div>
            {hospitals.length === 0 ? (
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 8, color: 'rgba(160,200,255,0.4)', fontSize: 11, fontStyle: 'italic' }}>
                No pending hospital registrations.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {hospitals.map(h => (
                  <div key={h.id} style={{ background: 'rgba(0,10,30,0.5)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{h.name}</div>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginTop: 4, fontFamily: "'Share Tech Mono'" }}>
                        LIC: {h.license_number || 'N/A'} | Beds: {h.total_beds} (ICU: {h.icu_beds}) | Vents: {h.ventilators}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', marginTop: 4 }}>
                        📞 Contact: {h.contact_number} | Tier: {h.trauma_tier || 'N/A'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => handleApprove('hospital', h.id)}
                        style={{ padding: '8px 16px', background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => handleReject('hospital', h.id)}
                        style={{ padding: '8px 16px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Ambulances */}
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ff8855', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🚑 PENDING AMBULANCES</span>
              <span style={{ fontSize: 9, background: 'rgba(255,107,53,0.15)', padding: '2px 6px', borderRadius: 10, color: '#ff6b35', fontFamily: "'Share Tech Mono'" }}>{ambulances.length}</span>
            </div>
            {ambulances.length === 0 ? (
              <div style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 8, color: 'rgba(160,200,255,0.4)', fontSize: 11, fontStyle: 'italic' }}>
                No pending ambulance registrations.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ambulances.map(a => (
                  <div key={a.id} style={{ background: 'rgba(0,10,30,0.5)', border: '1px solid rgba(255,107,53,0.15)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{a.vehicleNo} ({a.type})</div>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginTop: 4, fontFamily: "'Share Tech Mono'" }}>
                        LIC: {a.license_number || 'N/A'} | O2 Capacity: {a.oxygen_capacity_liters}L
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', marginTop: 4 }}>
                        👤 Driver: {a.driverName} | 📞 Contact: {a.contactInfo}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => handleApprove('ambulance', a.id)}
                        style={{ padding: '8px 16px', background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => handleReject('ambulance', a.id)}
                        style={{ padding: '8px 16px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}


