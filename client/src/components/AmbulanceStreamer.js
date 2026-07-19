import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import VideoCall from './VideoCall';
import { showAlert } from '../utils/alert';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PhysiologicalWaveforms from './PhysiologicalWaveforms';
let audioCtx = null;

/* ─── Alert beep using Web Audio API ─────────────────────────────────────── */
function playAlertBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const ctx = audioCtx;
    
    [880, 1320, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.1);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.1);
    });
  } catch (err) {
    console.warn('Audio alert failed', err);
  }
}

// Resume audio context on first click to bypass browser restrictions
if (typeof window !== 'undefined') {
  window.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(e => console.warn('Audio resume failed', e));
    }
  }, { once: true });
}

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

// GLOBAL: Ambulance credentials use neutral IDs. In production these come from the backend DB.
const AMBULANCE_CREDENTIALS = [
  { unitId: 'AMB-101', driverName: 'Unit 101 Lead Paramedic', vehicleNo: 'EMG-RL-0101', type: 'ALS' },
  { unitId: 'AMB-102', driverName: 'Unit 102 Lead Paramedic', vehicleNo: 'EMG-RL-0102', type: 'BLS' },
  { unitId: 'AMB-103', driverName: 'Unit 103 Lead Paramedic', vehicleNo: 'EMG-RL-0103', type: 'ALS' },
  { unitId: 'AMB-104', driverName: 'Unit 104 Lead Paramedic', vehicleNo: 'EMG-RL-0104', type: 'BLS' },
  { unitId: 'AMB-105', driverName: 'Unit 105 Lead Paramedic', vehicleNo: 'EMG-RL-0105', type: 'ALS' },
];

// GLOBAL GEOSPATIAL GENERATOR: 
// Automatically spawns Enterprise Trauma Centers in a 10km radius of the device's native GPS, 
// guaranteeing the demo works natively in ANY city or country.
export const generateGlobalHospitals = (currentLoc) => {
  if (!currentLoc) return [];
  
  // Base offset ~ 0.01 lat/lng = ~1km
  return [
    { id: 'regional-1', name: 'Central City Trauma Center', type: 'live', pos: { lat: currentLoc.lat + 0.04, lng: currentLoc.lng + 0.02 }, baseDistance: 4.5, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: true }, inventory: { outOfBlood: false, outOfBeds: false } },
    { id: 'regional-2', name: 'University Medical Center', type: 'simulated', pos: { lat: currentLoc.lat - 0.03, lng: currentLoc.lng + 0.05 }, baseDistance: 6.2, simulatedResources: { otPrepared: true, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: true }, inventory: { outOfBlood: true, outOfBeds: false } },
    { id: 'regional-3', name: 'District General Hospital', type: 'simulated', pos: { lat: currentLoc.lat - 0.06, lng: currentLoc.lng - 0.02 }, baseDistance: 7.1, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true, bloodBankAlerted: true }, inventory: { outOfBlood: false, outOfBeds: true } },
    { id: 'regional-4', name: 'St. Jude Cardiac Institute', type: 'simulated', pos: { lat: currentLoc.lat + 0.08, lng: currentLoc.lng - 0.05 }, baseDistance: 12.4, simulatedResources: { otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: true }, inventory: { outOfBlood: true, outOfBeds: true } },
    { id: 'regional-5', name: 'Mercy Multispeciality Clinic', type: 'simulated', pos: { lat: currentLoc.lat + 0.01, lng: currentLoc.lng - 0.07 }, baseDistance: 8.0, simulatedResources: { otPrepared: true, ventilatorReady: true, cardiologistAssigned: false, bloodBankAlerted: true }, inventory: { outOfBlood: false, outOfBeds: false } }
  ];
};

