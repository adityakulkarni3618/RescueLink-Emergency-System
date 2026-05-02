import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VideoCall from './VideoCall';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom ambulance marker
const ambulanceIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px; height:36px; background:rgba(255,100,50,0.9);
    border:2px solid rgba(255,150,100,0.8); border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:18px; box-shadow:0 0 20px rgba(255,100,50,0.6);
    animation:pulse 1.5s ease infinite;
  ">🚑</div>
  <style>@keyframes pulse{0%,100%{box-shadow:0 0 10px rgba(255,100,50,0.4)}50%{box-shadow:0 0 30px rgba(255,100,50,0.8)}}</style>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const hospitalIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px; height:32px; background:rgba(0,200,255,0.9);
    border:2px solid rgba(100,220,255,0.8); border-radius:6px;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; box-shadow:0 0 15px rgba(0,200,255,0.4);
  ">🏥</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px; height:32px; background:rgba(0,255,136,0.9);
    border:2px solid rgba(100,255,180,0.8); border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; box-shadow:0 0 15px rgba(0,255,136,0.4);
  ">🧍</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export const HOSPITALS = [
  { id: 'narayangaon', name: 'Narayangaon District Hospital', type: 'live', pos: { lat: 19.1901, lng: 73.9501 }, baseDistance: 12.4, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: true } },
  { id: 'junnar', name: 'Junnar City Clinic', type: 'simulated', pos: { lat: 19.2040, lng: 73.8820 }, baseDistance: 3.2, simulatedResources: { otPrepared: true, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: true } },
  { id: 'pune', name: 'Pune General Trauma Center', type: 'simulated', pos: { lat: 18.5204, lng: 73.8567 }, baseDistance: 78.5, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: true } },
  { id: 'otur', name: 'Otur Rural Health Center', type: 'simulated', pos: { lat: 19.1562, lng: 73.9750 }, baseDistance: 8.1, simulatedResources: { otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: true } },
  { id: 'manchar', name: 'Manchar Multispeciality Hospital', type: 'simulated', pos: { lat: 19.0047, lng: 73.9552 }, baseDistance: 22.0, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: false, bloodBankAlerted: true } },
  { id: 'chakan', name: 'Chakan Industrial Hospital', type: 'simulated', pos: { lat: 18.7610, lng: 73.8630 }, baseDistance: 45.0, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: false } },
  { id: 'shirur', name: 'Shirur Cardiac & Neuro Center', type: 'simulated', pos: { lat: 18.8271, lng: 74.3798 }, baseDistance: 55.0, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: true } },
  { id: 'alephata', name: 'Alephata Primary Health Center', type: 'simulated', pos: { lat: 19.1350, lng: 73.8250 }, baseDistance: 15.0, simulatedResources: { otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: false } },
];

function lerp(a, b, t) { return a + (b - a) * t; }

/* ─── Auto-Triage Logic ───────────────────────────────────────────────────── */
export function calculateTriage(vitals) {
  if (!vitals) return { level: 'PENDING', color: 'rgba(160,200,255,0.4)', label: 'AWAITING DATA' };
  
  if (vitals.spo2 < 90 || vitals.heartRate > 130 || vitals.heartRate < 40 || vitals.systolic < 90) {
    return { level: 'RED', color: '#ff4444', label: 'IMMEDIATE (RED)' };
  }
  if (vitals.spo2 < 94 || vitals.heartRate > 110 || vitals.heartRate < 50 || vitals.systolic > 160 || vitals.temperature > 39) {
    return { level: 'YELLOW', color: '#ffb800', label: 'URGENT (YELLOW)' };
  }
  return { level: 'GREEN', color: '#00ff88', label: 'STABLE (GREEN)' };
}

/* ─── Vital sign generator ────────────────────────────────────────────────── */
function generateVitals(prev, forceDeteriorate = false) {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const jitter = (v, range) => v + (Math.random() - 0.5) * range;

  if (forceDeteriorate) {
    return {
      heartRate: Math.round(clamp(jitter(prev?.heartRate ?? 78, 4) + 3, 45, 180)), // Rises steadily
      spo2: Math.round(clamp(jitter(prev?.spo2 ?? 97, 1) - 0.8, 60, 100) * 10) / 10, // Drops steadily
      systolic: Math.round(clamp(jitter(prev?.systolic ?? 120, 4) - 2, 50, 200)),
      diastolic: Math.round(clamp(jitter(prev?.diastolic ?? 80, 2) - 1, 30, 120)),
      temperature: Math.round(clamp(jitter(prev?.temperature ?? 37.2, 0.1), 35, 41) * 10) / 10,
      respRate: Math.round(clamp(jitter(prev?.respRate ?? 16, 2) + 1, 10, 40)),
      glucose: Math.round(clamp(jitter(prev?.glucose ?? 110, 5), 40, 300)),
    };
  }

  return {
    heartRate: Math.round(clamp(jitter(prev?.heartRate ?? 78, 6), 45, 130)),
    spo2: Math.round(clamp(jitter(prev?.spo2 ?? 97, 2), 88, 100) * 10) / 10,
    systolic: Math.round(clamp(jitter(prev?.systolic ?? 120, 5), 80, 190)),
    diastolic: Math.round(clamp(jitter(prev?.diastolic ?? 80, 3), 50, 110)),
    temperature: Math.round(clamp(jitter(prev?.temperature ?? 37.2, 0.2), 35, 41) * 10) / 10,
    respRate: Math.round(clamp(jitter(prev?.respRate ?? 16, 2), 10, 35)),
    glucose: Math.round(clamp(jitter(prev?.glucose ?? 110, 8), 60, 300)),
  };
}

/* ─── Mini digital display ───────────────────────────────────────────────── */
function VitalCard({ label, value, unit, color, icon, critical }) {
  return (
    <div style={{
      background: critical ? 'rgba(255,40,40,0.12)' : 'rgba(5,20,45,0.8)',
      border: `1px solid ${critical ? 'rgba(255,80,80,0.5)' : 'rgba(0,200,255,0.15)'}`,
      borderRadius: 10, padding: '14px 16px',
      transition: 'all 0.3s ease',
      animation: critical ? 'critFlash 0.5s ease infinite alternate' : 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', letterSpacing: '0.15em', marginBottom: 4, fontFamily: "'Share Tech Mono'" }}>
        {icon} {label}
      </div>
      <div style={{
        fontFamily: "'Share Tech Mono'", fontSize: 32, fontWeight: 700,
        color: critical ? '#ff4444' : color,
        textShadow: `0 0 15px ${critical ? 'rgba(255,80,80,0.6)' : color + '60'}`,
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', marginTop: 2, fontFamily: "'Share Tech Mono'" }}>{unit}</div>
      {critical && (
        <div style={{
          position: 'absolute', top: 6, right: 8,
          fontSize: 10, color: '#ff4444', fontWeight: 700,
          letterSpacing: '0.1em', fontFamily: "'Orbitron'",
          animation: 'blink 0.5s step-end infinite',
        }}>⚠ CRIT</div>
      )}
    </div>
  );
}

/* ─── Hospital Readiness Panel (Ambulance Side) ─────────────────────────── */
function AmbulanceResourcePanel({ resources }) {
  const items = [
    { key: 'otPrepared', label: 'OT PREPARED', icon: '🔪' },
    { key: 'ventilatorReady', label: 'VENTILATOR', icon: '🫁' },
    { key: 'cardiologistAssigned', label: 'CARDIOLOGIST', icon: '🫀' },
    { key: 'bloodBankAlerted', label: 'BLOOD BANK', icon: '🩸' },
  ];

  const readyCount = Object.values(resources).filter(Boolean).length;

  return (
    <div style={{
      background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
      borderRadius: 10, padding: 20, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
          HOSPITAL READINESS STATUS
        </div>
        <div style={{
          fontFamily: "'Share Tech Mono'", fontSize: 12,
          color: readyCount === 4 ? '#00ff88' : readyCount > 0 ? '#ffb800' : 'rgba(160,200,255,0.4)',
        }}>
          {readyCount}/4 READY
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {items.map(({ key, label, icon }) => (
          <div key={key} style={{
            padding: '10px', textAlign: 'center',
            background: resources[key] ? 'rgba(0,255,100,0.1)' : 'rgba(0,200,255,0.04)',
            border: `1px solid ${resources[key] ? 'rgba(0,255,100,0.4)' : 'rgba(0,200,255,0.12)'}`,
            borderRadius: 8, transition: 'all 0.3s ease',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 9, color: resources[key] ? '#00ff88' : 'rgba(160,200,255,0.5)', letterSpacing: '0.05em' }}>
              {label}
            </div>
            <div style={{ marginTop: 4, fontFamily: "'Share Tech Mono'", fontSize: 10, color: resources[key] ? '#00ff88' : 'rgba(160,200,255,0.3)' }}>
              {resources[key] ? '✓ READY' : '○ PENDING'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PATIENTS = ['PAT-001','PAT-002','PAT-003','PAT-004','PAT-005','PAT-006','PAT-007','PAT-008','PAT-009','PAT-010'];
const PATIENT_NAMES = {
  'PAT-001': 'Rajesh Kumar (58M)', 'PAT-002': 'Sunita Sharma (34F)', 'PAT-003': 'Arjun Patel (72M)',
  'PAT-004': 'Kavya Nair (26F)', 'PAT-005': 'Mohammed Ansari (45M)', 'PAT-006': 'Priya Deshmukh (41F)',
  'PAT-007': 'Vikram Jadhav (63M)', 'PAT-008': 'Meera Kulkarni (29F)', 'PAT-009': 'Ravi Shinde (55M)',
  'PAT-010': 'Ananya Patil (38F)',
};

/* ─── Chat panel ─────────────────────────────────────────────────────────── */
function ChatPanel({ socket, messages }) {
  const [msg, setMsg] = useState('');
  const [isListening, setIsListening] = useState(false);
  const bottomRef = useRef();
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Browser does not support speech recognition.");
    
    if (isListening) return; // Prevent multiple instances
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setMsg(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const send = () => {
    if (!msg.trim() && !fileInputRef.current?.files?.length) return;
    if (socket && msg.trim()) {
      socket.emit('chat-message', { text: msg, from: 'ambulance', fromLabel: '🚑 Paramedic' });
    }
    setMsg('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      if (socket) {
        socket.emit('chat-message', { text: msg, image: base64, from: 'ambulance', fromLabel: '🚑 Paramedic' });
        setMsg('');
      }
      e.target.value = null; // reset
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ color: 'rgba(160,200,255,0.3)', fontSize: 12, textAlign: 'center', marginTop: 20, fontFamily: "'Share Tech Mono'" }}>
            No messages yet
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{
            marginBottom: 8,
            textAlign: m.from === 'ambulance' ? 'right' : 'left',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginBottom: 2, fontFamily: "'Share Tech Mono'" }}>
              {m.fromLabel}
            </div>
            <div style={{
              display: 'inline-block', padding: '8px 12px', borderRadius: 8, maxWidth: '80%',
              background: m.from === 'ambulance' ? 'rgba(255,107,53,0.2)' : 'rgba(0,200,255,0.15)',
              border: m.from === 'ambulance' ? '1px solid rgba(255,107,53,0.3)' : '1px solid rgba(0,200,255,0.2)',
              color: '#e0eaff', fontSize: 13,
            }}>
              {m.image && <img src={m.image} alt="Upload" style={{ width: '100%', borderRadius: 4, marginBottom: m.text ? 8 : 0 }} />}
              {m.text && <div>{m.text}</div>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0 0' }}>
        <button onClick={toggleListening} style={{
          background: isListening ? 'rgba(255,40,40,0.2)' : 'rgba(0,200,255,0.06)',
          border: `1px solid ${isListening ? 'rgba(255,80,80,0.5)' : 'rgba(0,200,255,0.2)'}`,
          borderRadius: 6, padding: '8px 12px', color: isListening ? '#ff6b35' : '#00c8ff',
          cursor: 'pointer', transition: 'all 0.2s', animation: isListening ? 'pulse-ring 1s infinite' : 'none'
        }}>
          🎤
        </button>
        <button onClick={() => fileInputRef.current?.click()} style={{
          background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)',
          borderRadius: 6, padding: '8px 12px', color: '#00c8ff', cursor: 'pointer', transition: 'all 0.2s'
        }}>
          📸
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} style={{ display: 'none' }} />
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message to hospital..."
          style={{
            flex: 1, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: 6, padding: '8px 12px', color: '#e0eaff', fontSize: 13,
            fontFamily: "'Rajdhani'", outline: 'none',
          }}
        />
        <button onClick={send} style={{
          background: 'rgba(255,107,53,0.2)', border: '1px solid rgba(255,107,53,0.4)',
          borderRadius: 6, padding: '8px 14px', color: '#ff6b35',
          cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
        }}>SEND</button>
      </div>
    </div>
  );
}

/* ─── Ambulance Credentials DB (Demo) ─────────────────────────────────── */
const AMBULANCE_CREDENTIALS = [
  { unitId: 'AMB-101', password: 'rescue101', driverName: 'Suresh Patil', vehicleNo: 'MH-14-AB-2201', type: 'ALS' },
  { unitId: 'AMB-102', password: 'rescue102', driverName: 'Deepak Jadhav', vehicleNo: 'MH-14-CD-3305', type: 'BLS' },
  { unitId: 'AMB-103', password: 'rescue103', driverName: 'Rohit Sharma', vehicleNo: 'MH-14-EF-4410', type: 'ALS' },
  { unitId: 'AMB-104', password: 'rescue104', driverName: 'Santosh Gaikwad', vehicleNo: 'MH-14-GH-5507', type: 'BLS' },
  { unitId: 'AMB-105', password: 'rescue105', driverName: 'Manoj Kale', vehicleNo: 'MH-14-IJ-6602', type: 'ALS' },
];

/* ─── Main AmbulanceStreamer ─────────────────────────────────────────────── */
export default function AmbulanceStreamer({ socket, connected }) {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUnit, setAuthUnit] = useState(null); // logged in unit details
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [vitals, setVitals] = useState(generateVitals(null));
  const [streaming, setStreaming] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [routeProgress, setRouteProgress] = useState(0);
  const [location, setLocation] = useState({ lat: 18.5204, lng: 73.8567 });
  const [elapsed, setElapsed] = useState(0);
  const [messages, setMessages] = useState([]);
  const [incidentNote, setIncidentNote] = useState('');
  const [isListeningNote, setIsListeningNote] = useState(false);
  const [hospitalResources, setHospitalResources] = useState({ otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: false });
  const [aiAlert, setAiAlert] = useState(null);
  const [simulateCrisis, setSimulateCrisis] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [simulateTraffic, setSimulateTraffic] = useState(false);
  const trafficRef = useRef(false);
  useEffect(() => { trafficRef.current = simulateTraffic; }, [simulateTraffic]);

  const [locationHistory, setLocationHistory] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(HOSPITALS[0]);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [assignedUser, setAssignedUser] = useState(null);
  const [assignedHospital, setAssignedHospital] = useState(null);
  const [networkHospitals, setNetworkHospitals] = useState({});
  const [routePath, setRoutePath] = useState(null);
  const [previousReports, setPreviousReports] = useState([]);
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [arrivedAtUser, setArrivedAtUser] = useState(false);
  const [arrivalCountdown, setArrivalCountdown] = useState(20);
  const [rerouteTarget, setRerouteTarget] = useState(null);
  const [shareHistory, setShareHistory] = useState(true);


  const vitalsRef = useRef(vitals);
  vitalsRef.current = vitals;
  const vitalsHistoryRef = useRef([]);
  const simulateCrisisRef = useRef(simulateCrisis);
  simulateCrisisRef.current = simulateCrisis;
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;
  const offlineBacklog = useRef([]);
  const fullJourneyVitalsRef = useRef([]);
  const geoWatchIdRef = useRef(null);
  const arrivedRef = useRef(false);
  const patientRef = useRef('');
  useEffect(() => { arrivedRef.current = arrivedAtUser; }, [arrivedAtUser]);
  useEffect(() => { patientRef.current = selectedPatient; }, [selectedPatient]);


  const handleLogin = () => {
    const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === loginId.toUpperCase() && c.password === loginPass);
    if (found) {
      setAuthUnit(found);
      setIsAuthenticated(true);
      setLoginError('');
      if (socket) socket.emit('register-ambulance', { location: { lat: 19.2, lng: 73.88 }, available: true, unitId: found.unitId, driverName: found.driverName, vehicleNo: found.vehicleNo, type: found.type });
    } else {
      setLoginError('Invalid Unit ID or Password');
    }
  };


  // Socket listeners
  useEffect(() => {
    if (!socket || !connected) return;
    
    // Register Ambulance immediately with default/last known location
    socket.emit('register-ambulance', { location, available: true });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        // Offset by ~500m so it doesn't overlap exactly with the User's device
        const initLoc = { lat: pos.coords.latitude + 0.005, lng: pos.coords.longitude + 0.005 };
        setLocation(initLoc);
        socket.emit('location-update', initLoc);
        socket.emit('register-ambulance', { location: initLoc, available: true });
      }, (err) => {
        console.warn('GPS initial fetch error:', err);
      }, { timeout: 10000 });
    }

    const onHistory = (msgs) => setMessages(msgs);
    const onMsg = (msg) => setMessages(prev => [...prev, msg]);
    const onResources = (data) => setHospitalResources(data);
    const onAiAlert = (data) => {
      setAiAlert(data);
      setTimeout(() => setAiAlert(null), 10000);
    };
    
    const onHospitalsUpdate = (data) => setNetworkHospitals(data);
    
    const onIncomingRequest = (req) => {
      setIncomingRequest(req); // { id, userLocation, patientDetails }
    };
    
    const onHospitalResponse = (req) => {
      if (req.status === 'hospital_accepted') {
        setAssignedHospital(req);
        if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      }
    };

    const onAmbulanceResponse = (req) => {
       // We get this back to know our route
       if (req.status === 'ambulance_accepted') {
          if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
       }
    };
    
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMsg);
    socket.on('resources-update', onResources);
    socket.on('ai-prediction-alert', onAiAlert);
    socket.on('incoming-ambulance-request', onIncomingRequest);
    socket.on('ambulance-request-response', onAmbulanceResponse);
    socket.on('hospital-request-response', onHospitalResponse);
    socket.on('hospitals-update', onHospitalsUpdate);
    socket.on('route-update', (data) => {
      if (data.routePath) setRoutePath(data.routePath.map(pos => [pos.lat, pos.lng]));
    });
    
    return () => {
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onMsg);
      socket.off('resources-update', onResources);
      socket.off('ai-prediction-alert', onAiAlert);
      socket.off('incoming-ambulance-request', onIncomingRequest);
      socket.off('ambulance-request-response', onAmbulanceResponse);
      socket.off('hospital-request-response', onHospitalResponse);
      socket.off('hospitals-update', onHospitalsUpdate);
      socket.off('route-update');
    };
  }, [socket, connected]);

  // Streaming loop
  useEffect(() => {
    if (!streaming || !socket || !connected) return;

    const vitalsInterval = setInterval(() => {
      const newVitals = generateVitals(vitalsRef.current, simulateCrisisRef.current);
      setVitals(newVitals);
      
      if (isOfflineRef.current) {
        offlineBacklog.current.push({ ...newVitals, timestamp: Date.now() });
      } else {
        socket.emit('vitals-update', newVitals);
      }
      
      fullJourneyVitalsRef.current.push({ ...newVitals, timestamp: Date.now() });
      if (fullJourneyVitalsRef.current.length > 100) fullJourneyVitalsRef.current.shift();

      // AI Logic: Track history
      vitalsHistoryRef.current.push(newVitals);
      if (vitalsHistoryRef.current.length > 8) vitalsHistoryRef.current.shift();
      
      const history = vitalsHistoryRef.current;
      if (history.length >= 6 && !aiAlert) {
        const first = history[0];
        const last = history[history.length - 1];
        if (last.spo2 < first.spo2 - 4 && last.heartRate > first.heartRate + 12) {
          const alertData = { 
            message: "High Risk of Cardiac Event (Rapidly Declining SpO2 & Tachycardia)",
            timestamp: Date.now()
          };
          setAiAlert(alertData);
          socket.emit('ai-prediction-alert', alertData);
          vitalsHistoryRef.current = []; // reset to avoid spam
          setTimeout(() => setAiAlert(null), 10000);
        }
      }

    }, 2000);

    // True GPS tracking instead of simulation
    if (navigator.geolocation) {
      geoWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude + 0.005, lng: pos.coords.longitude + 0.005 };
          setLocation(newPos);
          setLocationHistory(h => [...h.slice(-99), [newPos.lat, newPos.lng]]);
          // Broad cast destination hospital ID to help User Unit look up location correctly
          socket.emit('location-update', { 
            ...newPos, 
            trafficDelay: trafficRef.current, 
            arrivedAtUser: arrivedRef.current, 
            selectedPatient: patientRef.current, 
            destinationId: selectedHospital?.hospitalId || selectedHospital?.id, 
            simulationOn: true 
          });
        },
        (err) => console.warn('GPS Error', err),
        { enableHighAccuracy: true }
      );
    }

    return () => {
      clearInterval(vitalsInterval);
      if (geoWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [streaming, socket, connected]);

  // Arrival countdown timer — when it hits 0, ambulance "arrives" and triggers hospital flow
  useEffect(() => {
    if (requestAccepted && !arrivedAtUser && arrivalCountdown > 0) {
      const timer = setTimeout(() => {
        const next = arrivalCountdown - 1;
        setArrivalCountdown(next);
        if (socket) socket.emit('arrival-countdown', { reqId: incomingRequest?.id, seconds: next });
      }, 1000);
      return () => clearTimeout(timer);
    } else if (requestAccepted && arrivalCountdown === 0 && !arrivedAtUser) {
      setArrivedAtUser(true);
      if (socket) socket.emit('ambulance-arrived', { reqId: incomingRequest?.id });
      // NOW generate field report and send hospital request
      if (socket && assignedUser) {
        const v = vitalsRef.current;
        const condition = assignedUser.patientDetails?.condition || 'General';
        const fieldReport = {
          generatedAt: new Date().toLocaleString(),
          condition,
          riskLevel: assignedUser.patientDetails?.riskLevel || 'CRITICAL',
          initialVitals: { heartRate: v.heartRate, spo2: v.spo2, systolic: v.systolic, diastolic: v.diastolic, respRate: v.respRate, temperature: v.temperature, bloodGlucose: v.bloodGlucose },
          triageLevel: v.spo2 < 92 || v.heartRate > 130 ? 'RED — IMMEDIATE' : v.spo2 < 94 || v.heartRate > 110 ? 'YELLOW — URGENT' : 'GREEN — STABLE',
          requiredServices: condition === 'Cardiac Arrest' ? ['Cardiologist On Call','Ventilator','Cardiac ICU','Defibrillator'] : condition === 'Trauma' ? ['OT Prepared','Blood Bank','Trauma Bay','Surgeon On Call'] : ['General Assessment','IV Access','Monitoring'],
          fieldNotes: `Patient presenting with ${condition}. Initial assessment: HR ${v.heartRate}bpm, SpO2 ${v.spo2}%, BP ${v.systolic}/${v.diastolic}mmHg. ${v.spo2 < 94 ? 'Supplemental O2 initiated.' : 'Vitals within acceptable range.'} ${v.heartRate > 110 ? 'Tachycardia noted, continuous monitoring.' : ''}`,
        };
        // Find best hospital
        const hList = Object.keys(networkHospitals).length > 0 ? Object.entries(networkHospitals).map(([id, h]) => ({ id, ...h })) : HOSPITALS;
        let bestHosp = null, bestScore = -Infinity;
        hList.forEach(hosp => {
          if (hosp.socketId && !hosp.available) return;
          let score = -calcDist(location, hosp.location || hosp.pos) * 10;
          const res = hosp.resources || hosp.simulatedResources || {};
          if (condition === 'Cardiac Arrest') { if (res.cardiologistAssigned) score += 100; if (res.ventilatorReady) score += 50; }
          else { if (res.otPrepared) score += 50; if (res.bloodBankAlerted) score += 30; }
          if (score > bestScore) { bestScore = score; bestHosp = hosp; }
        });
        if (bestHosp) {
          if (bestHosp.socketId) {
            socket.emit('request-hospital', { reqId: assignedUser.id, hospitalSocketId: bestHosp.socketId, fieldReport, previousReports: previousReports.length > 0 ? previousReports : undefined });
            setSelectedHospital({ ...bestHosp, pos: bestHosp.location, baseDistance: 15 });
          } else {
            setSelectedHospital(bestHosp);
          }
        }
      }
    }
  }, [arrivalCountdown, socket, assignedUser, requestAccepted, arrivedAtUser, incomingRequest, location, networkHospitals, previousReports]);

  // ── Auth Gate ──
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at 20% 20%, #0f1e0a 0%, #050d1a 60%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Rajdhani', sans-serif" }}>
        <div style={{ background:'rgba(5,20,45,0.9)', border:'2px solid rgba(0,255,136,0.3)', borderRadius:16, padding:40, width:420, boxShadow:'0 0 40px rgba(0,255,136,0.1)' }}>
          <div style={{ textAlign:'center', marginBottom:30 }}>
            <div style={{ fontSize:50, marginBottom:8 }}>🚑</div>
            <div style={{ fontFamily:"'Orbitron'", fontSize:18, color:'#00ff88', letterSpacing:'0.15em' }}>AMBULANCE UNIT LOGIN</div>
            <div style={{ fontSize:12, color:'rgba(160,200,255,0.4)', fontFamily:"'Share Tech Mono'", marginTop:4 }}>RESCUELINK FIELD TERMINAL v2.0</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:11, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", letterSpacing:'0.1em', display:'block', marginBottom:4 }}>UNIT ID</label>
              <input value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="e.g. AMB-101" style={{ width:'100%', padding:'10px 14px', background:'rgba(0,255,136,0.05)', border:'1px solid rgba(0,255,136,0.2)', borderRadius:6, color:'#e0eaff', fontSize:14, fontFamily:"'Share Tech Mono'", outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", letterSpacing:'0.1em', display:'block', marginBottom:4 }}>PASSWORD</label>
              <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} placeholder="Enter unit password" style={{ width:'100%', padding:'10px 14px', background:'rgba(0,255,136,0.05)', border:'1px solid rgba(0,255,136,0.2)', borderRadius:6, color:'#e0eaff', fontSize:14, fontFamily:"'Share Tech Mono'", outline:'none', boxSizing:'border-box' }} />
            </div>
            {loginError && <div style={{ color:'#ff4444', fontSize:12, fontFamily:"'Share Tech Mono'", textAlign:'center' }}>⚠ {loginError}</div>}
            <button onClick={handleLogin} style={{ padding:'12px', background:'rgba(0,255,136,0.15)', border:'1px solid rgba(0,255,136,0.4)', borderRadius:8, color:'#00ff88', fontFamily:"'Orbitron'", fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em', transition:'all 0.2s' }}>AUTHENTICATE & CONNECT</button>
          </div>
          <div style={{ marginTop:20, fontSize:10, color:'rgba(160,200,255,0.25)', fontFamily:"'Share Tech Mono'", textAlign:'center', lineHeight:1.6 }}>
            Demo Units: AMB-101 to AMB-105<br/>Password: rescue + unit number (e.g. rescue101)
          </div>
        </div>
      </div>
    );
  }

  const toggleStreaming = () => setStreaming(s => !s);

  const toggleOffline = () => {
    setIsOffline(prev => {
      const next = !prev;
      if (!next && offlineBacklog.current.length > 0 && socket) {
        // transitioning to online, flush backlog
        socket.emit('bulk-vitals-update', offlineBacklog.current);
        offlineBacklog.current = [];
      }
      return next;
    });
  };

  const selectPatient = (id) => {
    setSelectedPatient(id);
    if (socket) {
      socket.emit('patient-selected', id);
      // Immediately tell the user we have arrived and enrolled the patient
      socket.emit('ambulance-arrived', { patientId: id });
    }
  };


  const sendNote = () => {
    if (!incidentNote.trim() || !socket) return;
    socket.emit('incident-note', { note: incidentNote, from: 'ambulance' });
    setIncidentNote('');
  };

  const toggleNoteListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Browser does not support speech recognition.");
    
    if (isListeningNote) return;
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListeningNote(true);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setIncidentNote(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onend = () => setIsListeningNote(false);
    recognition.start();
  };

  // Rough distance calc
  const calcDist = (pos1, pos2) => {
    if (!pos1 || !pos2 || !pos1.lat || !pos2.lat) return 0;
    const R = 6371; // km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(pos1.lat*Math.PI/180)*Math.cos(pos2.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };


  const acceptRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('ambulance-response', { reqId: incomingRequest.id, accepted: true });
    setAssignedUser(incomingRequest);
    setRequestAccepted(true);
    setArrivedAtUser(false);
    // Start arrival countdown (simulate ~15 seconds for demo)
    const eta = Math.max(10, Math.ceil(calcDist(location, incomingRequest.userLocation) / 0.6) * 2);
    setArrivalCountdown(Math.min(eta, 20)); // cap at 20s for demo
    setIncomingRequest(null);
  };



  const rejectRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('ambulance-response', { reqId: incomingRequest.id, accepted: false });
    setIncomingRequest(null);
  };



  const distanceToUser = assignedUser ? calcDist(location, assignedUser.userLocation) : 0;
  const distanceKm = distanceToUser; 
  const etaMin = Math.ceil(distanceKm / 0.6);

  const isCritical = vitals.heartRate > 110 || vitals.spo2 < 92 || vitals.systolic > 150 || vitals.heartRate < 50;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, #0f1e0a 0%, #050d1a 60%)',
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      padding: '0',
    }}>
      <style>{`
        @keyframes critFlash { from { box-shadow: 0 0 0 rgba(255,60,60,0); } to { box-shadow: 0 0 20px rgba(255,60,60,0.4); } }
        @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'rgba(5,20,10,0.95)',
        borderBottom: '1px solid rgba(80,200,80,0.2)',
        padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 20, height: 60,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: 22 }}>🚑</div>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 14, fontWeight: 700, color: '#88ff88', letterSpacing: '0.1em' }}>
            {authUnit?.unitId || 'AMBULANCE'} — PARAMEDIC CONSOLE
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
            {authUnit ? `${authUnit.driverName} · ${authUnit.vehicleNo} · ${authUnit.type}` : 'RESCUELINK FIELD TERMINAL v2.0'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: connected ? '#00ff88' : '#ff4444',
                boxShadow: connected ? '0 0 8px #00ff88' : '0 0 8px #ff4444',
              }} />
              {connected && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: '#00ff88', animation: 'pulse-ring 1.5s ease-out infinite',
                }} />
              )}
            </div>
            <span style={{ fontSize: 12, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'" }}>
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>

          {/* Streaming & Network toggles */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                const newState = !simulateTraffic;
                setSimulateTraffic(newState);
                trafficRef.current = newState;
                if (socket && location) {
                  socket.emit('location-update', { ...location, trafficDelay: newState });
                }
              }}
              style={{
                padding: '8px 20px',
                background: simulateTraffic ? 'rgba(255,200,0,0.2)' : 'rgba(0,200,255,0.05)',
                border: `1px solid ${simulateTraffic ? 'rgba(255,200,0,0.5)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 6, color: simulateTraffic ? '#ffb800' : 'rgba(160,200,255,0.5)',
                fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              {simulateTraffic ? '⚠️ TRAFFIC JAM' : '🚗 SIMULATE TRAFFIC'}
            </button>

            <button
              onClick={() => {
                if (!location) return;
                const newLoc = { lat: location.lat + 0.0008, lng: location.lng + 0.0008 };
                setLocation(newLoc);
                setLocationHistory(h => [...h.slice(-99), [newLoc.lat, newLoc.lng]]);
                if (socket) socket.emit('location-update', { ...newLoc, trafficDelay: simulateTraffic, arrivedAtUser: arrivedRef.current, selectedPatient: patientRef.current, destinationId: selectedHospital?.id, simulationOn: true });
              }}
              style={{
                padding: '8px 20px',
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.4)',
                borderRadius: 6, color: '#00ff88',
                fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              🚀 SIMULATE MOVEMENT
            </button>

            <button
              onClick={toggleOffline}
              style={{
                padding: '8px 20px',
                background: isOffline ? 'rgba(255,150,0,0.2)' : 'rgba(0,200,255,0.05)',
                border: `1px solid ${isOffline ? 'rgba(255,180,0,0.5)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 6, color: isOffline ? '#ffb800' : 'rgba(160,200,255,0.5)',
                fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              {isOffline ? '⚠️ DEAD ZONE ACTIVE' : '📶 SIMULATE DEAD ZONE'}
            </button>
            <button
              onClick={toggleStreaming}
              style={{
                padding: '8px 20px',
                background: streaming ? 'rgba(255,50,50,0.2)' : 'rgba(0,255,100,0.15)',
                border: `1px solid ${streaming ? 'rgba(255,80,80,0.5)' : 'rgba(0,255,100,0.4)'}`,
                borderRadius: 6, color: streaming ? '#ff6060' : '#00ff88',
                fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.1em', transition: 'all 0.2s',
              }}
            >
              {streaming ? '⏹ STOP STREAM' : '▶ START STREAM'}
            </button>
          </div>
        </div>
      </div>
  
        {/* Incoming Dispatch Request Modal */}
        {incomingRequest && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)'
          }}>
            <div style={{
              background: '#0a1e3a', border: '2px solid #00ff88', borderRadius: 12, padding: 30,
              width: 400, textAlign: 'center', boxShadow: '0 0 30px rgba(0,255,136,0.3)'
            }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🚨</div>
              <h2 style={{ color: '#00ff88', fontFamily: "'Orbitron'", margin: '0 0 10px' }}>INCOMING DISPATCH</h2>
              <p style={{ color: '#ccc', marginBottom: 20 }}>
                Emergency Request from Patient.<br/>
                Risk Level: <span style={{ color: '#ffb800', fontWeight: 'bold' }}>{incomingRequest.patientDetails.riskLevel}</span>
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={acceptRequest} style={{
                  padding: '10px 20px', background: '#00ff88', border: 'none', borderRadius: 6,
                  color: '#000', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'"
                }}>ACCEPT DISPATCH</button>
                <button onClick={rejectRequest} style={{
                  padding: '10px 20px', background: '#ff4444', border: 'none', borderRadius: 6,
                  color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'"
                }}>REJECT</button>
              </div>
            </div>
          </div>
        )}

        {/* Alerts section */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {aiAlert && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(255,180,0,0.2) 0%, rgba(255,180,0,0.05) 100%)',
              borderBottom: '2px solid rgba(255,180,0,0.6)',
              padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
              animation: 'critFlash 0.5s ease infinite alternate',
            }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ffb800', fontWeight: 700, letterSpacing: '0.1em' }}>
                  AI PREDICTION ALERT
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,200,100,0.9)', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>
                  {aiAlert.message}
                </div>
              </div>
            </div>
          )}
          
          {isCritical && streaming && !aiAlert && (
            <div style={{
              background: 'rgba(255,40,40,0.15)', borderBottom: '1px solid rgba(255,80,80,0.4)',
              padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 12,
              animation: 'critFlash 0.4s ease infinite alternate',
            }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ff6060', fontWeight: 700, letterSpacing: '0.1em' }}>
                CRITICAL VITALS DETECTED — HOSPITAL ALERTED
              </span>
            </div>
          )}
        </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, height: 'calc(100vh - 60px)' }}>
        {/* Main panel */}
        <div style={{ padding: 24, overflowY: 'auto' }}>

          {/* IDLE STATE — No patient assigned yet */}
          {!assignedUser && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
              <div style={{ fontSize: 60, opacity: 0.3 }}>🚑</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: 'rgba(160,200,255,0.3)', letterSpacing: '0.15em' }}>AWAITING DISPATCH</div>
              <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.2)', textAlign: 'center', maxWidth: 400 }}>
                Ambulance unit is online and ready. Patient vitals and details will appear here once a dispatch request is accepted.
              </div>
              <div style={{ padding: '8px 20px', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, fontSize: 11, fontFamily: "'Share Tech Mono'", color: '#00ff88', background: 'rgba(0,255,136,0.05)' }}>
                ● UNIT ONLINE — STANDING BY
              </div>
            </div>
          )}

          {/* ACTIVE STATE — show EN ROUTE or VITALS based on arrival */}
          {assignedUser && !arrivedAtUser && (
             <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:400, gap:20 }}>
               <div style={{ fontSize:60 }}>🚑</div>
               <div style={{ fontFamily:"'Orbitron'", fontSize:18, color:'#ff6b35', letterSpacing:'0.15em' }}>EN ROUTE TO PATIENT</div>
               <div style={{ fontSize:14, color:'rgba(160,200,255,0.6)', textAlign: 'center', maxWidth: 300 }}>
                 AMBULANCE IS DISPATCHED AND HEADED TO YOUR LOCATION. STAND BY FOR PATIENT ENROLLMENT.
               </div>
             </div>
          )}


          {assignedUser && arrivedAtUser && (<>

          {/* Patient selector */}
          <div style={{
            background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: 10, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
              PATIENT IDENTIFICATION
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {PATIENTS.map(id => (
                <button key={id} onClick={() => selectPatient(id)} style={{
                  padding: '8px 16px',
                  background: selectedPatient === id ? 'rgba(0,200,255,0.2)' : 'rgba(0,200,255,0.05)',
                  border: `1px solid ${selectedPatient === id ? 'rgba(0,200,255,0.6)' : 'rgba(0,200,255,0.15)'}`,
                  borderRadius: 6, color: selectedPatient === id ? '#00c8ff' : 'rgba(160,200,255,0.5)',
                  fontFamily: "'Share Tech Mono'", fontSize: 12, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                  {id}
                </button>
              ))}
            </div>
            {selectedPatient && (
              <div style={{ marginTop: 10, padding: '12px', background: 'rgba(0,200,255,0.06)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: 'rgba(160,200,255,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>PATIENT: </span>
                  <span style={{ color: '#00c8ff', fontSize: 13, fontWeight: 600 }}>{PATIENT_NAMES[selectedPatient]}</span>
                  <div style={{ fontSize: 11, color: '#00ff88', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>✓ TRANSMITTED TO HOSPITAL</div>
                </div>
                {/* Dynamic Triage Badge */}
                <div style={{
                  padding: '6px 12px', borderRadius: 4,
                  background: `${calculateTriage(vitals).color}22`,
                  border: `1px solid ${calculateTriage(vitals).color}66`,
                  color: calculateTriage(vitals).color,
                  fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
                  animation: calculateTriage(vitals).level === 'RED' ? 'pulse 1.5s infinite' : 'none',
                }}>
                  {calculateTriage(vitals).label}
                </div>
              </div>
            )}
          </div>

          {/* Vitals Grid - Only shown when patient is selected */}
          {selectedPatient ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#88ff88', letterSpacing: '0.1em' }}>
                  LIVE PATIENT VITALS {streaming && <span style={{ color: '#ff4444', animation: 'blink 1s step-end infinite' }}>● REC</span>}
                </div>

              <button 
                onClick={() => setSimulateCrisis(!simulateCrisis)}
                style={{
                  padding: '4px 10px', background: simulateCrisis ? 'rgba(255,180,0,0.2)' : 'rgba(160,200,255,0.05)',
                  border: `1px solid ${simulateCrisis ? '#ffb800' : 'rgba(160,200,255,0.2)'}`,
                  borderRadius: 4, color: simulateCrisis ? '#ffb800' : 'rgba(160,200,255,0.5)',
                  fontFamily: "'Share Tech Mono'", fontSize: 10, cursor: 'pointer'
                }}>
                {simulateCrisis ? "⚠️ SIMULATING CRISIS" : "SIMULATE CRISIS"}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <VitalCard label="HEART RATE" value={vitals.heartRate} unit="bpm" color="#ff6b6b" icon="❤️"
                critical={vitals.heartRate > 110 || vitals.heartRate < 50} />
              <VitalCard label="SpO2" value={vitals.spo2} unit="%" color="#00c8ff" icon="💧"
                critical={vitals.spo2 < 92} />
              <VitalCard label="BLOOD PRESSURE" value={`${vitals.systolic}/${vitals.diastolic}`} unit="mmHg" color="#ffb800" icon="🩸"
                critical={vitals.systolic > 150} />
              <VitalCard label="TEMPERATURE" value={vitals.temperature} unit="°C" color="#ff88aa" icon="🌡️"
                critical={vitals.temperature > 38.5} />
              <VitalCard label="RESP RATE" value={vitals.respRate} unit="br/min" color="#88ff88" icon="🫁"
                critical={vitals.respRate > 25 || vitals.respRate < 12} />
              <VitalCard label="BLOOD GLUCOSE" value={vitals.glucose} unit="mg/dL" color="#aa88ff" icon="🔬"
                critical={vitals.glucose > 200 || vitals.glucose < 70} />
            </div>
          </div>
          ) : (
            <div style={{ 
              padding: '40px 20px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', 
              borderRadius: 10, border: '1px dashed rgba(160,200,255,0.2)', marginBottom: 20 
            }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>📋</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: 'rgba(160,200,255,0.4)' }}>
                SELECT A PATIENT ABOVE TO START VITALS MONITORING
              </div>
            </div>
          )}


          {/* Location & ETA */}
          <div style={{
            background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: 10, padding: 20, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
                GPS NAVIGATION
              </div>
              {simulateTraffic && (
                <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: '#ffb800', animation: 'blink 1s step-end infinite' }}>
                  ⚠ HEAVY TRAFFIC DELAY
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                ['LAT', location.lat.toFixed(4), '°N'],
                ['LNG', location.lng.toFixed(4), '°E'],
                ['DISTANCE', distanceKm.toFixed(1), 'km remaining'],
                ['ETA', `~${etaMin}`, 'minutes'],
              ].map(([l, v, u]) => (
                <div key={l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", letterSpacing: '0.1em' }}>{l}</div>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 22, color: '#00c8ff', fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>{u}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                <span>📍 JUNNAR INCIDENT SITE</span>
                <span>🏥 {selectedHospital.name.toUpperCase()}</span>
              </div>
              <div style={{ height: 8, background: 'rgba(0,200,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${routeProgress * 100}%`,
                  background: simulateTraffic ? 'linear-gradient(90deg, #ffb800, #ff6b6b)' : 'linear-gradient(90deg, #00c8ff, #88ff88)',
                  borderRadius: 4, transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* Live Map */}
            <div style={{
              marginTop: 16, borderRadius: 8, overflow: 'hidden',
              border: '1px solid rgba(0,200,255,0.2)', height: 200, position: 'relative',
            }}>
              <MapContainer
                center={[19.2, 73.9]}
                zoom={12}
                style={{ height: '100%', width: '100%', background: '#050d1a' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap'
                />
                {location && location.lat && (
                  <Marker position={[location.lat, location.lng]} icon={ambulanceIcon}>
                    <Popup><strong>🚑 Ambulance</strong><br />Lat: {location.lat.toFixed(4)}<br />Lng: {location.lng.toFixed(4)}</Popup>
                  </Marker>
                )}
                {assignedUser && assignedUser.userLocation && (
                  <Marker position={[assignedUser.userLocation.lat, assignedUser.userLocation.lng]} icon={userIcon}>
                    <Popup><strong>🧍 Emergency Location</strong></Popup>
                  </Marker>
                )}
                {selectedHospital && (selectedHospital.pos || selectedHospital.location) && (
                  <Marker 
                    position={[
                      selectedHospital.pos ? selectedHospital.pos.lat : selectedHospital.location.lat, 
                      selectedHospital.pos ? selectedHospital.pos.lng : selectedHospital.location.lng
                    ]} 
                    icon={hospitalIcon}
                  >
                    <Popup><strong>🏥 {selectedHospital.name}</strong></Popup>
                  </Marker>
                )}
                {routePath && (
                  <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
                )}
                {locationHistory.length > 1 && (
                  <Polyline positions={locationHistory} color={simulateTraffic ? "#ffb800" : "#00c8ff"} weight={3} opacity={0.5} />
                )}
              </MapContainer>
            </div>
          </div>

          {/* Multi-Hospital Network Directory */}
          <div style={{
            background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: 10, padding: 20,
          }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
              NEARBY HOSPITALS NETWORK
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {HOSPITALS.map((hosp) => {
                const isSelected = selectedHospital.id === hosp.id;
                const resources = isSelected ? hospitalResources : hosp.simulatedResources;
                const readyCount = Object.values(resources).filter(Boolean).length;
                
                return (
                  <div key={hosp.id} style={{
                    padding: '12px', borderRadius: 8,
                    background: isSelected ? 'rgba(0,200,255,0.1)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${isSelected ? '#00c8ff' : 'rgba(160,200,255,0.1)'}`,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: isSelected ? '#e0eaff' : 'rgba(160,200,255,0.7)', fontWeight: 700 }}>
                          {hosp.name} {isSelected && <span style={{ color: '#00ff88', fontSize: 9 }}>[LIVE]</span>}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                          ETA: ~{Math.ceil(hosp.baseDistance / 0.6)} mins · {readyCount}/4 Services Ready
                        </div>
                      </div>
                      {!isSelected && (
                        <button onClick={() => setRerouteTarget(hosp)} style={{
                          padding: '4px 10px', background: 'rgba(255,100,100,0.1)',
                          border: '1px solid rgba(255,100,100,0.4)', borderRadius: 4,
                          color: '#ff6b6b', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer'
                        }}>🔄 REROUTE</button>
                      )}
                      {isSelected && (
                        <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", fontWeight: 700, padding: '4px 10px', background: 'rgba(0,200,255,0.1)', borderRadius: 4 }}>
                          SELECTED
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        { k: 'otPrepared', label: 'OT', icon: '🔪' },
                        { k: 'ventilatorReady', label: 'VENT', icon: '🫁' },
                        { k: 'cardiologistAssigned', label: 'CARDIO', icon: '🫀' },
                        { k: 'bloodBankAlerted', label: 'BLOOD', icon: '🩸' }
                      ].map(({ k, label, icon }) => (
                        <div key={k} style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 10, fontFamily: "'Share Tech Mono'",
                          background: resources[k] ? 'rgba(0,255,100,0.1)' : 'rgba(255,40,40,0.1)',
                          border: `1px solid ${resources[k] ? 'rgba(0,255,100,0.3)' : 'rgba(255,40,40,0.3)'}`,
                          color: resources[k] ? '#00ff88' : 'rgba(255,80,80,0.7)',
                        }}>
                          {icon} {label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incident Notes */}
          <div style={{
            background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: 10, padding: 20,
          }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
              INCIDENT NOTES
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={toggleNoteListening} style={{
                background: isListeningNote ? 'rgba(255,40,40,0.2)' : 'rgba(0,200,255,0.1)',
                border: `1px solid ${isListeningNote ? 'rgba(255,80,80,0.5)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 6, padding: '10px 14px', color: isListeningNote ? '#ff6060' : '#00c8ff',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                🎤
              </button>
              <input
                value={incidentNote}
                onChange={e => setIncidentNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendNote()}
                placeholder={isListeningNote ? "Listening..." : "Type incident note and press Enter..."}
                style={{
                  flex: 1, background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)',
                  borderRadius: 6, padding: '10px 14px', color: '#e0eaff', fontSize: 14,
                  fontFamily: "'Rajdhani'", outline: 'none',
                }}
              />
              <button onClick={sendNote} style={{
                padding: '10px 20px',
                background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.3)',
                borderRadius: 6, color: '#00c8ff', fontFamily: "'Orbitron'",
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>SEND</button>
            </div>
          </div>

          </>)}
        </div>

        {/* Chat sidebar */}
        <div style={{
          background: 'rgba(3,10,28,0.95)',
          borderLeft: '1px solid rgba(0,200,255,0.1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0,200,255,0.1)',
            fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em',
          }}>
            📞 HOSPITAL COMM LINK
          </div>
          <VideoCall socket={socket} />
          <div style={{ flex: 1, padding: '12px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel socket={socket} messages={messages} />
          </div>
          {/* Reroute Confirmation Modal */}
          {rerouteTarget && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20
            }}>
              <div style={{
                width: '100%', maxWidth: 450, background: '#050d1a', border: '1px solid #ff4444',
                borderRadius: 12, padding: 24, boxShadow: '0 0 50px rgba(255,0,0,0.2)'
              }}>
                <div style={{ fontFamily: "'Orbitron'", color: '#ff4444', fontSize: 16, marginBottom: 16 }}>⚠️ CONFIRM REROUTE</div>
                <div style={{ fontSize: 14, color: '#e0eaff', marginBottom: 20, lineHeight: 1.5 }}>
                  You are changing destination to <span style={{ color: '#00c8ff', fontWeight: 'bold' }}>{rerouteTarget.name}</span>.<br />
                  Current connected hospital: <span style={{ color: '#ffb800' }}>{selectedHospital.name}</span>.
                </div>
                
                <div style={{ 
                  background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 8, marginBottom: 24,
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setShareHistory(!shareHistory)}>
                    <div style={{ 
                      width: 20, height: 20, border: '2px solid #00c8ff', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: shareHistory ? '#00c8ff' : 'transparent'
                    }}>
                      {shareHistory && <span style={{ color: '#050d1a', fontWeight: 'bold' }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Share Clinical History?</div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>Transmits previous hospital's reports & triage notes.</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setRerouteTarget(null)} style={{
                    flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff', borderRadius: 6, cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 12
                  }}>CANCEL</button>
                  <button onClick={() => {
                    const hosp = rerouteTarget;
                    if (selectedHospital) {
                      const triage = vitalsRef.current;
                      const snapshot = {
                        hospitalName: selectedHospital.name,
                        timestamp: new Date().toLocaleString(),
                        triageColor: triage.spo2 < 92 || triage.heartRate > 130 ? '#ff4444' : triage.spo2 < 94 || triage.heartRate > 110 ? '#ffb800' : '#00ff88',
                        triageLabel: triage.spo2 < 92 || triage.heartRate > 130 ? 'IMMEDIATE (RED)' : triage.spo2 < 94 || triage.heartRate > 110 ? 'URGENT (YELLOW)' : 'STABLE (GREEN)',
                        vitals: { ...triage },
                        notes: `Rerouted from ${selectedHospital.name} to ${hosp.name}. Reason: Tactical reroute.`
                      };
                      const updatedReports = [...previousReports, snapshot];
                      setPreviousReports(updatedReports);
                      
                      // Notify network
                      const netHosp = Object.entries(networkHospitals).find(([_, h]) => h.id === hosp.id);
                      if (socket && assignedUser) {
                        if (netHosp) {
                          socket.emit('request-hospital', { 
                            reqId: assignedUser.id, 
                            hospitalSocketId: netHosp[0],
                            fieldReport: snapshot,
                            previousReports: shareHistory ? updatedReports : undefined,
                            arrivedAtUser: true
                          });
                        }
                        socket.emit('reroute-hospital', {
                          reqId: assignedUser.id,
                          newHospitalId: hosp.id,
                          newHospitalName: hosp.name,
                          fieldReport: snapshot,
                          previousReports: shareHistory ? updatedReports : undefined
                        });
                      }
                    }
                    setSelectedHospital(hosp);
                    setRoutePath(null);
                    setRerouteTarget(null);
                  }} style={{
                    flex: 2, padding: 12, background: '#ff4444', border: 'none',
                    color: '#fff', borderRadius: 6, cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold'
                  }}>CONFIRM REROUTE</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

  );
}