// Rough distance calc
const calcDist = (pos1, pos2) => {
  if (!pos1 || !pos2 || !pos1.lat || !pos2.lat) return 0;
  const R = 6371; // km
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function lerp(a, b, t) { return a + (b - a) * t; }

/* ─── Auto-Triage Logic ───────────────────────────────────────────────────── */
export function calculateTriage(vitals) {
  if (!vitals) return { level: 'PENDING', color: 'rgba(160,200,255,0.4)', label: 'AWAITING DATA' };

  let score = 0;

  if (vitals.heartRate <= 40 || vitals.heartRate >= 131) score += 3;
  else if (vitals.heartRate >= 111) score += 2;
  else if (vitals.heartRate <= 50 || vitals.heartRate >= 91) score += 1;

  if (vitals.spo2 <= 91) score += 3;
  else if (vitals.spo2 === 92 || vitals.spo2 === 93) score += 2;
  else if (vitals.spo2 === 94 || vitals.spo2 === 95) score += 1;

  if (vitals.systolic <= 90) score += 3;
  else if (vitals.systolic <= 100) score += 2;
  else if (vitals.systolic <= 110) score += 1;
  else if (vitals.systolic >= 220) score += 3;

  if (score >= 7) return { level: 'RED', color: '#ff4444', label: `NEWS2: ${score} (CRITICAL)` };
  if (score >= 5) return { level: 'YELLOW', color: '#ffb800', label: `NEWS2: ${score} (URGENT)` };
  return { level: 'GREEN', color: '#00ff88', label: `NEWS2: ${score} (STABLE)` };
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
      bloodGlucose: Math.round(clamp(jitter(prev?.bloodGlucose ?? 110, 5), 40, 300)),
    };
  }

  return {
    heartRate: Math.round(clamp(jitter(prev?.heartRate ?? 78, 2), 65, 95)),
    spo2: Math.round(clamp(jitter(prev?.spo2 ?? 98, 0.5), 95, 100) * 10) / 10,
    systolic: Math.round(clamp(jitter(prev?.systolic ?? 120, 2), 110, 140)),
    diastolic: Math.round(clamp(jitter(prev?.diastolic ?? 80, 2), 70, 90)),
    temperature: Math.round(clamp(jitter(prev?.temperature ?? 37.0, 0.1), 36.5, 37.5) * 10) / 10,
    respRate: Math.round(clamp(jitter(prev?.respRate ?? 14, 1), 12, 18)),
    bloodGlucose: Math.round(clamp(jitter(prev?.bloodGlucose ?? 100, 2), 80, 120)),
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

const PATIENTS = ['PAT-001', 'PAT-002', 'PAT-003', 'PAT-004', 'PAT-005', 'PAT-006', 'PAT-007', 'PAT-008', 'PAT-009', 'PAT-010'];
const PATIENT_NAMES = {
  'PAT-001': 'Rajesh Kumar (58M)', 'PAT-002': 'Sunita Sharma (34F)', 'PAT-003': 'Arjun Patel (72M)',
  'PAT-004': 'Kavya Nair (26F)', 'PAT-005': 'Mohammed Ansari (45M)', 'PAT-006': 'Priya Deshmukh (41F)',
  'PAT-007': 'Vikram Jadhav (63M)', 'PAT-008': 'Meera Kulkarni (29F)', 'PAT-009': 'Ravi Shinde (55M)',
  'PAT-010': 'Ananya Patil (38F)',
};

/* ─── Paramedic Toolkit ────────────────────────────────────────────────────── */
function ParamedicToolkit({ patientDetails, socket, reqId, checklist = {}, setChecklist }) {
  const [weight, setWeight] = useState(70); // kg
  const [protocol, setProtocol] = useState('CARDIAC ARREST');
  const [selectedDrug, setSelectedDrug] = useState('');

  // Mock ABDM Allergies
  const allergies = patientDetails?.allergies || ['Penicillin', 'Sulfa Drugs'];

  const protocols = {
    'CARDIAC ARREST': [
      'Initiate CPR',
      'Apply AED',
      'Establish IV',
      'Administer Epinephrine',
      'Secure Airway'
    ],
    'TRAUMA/HEMORRHAGE': [
      'Apply Tourniquet',
      'Collar C-Spine',
      'IV Fluids Bolus',
      'Splint Fractures'
    ],
    'STROKE': [
      'Cincinnati Stroke Scale',
      'Check Blood Glucose',
      'Establish 2x Large Bore IVs',
      'Pre-alert Stroke Team'
    ],
    'RESPIRATORY DISTRESS': [
      'Administer High-Flow O2',
      'Nebulize Albuterol',
      'Monitor Capnography',
      'Prepare CPAP'
    ]
  };

  const drugs = [
    { name: 'Epinephrine', calc: (w) => (w >= 40 ? '1 mg (1:10000) IV' : `${(w * 0.01).toFixed(2)} mg IV`) },
    { name: 'Amiodarone', calc: (w) => (w >= 40 ? '300 mg IV' : `${(w * 5).toFixed(0)} mg IV`) },
    { name: 'Fentanyl', calc: (w) => `${(w * 1).toFixed(0)} mcg IV` },
    { name: 'Amoxicillin', calc: (w) => 'Not for emergency prehospital use' } // For allergy demo
  ];

  const handleToggleStep = (step) => {
    const newChecklist = {
      ...checklist,
      [step]: checklist[step] ? null : new Date().toLocaleTimeString()
    };
    setChecklist(newChecklist);
    if (socket && reqId) {
      socket.emit('clinical-checklist-update', { reqId, checklist: newChecklist });
    }
  };

  const checkAllergy = (drugName) => {
    if (drugName === 'Amoxicillin' && allergies.includes('Penicillin')) return true;
    return false;
  };

  return (
    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20, display: 'flex', gap: 20 }}>
      {/* Protocol Checklist */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>📋 PARAMEDIC PROTOCOL</div>
          <select value={protocol} onChange={e => { setProtocol(e.target.value); }} style={{ background: 'rgba(0,0,0,0.4)', color: '#00c8ff', border: '1px solid #00c8ff', borderRadius: 4, padding: '4px', fontSize: 10, fontFamily: "'Orbitron'" }}>
            {Object.keys(protocols).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {protocols[protocol].map((step, idx) => (
            <div key={idx} onClick={() => handleToggleStep(step)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: checklist[step] ? 'rgba(0,255,136,0.1)' : 'rgba(0,0,0,0.3)', border: `1px solid ${checklist[step] ? '#00ff88' : 'rgba(160,200,255,0.2)'}`, borderRadius: 6, cursor: 'pointer' }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checklist[step] ? '#00ff88' : 'rgba(160,200,255,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checklist[step] ? '#00ff88' : 'transparent' }}>
                {checklist[step] && <span style={{ color: '#000', fontSize: 12 }}>✓</span>}
              </div>
              <div style={{ flex: 1, fontSize: 11, color: checklist[step] ? '#00ff88' : '#e0eaff', textDecoration: checklist[step] ? 'line-through' : 'none' }}>{step}</div>
              {checklist[step] && <div style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(0,255,136,0.6)' }}>{checklist[step]}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Drug Calculator & Alerts */}
      <div style={{ width: 250, borderLeft: '1px solid rgba(0,200,255,0.15)', paddingLeft: 20 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>💊 DOSAGE CALCULATOR</div>
        
        <div style={{ marginBottom: 15 }}>
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 4 }}>PATIENT WEIGHT (KG)</div>
          <input type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>

        <div style={{ marginBottom: 15 }}>
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 4 }}>DRUG SELECTION</div>
          <select value={selectedDrug} onChange={e => setSelectedDrug(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: 8, boxSizing: 'border-box' }}>
            <option value="">-- Select Drug --</option>
            {drugs.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </div>

        {selectedDrug && !checkAllergy(selectedDrug) && (
          <div style={{ padding: 10, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'" }}>CALCULATED DOSE</div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginTop: 4 }}>{drugs.find(d => d.name === selectedDrug).calc(weight)}</div>
          </div>
        )}

        {selectedDrug && checkAllergy(selectedDrug) && (
          <div style={{ padding: 10, background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', borderRadius: 6, animation: 'blink 1s infinite' }}>
            <div style={{ fontSize: 14 }}>⚠️ WARNING</div>
            <div style={{ fontSize: 10, color: '#ff4444', marginTop: 4 }}>Patient has active {allergies[0]} allergy. DO NOT ADMINISTER.</div>
          </div>
        )}
      </div>
    </div>
  );
}

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
    if (!SpeechRecognition) return showAlert("Browser does not support speech recognition.");

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
      <div style={{ display: 'flex', gap: 8, padding: '8px 0 0', marginBottom: '40px' }}>
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
          placeholder="Msg..."
          style={{
            flex: 1, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: 6, padding: '10px 8px', color: '#e0eaff', fontSize: 13,
            fontFamily: "'Rajdhani'", outline: 'none', minWidth: 0
          }}
        />
        <button onClick={send} style={{
          background: 'rgba(255,107,53,0.2)', border: '1px solid rgba(255,107,53,0.4)',
          borderRadius: 6, padding: '10px 12px', color: '#ff6b35',
          cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
          minWidth: '65px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        }}>SEND</button>
      </div>
    </div>
  );
}

/* ─── Main AmbulanceStreamer ─────────────────────────────────────────────── */
/* --- Map recenter helper --- */
function SmartMapController({ ambulanceLoc, userLoc, manualCenter }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    if (manualCenter) {
      map.setView([manualCenter.lat, manualCenter.lng], 13, { animate: true });
      return;
    }

    if (ambulanceLoc && userLoc) {
      const bounds = L.latLngBounds([
        [ambulanceLoc.lat, ambulanceLoc.lng],
        [userLoc.lat, userLoc.lng]
      ]);
      const boundsStr = bounds.toBBoxString();
      if (boundsStr !== lastBoundsRef.current) {
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
        lastBoundsRef.current = boundsStr;
      }
    } else if (ambulanceLoc) {
      map.panTo([ambulanceLoc.lat, ambulanceLoc.lng], { animate: true });
    }
  }, [ambulanceLoc, userLoc, manualCenter, map]);

  return null;
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center.lat) {
      map.panTo([center.lat, center.lng], { animate: true });
    }
  }, [center, map]);
  return null;
}


export default function AmbulanceStreamer({ socket, connected }) {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!sessionStorage.getItem('rescuelink_token'));
  const [authUnit, setAuthUnit] = useState(() => {
    const userStr = sessionStorage.getItem('rescuelink_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const emailUpper = (user.email || '').toUpperCase();
      const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === emailUpper) || {
        unitId: user.id,
        driverName: user.name,
        vehicleNo: 'EMG-RL-0101',
        type: 'ALS'
      };
      return found;
    }
    return null;
  });
  useEffect(() => {
    const userStr = sessionStorage.getItem('rescuelink_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const emailUpper = (user.email || '').toUpperCase();
      const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === emailUpper) || {
        unitId: user.id,
        driverName: user.name,
        vehicleNo: 'EMG-RL-0101',
        type: 'ALS'
      };
      setAuthUnit(found);
      setIsAuthenticated(true);
    }
  }, []);
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [manualRecoveryId, setManualRecoveryId] = useState('');
  const [vitals, setVitals] = useState({ heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 37.0, respRate: 16, bloodGlucose: 100 });
  const [vitalsSource, setVitalsSource] = useState('SIMULATED'); // 'SIMULATED', 'MANUAL', 'LIVE'
  const vitalsSourceRef = useRef(vitalsSource);
  useEffect(() => { vitalsSourceRef.current = vitalsSource; }, [vitalsSource]);

  const [greenCorridorActive, setGreenCorridorActive] = useState(false);

  const [bleDevice, setBleDevice] = useState(null);
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleError, setBleError] = useState('');

  const connectBluetoothHRM = async () => {
    setBleConnecting(true);
    setBleError('');
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser.');
      }
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      
      await characteristic.startNotifications();
      
      const handleHeartRateNotification = (event) => {
        const value = event.target.value;
        const flags = value.getUint8(0);
        let hrValue;
        if ((flags & 0x01) === 0) {
          hrValue = value.getUint8(1);
        } else {
          hrValue = value.getUint16(1, true);
        }
        
        setVitals(prev => {
          const updated = { ...prev, heartRate: hrValue };
          if (socket && connected && !isOfflineRef.current) {
            socket.emit('vitals-update', { ...updated, reqId: assignedUserRef.current?.id });
          }
          return updated;
        });
      };

      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateNotification);
      setBleDevice(device);
      setVitalsSource('BLUETOOTH');
      
      device.addEventListener('gattserverdisconnected', () => {
        console.log('[BLE] GATT server disconnected');
        setBleDevice(null);
        setVitalsSource('SIMULATED');
      });
      
    } catch (err) {
      console.error('[BLE ERROR]', err);
      setBleError(err.message || 'Bluetooth connection failed');
      setVitalsSource('SIMULATED');
    } finally {
      setBleConnecting(false);
    }
  };

  const disconnectBluetoothHRM = () => {
    if (bleDevice && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
    setBleDevice(null);
    setVitalsSource('SIMULATED');
  };

  const handleManualVitalChange = (key, val) => {
    const numVal = parseFloat(val) || 0;
    setVitals(prev => {
      const updated = { ...prev, [key]: numVal, source: 'MANUAL' };
      if (socket && connected && !isOfflineRef.current) {
        socket.emit('vitals-update', { ...updated, reqId: assignedUserRef.current?.id });
      }
      return updated;
    });
  };
  const [resourceLocks, setResourceLocks] = useState({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
  const [trafficIncidents, setTrafficIncidents] = useState({});
  const [clinicalChecklist, setClinicalChecklist] = useState({});

  // HRI calculation helper
  const calculateHRI = (dist, h) => {
    const eta = Math.ceil(dist / 0.6);
    const icuBeds = h.inventory && typeof h.inventory.beds === 'number' ? h.inventory.beds : (h.inventory?.outOfBeds ? 0 : 10);
    const traumaReady = (h.simulatedResources?.otPrepared || h.resources?.otPrepared || h.resources?.ot) ? 1 : 0;
    const queue = h.activeMissionsCount || 0;

    const rawScore = -1.2 * eta + 3.0 * icuBeds + 15.0 * traumaReady - 2.0 * queue + 50;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    const breakdown = `-1.2 * ETA (${eta}m) + 3.0 * ICU Beds (${icuBeds}) + 15.0 * Trauma Ready (${traumaReady ? 'Yes' : 'No'}) - 2.0 * ER Queue (${queue}) + 50`;
    
    return { score, breakdown, eta, icuBeds, traumaReady, queue };
  };
  const [streaming, setStreaming] = useState(false);
  const [hardwareMode, setHardwareMode] = useState(true); // Enable simulation by default for vitals generation
  const [selectedPatient, setSelectedPatient] = useState(() => localStorage.getItem('amb_selectedPatient') || '');
  const [isScanning, setIsScanning] = useState(false);
  const [routeProgress, setRouteProgress] = useState(0);
  const [showGodMode, setShowGodMode] = useState(false);

  // Hidden God Mode Toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl + Shift + D to toggle Demo Control Panel
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowGodMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // FIX: Initial location starts null — navigator.geolocation provides real city coords.
  // Previously hardcoded to Pune (18.5204, 73.8567), which broke routing in every other country.
  const [location, setLocation] = useState(null);
  const [locationMethod, setLocationMethod] = useState('detecting...');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsSpeed, setGpsSpeed] = useState(null);
  const [gpsHeading, setGpsHeading] = useState(null);
  const [gpsOverride, setGpsOverride] = useState(false);
  const [overrideLat, setOverrideLat] = useState('');
  const [overrideLng, setOverrideLng] = useState('');
  const [gpsError, setGpsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualCenter, setManualCenter] = useState(null);

  const handleManualSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const newLoc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setLocation(newLoc);
        setManualCenter(newLoc);
        setLocationMethod('manual');
        if (socket) socket.emit('location-update', newLoc);
      }
    } catch (e) { console.error('Search failed', e); }
  };
  const [elapsed, setElapsed] = useState(0);
  const [messages, setMessages] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [networkHospitals, setNetworkHospitals] = useState({});
  // HIGH-RELIABILITY: Sync assigned hospital socket if it changes in the network
  useEffect(() => {
    if (selectedHospital && networkHospitals) {
      const updated = Object.values(networkHospitals).find(h => h.id === selectedHospital.id);
      if (updated && updated.socketId !== selectedHospital.socketId) {
        console.log(`[SYNC] Updating hospital socket: ${selectedHospital.socketId} -> ${updated.socketId}`);
        setSelectedHospital(updated);
      }
    }
  }, [networkHospitals, selectedHospital]);

  const [incidentNote, setIncidentNote] = useState('');
  const [isListeningNote, setIsListeningNote] = useState(false);
  const [hospitalResources, setHospitalResources] = useState({ otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: false });
  const [aiAlert, setAiAlert] = useState(null);
  const [simulateCrisis, setSimulateCrisis] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [signalLostTime, setSignalLostTime] = useState(0);
  const [isHardwareOnline, setIsHardwareOnline] = useState(navigator.onLine);
  const [simulateTraffic, setSimulateTraffic] = useState(false);
  const trafficRef = useRef(false);
  useEffect(() => { trafficRef.current = simulateTraffic; }, [simulateTraffic]);

  const [locationHistory, setLocationHistory] = useState([]);

  const [escalationTimer, setEscalationTimer] = useState(null); // Countdown seconds
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [hospitalRequestSent, setHospitalRequestSent] = useState(false);

  const [incomingRequest, setIncomingRequest] = useState(null);
  const [assignedUser, setAssignedUser] = useState(null);
  const [assignedHospital, setAssignedHospital] = useState(null);

  const assignedUserRef = useRef(assignedUser);
  useEffect(() => {
    assignedUserRef.current = assignedUser;
  }, [assignedUser]);


  const [ambulances, setAmbulances] = useState({}); // Fleet overview
  const [routePath, setRoutePath] = useState(null);
  const [previousReports, setPreviousReports] = useState([]);

  const [requestAccepted, setRequestAccepted] = useState(false);
  const [arrivedAtUser, setArrivedAtUser] = useState(false);
  const [patientLoaded, setPatientLoaded] = useState(false);
  const [arrivalCountdown, setArrivalCountdown] = useState(20);
  const [rerouteTarget, setRerouteTarget] = useState(null);
  const [shareHistory, setShareHistory] = useState(true);
  const [pendingResumeMission, setPendingResumeMission] = useState(null);
  const ignoredMissionsRef = useRef(new Set());
  const lastFieldReportRef = useRef(null);
  const [commTab, setCommTab] = useState('hospital');

  // --- STATE RECOVERY SYNC ---
  useEffect(() => { localStorage.setItem('amb_streaming', streaming); }, [streaming]);
  useEffect(() => { localStorage.setItem('amb_selectedPatient', selectedPatient); }, [selectedPatient]);
  useEffect(() => { localStorage.setItem('amb_incomingRequest', JSON.stringify(incomingRequest)); }, [incomingRequest]);
  useEffect(() => { localStorage.setItem('amb_assignedUser', JSON.stringify(assignedUser)); }, [assignedUser]);
  useEffect(() => { localStorage.setItem('amb_assignedHospital', JSON.stringify(assignedHospital)); }, [assignedHospital]);
  useEffect(() => { localStorage.setItem('amb_requestAccepted', requestAccepted); }, [requestAccepted]);
  useEffect(() => { localStorage.setItem('amb_arrivedAtUser', arrivedAtUser); }, [arrivedAtUser]);


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
  const hospitalRef = useRef(null);
  const arrivedHospitalRef = useRef(false);
  const lastAlertedIdRef = useRef(null);
  const lastVitalsAlertRef = useRef(0);
  useEffect(() => { arrivedRef.current = arrivedAtUser; }, [arrivedAtUser]);
  useEffect(() => { patientRef.current = selectedPatient; }, [selectedPatient]);
  useEffect(() => { hospitalRef.current = assignedHospital; }, [assignedHospital]);


  const handleLogin = async () => {
    try {
      const cleanId = loginId.trim().toLowerCase();
      // ENTERPRISE AUTH: Request cryptographic JWT from backend
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cleanId, password: loginPass, role: 'ambulance' })
      });
      const data = await res.json();
      
      if (res.ok && data.token) {
        // Securely store JWT for future API calls
        sessionStorage.setItem('rescuelink_token', data.token);
        console.log('[ENTERPRISE SEC] JWT Successfully obtained and stored in session.');
        
        // Hydrate frontend profile (Fallback to mock details if purely DB-driven)
        const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === loginId.toUpperCase()) || { 
          unitId: cleanId, driverName: data.user?.name || 'Paramedic Lead', vehicleNo: 'MH-14-EM-0001', type: 'ALS Unit' 
        };
        
        setAuthUnit(found);
        setIsAuthenticated(true);
        setLoginError('');
        if (socket) socket.emit('register-ambulance', { location: location || null, available: true, unitId: found.unitId, driverName: found.driverName, vehicleNo: found.vehicleNo, type: found.type, token: data.token });
      } else {
        setLoginError(data.error || 'Invalid Unit ID or Password');
      }
    } catch (err) {
      console.error('[AUTH FAIL]', err);
      setLoginError('Authentication Server Offline');
    }
  };


  // Socket listeners
  useEffect(() => {
    if (!socket || !connected) return;

    // Register Ambulance immediately with stable unitId for session recovery
    const token = sessionStorage.getItem('rescuelink_token');
    socket.emit('register-ambulance', { 
      location, 
      available: true, 
      unitId: authUnit?.unitId,
      token
    });

    const fetchIpLocation = async () => {
      // MULTI-PROVIDER FALLBACK
      const providers = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json'
      ];

      for (const url of providers) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          const lat = data.latitude || data.lat;
          const lng = data.longitude || data.lon;
          if (lat && lng) {
            setLocationMethod('IP Geolocation');
            return { lat, lng };
          }
        } catch (err) { console.warn(`Provider ${url} failed`); }
      }
      
      setLocationMethod('System Default');
      return { lat: 12.9716, lng: 77.5946 }; // Bengaluru Fallback
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const initLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(initLoc);
        setLocationMethod('Native GPS');
        socket.emit('location-update', initLoc);
        socket.emit('register-ambulance', { 
          location: initLoc, 
          available: true, 
          unitId: authUnit?.unitId,
          vehicleNo: authUnit?.vehicleNo,
          driverName: authUnit?.driverName,
          token
        });
      }, async (err) => {
        console.warn('GPS initial fetch error:', err);
        const fallbackLoc = await fetchIpLocation();
        setLocation(fallbackLoc);
        socket.emit('location-update', fallbackLoc);
        socket.emit('register-ambulance', { 
          location: fallbackLoc, 
          available: true, 
          unitId: authUnit?.unitId,
          vehicleNo: authUnit?.vehicleNo,
          driverName: authUnit?.driverName,
          token
        });
      }, { timeout: 10000, enableHighAccuracy: true });
    } else {
      fetchIpLocation().then(fallbackLoc => {
        setLocation(fallbackLoc);
        socket.emit('location-update', fallbackLoc);
        socket.emit('register-ambulance', { 
          location: fallbackLoc, 
          available: true, 
          unitId: authUnit?.unitId,
          vehicleNo: authUnit?.vehicleNo,
          driverName: authUnit?.driverName,
          token
        });
      });
    }

    socket.on('rejoin-mission', (data) => {
      console.log(`[PERSISTENCE] Mission available for resume: ${data.id}`, data);
      if (ignoredMissionsRef.current.has(data.id) || (assignedUser && assignedUser.id === data.id)) {
        console.log(`[RECOVERY] Mission ${data.id} already active or ignored, skipping prompt.`);
        return;
      }
      setPendingResumeMission(data);
    });

    socket.on('error', (err) => {
      if (err.id || err.message?.includes('Mission')) {
        showAlert(`Recovery Failed: ${err.message || 'Mission not found.'}`);
      }
    });

    const onHistory = (msgs) => setMessages(msgs);
    const onMsg = (msg) => setMessages(prev => [...prev, msg]);
    const onResources = (data) => setHospitalResources(data);
    const onAiAlert = (data) => {
      setAiAlert(data);
      setTimeout(() => setAiAlert(null), 10000);
    };

    const onHospitalsUpdate = (data) => setNetworkHospitals(data);

    const onIncomingRequest = (req) => {
      if (req && req.id !== lastAlertedIdRef.current) {
        lastAlertedIdRef.current = req.id;
        setIncomingRequest(req); // { id, userLocation, patientDetails }
        playAlertBeep();
      }
    };

    const onHospitalResponse = (req) => {
      if (req.status === 'hospital_accepted') {
        setAssignedHospital(req.assignedHospital || req);
        if (req.readyServices) {
          setHospitalResources(req.readyServices);
        }
        if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      }
    };

    const onAmbulanceResponse = (req) => {
      // We get this back to know our route
      if (req.status === 'ambulance_accepted') {
        if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      }
    };

    const onPatientData = (data) => {
      if (data.reqId) {
        setAssignedUser(prev => prev && prev.id === data.reqId ? { ...prev, patientDetails: { ...prev.patientDetails, ...data } } : prev);
      }
    };

    const onResourcesLocked = (data) => {
      if (data && assignedUserRef.current && data.reqId === assignedUserRef.current.id) {
        setResourceLocks(data.locks || { traumaBay: false, bloodUnits: false, ventilatorStandby: false });
        playAlertBeep();
      }
    };

    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMsg);
    socket.on('resources-update', onResources);
    socket.on('ai-prediction-alert', onAiAlert);
    socket.on('patient-data', onPatientData);
    socket.on('incoming-ambulance-request', onIncomingRequest);
    socket.on('ambulance-request-response', onAmbulanceResponse);
    socket.on('hospital-request-response', onHospitalResponse);
    socket.on('hospitals-update', onHospitalsUpdate);
    socket.on('ambulances-update', (data) => setAmbulances(data));
    socket.on('route-update', (data) => {
      if (data.routePath) setRoutePath(data.routePath.map(pos => [pos.lat, pos.lng]));
    });
    socket.on('hospital-resources-locked', onResourcesLocked);
    socket.on('green-corridor-status', (data) => {
      if (assignedUserRef.current && data.reqId === assignedUserRef.current.id) {
        setGreenCorridorActive(data.active);
      }
    });
    socket.on('traffic-incidents-update', (data) => {
      setTrafficIncidents(data || {});
    });
    socket.on('clinical-checklist-update', (data) => {
      if (assignedUserRef.current && data.reqId === assignedUserRef.current.id) {
        setClinicalChecklist(data.checklist || {});
      }
    });

    const onVitalsUpdate = (data) => {
      if (vitalsSourceRef.current === 'LIVE' && data) {
        if (data.reqId && data.reqId !== assignedUserRef.current?.id) return;
        setVitals({
          heartRate: data.heartRate || 0,
          spo2: data.spo2 || 0,
          systolic: data.systolic || 0,
          diastolic: data.diastolic || 0,
          temperature: data.temperature || 0,
          respRate: data.respRate || 0,
          bloodGlucose: data.bloodGlucose || data.glucose || 0,
          source: 'LIVE'
        });
      }
    };
    socket.on('vitals-update', onVitalsUpdate);

    socket.on('mission-completed', (data) => {
      console.log('[MISSION] Completion signal received. Resetting unit...');
      setPendingResumeMission(null);
      if (data && data.reqId) ignoredMissionsRef.current.delete(data.reqId);
      setStreaming(false);
      setPatientLoaded(false);
      setArrivedAtUser(false);
      setAssignedUser(null);
      setAssignedHospital(null);
      setIncomingRequest(null);
      setRequestAccepted(false);
      setSelectedPatient(null);
      setVitals({ heartRate: 0, spo2: 0, systolic: 0, diastolic: 0, temperature: 0, respRate: 0, bloodGlucose: 0 });
      setRoutePath(null);
      setIncidentNote('');
      setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
      setClinicalChecklist({});
    });

    socket.on('patient-onboard', () => setPatientLoaded(true));

    // --- SMART AUTO-SYNC LOGIC ---
    if (connected) {
      // If we just came back online and have data in the backlog, blast it to the server
      if (offlineBacklog.current.length > 0 && !isOfflineRef.current) {
        console.log(`[DEAD ZONE] Signal restored. Syncing ${offlineBacklog.current.length} records...`);
        socket.emit('bulk-vitals-update', {
          reqId: assignedUser?.id,
          vitalsHistory: offlineBacklog.current
        });
        offlineBacklog.current = []; // Clear the buffer
      }
    }

    return () => {
      if (!socket) return;
      socket.off('rejoin-mission');
      socket.off('error');
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onMsg);
      socket.off('green-corridor-status');
      socket.off('resources-update', onResources);
      socket.off('ai-prediction-alert', onAiAlert);
      socket.off('incoming-ambulance-request', onIncomingRequest);
      socket.off('ambulance-request-response', onAmbulanceResponse);
      socket.off('hospital-request-response', onHospitalResponse);
      socket.off('hospitals-update', onHospitalsUpdate);
      socket.off('ambulances-update');
      socket.off('route-update');
      socket.off('mission-completed');
      socket.off('patient-onboard');
      socket.off('patient-data', onPatientData);
      socket.off('hospital-resources-locked', onResourcesLocked);
      socket.off('traffic-incidents-update');
      socket.off('clinical-checklist-update');
      socket.off('vitals-update', onVitalsUpdate);
    };
  }, [socket, connected, authUnit]);

  const handleAbortResume = () => {
    if (socket && pendingResumeMission) {
      socket.emit('reject-resume-mission', { reqId: pendingResumeMission.id });
      ignoredMissionsRef.current.add(pendingResumeMission.id);
    }
    setPendingResumeMission(null);
    localStorage.removeItem('activeMissionId');
    localStorage.removeItem('amb_assignedUser');
    setAssignedUser(null);
    setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
  };

  const handleResumeMission = () => {
    if (!pendingResumeMission) {
      console.warn('[RECOVERY] Attempted resume with no pending mission.');
      return;
    }
    const data = pendingResumeMission;
    ignoredMissionsRef.current.add(data.id);
    console.log(`[RECOVERY] Starting restoration for mission ${data.id}`, data);

    try {
      // RESTORE AUTH STATE
      if (data.unitId) {
        const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === data.unitId);
        if (found) {
          console.log(`[RECOVERY] Restoring ambulance auth: ${found.unitId}`);
          setAuthUnit(found);
        }
      }

      setAssignedUser({ id: data.id, ...data });
      setRequestAccepted(true); 
      
      const isArrived = data.status === 'ambulance_arrived' || data.status === 'patient_onboard' || data.status === 'hospital_accepted' || !!data.arrivedAtUser;
      setArrivedAtUser(isArrived);
      
      if (data.status === 'patient_onboard' || data.status === 'hospital_accepted' || data.patientDetails) {
        setPatientLoaded(true);
        setSelectedPatient(data.patientDetails?.id || 'EMERGENCY');
      }
      
      if (data.assignedHospital) setAssignedHospital(data.assignedHospital);
      
      if (data.routePath && Array.isArray(data.routePath)) {
        setRoutePath(data.routePath.map(pos => (Array.isArray(pos) ? pos : [pos.lat, pos.lng])));
      }
      
      if (data.status === 'patient_onboard' || data.status === 'hospital_accepted' || data.patientDetails || data.fieldReport) {
        setPatientLoaded(true);
        setStreaming(true);
      }
      
      if (data.chatMessages) setMessages(data.chatMessages);
      if (data.checklist) setClinicalChecklist(data.checklist);
      if (data.incidentNotes && Array.isArray(data.incidentNotes)) {
        // HospitalDashboard uses incidentNotes state differently, but let's sync what we can
      }
      
      if (data.resourceLocks) {
        setResourceLocks(data.resourceLocks);
      } else {
        setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
      }
      
      setPendingResumeMission(null);
      console.log('[RECOVERY] Restoration complete.');
    } catch (err) {
      console.error('[RECOVERY] Restoration failed:', err);
      showAlert('Failed to restore mission state. Please check console.');
    }
  };

  const handleManualRecover = () => {
    if (!manualRecoveryId.trim()) return;
    console.log(`[MANUAL_RECOVERY] Requesting mission ${manualRecoveryId}`);
    ignoredMissionsRef.current.delete(manualRecoveryId.trim());
    socket.emit('get-mission-data', manualRecoveryId.trim());
    setManualRecoveryId('');
  };

  const handleManualRecoveryKeyDown = (e) => {
    if (e.key === 'Enter') handleManualRecover();
  };

  // Streaming loop
  useEffect(() => {
    if (!streaming || !patientLoaded) return;

    const vitalsInterval = setInterval(() => {
      if (vitalsSourceRef.current === 'SIMULATED') {
        const newVitals = generateVitals(vitalsRef.current, simulateCrisisRef.current);
        const vitalsWithSource = { ...newVitals, source: 'SIMULATED' };
        setVitals(vitalsWithSource);

        // AUDIO ALERT: Critical Vitals in Field (Throttled to every 5s)
        const now = Date.now();
        if ((newVitals.heartRate > 110 || newVitals.heartRate < 50 || newVitals.spo2 < 92) && (now - lastVitalsAlertRef.current > 5000)) {
          lastVitalsAlertRef.current = now;
          playAlertBeep();
        }

        // Handle data transmission
        if (socket && connected) {
          if (isOfflineRef.current) {
            offlineBacklog.current.push({ ...vitalsWithSource, timestamp: Date.now() });
            if (offlineBacklog.current.length > 100) offlineBacklog.current.shift();
          } else {
            socket.emit('vitals-update', { ...vitalsWithSource, reqId: assignedUserRef.current?.id });
          }
        }

        fullJourneyVitalsRef.current.push({ ...vitalsWithSource, timestamp: Date.now() });
        if (fullJourneyVitalsRef.current.length > 100) fullJourneyVitalsRef.current.shift();

        // AI Logic: Track history
        vitalsHistoryRef.current.push(vitalsWithSource);
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
            socket.emit('ai-prediction-alert', { ...alertData, reqId: assignedUserRef.current?.id });
            vitalsHistoryRef.current = [];
            setTimeout(() => setAiAlert(null), 10000);
          }
        }
      } else if (vitalsSourceRef.current === 'LIVE' || vitalsSourceRef.current === 'MANUAL') {
        const newVitals = vitalsRef.current;
        const now = Date.now();
        if ((newVitals.heartRate > 110 || newVitals.heartRate < 50 || newVitals.spo2 < 92) && (now - lastVitalsAlertRef.current > 5000)) {
          lastVitalsAlertRef.current = now;
          playAlertBeep();
        }
      }
    }, 1000);

    return () => {
      clearInterval(vitalsInterval);
    };
  }, [streaming, patientLoaded, socket, connected]);

  useEffect(() => {
    if (!patientLoaded) {
      setVitals({ heartRate: 0, spo2: 0, systolic: 0, diastolic: 0, temperature: 0, respRate: 0, bloodGlucose: 0 });
    }
  }, [patientLoaded]);

  // GPS tracking loop - independent of streaming (PRODUCTION READY)
  useEffect(() => {
    if (gpsOverride) {
      if (geoWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
        geoWatchIdRef.current = null;
      }
      return;
    }

    if (navigator.geolocation) {
      geoWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGpsAccuracy(pos.coords.accuracy);
          setGpsSpeed(pos.coords.speed !== null && pos.coords.speed >= 0 ? Math.round(pos.coords.speed * 3.6) : 0);
          setGpsHeading(pos.coords.heading);
          setGpsError(null);
          
          // Check for Hospital Arrival (within ~100m)
          if (hospitalRef.current && !arrivedHospitalRef.current) {
            const dist = calcDist(newPos, hospitalRef.current.pos);
            if (dist < 0.1) {
              arrivedHospitalRef.current = true;
              if (socket) socket.emit('ambulance-at-hospital', { reqId: assignedUser?.id });
            }
          }

          // Only update if moved significantly (> 5 meters approx) to save battery/bandwidth
          setLocation(prev => {
            if (prev && Math.abs(prev.lat - newPos.lat) < 0.00005 && Math.abs(prev.lng - newPos.lng) < 0.00005) {
              return prev; 
            }
            
            // Broadcast the real automatic movement
            if (socket && connected && !isOfflineRef.current) {
              socket.emit('location-update', {
                ...newPos,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed,
                heading: pos.coords.heading,
                timestamp: pos.timestamp,
                trafficDelay: trafficRef.current,
                arrivedAtUser: arrivedRef.current,
                selectedPatient: patientRef.current,
                destinationId: hospitalRef.current?.hospitalId || hospitalRef.current?.id,
                simulationOn: false 
              });
            }
            
            return newPos;
          });

          setLocationHistory(h => [...h.slice(-99), [newPos.lat, newPos.lng]]);
        },
        (err) => {
          console.warn('[GPS] Hardware Error:', err);
          let errMsg = 'GPS Error: ';
          if (err.code === 1) errMsg += 'Permission denied';
          else if (err.code === 2) errMsg += 'Position unavailable';
          else if (err.code === 3) errMsg += 'Timeout';
          else errMsg += err.message;
          setGpsError(errMsg);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }

    return () => {
      if (geoWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchIdRef.current);
      }
    };
  }, [socket, connected, gpsOverride]); // removed selectedHospital dependency

  const sendHospitalRequest = (directPatientId = null, isForce = false, directDetails = null, isPhase2 = false) => {
    if (!socket) return;
    const v = vitalsRef.current;
    const pId = directPatientId || selectedPatient || 'EMERGENCY_OVERRIDE';
    const pDetails = directDetails || assignedUser?.patientDetails;
    const pName = pDetails?.name || (PATIENT_NAMES[pId] || pId) || 'Emergency Case';

    const condition = pDetails?.condition || 'General Emergency';

    // PHASE 1 (Broadcast): Basic alert without full vitals/reports
    // PHASE 2 (Targeted): Full report with vitals and services
    const fieldReport = {
      generatedAt: new Date().toLocaleString(),
      patientName: pName,
      patientId: pId,
      condition,
      riskLevel: pDetails?.riskLevel || 'CRITICAL',
      vitals: { ...v },
      triageLevel: (v.heartRate > 110 || v.spo2 < 92 ? 'RED — IMMEDIATE' : v.spo2 < 95 ? 'YELLOW — URGENT' : 'GREEN — STABLE'),
      requiredServices: (condition === 'Cardiac Arrest' ? ['Cardiologist On Call', 'Ventilator', 'Cardiac ICU'] : ['OT Prepared', 'Blood Bank', 'Surgeon On Call']),
      fieldNotes: `${isForce ? 'MANUAL OVERRIDE: ' : ''}Patient ${pName} enrolled. HR ${v.heartRate}, SpO2 ${v.spo2}%.`,
    };

    console.log(`[NETWORK] ${isPhase2 ? 'PHASE 2 (TARGETED)' : 'PHASE 1 (BROADCAST)'} for ${pName}...`);
    lastFieldReportRef.current = fieldReport;

    const targetSocketId = selectedHospital?.socketId || selectedHospital?.hospitalSocket;

    socket.emit('request-hospital', {
      reqId: assignedUser?.id || directDetails?.id || `FORCED-${Date.now()}`,
      broadcast: !targetSocketId,
      hospitalSocketId: targetSocketId,
      fieldReport,
      ambulanceDetails: authUnit || { unitId: 'AMB-UNIT', type: 'ALS' },
      patientDetails: pDetails,
      previousReports: (previousReports && previousReports.length > 0) ? previousReports : undefined,
      // ANCHOR FIX: Pass the incident GPS (where the user is) as the definitive search origin.
      // Hospital selection must radiate from the patient, not from the ambulance's last known position.
      incidentLocation: assignedUser?.userLocation || location
    });

    setHospitalRequestSent(true);
    setEscalationTimer(15);

    // --- SMART ROUTING: Hospitals selected by proximity to INCIDENT SITE, not ambulance garage ---
    // ANCHOR FIX: incidentAnchor = where the patient IS, which is where the ambulance is heading.
    // Using ambulance.location here would sort hospitals by ambulance's starting point,
    // which could be 50km away from the patient in a large city.
    const incidentAnchor = assignedUser?.userLocation || location;
    
     // Convert real network hospitals to list and filter by a reasonable 200km radius
     const realHospitals = Object.entries(networkHospitals).map(([id, h]) => ({ id, ...h }));
     let hList = realHospitals.filter(h => {
       const hPos = h.location || h.pos;
       if (!hPos || !incidentAnchor) return false;
       const dist = calcDist(incidentAnchor, hPos);
       return dist <= 200; // 200 km radius
     });
 
     if (hList.length === 0) {
       console.warn("[NETWORK] No live connected hospitals found within 200km. Falling back to local/simulated network registry.");
       hList = generateGlobalHospitals(incidentAnchor);
     }
    const riskLevel = pDetails?.riskLevel || 'CRITICAL';

    // Calculate distances FROM INCIDENT SITE to each hospital
    const sortedHospitals = hList.map(h => {
      const hPos = h.location || h.pos;
      // If hospital has no GPS, treat as infinitely far to avoid suggesting it as 'nearest'
      const dist = (incidentAnchor && hPos) 
        ? calcDist(incidentAnchor, hPos) 
        : Infinity;
      return { ...h, currentDist: dist };
    }).sort((a, b) => a.currentDist - b.currentDist);

    // Find hospitals that are NOT busy AND have the required services
    const capableHospitals = sortedHospitals.filter(h => {
      if (h.isBusy) return false;
      const resources = h.simulatedResources || h.resources || {};
      if (condition === 'Cardiac Arrest' && !resources.ventilatorReady) return false;
      if (riskLevel === 'CRITICAL' && !resources.otPrepared) return false;
      return true;
    });

    const availableHosp = capableHospitals.length > 0 ? capableHospitals[0] : sortedHospitals.find(h => !h.isBusy) || sortedHospitals[0];
    
    if (capableHospitals.length === 0) {
      console.warn(`[ROUTING] No perfectly capable hospital found for ${condition}. Using nearest available: ${availableHosp.name}`);
    }

    console.log(`[ROUTING] Selected target: ${availableHosp.name} (Busy: ${availableHosp.isBusy || false})`);
    setSelectedHospital({ ...availableHosp, pos: availableHosp.location || availableHosp.pos, baseDistance: availableHosp.currentDist || 15 });
  };

  const simulateIdScan = async () => {
    if (!requestAccepted) return showAlert("NO ACTIVE DISPATCH: Accept a request first.");
    
    // Simulate real-world scanning (e.g. tablet camera reading a Universal Health ID QR code)
    const nationalId = window.prompt(
      "📸 GLOBAL HIE SCANNER\n\nPlease scan patient's Universal Health ID, SSN, or NHS Number (or enter manually):", 
      "UHI-9932-8412-1100"
    );
    
    if (!nationalId) return;

    setIsScanning(true);
    
    try {
      // 1. Send the scanned ID to the secure backend to query the National Database
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const res = await fetch(`${SERVER_URL}/api/patient/lookup/${nationalId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const patientData = await res.json();
      
      // 2. Hydrate the local dashboard with real medical history
      setSelectedPatient(patientData.id);
      
      if (socket) {
        socket.emit('patient-data', { reqId: assignedUser.id, ...patientData });
        // 3. Immediately beam the newfound allergies/history to the destination hospital
        sendHospitalRequest(patientData.id, false, patientData, true); 
      }
      console.log(`[HIE SCAN] Successfully retrieved medical history for: ${patientData.name}`);
    } catch (err) {
      console.error("[HIE ERROR] Registry Offline", err);
      showAlert("⚠️ NATIONAL REGISTRY OFFLINE: Please proceed with manual patient intake.");
    } finally {
      setIsScanning(false);
    }
  };

  // Submit manual GPS coordinates override
  const handleGpsOverrideSubmit = (e) => {
    e.preventDefault();
    const latVal = parseFloat(overrideLat);
    const lngVal = parseFloat(overrideLng);
    if (isNaN(latVal) || isNaN(lngVal)) {
      showAlert('Invalid coordinates entered.');
      return;
    }
    const overridePos = { lat: latVal, lng: lngVal };
    setLocation(overridePos);
    setLocationMethod('Manual Override');
    setGpsAccuracy(1.0);
    setGpsSpeed(0.0);
    setGpsError(null);
    if (socket && connected) {
      socket.emit('location-update', {
        lat: overridePos.lat,
        lng: overridePos.lng,
        accuracy: 1.0,
        speed: 0,
        heading: 0,
        timestamp: Date.now(),
        trafficDelay: trafficRef.current,
        arrivedAtUser: arrivedRef.current,
        selectedPatient: patientRef.current,
        destinationId: hospitalRef.current?.hospitalId || hospitalRef.current?.id,
        simulationOn: false
      });
    }
  };

  // Arrival countdown timer — when it hits 0, ambulance "arrives" and triggers hospital flow
  useEffect(() => {
    if (requestAccepted && !arrivedAtUser && arrivalCountdown > 0) {
      const timer = setTimeout(() => {
        const next = arrivalCountdown - 1;
        setArrivalCountdown(next);
        if (socket) socket.emit('arrival-countdown', { reqId: assignedUser?.id, seconds: next });
      }, 1000);
      return () => clearTimeout(timer);
    } else if (requestAccepted && arrivalCountdown === 0 && !arrivedAtUser) {
      setArrivedAtUser(true);
      if (socket) socket.emit('ambulance-arrived', { reqId: assignedUser?.id });
      // PHASE 2: Proactive Broadcast on Arrival
      sendHospitalRequest(selectedPatient, false, assignedUser?.patientDetails, true);
    }
  }, [arrivalCountdown, socket, assignedUser, requestAccepted, arrivedAtUser, location, networkHospitals, previousReports]);

  // --- Escalation Timer Effect ---
  useEffect(() => {
    if (escalationTimer === null || assignedHospital || isBroadcasting) return;

    if (escalationTimer > 0) {
      const t = setTimeout(() => setEscalationTimer(escalationTimer - 1), 1000);
      return () => clearTimeout(t);
    } else {
      // TIMER HIT ZERO -> TRIGGER GLOBAL ESCALATION
      console.log("[NETWORK] No response from primary hospital. Escalating...");
      setIsBroadcasting(true);
      if (socket && assignedUser) {
        socket.emit('request-hospital', {
          reqId: assignedUser.id,
          broadcast: true,
          fieldReport: lastFieldReportRef.current // We'll need to store this
        });
      }
    }
  }, [escalationTimer, assignedHospital, isBroadcasting, socket, assignedUser]);

  // Network Hardware Listeners
  useEffect(() => {
    const handleOnline = () => setIsHardwareOnline(true);
    const handleOffline = () => setIsHardwareOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-Dead-Zone Watchdog: Triggers if connection lost for 15s
  useEffect(() => {
    let deadZoneTimer;
    let countdownInterval;

    // DETERMINISTIC OFFLINE CHECK: If EITHER the socket is gone OR the hardware is offline
    const isNetworkLost = !connected || !isHardwareOnline;

    if (isNetworkLost && !isOffline && (assignedUser || streaming)) {
      if (signalLostTime === 0) {
        console.log("[WATCHDOG] Network hardware or socket lost. Starting 15s countdown...");
        setSignalLostTime(15);
        countdownInterval = setInterval(() => {
          setSignalLostTime(prev => Math.max(0, prev - 1));
        }, 1000);

        deadZoneTimer = setTimeout(() => {
          if (!connected || !navigator.onLine) {
            console.warn("[WATCHDOG] 15s threshold reached. AUTO-ACTIVATING DEAD ZONE.");
            setIsOffline(true);
            setSignalLostTime(0);
          }
        }, 15000);
      }
    }

    if (!isNetworkLost && isOffline) {
      console.log("[WATCHDOG] Network restored. Resuming live transmission...");
      setIsOffline(false);
      setSignalLostTime(0);
      if (offlineBacklog.current.length > 0 && socket) {
        socket.emit('bulk-vitals-update', {
          reqId: assignedUser?.id,
          vitalsHistory: offlineBacklog.current
        });
        offlineBacklog.current = [];
      }
    }

    if (!isNetworkLost) {
      setSignalLostTime(0);
      if (countdownInterval) clearInterval(countdownInterval);
      if (deadZoneTimer) clearTimeout(deadZoneTimer);
    }

    return () => {
      if (deadZoneTimer) clearTimeout(deadZoneTimer);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [connected, isHardwareOnline, streaming, socket, assignedUser, isOffline]);

  // Handle hospital acceptance
  useEffect(() => {
    if (assignedHospital) {
      setEscalationTimer(null);
      setIsBroadcasting(false);
    }
  }, [assignedHospital]);
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 20% 20%, #0f1e0a 0%, #050d1a 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani', sans-serif", position: 'relative', zIndex: 10001 }}>
        <div style={{ background: 'rgba(5,20,45,0.9)', border: '2px solid rgba(0,255,136,0.3)', borderRadius: 16, padding: 40, width: 420, boxShadow: '0 0 40px rgba(0,255,136,0.1)', position: 'relative', zIndex: 10002 }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ fontSize: 50, marginBottom: 8 }}>🚑</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#00ff88', letterSpacing: '0.15em' }}>AMBULANCE UNIT LOGIN</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>RESCUELINK FIELD TERMINAL v2.0</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>UNIT ID</label>
              <input value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="e.g. AMB-101" style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 14, fontFamily: "'Share Tech Mono'", outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.1em', display: 'block', marginBottom: 4 }}>PASSWORD</label>
              <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="Enter unit password" style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 14, fontFamily: "'Share Tech Mono'", outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {loginError && <div style={{ color: '#ff4444', fontSize: 12, fontFamily: "'Share Tech Mono'", textAlign: 'center' }}>⚠ {loginError}</div>}
            <button onClick={handleLogin} style={{ padding: '12px', background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s' }}>AUTHENTICATE & CONNECT</button>
            <button onClick={() => {
              // Simulated Biometric Login via WebAuthn
              const targetId = loginId.trim() || "AMB-101";
              if (window.confirm(`Verify FaceID to login as ${targetId.toUpperCase()}?`)) {
                setLoginId(targetId.toUpperCase());
                
                // Demo fallback password logic
                let password = loginPass;
                if (!password) {
                  const match = targetId.match(/\d+$/);
                  password = match ? `rescue${match[0]}` : 'rescue101';
                  setLoginPass(password);
                }
                
                setTimeout(handleLogin, 500);
              }
            }} style={{ padding: '12px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.4)', borderRadius: 8, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>👤</span> FACE-ID BIOMETRIC LOGIN
            </button>
          </div>
          <div style={{ marginTop: 20, fontSize: 10, color: 'rgba(160,200,255,0.25)', fontFamily: "'Share Tech Mono'", textAlign: 'center', lineHeight: 1.6 }}>
            Demo Units: AMB-101 to AMB-105<br />Password: rescue + unit number (e.g. rescue101)
          </div>
        </div>
      </div>
    );
  }

  const toggleStreaming = () => {
    if (!streaming && !patientLoaded) {
      showAlert("Please onboard the patient first before starting the live stream.");
      return;
    }
    const nextState = !streaming;
    setStreaming(nextState);
    if (!nextState && socket && connected) {
      // Clear hospital vitals on stop
      socket.emit('vitals-update', { heartRate: 0, spo2: 0, systolic: 0, diastolic: 0, temperature: 0, respRate: 0, bloodGlucose: 0 });
    }
  };

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
    if (!requestAccepted) {
      console.warn("[SECURITY] Cannot select patient before accepting dispatch.");
      return;
    }
    setSelectedPatient(id);
    if (socket) {
      socket.emit('patient-selected', id);
      sendHospitalRequest(id, false, null, true);
    }
  };


  const sendNote = () => {
    if (!incidentNote.trim() || !socket) return;
    socket.emit('incident-note', { note: incidentNote, from: 'ambulance' });
    setIncidentNote('');
  };

  const toggleNoteListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert("Browser does not support speech recognition.");
    if (isListeningNote) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Optimized for Indian English/accents
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsListeningNote(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      // Update the note field in real-time as you speak
      if (e.results[0].isFinal) {
        setIncidentNote(prev => prev ? prev + ' ' + transcript : transcript);
        
        // --- REAL WORLD FEATURE: AUTOMATED VOICE TRIAGE ---
        // Parse the final transcript for medical NLP extraction
        const text = transcript.toLowerCase();
        setVitals(prev => {
          let newVitals = { ...prev };
          const hrMatch = text.match(/heart rate (of |is )?(\d+)/) || text.match(/hr (of |is )?(\d+)/);
          const spo2Match = text.match(/o2 (of |is )?(\d+)/) || text.match(/oxygen (of |is )?(\d+)/) || text.match(/spo2 (of |is )?(\d+)/);
          const bpMatch = text.match(/blood pressure (of |is )?(\d+)\s*(over|by|\/)\s*(\d+)/) || text.match(/bp (of |is )?(\d+)\s*(over|by|\/)\s*(\d+)/);
          const tempMatch = text.match(/temperature (of |is )?(\d+(\.\d+)?)/) || text.match(/temp (of |is )?(\d+(\.\d+)?)/);
          
          let updated = false;
          if (hrMatch) { newVitals.heartRate = parseInt(hrMatch[2]); updated = true; }
          if (spo2Match) { newVitals.spo2 = parseInt(spo2Match[2]); updated = true; }
          if (bpMatch) { 
            newVitals.systolic = parseInt(bpMatch[2]); 
            newVitals.diastolic = parseInt(bpMatch[4]); 
            updated = true; 
          }
          if (tempMatch) { newVitals.temperature = parseFloat(tempMatch[2]); updated = true; }
          
          if (updated) {
            playAlertBeep(); // Audio feedback that triage data was extracted
            console.log('[AUTO-TRIAGE] Voice extracted vitals:', newVitals);
            if (socket && connected) {
               socket.emit('vitals-update', { reqId: assignedUser?.id, vitals: newVitals });
            }
          }
          return newVitals;
        });
      }
    };
    recognition.onerror = (e) => {
      console.error('[DICTATION] Mic Error:', e.error);
      setIsListeningNote(false);
    };
    recognition.onend = () => setIsListeningNote(false);
    recognition.start();
  };



  const acceptRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('ambulance-response', {
      reqId: incomingRequest.id,
      accepted: true,
      distanceToUser: distanceToUser // Send real-time distance for Stage 1 ETA
    });
    setAssignedUser(incomingRequest);
    setRequestAccepted(true);
    setArrivedAtUser(false);

    // PHASE 1: Broadcast Lite Alert (Advance Notice)
    const pId = incomingRequest.patientDetails?.id || 'EMERGENCY';
    setSelectedPatient(pId);
    
    // Proactively notify the hospital network that an ambulance is en route
    sendHospitalRequest(pId, false, incomingRequest.patientDetails, false);

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

  const isCritical = arrivedAtUser && (vitals.heartRate > 110 || (vitals.spo2 > 0 && vitals.spo2 < 92) || vitals.systolic > 150 || (vitals.heartRate > 0 && vitals.heartRate < 50));

  return (
    <div style={{
      height: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, #0f1e0a 0%, #050d1a 60%)',
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes critFlash { from { box-shadow: 0 0 0 rgba(255,60,60,0); } to { box-shadow: 0 0 20px rgba(255,60,60,0.4); } }
        @keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50% { opacity: 0.6; filter: brightness(1.5); }
        }
        .hri-tooltip {
          position: relative;
          display: inline-block;
          cursor: help;
        }
        .hri-tooltip .hri-tooltip-text {
          visibility: hidden;
          width: 260px;
          background-color: #050d1a;
          color: #fff;
          text-align: left;
          border: 1px solid #00c8ff;
          border-radius: 6px;
          padding: 8px 12px;
          position: absolute;
          z-index: 10005;
          bottom: 125%;
          left: 50%;
          margin-left: -130px;
          opacity: 0;
          transition: opacity 0.3s;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          line-height: 1.4;
          box-shadow: 0 4px 15px rgba(0,200,255,0.3);
          white-space: normal;
        }
        .hri-tooltip .hri-tooltip-text::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -5px;
          border-width: 5px;
          border-style: solid;
          border-color: #00c8ff transparent transparent transparent;
        }
        .hri-tooltip:hover .hri-tooltip-text {
          visibility: visible;
          opacity: 1;
        }
        @media (max-width: 768px) {
          .ambulance-stream-grid {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'rgba(5,20,10,0.98)',
        borderBottom: '1px solid rgba(0,255,136,0.2)',
        padding: '10px 450px 10px 24px',
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 70, height: 'auto', flexWrap: 'wrap',
        backdropFilter: 'blur(15px)',
        position: 'relative', zIndex: 100
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
          {/* Global God Mode Panel */}
      {showGodMode && (
        <div style={{
          position: 'fixed', top: 20, right: 20, width: 320, background: 'rgba(10, 0, 20, 0.95)',
          border: '1px solid #cc00ff', borderRadius: 8, padding: 16, zIndex: 99999,
          boxShadow: '0 0 40px rgba(204,0,255,0.4)', backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#cc00ff', fontWeight: 700, letterSpacing: '0.1em' }}>
              🛠️ GOD MODE (DEMO CONTROL)
            </div>
            <button onClick={() => setShowGodMode(false)} style={{ background: 'transparent', border: 'none', color: '#cc00ff', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => setSimulateCrisis(!simulateCrisis)}
              style={{
                background: simulateCrisis ? 'rgba(255,40,40,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${simulateCrisis ? '#ff4444' : 'rgba(255,255,255,0.2)'}`,
                padding: 10, borderRadius: 6, color: simulateCrisis ? '#ff4444' : '#fff',
                fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between'
              }}
            >
              <span>{simulateCrisis ? '🛑 CANCEL CRISIS' : '⚠️ TRIGGER CARDIAC ARREST'}</span>
              <span>{simulateCrisis ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setSimulateTraffic(!simulateTraffic)}
              style={{
                background: simulateTraffic ? 'rgba(255,184,0,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${simulateTraffic ? '#ffb800' : 'rgba(255,255,255,0.2)'}`,
                padding: 10, borderRadius: 6, color: simulateTraffic ? '#ffb800' : '#fff',
                fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between'
              }}
            >
              <span>{simulateTraffic ? '🛣️ CLEAR TRAFFIC' : '🚧 SIMULATE TRAFFIC JAM'}</span>
              <span>{simulateTraffic ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setIsOffline(!isOffline)}
              style={{
                background: isOffline ? 'rgba(100,100,100,0.4)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isOffline ? '#aaa' : 'rgba(255,255,255,0.2)'}`,
                padding: 10, borderRadius: 6, color: isOffline ? '#aaa' : '#fff',
                fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer', textAlign: 'left',
                display: 'flex', justifyContent: 'space-between'
              }}
            >
              <span>{isOffline ? '📡 RESTORE SIGNAL' : '📡 FORCE OFFLINE (BLACKOUT)'}</span>
              <span>{isOffline ? 'OFFLINE' : 'ONLINE'}</span>
            </button>
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            Use Ctrl+Shift+D to hide/show this panel.
          </div>
        </div>
      )}

      {/* ── Dashboard Layout ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            {(resourceLocks.traumaBay || resourceLocks.bloodUnits || resourceLocks.ventilatorStandby) && (
              <div style={{
                background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88',
                padding: '4px 12px', borderRadius: 4, fontSize: 11, fontFamily: "'Orbitron'",
                color: '#00ff88', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4,
                boxShadow: '0 0 10px rgba(0,255,136,0.2)'
              }}>
                ✅ EMR RESOURCES LOCKED
              </div>
            )}
            {assignedUser && (
              <div style={{ 
                background: 'rgba(0,200,255,0.1)', border: '1px solid #00c8ff', 
                padding: '4px 12px', borderRadius: 4, fontSize: 11, fontFamily: "'Orbitron'" 
              }}>
                <span style={{ opacity: 0.5 }}>REQ ID:</span> {assignedUser.id && assignedUser.id.length > 15 ? assignedUser.id.slice(0, 8) + '...' + assignedUser.id.slice(-4) : assignedUser.id}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: connected ? '#00ff88' : '#ff4444',
                boxShadow: connected ? '0 0 12px #00ff88' : '0 0 8px #ff4444',
                position: 'relative', zIndex: 2,
                animation: connected ? 'pulse-opacity 1s ease-in-out infinite' : 'none'
              }} />
              {connected && (
                <div style={{
                  position: 'absolute', inset: -4, borderRadius: '50%',
                  background: 'rgba(0,255,136,0.4)', animation: 'pulse-ring 2s ease-out infinite',
                  zIndex: 1
                }} />
              )}
            </div>
            <span style={{ fontSize: 12, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'" }}>
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>

          {/* Control Buttons Group */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
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
                padding: '6px 12px', background: simulateTraffic ? 'rgba(255,184,0,0.2)' : 'rgba(0,200,255,0.05)',
                border: `1px solid ${simulateTraffic ? 'rgba(255,184,0,0.5)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 4, color: '#ffb800', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer',
                fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>🚦</span> {simulateTraffic ? 'JAM' : 'TRAFFIC'}
            </button>

            <button
              onClick={() => {
                const doc = new jsPDF();
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(22);
                doc.setTextColor(0, 100, 200);
                doc.text("RESCUELINK INCIDENT HANDOFF REPORT", 105, 20, null, null, "center");

                doc.setFontSize(12);
                doc.setTextColor(50, 50, 50);
                doc.text(`Mission ID: ${assignedUser?.id || 'FIELD_MISSION'}`, 14, 35);
                doc.text(`Timestamp: ${new Date().toLocaleString()}`, 14, 42);
                doc.text(`Patient Name: ${selectedPatient ? PATIENT_NAMES[selectedPatient] : (assignedUser?.patientDetails?.name || 'Emergency Case')}`, 14, 49);
                doc.text(`Assigned Hospital: ${assignedHospital?.name || 'Unknown'}`, 14, 56);

                // Patient Details & Vitals Table
                const vitals = lastFieldReportRef.current?.vitals || {};
                autoTable(doc, {
                  startY: 65,
                  head: [['Metric', 'Value']],
                  body: [
                    ['Heart Rate', vitals.heartRate ? `${vitals.heartRate} bpm` : 'N/A'],
                    ['Blood Pressure', vitals.systolic ? `${vitals.systolic}/${vitals.diastolic} mmHg` : 'N/A'],
                    ['SpO2', vitals.spo2 ? `${vitals.spo2}%` : 'N/A'],
                    ['Reported Condition', assignedUser?.patientDetails?.condition || 'N/A'],
                    ['Risk Level', assignedUser?.patientDetails?.riskLevel || 'N/A']
                  ],
                  theme: 'grid',
                  headStyles: { fillColor: [0, 100, 200] }
                });

                // Notes
                const notesY = doc.lastAutoTable.finalY + 15;
                doc.setFont('helvetica', 'bold');
                doc.text("Incident Notes & Actions", 14, notesY);
                doc.setFont('helvetica', 'normal');
                
                let currentY = notesY + 10;
                if (incidentNote) {
                  const splitNotes = doc.splitTextToSize(incidentNote, 180);
                  doc.text(splitNotes, 14, currentY);
                } else {
                  doc.setFont('helvetica', 'italic');
                  doc.text("No manual notes recorded.", 14, currentY);
                }

                // Auto-trigger download
                doc.save(`MISSION_REPORT_${assignedUser?.id || 'FIELD_MISSION'}.pdf`);
              }}
              style={{
                padding: '6px 12px', background: 'rgba(0,200,255,0.1)',
                border: '1px solid rgba(0,200,255,0.4)', borderRadius: 4,
                color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer',
                fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>📥</span> REPORT
            </button>

            <button
              onClick={() => {
                if (window.confirm("Abort current mission and reset?")) {
                  setRequestAccepted(false);
                  setAssignedUser(null);
                  setAssignedHospital(null);
                  setRoutePath(null);
                  setSelectedPatient(null);
                  setArrivedAtUser(false);
                  setIncomingRequest(null);
                  setStreaming(false);
                  setPatientLoaded(false);
                  setArrivalCountdown(20);
                  setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
                  if (socket) {
                    if (activeMissionId) {
                      socket.emit('complete-mission', { reqId: activeMissionId });
                    }
                    socket.emit('register-ambulance', { location, available: true });
                  }
                  
                  // Clear active mission local storage state completely
                  localStorage.removeItem('activeMissionId');
                  localStorage.removeItem('amb_requestAccepted');
                  localStorage.removeItem('amb_assignedUser');
                  localStorage.removeItem('amb_assignedHospital');
                  localStorage.removeItem('amb_selectedPatient');
                  localStorage.removeItem('amb_arrivedAtUser');
                  localStorage.removeItem('amb_streaming');
                  localStorage.removeItem('amb_incomingRequest');
                }
              }}
              style={{
                padding: '6px 12px', background: 'rgba(255,40,40,0.1)',
                border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4,
                color: '#ff6b6b', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer',
                fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>🛑</span> CLEAR
            </button>
 
            <button
              onClick={() => {
                if (window.confirm("Switch unit identity? All active unit session data will be reset.")) {
                  localStorage.removeItem('ambulance_auth');
                  sessionStorage.clear();
                  
                  // Reset mission keys to prevent state conflicts
                  localStorage.removeItem('activeMissionId');
                  localStorage.removeItem('amb_requestAccepted');
                  localStorage.removeItem('amb_assignedUser');
                  localStorage.removeItem('amb_assignedHospital');
                  localStorage.removeItem('amb_selectedPatient');
                  localStorage.removeItem('amb_arrivedAtUser');
                  localStorage.removeItem('amb_streaming');
                  localStorage.removeItem('amb_incomingRequest');
                  
                  window.location.reload();
                }
              }}
              style={{
                padding: '6px 12px', background: 'rgba(255,68,68,0.1)',
                border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4,
                color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer',
                fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>🚪</span> SWITCH
            </button>

            <button
              onClick={toggleOffline}
              style={{
                padding: '6px 12px',
                background: isOffline ? 'rgba(255,150,0,0.2)' : 'rgba(0,200,255,0.05)',
                border: `1px solid ${isOffline ? 'rgba(255,180,0,0.5)' : 'rgba(0,200,255,0.3)'}`,
                borderRadius: 4, color: '#ffb800', fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer',
                fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>📟</span> {isOffline ? 'ONLINE' : 'DEAD ZONE'}
            </button>

            <button
              onClick={() => setStreaming(!streaming)}
              style={{
                padding: '6px 12px', background: streaming ? 'rgba(255,40,40,0.2)' : 'rgba(0,255,136,0.1)',
                border: `1px solid ${streaming ? 'rgba(255,80,80,0.5)' : 'rgba(0,255,136,0.3)'}`,
                borderRadius: 4, color: streaming ? '#ff6060' : '#00ff88', fontFamily: "'Orbitron'",
                fontSize: 9, fontWeight: 'bold', cursor: 'pointer', boxShadow: streaming ? '0 0 10px rgba(255,40,40,0.2)' : 'none',
                display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <span>{streaming ? '■' : '▶'}</span> {streaming ? 'STOP' : 'STREAM'}
            </button>
          </div>
        </div>
      </div>

      {/* Mission Resume Guard Overlay */}
      {pendingResumeMission && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: 'linear-gradient(135deg, #051a3a 0%, #020814 100%)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 16, width: 480, padding: 40, textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 40, marginBottom: 20, animation: 'pulse-opacity 1s infinite' }}>📡</div>
            <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', margin: '0 0 10px', fontSize: 20, letterSpacing: 2 }}>MISSION RECOVERY DETECTED</h2>
            <p style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', marginBottom: 30, lineHeight: 1.5 }}>
              The central server has an active mission (<strong>{pendingResumeMission.id}</strong>) assigned to this unit. 
              Would you like to resume terminal duties or abort the previous mission?
            </p>



            <div style={{ display: 'flex', gap: 15, justifyContent: 'center' }}>
              <button 
                onClick={handleAbortResume}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}
              >
                ABORT & RESET
              </button>
              <button 
                onClick={handleResumeMission}
                style={{ flex: 2, padding: '12px', background: '#00c8ff', border: 'none', borderRadius: 8, color: '#000', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, boxShadow: '0 0 20px rgba(0,200,255,0.3)' }}
              >
                RESUME MISSION
              </button>
            </div>
          </div>
        </div>
      )}

      {incomingRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#0a1e3a', border: '2px solid #ff6b35', borderRadius: 12, width: 440, padding: 30, boxShadow: '0 0 30px rgba(255,107,53,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 10 }}>🚨</div>
            <h2 style={{ fontFamily: "'Orbitron'", color: '#ff6b35', margin: '0 0 10px', fontSize: 18 }}>INCOMING EMERGENCY REQUEST</h2>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 8, marginBottom: 20 }}>
              <div style={{ fontSize: 14, color: '#e0eaff', marginBottom: 5 }}>
                Patient: <strong style={{ color: '#ff6b35' }}>{incomingRequest.patientDetails?.name || 'EMERGENCY CASE'}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>
                Risk Level: <span style={{ color: '#ffb800', fontWeight: 'bold' }}>{incomingRequest.patientDetails?.riskLevel || 'CRITICAL'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={acceptRequest} style={{ padding: '10px 24px', background: '#00ff88', border: 'none', borderRadius: 6, color: '#000', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 12 }}>ACCEPT DISPATCH</button>
              <button onClick={rejectRequest} style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 12 }}>REJECT</button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts section */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {authUnit?.type === 'BLS' && assignedUser && (assignedUser.fallbackBLS || calculateTriage(vitals).level === 'RED') && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(255,50,50,0.25) 0%, rgba(255,50,50,0.05) 100%)',
            borderBottom: '2px solid rgba(255,80,80,0.8)',
            padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12,
            animation: 'critFlash 0.5s ease infinite alternate',
          }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff4444', fontWeight: 700, letterSpacing: '0.1em' }}>
                HIGH-ACUITY MISSION ASSIGNED TO BLS UNIT
              </div>
              <div style={{ fontSize: 12, color: '#ffb800', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>
                WARNING: Patient condition is critical (NEWS2 Red / High-Acuity). Dispatch requested ALS, but none were available. Fallback protocol active. Prepare for immediate stabilization and rapid transit.
              </div>
            </div>
          </div>
        )}

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

      {requestAccepted && assignedHospital && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(0,255,136,0.15) 0%, rgba(0,255,136,0.02) 100%)',
          borderBottom: '1px solid rgba(0,255,136,0.5)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>🔗</span>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', fontWeight: 700, letterSpacing: '0.1em' }}>
              SECURE HANDSHAKE ESTABLISHED
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>
              Receiving Hospital: <strong style={{ color: '#fff' }}>{assignedHospital.name}</strong> | Point of Contact: <strong style={{ color: '#fff' }}>{assignedHospital.adminName || 'Emergency Bay 1'}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="ambulance-stream-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, flex: 1, overflow: 'hidden' }}>
        {/* Main Panel */}
        <div style={{ padding: 24, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', position: 'relative' }}>

          {/* IDLE STATE — No patient assigned yet */}
          {!assignedUser && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
              <div style={{ fontSize: 60, opacity: 0.3 }}>🚑</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: 'rgba(160,200,255,0.3)', letterSpacing: '0.15em' }}>AWAITING DISPATCH</div>
              <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.2)', textAlign: 'center', maxWidth: 400 }}>
                Ambulance unit is online and ready. Patient vitals and details will appear here once a dispatch request is accepted.
              </div>
              {connected ? (
                <div style={{ padding: '8px 20px', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, fontSize: 11, fontFamily: "'Share Tech Mono'", color: '#00ff88', background: 'rgba(0,255,136,0.05)' }}>
                  ● UNIT ONLINE — STANDING BY
                </div>
              ) : (
                <div style={{ padding: '8px 20px', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, fontSize: 11, fontFamily: "'Share Tech Mono'", color: '#ff4444', background: 'rgba(255,68,68,0.05)' }}>
                  ● OFFLINE
                </div>
              )}
              <div style={{ marginTop: 30, padding: '20px', background: 'rgba(5,20,45,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, width: '100%', maxWidth: 320, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 8, letterSpacing: '0.1em' }}>MANUAL MISSION RECOVERY</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input 
                    value={manualRecoveryId} 
                    onChange={e => setManualRecoveryId(e.target.value)}
                    onKeyDown={handleManualRecoveryKeyDown}
                    placeholder="REQ ID" 
                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: "'Share Tech Mono'" }} 
                  />
                  <button onClick={handleManualRecover} style={{ background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', color: '#00c8ff', borderRadius: 4, padding: '0 15px', cursor: 'pointer', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>GO</button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE STATE — show EN ROUTE or VITALS based on arrival */}
          {assignedUser && !arrivedAtUser && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
              <div style={{ fontSize: 60 }}>🚑</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#ff6b35', letterSpacing: '0.15em' }}>EN ROUTE TO PATIENT</div>
              <div style={{ fontSize: 14, color: 'rgba(160,200,255,0.6)', textAlign: 'center', maxWidth: 300 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
                    PATIENT IDENTITY
                  </span>
                  {(resourceLocks.traumaBay || resourceLocks.bloodUnits || resourceLocks.ventilatorStandby) && (
                    <span style={{
                      padding: '2px 8px', background: 'rgba(0,255,136,0.2)',
                      border: '1px solid #00ff88', borderRadius: 4,
                      fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold',
                      animation: 'pulse-opacity 1.5s ease infinite'
                    }}>
                      🔒 EMR LOCKED
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select
                    onChange={(e) => {
                      if (e.target.value) setSelectedPatient(e.target.value);
                    }}
                    value={selectedPatient || ''}
                    style={{
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(160,200,255,0.2)',
                      borderRadius: 4, padding: '4px 12px', color: 'rgba(160,200,255,0.8)',
                      fontFamily: "'Share Tech Mono'", fontSize: 11, cursor: 'pointer', outline: 'none'
                    }}
                  >
                    <option value="">-- MANUAL SELECT --</option>
                    {Object.entries(PATIENT_NAMES).map(([id, name]) => (
                      <option key={id} value={id}>{name} (ID: {id})</option>
                    ))}
                  </select>

                  <button
                    onClick={simulateIdScan}
                    disabled={isScanning || !requestAccepted}
                    style={{
                      background: isScanning ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.1)',
                      border: `1px solid ${isScanning ? '#00ff88' : '#00ff88'}`,
                      borderRadius: 4, padding: '6px 16px',
                      color: '#00ff88',
                      fontFamily: "'Share Tech Mono'", fontSize: 11, cursor: (isScanning || !requestAccepted) ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: isScanning ? '0 0 15px rgba(0,255,136,0.4)' : 'none',
                      transition: 'all 0.3s'
                    }}>
                    {isScanning ? (
                      <>
                        <span className="scan-pulse" style={{ width: 10, height: 10, background: '#00ff88', borderRadius: '50%' }}></span>
                        PROCESSING AI CLOUD-ID...
                      </>
                    ) : (
                      <>📷 SCAN ID / AADHAR</>
                    )}
                  </button>
                </div>
              </div>

              {assignedUser?.patientDetails ? (
                <div style={{
                  padding: 12, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)',
                  borderRadius: 6, marginBottom: 15
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'" }}>
                      DISPATCH DATA (FROM USER)
                    </div>
                    {assignedUser.patientDetails?.isVerified && (
                      <div style={{ 
                        display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', 
                        background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', 
                        borderRadius: 20, fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold'
                      }}>
                        ✓ ABDM VERIFIED
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>NAME</div>
                      <div style={{ fontSize: 13, color: '#fff', fontFamily: "'Orbitron'" }}>{assignedUser.patientDetails.name || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>AGE</div>
                      <div style={{ fontSize: 13, color: '#fff', fontFamily: "'Orbitron'" }}>{assignedUser.patientDetails.age || 'N/A'} yrs</div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>CONDITION</div>
                      <div style={{ fontSize: 12, color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>{assignedUser.patientDetails.condition || 'General Emergency'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.3)', fontStyle: 'italic', marginBottom: 15 }}>
                  (No pre-registered details provided by caller)
                </div>
              )}

              {/* User Dispatch Details (Manual Entry from Caller) */}
              {!selectedPatient && assignedUser?.patientDetails && (
                <div style={{ marginBottom: 15, padding: '12px', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: '#ff6b35', fontFamily: "'Orbitron'", marginBottom: 6 }}>USER DISPATCH NOTES</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 'bold' }}>{assignedUser.patientDetails.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Condition: {assignedUser.patientDetails.condition}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>REPORTED RISK</div>
                      <div style={{ fontSize: 13, color: '#ff4444', fontWeight: 'bold' }}>{assignedUser.patientDetails.riskLevel}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual selection info */}
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginBottom: 12, fontFamily: "'Share Tech Mono'" }}>
                ENROLL PATIENT MANUALLY OR SCAN PHYSICAL ID CARD TO SYNC WITH DISPATCH.
              </div>
              {selectedPatient && (
                <>
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
                  {(resourceLocks.traumaBay || resourceLocks.bloodUnits || resourceLocks.ventilatorStandby) && (
                    <div style={{
                      marginTop: 10, padding: '10px 12px', background: 'rgba(0,255,136,0.05)',
                      border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6,
                      display: 'flex', flexDirection: 'column', gap: 6
                    }}>
                      <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold', letterSpacing: '0.05em' }}>
                        🔒 RESERVED CLINICAL RESOURCES (EMR SYNCED)
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {resourceLocks.traumaBay && (
                          <span style={{
                            padding: '2px 6px', background: 'rgba(0,255,136,0.15)',
                            border: '1px solid #00ff88', borderRadius: 4,
                            fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'"
                          }}>
                            🏨 TRAUMA BAY
                          </span>
                        )}
                        {resourceLocks.bloodUnits && (
                          <span style={{
                            padding: '2px 6px', background: 'rgba(0,255,136,0.15)',
                            border: '1px solid #00ff88', borderRadius: 4,
                            fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'"
                          }}>
                            🩸 BLOOD UNITS
                          </span>
                        )}
                        {resourceLocks.ventilatorStandby && (
                          <span style={{
                            padding: '2px 6px', background: 'rgba(0,255,136,0.15)',
                            border: '1px solid #00ff88', borderRadius: 4,
                            fontSize: 10, color: '#00ff88', fontFamily: "'Share Tech Mono'"
                          }}>
                            🫁 VENTILATOR STANDBY
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Vitals Grid - Only shown when patient is selected */}
            {selectedPatient ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#88ff88', letterSpacing: '0.1em' }}>
                      PATIENT VITALS {streaming && <span style={{ color: '#ff4444', animation: 'blink 1s step-end infinite' }}>● REC</span>}
                      <span style={{
                        marginLeft: 10,
                        background: `${(vitals.source || 'SIMULATED') === 'LIVE' ? '#00ff88' : (vitals.source || 'SIMULATED') === 'MANUAL' ? '#ffb800' : '#00c8ff'}22`,
                        color: (vitals.source || 'SIMULATED') === 'LIVE' ? '#00ff88' : (vitals.source || 'SIMULATED') === 'MANUAL' ? '#ffb800' : '#00c8ff',
                        border: `1px solid ${(vitals.source || 'SIMULATED') === 'LIVE' ? '#00ff88' : (vitals.source || 'SIMULATED') === 'MANUAL' ? '#ffb800' : '#00c8ff'}88`,
                        borderRadius: 12,
                        padding: '2px 8px',
                        fontSize: 10,
                        fontFamily: "'Orbitron'",
                        fontWeight: 'bold',
                        letterSpacing: '0.05em'
                      }}>
                        {vitals.source || 'SIMULATED'}
                      </span>
                    </div>
                    <button
                      onClick={() => sendHospitalRequest(selectedPatient)}
                      style={{ background: 'rgba(255,184,0,0.1)', border: '1px solid #ffb800', borderRadius: 4, padding: '4px 10px', color: '#ffb800', fontSize: 9, fontFamily: "'Orbitron'", cursor: 'pointer', fontWeight: 'bold' }}>
                      ⚡ RE-SEND ALERT
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'" }}>SOURCE:</span>
                    <select
                      value={vitalsSource}
                      onChange={(e) => {
                        const nextSource = e.target.value;
                        setVitalsSource(nextSource);
                        if (nextSource === 'LIVE') {
                          setStreaming(true);
                          setVitals(prev => ({ ...prev, source: 'LIVE' }));
                        } else if (nextSource === 'SIMULATED') {
                          setStreaming(true);
                          setVitals(prev => ({ ...prev, source: 'SIMULATED' }));
                        } else if (nextSource === 'MANUAL') {
                          setStreaming(true);
                          setVitals(prev => ({ ...prev, source: 'MANUAL' }));
                        }
                      }}
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        color: vitalsSource === 'LIVE' ? '#00ff88' : vitalsSource === 'MANUAL' ? '#ffb800' : '#00c8ff',
                        border: `1px solid ${vitalsSource === 'LIVE' ? '#00ff88' : vitalsSource === 'MANUAL' ? '#ffb800' : '#00c8ff'}`,
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        fontFamily: "'Orbitron'",
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="SIMULATED">SIMULATED</option>
                      <option value="MANUAL">MANUAL (FORM)</option>
                      <option value="LIVE">LIVE (IOT / GATEWAY)</option>
                      <option value="BLUETOOTH">📡 BLUETOOTH HRM</option>
                    </select>
                    <button
                      onClick={() => setSimulateCrisis(!simulateCrisis)}
                      disabled={vitalsSource !== 'SIMULATED'}
                      style={{
                        padding: '4px 10px', background: simulateCrisis ? 'rgba(255,180,0,0.2)' : 'rgba(160,200,255,0.05)',
                        border: `1px solid ${simulateCrisis ? '#ffb800' : 'rgba(160,200,255,0.2)'}`,
                        borderRadius: 4, color: simulateCrisis ? '#ffb800' : 'rgba(160,200,255,0.5)',
                        fontFamily: "'Share Tech Mono'", fontSize: 10, cursor: vitalsSource === 'SIMULATED' ? 'pointer' : 'not-allowed',
                        opacity: vitalsSource === 'SIMULATED' ? 1 : 0.5
                      }}>
                      {simulateCrisis ? "⚠️ SIMULATING CRISIS" : "SIMULATE CRISIS"}
                    </button>
                  </div>
                </div>

                {vitalsSource === 'BLUETOOTH' && patientLoaded && (
                  <div style={{
                    background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)',
                    borderRadius: 10, padding: 15, marginBottom: 15
                  }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10, letterSpacing: '0.1em', fontWeight: 'bold' }}>
                      📡 WEB BLUETOOTH INTEGRATION
                    </div>
                    {bleDevice ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 12, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
                          🟢 CONNECTED: {bleDevice.name || 'Bluetooth HRM'}
                        </div>
                        <button 
                          onClick={disconnectBluetoothHRM}
                          style={{
                            padding: '8px 12px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444',
                            borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer'
                          }}
                        >
                          DISCONNECT DEVICE
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.4 }}>
                          Connect a standard BLE Heart Rate Monitor device to stream live ECG pulse directly to this terminal.
                        </div>
                        {bleError && (
                          <div style={{ fontSize: 11, color: '#ff4444', fontFamily: "'Share Tech Mono'" }}>
                            Error: {bleError}
                          </div>
                        )}
                        <button 
                          onClick={connectBluetoothHRM}
                          disabled={bleConnecting}
                          style={{
                            padding: '10px 16px', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
                            borderRadius: 6, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          {bleConnecting ? 'SCANNING...' : '🔌 CONNECT BLE MONITOR'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {vitalsSource === 'MANUAL' && patientLoaded && (
                  <div style={{
                    background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.2)',
                    borderRadius: 10, padding: 15, marginBottom: 15
                  }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ffb800', marginBottom: 10, letterSpacing: '0.1em', fontWeight: 'bold' }}>
                      ✍️ MANUAL VITAL SIGNS ENTRY FORM
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                      {[
                        { key: 'heartRate', label: 'HEART RATE (BPM)', min: 30, max: 200 },
                        { key: 'spo2', label: 'SpO2 (%)', min: 50, max: 100 },
                        { key: 'systolic', label: 'BP SYSTOLIC (MMHG)', min: 60, max: 220 },
                        { key: 'diastolic', label: 'BP DIASTOLIC (MMHG)', min: 30, max: 130 },
                        { key: 'temperature', label: 'TEMP (°C)', min: 34, max: 42, step: 0.1 },
                        { key: 'respRate', label: 'RESP RATE (MIN)', min: 8, max: 40 },
                        { key: 'bloodGlucose', label: 'GLUCOSE (MG/DL)', min: 40, max: 400 }
                      ].map(field => (
                        <div key={field.key}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", display: 'block', marginBottom: 3 }}>
                            {field.label}
                          </label>
                          <input
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            value={vitals[field.key] || ''}
                            onChange={(e) => handleManualVitalChange(field.key, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(255,184,0,0.3)',
                              borderRadius: 4,
                              color: '#fff',
                              fontSize: 12,
                              fontFamily: "'Share Tech Mono'",
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!arrivedAtUser ? (
                  <div style={{
                    padding: '40px 20px', textAlign: 'center', background: 'rgba(255,184,0,0.05)',
                    borderRadius: 10, border: '1px dashed rgba(255,184,0,0.3)', marginBottom: 20
                  }}>
                    <div style={{ fontSize: 30, marginBottom: 10 }}>🚑</div>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ffb800', fontWeight: 700, letterSpacing: 1 }}>
                      EN ROUTE TO INCIDENT SITE
                    </div>
                    <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: 'rgba(255,184,0,0.6)', marginTop: 8 }}>
                      SENSORS DISCONNECTED • VITALS MONITORING WILL START UPON ARRIVAL
                    </div>
                  </div>
                ) : !patientLoaded ? (
                  <div style={{
                    padding: '40px 20px', textAlign: 'center', background: 'rgba(0,255,136,0.05)',
                    borderRadius: 10, border: '1px dashed rgba(0,255,136,0.3)', marginBottom: 20
                  }}>
                    <div style={{ fontSize: 30, marginBottom: 10 }}>📥</div>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>
                      ARRIVED AT INCIDENT SITE
                    </div>
                    <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: 'rgba(0,255,136,0.6)', margin: '8px 0 20px' }}>
                      PATIENT CONTACT ESTABLISHED • CONNECT SENSORS TO START MONITORING
                    </div>
                    <button 
                      onClick={() => {
                        setPatientLoaded(true);
                        setStreaming(true); // Automatically start streaming when patient is onboarded
                        if (socket && assignedUser) {
                          socket.emit('patient-onboard', { reqId: assignedUser.id });
                        }
                      }}
                      style={{
                        padding: '12px 24px', background: 'rgba(0,255,136,0.2)', border: '1px solid #00ff88',
                        borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 12,
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.background = 'rgba(0,255,136,0.3)'}
                      onMouseOut={(e) => e.target.style.background = 'rgba(0,255,136,0.2)'}
                    >
                      🚀 📤 PATIENT ONBOARD
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
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
                      <VitalCard label="BLOOD GLUCOSE" value={vitals.bloodGlucose || vitals.glucose} unit="mg/dL" color="#aa88ff" icon="🔬"
                        critical={(vitals.bloodGlucose || vitals.glucose) > 200 || (vitals.bloodGlucose || vitals.glucose) < 70} />
                    </div>

                    {/* Real-time Physiological Waveforms Component */}
                    <div style={{ marginTop: 16 }}>
                      <PhysiologicalWaveforms 
                        vitals={vitals} 
                        news2Score={
                          (() => {
                            let score = 0;
                            if (vitals.heartRate <= 40 || vitals.heartRate >= 131) score += 3;
                            else if (vitals.heartRate >= 111) score += 2;
                            else if (vitals.heartRate <= 50 || vitals.heartRate >= 91) score += 1;
                          
                            if (vitals.spo2 <= 91) score += 3;
                            else if (vitals.spo2 === 92 || vitals.spo2 === 93) score += 2;
                            else if (vitals.spo2 === 94 || vitals.spo2 === 95) score += 1;
                          
                            if (vitals.systolic <= 90) score += 3;
                            else if (vitals.systolic <= 100) score += 2;
                            else if (vitals.systolic <= 110) score += 1;
                            else if (vitals.systolic >= 220) score += 3;
                            return score;
                          })()
                        }
                      />
                    </div>
                  </div>
                )}
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
                  <span>📍 LIVE INCIDENT SITE</span>
                  <span>🏥 {selectedHospital?.name?.toUpperCase() || 'SEARCHING...'}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(0,200,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${routeProgress * 100}%`,
                    background: simulateTraffic ? 'linear-gradient(90deg, #ffb800, #ff6b6b)' : 'linear-gradient(90deg, #00c8ff, #88ff88)',
                    borderRadius: 4, transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              
              {/* === ENTERPRISE CONTROLS === */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => {
                    const active = window.confirm("Request Green Corridor? Traffic signals will be cleared.");
                    if (active && socket) {
                      socket.emit('green-corridor-request', {
                        ambulanceId: authUnit?.unitId,
                        route: routePath,
                        destination: selectedHospital?.id
                      });
                      showAlert('🟢 Green Corridor Activated. Route prioritized.');
                    }
                  }}
                  style={{
                    padding: '10px', background: 'rgba(0,255,136,0.1)',
                    border: '1px solid #00ff88', borderRadius: 8, color: '#00ff88',
                    fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0,255,136,0.2)'
                  }}
                >🟢 REQUEST GREEN CORRIDOR</button>
                <button
                  onClick={() => {
                    if (window.confirm("💥 SIMULATE VEHICLE COLLISION? This will trigger an automatic SOS to the War Room and Hospital.")) {
                      socket.emit('accident-detected', {
                        ambulanceId: authUnit?.unitId,
                        location,
                        severity: 'CRITICAL',
                        force: '8.4G'
                      });
                      showAlert('💥 COLLISION DETECTED. SOS SENT AUTOMATICALLY.');
                    }
                  }}
                  style={{
                    padding: '10px', background: 'rgba(255,68,68,0.1)',
                    border: '1px solid #ff4444', borderRadius: 8, color: '#ff4444',
                    fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(255,68,68,0.2)'
                  }}
                >💥 SIMULATE COLLISION</button>
              </div>

              {/* GPS Status & Override Panel */}
              <div style={{
                background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)',
                borderRadius: 10, padding: 15, marginTop: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
                    📡 REAL-TIME GPS TELEMETRY
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#ff6b35', cursor: 'pointer', fontFamily: "'Orbitron'" }}>
                    <input
                      type="checkbox"
                      checked={gpsOverride}
                      onChange={(e) => setGpsOverride(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    GPS OVERRIDE
                  </label>
                </div>

                {gpsError && (
                  <div style={{ padding: '6px 10px', background: 'rgba(255,50,50,0.1)', border: '1px solid #ff4444', borderRadius: 4, color: '#ff8888', fontSize: 10, marginBottom: 10, fontFamily: "'Share Tech Mono'" }}>
                    ⚠️ {gpsError} — Using last known position / IP fallback
                  </div>
                )}

                {gpsOverride ? (
                  <form onSubmit={handleGpsOverrideSubmit} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      step="any"
                      placeholder="Lat (e.g. 12.9592)"
                      value={overrideLat}
                      onChange={(e) => setOverrideLat(e.target.value)}
                      required
                      style={{ flex: 1, padding: '6px 8px', background: 'rgba(5,15,40,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 11, outline: 'none' }}
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Lng (e.g. 77.6444)"
                      value={overrideLng}
                      onChange={(e) => setOverrideLng(e.target.value)}
                      required
                      style={{ flex: 1, padding: '6px 8px', background: 'rgba(5,15,40,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 11, outline: 'none' }}
                    />
                    <button type="submit" style={{ padding: '6px 12px', background: 'rgba(255,107,53,0.2)', border: '1px solid #ff6b35', borderRadius: 4, color: '#ff6b35', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: "'Orbitron'" }}>
                      SET
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ACCURACY</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: gpsAccuracy && gpsAccuracy < 30 ? '#00ff88' : '#ffb800', fontFamily: "'Share Tech Mono'" }}>
                        {gpsAccuracy ? `${Math.round(gpsAccuracy)} m` : 'N/A'}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>SPEED</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>
                        {gpsSpeed !== null ? `${gpsSpeed} km/h` : '0 km/h'}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>SIGNAL</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: gpsAccuracy && gpsAccuracy < 15 ? '#00ff88' : gpsAccuracy ? '#ffb800' : 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                        {gpsAccuracy ? (gpsAccuracy < 15 ? '🟢 EXCELLENT' : '🟡 GOOD') : '⚪ NO GPS'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Map */}

              <div style={{
                marginTop: 16, borderRadius: 8, overflow: 'hidden',
                border: '1px solid rgba(0,200,255,0.2)', height: 200, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000,
                  display: 'flex', gap: 6
                }}>
                  <input 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                    placeholder="Search city/area..."
                    style={{
                      flex: 1, padding: '6px 10px', background: 'rgba(5,20,40,0.9)', 
                      border: '1px solid rgba(0,200,255,0.4)', borderRadius: 4, 
                      color: '#fff', fontSize: 11, outline: 'none'
                    }}
                  />
                  <button onClick={handleManualSearch} style={{
                    padding: '6px 10px', background: 'rgba(0,200,255,0.2)', 
                    border: '1px solid #00c8ff', borderRadius: 4, color: '#00c8ff',
                    cursor: 'pointer', fontSize: 10
                  }}>📍</button>
                </div>
                <div style={{
                  position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
                  background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4,
                  fontSize: 8, color: 'rgba(0,255,136,0.8)', fontFamily: "'Share Tech Mono'"
                }}>
                  MODE: {locationMethod}
                </div>
                <MapContainer
                  center={location ? [location.lat, location.lng] : [12.9716, 77.5946]}
                  zoom={location ? 12 : 2}
                  style={{ height: '100%', width: '100%', background: '#050d1a' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                  <SmartMapController 
                    ambulanceLoc={location} 
                    userLoc={assignedUser?.userLocation} 
                    manualCenter={manualCenter} 
                  />
                  {location && location.lat && (
                    <>
                      <Marker position={[location.lat, location.lng]} icon={ambulanceIcon}>
                        <Popup><strong>🚑 Ambulance</strong><br />Lat: {location.lat.toFixed(4)}<br />Lng: {location.lng.toFixed(4)}</Popup>
                      </Marker>
                      <MapUpdater center={location} />
                    </>
                  )}
                  {assignedUser && assignedUser.userLocation && (
                    <Marker position={[assignedUser.userLocation.lat, assignedUser.userLocation.lng]} icon={userIcon}>
                      <Popup><strong>🧍 Emergency Location</strong></Popup>
                    </Marker>
                  )}
                  {selectedHospital && (
                    <Marker
                      position={[
                        selectedHospital.pos ? selectedHospital.pos.lat : (selectedHospital.location?.lat || 0),
                        selectedHospital.pos ? selectedHospital.pos.lng : (selectedHospital.location?.lng || 0)
                      ]}
                      icon={hospitalIcon}
                    >
                      <Popup><strong>🏥 {selectedHospital?.name || 'Hospital'}</strong></Popup>
                    </Marker>
                  )}
                  {Object.entries(networkHospitals).map(([id, hosp]) => {
                    const pos = hosp.location || hosp.pos;
                    if (!pos || (selectedHospital && (selectedHospital.id === hosp.id || selectedHospital.hospitalId === hosp.id))) return null;
                    return (
                      <Marker key={id} position={[pos.lat, pos.lng]} icon={hospitalIcon} opacity={0.6}>
                        <Popup>
                          <strong>🏥 {hosp.name}</strong><br />
                          {hosp.isOnline ? '🟢 Online' : '⚪ Offline'}<br />
                          {hosp.isBusy ? '🔴 Busy' : '🟢 Ready'}
                        </Popup>
                      </Marker>
                    );
                  })}
                  {routePath && (
                    greenCorridorActive ? (
                      <>
                        <Polyline positions={routePath} color="#00ff88" weight={12} opacity={0.25} />
                        <Polyline positions={routePath} color="#00ff88" weight={8} opacity={0.5} />
                        <Polyline positions={routePath} color="#00ff88" weight={4} opacity={0.9} />
                      </>
                    ) : (
                      <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
                    )
                  )}
                  {locationHistory.length > 1 && (
                    <Polyline positions={locationHistory} color={simulateTraffic ? "#ffb800" : "#00c8ff"} weight={3} opacity={0.5} />
                  )}

                  {/* Traffic Incidents Circles */}
                  {Object.values(trafficIncidents).map((incident) => (
                    <React.Fragment key={incident.id}>
                      <Circle
                        center={[incident.lat, incident.lng]}
                        radius={incident.radius || 300}
                        pathOptions={{
                          color: '#ff3333',
                          fillColor: '#ff3333',
                          fillOpacity: 0.15,
                          dashArray: '5, 10',
                          weight: 2
                        }}
                      >
                        <Popup>
                          <div style={{ color: '#333', fontFamily: 'sans-serif' }}>
                            <strong style={{ color: '#ff3333' }}>⚠️ Traffic Incident / Blockage</strong>
                            <p style={{ margin: '5px 0 0 0', fontSize: '11px' }}>{incident.reason}</p>
                            <span style={{ fontSize: '9px', color: '#666' }}>Radius: {incident.radius}m</span>
                          </div>
                        </Popup>
                      </Circle>
                      <Circle
                        center={[incident.lat, incident.lng]}
                        radius={20}
                        pathOptions={{
                          color: '#ff1111',
                          fillColor: '#ff1111',
                          fillOpacity: 0.8,
                          weight: 1
                        }}
                      />
                    </React.Fragment>
                  ))}

                  {/* Fleet Overview: Other Ambulances */}
                  {Object.entries(ambulances).map(([id, amb]) => {
                    if (!amb.location || id === socket.id) return null;
                    return (
                      <Marker key={id} position={[amb.location.lat, amb.location.lng]} icon={ambulanceIcon} opacity={0.4}>
                        <Popup>
                          <strong>🚑 {amb.name || 'Ambulance'}</strong><br/>
                          {amb.available ? '🟢 Available' : '🔴 Busy'}
                        </Popup>
                      </Marker>
                    );
                  })}
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
                {(() => {
                  const anchor = assignedUser?.userLocation || location;
                  const realHospitals = Object.values(networkHospitals);
                  const list = realHospitals.length > 0 ? realHospitals : generateGlobalHospitals(anchor);

                  return list
                    .map(h => {
                      const dist = calcDist(anchor, h.pos || h.location || h);
                      const { score, breakdown } = calculateHRI(dist, h);
                      return { ...h, currentDist: dist, hriScore: score, hriBreakdown: breakdown };
                    })
                    .sort((a, b) => b.hriScore - a.hriScore)
                    .map(h => {
                      const dist = h.currentDist;
                      const isSelected = selectedHospital?.id === h.id || selectedHospital?.hospitalId === h.id;
                      const isOnline = h.isOnline || !!h.socketId;

                      const resources = (selectedHospital?.id === h.id) ? hospitalResources : (h.simulatedResources || h.resources || {});
                      const readyCount = Object.values(resources).filter(Boolean).length;
                      const hasInventoryWarning = h.inventory?.outOfBlood || h.inventory?.outOfBeds;

                      return (
                        <div key={h.id} style={{
                          padding: '12px', borderRadius: 8,
                          background: isSelected ? 'rgba(0,200,255,0.1)' : (h.isBusy ? 'rgba(255,184,0,0.05)' : (hasInventoryWarning ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.2)')),
                          border: `1px solid ${isSelected ? '#00c8ff' : (h.isBusy ? '#ffb800' : (hasInventoryWarning ? 'rgba(255,40,40,0.2)' : 'rgba(160,200,255,0.1)'))}`,
                          transition: 'all 0.2s',
                          opacity: (hasInventoryWarning || (h.isBusy && !isSelected)) ? 0.8 : 1,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: isSelected ? '#00c8ff' : '#fff' }}>{h.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ 
                                fontSize: 9, 
                                padding: '2px 6px', 
                                borderRadius: 4, 
                                background: isOnline ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                                color: isOnline ? '#00ff88' : 'rgba(255,255,255,0.4)',
                                border: `1px solid ${isOnline ? '#00ff8844' : 'rgba(255,255,255,0.1)'}`,
                                fontFamily: "'Share Tech Mono'"
                              }}>
                                {isOnline ? '● ONLINE' : '○ OFFLINE'}
                              </div>
                              {(h.inventory?.beds === 0 || h.inventory?.outOfBeds) && (
                                <div style={{
                                  background: 'rgba(255, 68, 68, 0.2)',
                                  color: '#ff5555',
                                  border: '1px solid rgba(255, 68, 68, 0.4)',
                                  borderRadius: 4,
                                  padding: '2px 6px',
                                  fontSize: 9,
                                  fontFamily: "'Orbitron'",
                                  fontWeight: 'bold',
                                  animation: 'pulse-opacity 1.5s infinite'
                                }}>
                                  ⚠️ DIVERT RECOMMENDED
                                </div>
                              )}
                              <div className="hri-tooltip" style={{
                                fontSize: 9,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: h.hriScore > 75 ? 'rgba(0,255,136,0.2)' : h.hriScore > 40 ? 'rgba(255,184,0,0.2)' : 'rgba(255,68,68,0.2)',
                                color: h.hriScore > 75 ? '#00ff88' : h.hriScore > 40 ? '#ffb800' : '#ff4444',
                                border: `1px solid ${h.hriScore > 75 ? '#00ff88' : h.hriScore > 40 ? '#ffb800' : '#ff4444'}`,
                                fontFamily: "'Orbitron'",
                                fontWeight: 'bold',
                              }}>
                                {h.hriScore}% MATCH
                                <span className="hri-tooltip-text">
                                  <strong>Hospital Recommendation Index (HRI):</strong><br />
                                  {h.hriBreakdown}<br /><br />
                                  Factors:<br />
                                  • Proximity: -1.2 per min ETA<br />
                                  • ICU Beds: +3.0 per bed<br />
                                  • Trauma Bay Prepared: +15%<br />
                                  • Active ER Queue: -2.0 per mission
                                </span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                              ETA: ~{Math.ceil(dist / 0.6)} mins · {h.isBusy ? 'Capacity Full' : `${readyCount}/4 Services Ready`}
                            </div>
                            {!isSelected && (
                              <button onClick={() => setRerouteTarget(h)} style={{
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
                    });
                })()}
              </div>
            </div>

            {/* Paramedic Toolkit */}
            <ParamedicToolkit 
              patientDetails={assignedUser?.patientDetails} 
              socket={socket} 
              reqId={assignedUser?.id || activeMissionId} 
              checklist={clinicalChecklist} 
              setChecklist={setClinicalChecklist} 
            />

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
              <div style={{ marginTop: 25, borderTop: '1px solid rgba(0,255,136,0.1)', paddingTop: 20 }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 10 }}>MANUAL MISSION RECOVERY (FALLBACK)</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input 
                    value={manualRecoveryId} 
                    onChange={e => setManualRecoveryId(e.target.value)}
                    onKeyDown={handleManualRecoveryKeyDown}
                    placeholder="ENTER REQUEST ID..." 
                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '10px 15px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: "'Share Tech Mono'" }} 
                  />
                  <button onClick={handleManualRecover} style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', color: '#00ff88', borderRadius: 8, padding: '0 20px', cursor: 'pointer', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>RECOVER</button>
                </div>
              </div>
            </div>

          </>)}
        </div>

        {/* Chat sidebar */}
        <div style={{
          background: 'rgba(3,10,28,0.95)',
          borderLeft: '1px solid rgba(0,200,255,0.1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          height: '100%'
        }}>
          <div style={{ padding: '14px', borderBottom: '1px solid rgba(0,200,255,0.1)', flexShrink: 0 }}>
            {assignedUser && (
              <VideoCall 
                socket={socket} 
                role="paramedic" 
                missionId={assignedUser?.id} 
              />
            )}
          </div>

          {/* --- AI SMART ROUTING PANEL --- */}
          <div style={{ flexShrink: 0, padding: '12px 16px', background: 'rgba(0,200,255,0.03)', borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
            
            {/* Green Corridor Toggle */}
            {assignedUser && (
              <div style={{ 
                background: greenCorridorActive ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${greenCorridorActive ? '#00ff88' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 8, padding: '10px 12px', marginBottom: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: greenCorridorActive ? '#00ff88' : '#e0eaff', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                    🚦 GREEN CORRIDOR
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>
                    Preempt municipal signals
                  </div>
                </div>
                <button
                  onClick={() => {
                    const newStatus = !greenCorridorActive;
                    setGreenCorridorActive(newStatus);
                    socket.emit('green-corridor-status', {
                      reqId: assignedUser.id,
                      active: newStatus
                    });
                  }}
                  style={{
                    padding: '4px 10px',
                    background: greenCorridorActive ? '#00ff88' : 'rgba(0,200,255,0.15)',
                    border: 'none',
                    borderRadius: 4,
                    color: greenCorridorActive ? '#000' : '#00c8ff',
                    fontSize: 9,
                    fontWeight: 'bold',
                    fontFamily: "'Orbitron'",
                    cursor: 'pointer'
                  }}
                >
                  {greenCorridorActive ? 'ACTIVE' : 'REQUEST'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#00c8ff', letterSpacing: '0.1em' }}>
                📡 SMART SUGGESTIONS
              </div>
              <div style={{ fontSize: 8, background: '#00c8ff', color: '#000', padding: '1px 4px', borderRadius: 2, fontWeight: 'bold' }}>AI</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const incidentAnchor = assignedUser?.userLocation || location;
                const realHospitals = Object.values(networkHospitals);
                const list = realHospitals.length > 0 ? realHospitals : generateGlobalHospitals(incidentAnchor);

                return list.map(h => {
                  const dist = incidentAnchor && (h.pos || h.location || h) ? calcDist(incidentAnchor, h.pos || h.location || h) : 0;
                  const { score, breakdown, eta } = calculateHRI(dist, h);
                  return { ...h, dist, eta, hriScore: score, hriBreakdown: breakdown };
                })
                .sort((a, b) => b.hriScore - a.hriScore)
                .slice(0, 2)
                .map(h => {
                  const isSelected = selectedHospital?.id === h.id || selectedHospital?.hospitalId === h.id;
                  return (
                    <div key={h.id} style={{ 
                      background: isSelected ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 6, padding: '8px 10px', cursor: h.isBusy ? 'not-allowed' : 'pointer',
                      position: 'relative'
                    }} onClick={() => !h.isBusy && setRerouteTarget(h)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{h.name.split(' ')[0]}...</span>
                        <span style={{ color: h.isBusy ? '#ff4444' : '#00ff88', fontSize: 10 }}>{h.eta}m ETA</span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Object.entries(h.simulatedResources || h.resources || {}).slice(0, 2).map(([key, val]) => (
                            <div key={key} style={{ fontSize: 7, color: val ? '#00ff88' : '#ff4444' }}>
                              {val ? '✓' : '✗'} {key.replace('Ready', '').replace('Prepared', '').toUpperCase()}
                            </div>
                          ))}
                        </div>
                        
                        <div className="hri-tooltip" style={{
                          fontSize: 8,
                          padding: '1px 5px',
                          borderRadius: 3,
                          background: h.hriScore > 75 ? 'rgba(0,255,136,0.15)' : h.hriScore > 40 ? 'rgba(255,184,0,0.15)' : 'rgba(255,68,68,0.15)',
                          color: h.hriScore > 75 ? '#00ff88' : h.hriScore > 40 ? '#ffb800' : '#ff4444',
                          border: `1px solid ${h.hriScore > 75 ? '#00ff8844' : h.hriScore > 40 ? '#ffb80044' : '#ff444444'}`,
                          fontFamily: "'Orbitron'",
                          fontWeight: 'bold',
                        }}>
                          {h.hriScore}% MATCH
                          <span className="hri-tooltip-text" style={{ bottom: '150%', left: 'auto', right: '0%', marginLeft: '0px', transform: 'none' }}>
                            <strong>Hospital Recommendation Index (HRI):</strong><br />
                            {h.hriBreakdown}<br /><br />
                            Factors:<br />
                            • Proximity: -1.2 per min ETA<br />
                            • ICU Beds: +3.0 per bed<br />
                            • Trauma Bay Prepared: +15%<br />
                            • Active ER Queue: -2.0 per mission
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div style={{ flex: 1, padding: '12px 16px 40px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                  You are changing destination to <span style={{ color: '#00c8ff', fontWeight: 'bold' }}>{rerouteTarget?.name}</span>.<br />
                  Current connected hospital: <span style={{ color: '#ffb800' }}>{selectedHospital?.name || 'None'}</span>.
                </div>

                {/* Service Verification Checklist */}
                <div style={{
                  background: 'rgba(0,200,255,0.05)', padding: 15, borderRadius: 8, marginBottom: 20,
                  border: '1px solid rgba(0,200,255,0.2)'
                }}>
                  <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", marginBottom: 10 }}>CAPABILITY VERIFICATION</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.ventilatorReady ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.ventilatorReady ? '✓' : '✗'} VENTILATORS
                    </div>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.otPrepared ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.otPrepared ? '✓' : '✗'} OT PREPARED
                    </div>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.cardiologistAssigned ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.cardiologistAssigned ? '✓' : '✗'} CARDIOLOGY
                    </div>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.bloodBankAlerted ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.bloodBankAlerted ? '✓' : '✗'} BLOOD BANK
                    </div>
                  </div>
                  {((assignedUser?.patientDetails?.condition === 'Cardiac Arrest' && !rerouteTarget?.simulatedResources?.ventilatorReady) || 
                    (assignedUser?.patientDetails?.riskLevel === 'CRITICAL' && !rerouteTarget?.simulatedResources?.otPrepared)) && (
                    <div style={{ marginTop: 10, fontSize: 10, color: '#ff4444', background: 'rgba(255,68,68,0.1)', padding: '6px 10px', borderRadius: 4, fontWeight: 'bold', border: '1px solid #ff4444' }}>
                      ⚠️ WARNING: TARGET HOSPITAL LACKS CRITICAL SERVICES FOR THIS CASE
                    </div>
                  )}
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
                        hospitalName: selectedHospital?.name || 'Emergency Center',
                        timestamp: new Date().toLocaleString(),
                        triageColor: triage.spo2 < 92 || triage.heartRate > 130 ? '#ff4444' : triage.spo2 < 94 || triage.heartRate > 110 ? '#ffb800' : '#00ff88',
                        triageLabel: triage.spo2 < 92 || triage.heartRate > 130 ? 'IMMEDIATE (RED)' : triage.spo2 < 94 || triage.heartRate > 110 ? 'URGENT (YELLOW)' : 'STABLE (GREEN)',
                        vitals: { ...triage },
                        notes: `Rerouted from ${selectedHospital?.name || 'Unknown'} to ${hosp?.name || 'Target'}. Reason: Tactical reroute.`
                      };
                      const updatedReports = [...previousReports, snapshot];
                      setPreviousReports(updatedReports);

                      // Notify network
                      const netHosp = Object.entries(networkHospitals).find(([_, h]) => h.id === hosp.id);
                      if (socket && assignedUser) {
                        if (netHosp) {
                          socket.emit('request-hospital', {
                            reqId: assignedUser.id,
                            hospitalSocketId: netHosp[1]?.socketId,
                            fieldReport: snapshot,
                            previousReports: shareHistory ? updatedReports : undefined,
                            arrivedAtUser: true
                          });
                        }
                        socket.emit('reroute-hospital', {
                          reqId: assignedUser.id,
                          newHospitalId: hosp?.id,
                          newHospitalName: hosp?.name,
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
