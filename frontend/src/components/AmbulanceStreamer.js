import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import VideoCall from './VideoCall';
import { showAlert } from '../utils/alert';
import { offlineQueue } from '../utils/IndexedDBBridge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PhysiologicalWaveforms from './PhysiologicalWaveforms';
import EmergencyCorridorPanel from './EmergencyCorridorPanel';
import OfflineTileLayer from './OfflineTileLayer';
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
let hospitalIcon = null;
let userIcon = null;
try {
  if (typeof window !== 'undefined' && L && L.divIcon) {
    ambulanceIcon = L.divIcon({
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

    hospitalIcon = L.divIcon({
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

    userIcon = L.divIcon({
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
  }
} catch (e) {}

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
          <div style={{ padding: 10, background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6, color: '#ff8888', fontSize: 11 }}>
            🚨 CONTRAINDICATION: Patient allergic to Penicillin group.
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


export default function AmbulanceStreamer({ socket, connected, onLogout, onSwitchRole, onShowSecurity }) {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authUnit, setAuthUnit] = useState(() => {
    const userStr = sessionStorage.getItem('rescuelink_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const emailUpper = (user.email || user.username || user.id || '').toUpperCase();
      const found = AMBULANCE_CREDENTIALS.find(c => c.unitId === emailUpper) || {
        unitId: user.id || 'AMB-101',
        driverName: user.name || 'Unit 101 Lead Paramedic',
        vehicleNo: user.email?.includes('@') ? user.email.split('@')[0].toUpperCase() : (user.email || 'EMG-RL-0101'),
        type: 'ALS'
      };
      return found;
    }
    // Fallback default so it doesn't crash
    return {
      unitId: 'AMB-101',
      driverName: 'Unit 101 Lead Paramedic',
      vehicleNo: 'EMG-RL-0101',
      type: 'ALS'
    };
  });
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [activeTab, setActiveTab] = useState('mission'); // mission, vitals, comms, settings
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [manualRecoveryId, setManualRecoveryId] = useState('');
  const [vitals, setVitals] = useState({ heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 37.0, respRate: 16, bloodGlucose: 100 });
  const [vitalsSource, setVitalsSource] = useState('SIMULATED'); // 'SIMULATED', 'MANUAL', 'LIVE'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const vitalsSourceRef = useRef(vitalsSource);
  useEffect(() => { vitalsSourceRef.current = vitalsSource; }, [vitalsSource]);

  // Paramedic Heartbeat Emitter for stuck-case tracking
  useEffect(() => {
    if (!socket || !connected || !authUnit?.unitId) return;

    const interval = setInterval(() => {
      socket.emit('driver:heartbeat', { reqId: authUnit.unitId });
    }, 15000);

    return () => clearInterval(interval);
  }, [socket, connected, authUnit?.unitId]);

  const [greenCorridorActive, setGreenCorridorActive] = useState(false);
  const [isActiveDuty, setIsActiveDuty] = useState(true);

  const [bleDevice, setBleDevice] = useState(null);
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleError, setBleError] = useState('');
  const bleIntervalRef = useRef(null);

  const connectBluetoothHRM = async () => {
    setBleConnecting(true);
    setBleError('');
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser.');
      }
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['heart_rate']
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
    if (bleDevice && bleDevice.gatt && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
    }
    if (bleIntervalRef.current) {
      clearInterval(bleIntervalRef.current);
      bleIntervalRef.current = null;
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
  const [pendingLocks, setPendingLocks] = useState({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
  const [lockStatus, setLockStatus] = useState(''); // '', 'PENDING', 'APPROVED', 'DENIED'
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
  const [hospitalRecommendations, setHospitalRecommendations] = useState([]);

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

  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[LocalStorage Error] Failed to write key "${key}":`, e);
      if (e.name === 'QuotaExceededError') {
        try {
          // Clear non-critical offline backlog to free space
          localStorage.removeItem('offline_backlog');
          localStorage.setItem(key, value);
        } catch (innerErr) {
          console.warn('[LocalStorage Error] Fallback cleanup failed:', innerErr);
        }
      }
    }
  };

  // --- STATE RECOVERY SYNC ---
  useEffect(() => { safeSetItem('amb_streaming', streaming); }, [streaming]);
  useEffect(() => { safeSetItem('amb_selectedPatient', selectedPatient); }, [selectedPatient]);
  useEffect(() => { safeSetItem('amb_incomingRequest', JSON.stringify(incomingRequest)); }, [incomingRequest]);
  useEffect(() => { safeSetItem('amb_assignedUser', JSON.stringify(assignedUser)); }, [assignedUser]);
  useEffect(() => { safeSetItem('amb_assignedHospital', JSON.stringify(assignedHospital)); }, [assignedHospital]);
  useEffect(() => { safeSetItem('amb_requestAccepted', requestAccepted); }, [requestAccepted]);
  useEffect(() => { safeSetItem('amb_arrivedAtUser', arrivedAtUser); }, [arrivedAtUser]);


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
  useEffect(() => {
    try {
      const saved = localStorage.getItem('offline_backlog');
      if (saved) {
        offlineBacklog.current = JSON.parse(saved);
        console.log(`[OFFLINE RECOVERY] Loaded ${offlineBacklog.current.length} records from LocalStorage.`);
      }
    } catch (e) {
      console.error('[OFFLINE RECOVERY] Failed to load backlog:', e);
    }
  }, []);
  useEffect(() => { arrivedRef.current = arrivedAtUser; }, [arrivedAtUser]);
  useEffect(() => { patientRef.current = selectedPatient; }, [selectedPatient]);
  useEffect(() => { hospitalRef.current = assignedHospital; }, [assignedHospital]);


  const handleLogin = async () => {
    try {
      const cleanId = loginId.trim().toLowerCase();
      // ENTERPRISE AUTH: Request cryptographic JWT from backend
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
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
      console.log(`[PERSISTENCE] Rejoined mission automatically: ${data.id}`, data);
      performMissionRestoration(data);
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
        if ('speechSynthesis' in window) {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance('Attention. New emergency dispatch request assigned to your unit.'));
        }
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
        if (data.status === 'APPROVED') {
          setLockStatus('APPROVED');
          showAlert('✅ Hospital approved the emergency resource lock!');
        } else if (data.status === 'DENIED') {
          setLockStatus('DENIED');
          showAlert('❌ Hospital denied the resource lock request.');
        } else {
          setLockStatus('');
        }
        playAlertBeep();
      }
    };

    socket.on('chat-history', onHistory);
    socket.on('chat-message', onMsg);
    socket.on('vitals-ack', (data) => {
      if (data && data.msgId) {
        offlineQueue.dequeue(data.msgId).catch(err => console.error('[IndexedDB] Dequeue failed:', err));
      }
    });
    socket.on('resources-update', onResources);
    socket.on('ai-prediction-alert', onAiAlert);
    socket.on('patient-data', onPatientData);
    socket.on('incoming-ambulance-request', onIncomingRequest);
    socket.on('ambulance-request-response', onAmbulanceResponse);
    socket.on('hospital-request-response', onHospitalResponse);
    socket.on('hospitals-update', onHospitalsUpdate);
    socket.on('hospital-facility-recommendations', (data) => {
      if (data && data.recommendations) {
        setHospitalRecommendations(data.recommendations);
      }
    });
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

    socket.on('error-alert', (data) => {
      if (data && data.message && data.message.startsWith('PENDING_APPROVAL')) {
        setIsPendingApproval(true);
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
        localStorage.removeItem('offline_backlog');
      }
    }

    const syncInterval = setInterval(async () => {
      if (socket && connected && !isOfflineRef.current) {
        try {
          const items = await offlineQueue.getAll();
          for (const item of items) {
            socket.emit('vitals-update', item);
          }
        } catch (err) {
          console.warn('[IndexedDB Sync Error]', err);
        }
      }
    }, 4000);

    return () => {
      clearInterval(syncInterval);
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
      socket.off('hospital-facility-recommendations');
      socket.off('patient-data', onPatientData);
      socket.off('hospital-resources-locked', onResourcesLocked);
      socket.off('traffic-incidents-update');
      socket.off('clinical-checklist-update');
      socket.off('vitals-update', onVitalsUpdate);
      socket.off('error-alert');
      socket.off('vitals-ack');
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

  const performMissionRestoration = (data) => {
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

      if (data.status === 'pending_ambulance') {
        // If it is pending, set it as the active incoming request so the driver can Accept or Decline.
        setIncomingRequest(data);
        setAssignedUser(null);
        setRequestAccepted(false);
        setArrivedAtUser(false);
        setPatientLoaded(false);
        setStreaming(false);
        setRoutePath(null);
      } else {
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
        
        if (data.resourceLocks) {
          setResourceLocks(data.resourceLocks);
        } else {
          setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
        }
      }
      
      setPendingResumeMission(null);
      console.log('[RECOVERY] Restoration complete.');
    } catch (err) {
      console.error('[RECOVERY] Restoration failed:', err);
      showAlert('Failed to restore mission state. Please check console.');
    }
  };

  const handleResumeMission = () => {
    if (!pendingResumeMission) {
      console.warn('[RECOVERY] Attempted resume with no pending mission.');
      return;
    }
    performMissionRestoration(pendingResumeMission);
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
        const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const vitalsPayload = { ...vitalsWithSource, reqId: assignedUserRef.current?.id, msgId, timestamp: Date.now() };

        // Save to persistent local queue
        offlineQueue.enqueue(vitalsPayload).catch(err => console.error(err));

        if (socket && connected) {
          if (isOfflineRef.current) {
            offlineBacklog.current.push({ ...vitalsWithSource, timestamp: Date.now() });
            if (offlineBacklog.current.length > 100) offlineBacklog.current.shift();
            safeSetItem('offline_backlog', JSON.stringify(offlineBacklog.current));
          } else {
            socket.emit('vitals-update', vitalsPayload);
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
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
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
               socket.emit('vitals-update', { reqId: assignedUser?.id, ...newVitals });
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

  const handleCompleteMission = () => {
    if (!assignedUser) return;
    if (window.confirm("Are you sure you want to end this mission?")) {
      if (socket) {
        socket.emit('complete-mission', { reqId: assignedUser.id });
        const storedToken = sessionStorage.getItem('rescuelink_token');
        socket.emit('register-ambulance', { 
          location, 
          available: true,
          unitId: authUnit?.unitId,
          token: storedToken
        });
      }
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
      setClinicalChecklist({});
      setIncidentNote('');
      
      localStorage.removeItem('activeMissionId');
      localStorage.removeItem('amb_requestAccepted');
      localStorage.removeItem('amb_assignedUser');
      localStorage.removeItem('amb_assignedHospital');
      localStorage.removeItem('amb_selectedPatient');
      localStorage.removeItem('amb_arrivedAtUser');
      localStorage.removeItem('amb_streaming');
      localStorage.removeItem('amb_incomingRequest');
    }
  };



  const distanceToUser = assignedUser ? calcDist(location, assignedUser.userLocation) : 0;
  const distanceKm = distanceToUser;
  const etaMin = Math.ceil(distanceKm / 0.6);

  const isCritical = arrivedAtUser && (vitals.heartRate > 110 || (vitals.spo2 > 0 && vitals.spo2 < 92) || vitals.systolic > 150 || (vitals.heartRate > 0 && vitals.heartRate < 50));

  const headerActions = (isMobileView = false) => (
    <>
      <button
        onClick={() => {
          const newState = !simulateTraffic;
          setSimulateTraffic(newState);
          trafficRef.current = newState;
          if (socket && location) {
            socket.emit('location-update', { ...location, trafficDelay: newState });
          }
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className={simulateTraffic ? "rl-btn-primary" : "rl-btn-secondary"}
        style={{
          padding: '6px 12px',
          fontSize: 9,
          display: 'flex', alignItems: 'center', gap: 4
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
          doc.save(`MISSION_REPORT_${assignedUser?.id || 'FIELD_MISSION'}.pdf`);
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className="rl-btn-secondary"
        style={{
          padding: '6px 12px',
          fontSize: 9,
          display: 'flex', alignItems: 'center', gap: 4
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
              const storedToken = sessionStorage.getItem('rescuelink_token');
              socket.emit('register-ambulance', { 
                location, 
                available: true,
                unitId: authUnit?.unitId,
                token: storedToken
              });
            }
            localStorage.removeItem('activeMissionId');
            localStorage.removeItem('amb_requestAccepted');
            localStorage.removeItem('amb_assignedUser');
            localStorage.removeItem('amb_assignedHospital');
            localStorage.removeItem('amb_selectedPatient');
            localStorage.removeItem('amb_arrivedAtUser');
            localStorage.removeItem('amb_streaming');
            localStorage.removeItem('amb_incomingRequest');
          }
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className="rl-btn-primary"
        style={{
          padding: '6px 12px',
          fontSize: 9,
          background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)',
          boxShadow: 'none',
          display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        <span>🛑</span> CLEAR
      </button>

      <button
        onClick={() => {
          if (window.confirm("Switch unit identity? All active unit session data will be reset.")) {
            localStorage.removeItem('ambulance_auth');
            sessionStorage.clear();
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
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className="rl-btn-secondary"
        style={{
          padding: '6px 12px',
          fontSize: 9, cursor: 'pointer',
          fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        <span>🚪</span> SWITCH
      </button>

      <button
        onClick={() => {
          setShowSettingsModal(true);
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className="rl-btn-primary"
        style={{
          padding: '6px 12px',
          fontSize: 9, cursor: 'pointer',
          fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        <span>⚙️</span> SETTINGS
      </button>

      <button
        onClick={() => {
          toggleOffline();
          if (isMobileView) setMobileMenuOpen(false);
        }}
        className="rl-btn-secondary"
        style={{
          padding: '6px 12px',
          fontSize: 9, cursor: 'pointer',
          fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4
        }}
      >
        <span>📟</span> {isOffline ? 'ONLINE' : 'DEAD ZONE'}
      </button>

      <button
        onClick={() => {
          setStreaming(!streaming);
          if (isMobileView) setMobileMenuOpen(false);
        }}
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
    </>
  );

  if (isPendingApproval) {
    return (
      <div style={{
        height: '100vh', background: 'radial-gradient(ellipse at 50% 30%, #0c0a1e 0%, #02010c 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani', sans-serif", color: '#e0eaff'
      }}>
        <div style={{
          width: '90%', maxWidth: 450, padding: '40px 32px',
          background: 'rgba(12,10,30,0.85)', border: '1px solid rgba(255,60,60,0.3)',
          borderRadius: 12, backdropFilter: 'blur(10px)', textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(255,60,60,0.1)'
        }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🚫</div>
          <h2 style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: 22,
            color: '#ff4444', textAlign: 'center', marginBottom: 12,
            textShadow: '0 0 10px rgba(255,68,68,0.4)', letterSpacing: '0.1em'
          }}>REGISTRATION PENDING</h2>
          <p style={{
            fontSize: 12, color: 'rgba(160,200,255,0.4)', marginBottom: 24,
            fontFamily: "'Share Tech Mono'", letterSpacing: '0.15em'
          }}>SYSTEM SECURITY PROTOCOL</p>
          <div style={{
            padding: 16, background: 'rgba(255,68,68,0.05)', border: '1px solid rgba(255,68,68,0.2)',
            borderRadius: 8, color: '#ffb8b8', fontSize: 13, textAlign: 'left', lineHeight: 1.6, marginBottom: 30
          }}>
            Your ambulance registration has been recorded. For public safety and authentication, all active emergency units must be verified and approved by the <strong>City Administrator</strong> before operational clearance is granted.
          </div>
          <button
            onClick={() => {
              sessionStorage.clear();
              localStorage.clear();
              window.location.reload();
            }}
            style={{
              width: '100%', padding: '14px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
              color: 'rgba(160,200,255,0.7)', fontFamily: "'Orbitron'", fontSize: 12,
              fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            RETURN TO GATEWAY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, #0f1e0a 0%, #050d1a 60%)',
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      display: 'flex',
      flexDirection: 'row',
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

        /* Sidebar styles */
        .sidebar {
          width: 260px;
          background: rgba(3, 10, 25, 0.96);
          border-right: 1px solid rgba(0, 255, 136, 0.2);
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
          overflow-y: auto;
          z-index: 999;
          flex-shrink: 0;
        }
        .sidebar.closed {
          width: 0px;
          overflow: hidden;
          border-right: none;
        }
        
        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          color: rgba(160, 200, 255, 0.7);
          text-decoration: none;
          font-family: 'Orbitron', sans-serif;
          font-size: 12px;
          border-left: 3px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.05em;
        }
        .sidebar-item:hover {
          background: rgba(0, 255, 136, 0.05);
          color: #00ff88;
        }
        .sidebar-item.active {
          background: rgba(0, 255, 136, 0.1);
          color: #00ff88;
          border-left-color: #00ff88;
        }

        /* Responsive styles */
        @media (max-width: 1024px) {
          .ambulance-stream-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 768px) {
          .sidebar {
            position: absolute;
            left: 0;
            top: 60px;
            height: calc(100vh - 60px);
            transform: translateX(-100%);
            width: 260px;
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .sidebar.closed {
            transform: translateX(-100%);
            width: 260px;
          }
          
          /* Stacking grids for mobile compatibility */
          .ambulance-stream-grid {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
          }
        }
      `}</style>

      {/* Collapsible Left Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div style={{ padding: '20px 10px 10px 10px', borderBottom: '1px solid rgba(0,255,136,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>RESCUELINK</div>
          <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>PARAMEDIC CONSOLE</div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '15px 0' }}>
          {[
            { id: 'mission', label: 'LIVE DISPATCH', icon: '🗺️' },
            { id: 'vitals', label: 'PATIENT VITALS', icon: '📈' },
            { id: 'comms', label: 'COMMS & CHAT', icon: '💬' },
            { id: 'settings', label: 'CONSOLE SETTINGS', icon: '⚙️' },
          ].map(tab => (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (window.innerWidth <= 768) setSidebarOpen(false); // Auto-close on mobile
              }}
              className={`sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </div>
          ))}
        </div>

        {/* Current Active Mission status */}
        {assignedUser && (
          <div style={{ borderTop: '1px solid rgba(0,255,136,0.1)', padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", letterSpacing: 1 }}>CURRENT DISPATCH</div>
            <div style={{ padding: '8px 10px', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.2)', borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontFamily: "'Orbitron'", color: '#ff6b35', fontWeight: 'bold' }}>
                {assignedUser.id && assignedUser.id.length > 15 ? `RL-${assignedUser.id.replace(/-/g, '').slice(-4).toUpperCase()}` : assignedUser.id}
              </div>
              <div style={{ fontSize: 10, color: '#fff', marginTop: 4 }}>
                {assignedUser.patientDetails?.name || 'Emergency Incident'}
              </div>
            </div>
            <button 
              onClick={handleCompleteMission} 
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontFamily: "'Orbitron'",
                fontSize: 10,
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: 6
              }}
            >
              END MISSION 🏁
            </button>
          </div>
        )}

        {/* Node Telemetry panel */}
        <div style={{ borderTop: '1px solid rgba(0,255,136,0.1)', padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", letterSpacing: 1 }}>UNIT TELEMETRY</div>
          
          {/* Live Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#00ff88' : '#ff4444' }} />
            <span style={{ fontSize: 9, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'", fontWeight: 700 }}>{connected ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>

          {/* Active Duty Switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
            <span style={{ fontSize: 9, fontFamily: "'Orbitron'", color: isActiveDuty ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>{isActiveDuty ? 'ACTIVE' : 'BREAK'}</span>
            <button
              onClick={() => {
                const nextStatus = !isActiveDuty;
                setIsActiveDuty(nextStatus);
                if (socket) socket.emit('toggle-active-duty', { active: nextStatus });
              }}
              style={{
                background: isActiveDuty ? '#00ff88' : '#ff4444',
                border: 'none', width: 28, height: 14, borderRadius: 10,
                position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px'
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#051025', position: 'absolute', left: isActiveDuty ? 16 : 2, transition: 'left 0.2s' }} />
            </button>
          </div>

          {/* Stream Status Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
            <span style={{ fontSize: 9, fontFamily: "'Orbitron'", color: streaming ? '#00ff88' : '#aaa', fontWeight: 'bold' }}>{streaming ? 'STREAMING' : 'IDLE'}</span>
            <button
              onClick={() => setStreaming(!streaming)}
              style={{
                background: streaming ? '#00ff88' : '#555',
                border: 'none', width: 28, height: 14, borderRadius: 10,
                position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 2px'
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#051025', position: 'absolute', left: streaming ? 16 : 2, transition: 'left 0.2s' }} />
            </button>
          </div>
        </div>

        {/* Manual Recovery at the bottom */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0,255,136,0.1)', padding: '15px 10px' }}>
          <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 6, textAlign: 'center' }}>MANUAL DISPATCH</div>
          <div style={{ display: 'flex', gap: 4, height: 28 }}>
            <input
              value={manualRecoveryId}
              onChange={e => setManualRecoveryId(e.target.value)}
              onKeyDown={handleManualRecoveryKeyDown}
              placeholder="REQ ID"
              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 4, padding: '0 8px', color: '#fff', fontSize: 10, outline: 'none' }}
            />
            <button onClick={handleManualRecover} style={{ background: 'rgba(0,255,136,0.15)', border: '1px solid #00ff88', color: '#00ff88', borderRadius: 4, padding: '0 8px', cursor: 'pointer', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>GO</button>
          </div>
        </div>
      </div>

      {/* Main Content Area Container */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Slim, Clean Header */}
        <div style={{
          background: 'rgba(5,20,10,0.98)',
          borderBottom: '1px solid rgba(0,255,136,0.2)',
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', gap: 12, minHeight: 50, height: 'auto', flexWrap: 'wrap',
          backdropFilter: 'blur(15px)',
          position: 'relative', zIndex: 100
        }}>
          {/* Hamburger toggle button */}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'transparent', border: 'none', color: '#00ff88', 
              fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '4px 8px', borderRadius: 4, transition: 'all 0.2s', marginRight: 10
            }}
          >
            ☰
          </button>
          <div style={{ fontSize: 20 }}>🚑</div>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, color: '#88ff88', letterSpacing: '0.1em' }}>
              {(authUnit?.vehicleNo || 'AMBULANCE')} — PARAMEDIC CONSOLE
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 15, alignItems: 'center' }}>
            {/* Connection status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: connected ? '#00ff88' : '#ff4444',
                boxShadow: connected ? '0 0 10px #00ff88' : '0 0 6px #ff4444'
              }} />
              <span style={{ fontSize: 11, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'", fontWeight: 700 }}>
                {connected ? 'CONNECTED' : 'OFFLINE'}
              </span>
            </div>

            {assignedUser && (
              <button 
                onClick={handleCompleteMission} 
                className="rl-btn-primary" 
                style={{ 
                  height: 32, 
                  padding: '0 12px', 
                  fontSize: 10, 
                  background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)', 
                  border: 'none', 
                  color: '#fff' 
                }}
              >
                END MISSION 🏁
              </button>
            )}

            <button onClick={onSwitchRole} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10, borderColor: '#00ff88', color: '#00ff88' }}>
              ROLE 🔄
            </button>
            <button onClick={onShowSecurity} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10, borderColor: '#00ff88', color: '#00ff88' }}>
              SECURITY 🛡️
            </button>
            <button onClick={onLogout} className="rl-btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 10, background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)', border: 'none', color: '#fff' }}>
              LOGOUT ⏻
            </button>
          </div>
        </div>

        {/* Global God Mode Panel overlay */}
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
          </div>
        )}

        {/* Dispatch Alerts section */}
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

        {/* ── CONDITIONAL SUB-PAGE VIEWPORTS ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* TAB 1: LIVE MISSION VIEW */}
          {activeTab === 'mission' && (
            <>
              {/* IDLE STATE — No patient assigned yet */}
              {!assignedUser && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', gap: 20, padding: 24 }}>
                  {!isActiveDuty ? (
                    <>
                      <div style={{ fontSize: 60, opacity: 0.5, animation: 'pulse-opacity 2s infinite' }}>🛌</div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#ff4444', letterSpacing: '0.15em' }}>ON BREAK / INACTIVE</div>
                      <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.4)', textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
                        You have toggled your status to <strong>INACTIVE</strong>. You will not receive any incoming emergency dispatch requests. Toggle <strong>ACTIVE</strong> in the sidebar to resume standby.
                      </div>
                    </>
                  ) : (
                    <>
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
                      <div className="rl-card" style={{ marginTop: 30, padding: '20px', width: '100%', maxWidth: 320, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 8, letterSpacing: '0.1em' }}>MANUAL MISSION RECOVERY</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <input 
                            value={manualRecoveryId} 
                            onChange={e => setManualRecoveryId(e.target.value)}
                            onKeyDown={handleManualRecoveryKeyDown}
                            placeholder="REQ ID" 
                            className="rl-input"
                            style={{ flex: 1, fontSize: 12, outline: 'none', fontFamily: "'Share Tech Mono'", boxSizing: 'border-box', height: '36px' }} 
                          />
                          <button onClick={handleManualRecover} className="rl-btn-primary" style={{ height: '36px', padding: '0 15px', fontSize: 10, fontWeight: 'bold' }}>GO</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ACTIVE STATE but NOT ARRIVED YET */}
              {assignedUser && !arrivedAtUser && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', gap: 20, padding: 24 }}>
                  <div style={{ fontSize: 60 }}>🚑</div>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#ff6b35', letterSpacing: '0.15em' }}>EN ROUTE TO PATIENT</div>
                  <div style={{ fontSize: 14, color: 'rgba(160,200,255,0.6)', textAlign: 'center', maxWidth: 400 }}>
                    AMBULANCE IS DISPATCHED AND HEADED TO THE INCIDENT SITE. STAND BY FOR PATIENT ENROLLMENT.
                  </div>
                  <button
                    onClick={() => {
                      setArrivedAtUser(true);
                      if (socket && assignedUser) {
                        socket.emit('paramedic-arrived', { reqId: assignedUser.id });
                      }
                    }}
                    style={{
                      padding: '12px 24px', background: '#ff6b35', border: 'none',
                      borderRadius: 6, color: '#000', fontWeight: 'bold', cursor: 'pointer',
                      fontFamily: "'Orbitron'", fontSize: 12, letterSpacing: 1, marginTop: 10
                    }}
                  >
                    🚨 SIGNAL ARRIVAL AT SITE
                  </button>
                </div>
              )}

              {/* ACTIVE STATE & ARRIVED AT USER */}
              {assignedUser && arrivedAtUser && (
                <div className="ambulance-stream-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, flex: 1, overflow: 'hidden' }}>
                  
                  {/* Left panel: Map & Navigation */}
                  <div style={{ padding: 24, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
                    
                    {/* Patient identity overview */}
                    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
                          PATIENT IDENTITY
                        </div>
                        {selectedPatient ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'rgba(160,200,255,0.5)', fontSize: 11 }}>SYNCED: </span>
                            <span style={{ color: '#00ff88', fontSize: 12, fontWeight: 'bold' }}>{PATIENT_NAMES[selectedPatient]}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#ffb800', fontSize: 11, fontFamily: "'Orbitron'" }}>AWAITING ENROLLMENT (GO TO VITALS TAB)</span>
                        )}
                      </div>
                      
                      {assignedUser?.patientDetails && (
                        <div style={{ padding: 12, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 6 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>NAME</div>
                              <div style={{ fontSize: 12, color: '#fff', fontFamily: "'Orbitron'" }}>{assignedUser.patientDetails.name || 'N/A'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>REPORTED RISK</div>
                              <div style={{ fontSize: 12, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>{assignedUser.patientDetails.riskLevel || 'HIGH'}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* GPS Navigation & route details */}
                    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
                          GPS NAVIGATION
                        </div>
                        {simulateTraffic && <span style={{ fontSize: 10, color: '#ffb800' }}>⚠ TRAFFIC DELAY SIMULATED</span>}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                          ['LAT', location?.lat?.toFixed(4) || 'N/A', '°N'],
                          ['LNG', location?.lng?.toFixed(4) || 'N/A', '°E'],
                          ['DISTANCE', distanceKm?.toFixed(1) || '0.0', 'km left'],
                          ['ETA', `~${etaMin || '0'}`, 'minutes'],
                        ].map(([l, v, u]) => (
                          <div key={l} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>{l}</div>
                            <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 20, color: '#00c8ff', fontWeight: 700 }}>{v}</div>
                            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>{u}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                          <span>📍 INCIDENT SITE</span>
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
                    </div>

                    {/* Leaflet Live Map Widget */}
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,200,255,0.2)', height: 350, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1000, display: 'flex', gap: 6 }}>
                        <input 
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                          placeholder="Search incident city/area..."
                          style={{
                            flex: 1, padding: '6px 10px', background: 'rgba(5,20,40,0.9)', 
                            border: '1px solid rgba(0,200,255,0.4)', borderRadius: 4, 
                            color: '#fff', fontSize: 11, outline: 'none'
                          }}
                        />
                        <button onClick={handleManualSearch} style={{ padding: '6px 10px', background: 'rgba(0,200,255,0.2)', border: '1px solid #00c8ff', borderRadius: 4, color: '#00c8ff', cursor: 'pointer', fontSize: 10 }}>📍</button>
                      </div>
                      
                      <MapContainer
                        center={location ? [location.lat, location.lng] : [12.9716, 77.5946]}
                        zoom={location ? 12 : 2}
                        style={{ height: '100%', width: '100%', background: '#050d1a' }}
                        zoomControl={false}
                      >
                        <OfflineTileLayer
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

                        {/* Traffic circles */}
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
                                  <strong style={{ color: '#ff3333' }}>⚠️ Traffic Blockage</strong>
                                  <p style={{ margin: '5px 0 0 0', fontSize: '11px' }}>{incident.reason}</p>
                                </div>
                              </Popup>
                            </Circle>
                          </React.Fragment>
                        ))}
                      </MapContainer>
                    </div>
                  </div>

                  {/* Right panel: AI Smart Suggestions & Corridor controllers */}
                  <div style={{ background: 'rgba(3,10,28,0.95)', borderLeft: '1px solid rgba(0,200,255,0.1)', padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
                    
                    {/* Green Corridor Trigger */}
                    <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid #00ff88', borderRadius: 8, padding: 15 }}>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', fontWeight: 'bold', marginBottom: 6 }}>
                        🚦 GREEN CORRIDOR CONTROL
                      </div>
                      <p style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', lineHeight: 1.4, marginBottom: 12 }}>
                        Lock municipal traffic signals ahead of route to clear vehicle blockages automatically.
                      </p>
                      <button
                        onClick={() => {
                          const newStatus = !greenCorridorActive;
                          setGreenCorridorActive(newStatus);
                          if (socket && assignedUser) {
                            socket.emit('green-corridor-status', { reqId: assignedUser.id, active: newStatus });
                          }
                        }}
                        style={{
                          width: '100%', padding: '10px', background: greenCorridorActive ? '#00ff88' : 'rgba(0,255,136,0.1)',
                          border: '1px solid #00ff88', borderRadius: 6, color: greenCorridorActive ? '#000' : '#00ff88',
                          fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                        }}
                      >
                        {greenCorridorActive ? '🛑 STOP prioritisation' : '⚡ REQUEST PRIORITISATION'}
                      </button>
                    </div>

                    {/* Smart Hospital Suggestions */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
                          📡 SMART SUGGESTIONS
                        </div>
                        <div style={{ fontSize: 8, background: '#00c8ff', color: '#000', padding: '1px 4px', borderRadius: 2, fontWeight: 'bold' }}>AI</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
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
                          .slice(0, 3)
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
                                    fontSize: 8, padding: '1px 5px', borderRadius: 3,
                                    background: h.hriScore > 75 ? 'rgba(0,255,136,0.15)' : h.hriScore > 40 ? 'rgba(255,184,0,0.15)' : 'rgba(255,68,68,0.15)',
                                    color: h.hriScore > 75 ? '#00ff88' : h.hriScore > 40 ? '#ffb800' : '#ff4444',
                                    border: `1px solid ${h.hriScore > 75 ? '#00ff8844' : h.hriScore > 40 ? '#ffb80044' : '#ff444444'}`,
                                    fontFamily: "'Orbitron'", fontWeight: 'bold'
                                  }}>
                                    {h.hriScore}% MATCH
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

              {/* TAB 2: PATIENT VITALS (Telemetry cards, Waveforms, Ble, and manual entry forms) */}
              {activeTab === 'vitals' && (
                <div style={{ padding: 24, overflowY: 'auto', background: 'rgba(0,0,0,0.1)', flex: 1 }}>
                  
                  {/* Patient Enrollment / Scan Card */}
                  <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>
                        PATIENT IDENTITY VERIFICATION
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
                            border: '1px solid #00ff88', borderRadius: 4, padding: '6px 16px', color: '#00ff88',
                            fontFamily: "'Share Tech Mono'", fontSize: 11, cursor: (isScanning || !requestAccepted) ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8
                          }}
                        >
                          {isScanning ? 'PROCESSING AI CLOUD-ID...' : '📷 SCAN ID / AADHAR'}
                        </button>
                      </div>
                    </div>

                    {selectedPatient && (
                      <div style={{ padding: '12px', background: 'rgba(0,200,255,0.06)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ color: 'rgba(160,200,255,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>ACTIVE PATIENT: </span>
                          <span style={{ color: '#00c8ff', fontSize: 13, fontWeight: 600 }}>{PATIENT_NAMES[selectedPatient]}</span>
                        </div>
                        
                        <div style={{
                          padding: '6px 12px', borderRadius: 4,
                          background: `${calculateTriage(vitals).color}22`,
                          border: `1px solid ${calculateTriage(vitals).color}66`,
                          color: calculateTriage(vitals).color,
                          fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700
                        }}>
                          {calculateTriage(vitals).label}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vitals Telemetry */}
                  {selectedPatient ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#88ff88', letterSpacing: '0.1em' }}>
                          PATIENT VITALS {streaming && <span style={{ color: '#ff4444', animation: 'blink 1s step-end infinite' }}>● REC</span>}
                        </div>

                        {/* Telemetry Input sources selection */}
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
                              } else if (nextSource === 'BLUETOOTH') {
                                connectBluetoothHRM();
                              }
                            }}
                            style={{
                              background: 'rgba(0,0,0,0.4)',
                              color: vitalsSource === 'LIVE' ? '#00ff88' : vitalsSource === 'MANUAL' ? '#ffb800' : '#00c8ff',
                              border: `1px solid ${vitalsSource === 'LIVE' ? '#00ff88' : vitalsSource === 'MANUAL' ? '#ffb800' : '#00c8ff'}`,
                              borderRadius: 4, padding: '4px 8px', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer', outline: 'none'
                            }}
                          >
                            <option value="SIMULATED">SIMULATED</option>
                            <option value="MANUAL">MANUAL (FORM)</option>
                            <option value="LIVE">LIVE (IOT / GATEWAY)</option>
                            <option value="BLUETOOTH">📡 BLUETOOTH HRM</option>
                          </select>
                        </div>
                      </div>

                      {/* BLE drawer */}
                      {vitalsSource === 'BLUETOOTH' && (
                        <div style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 10, padding: 15, marginBottom: 15 }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 10, letterSpacing: '0.1em', fontWeight: 'bold' }}>
                            📡 WEB BLUETOOTH INTEGRATION
                          </div>
                          {bleDevice ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ fontSize: 12, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>
                                🟢 CONNECTED: {bleDevice.name || 'Bluetooth HRM'}
                              </div>
                              <button onClick={disconnectBluetoothHRM} style={{ padding: '8px 12px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer' }}>
                                DISCONNECT DEVICE
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.4 }}>
                                Connect a standard BLE Heart Rate Monitor device to stream live ECG pulse directly to this terminal.
                              </div>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={connectBluetoothHRM} disabled={bleConnecting} style={{ flex: 1, padding: '10px 16px', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', borderRadius: 6, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}>
                                  {bleConnecting ? 'SCANNING...' : '🔌 CONNECT REAL BLE'}
                                </button>
                                <button 
                                  onClick={() => {
                                    setBleDevice({ name: 'Simulated HRM Watch' });
                                    setVitalsSource('BLUETOOTH');
                                    const interval = setInterval(() => {
                                      setVitals(prev => {
                                        const updated = { ...prev, heartRate: Math.round(70 + Math.random() * 15) };
                                        if (socket && connected && assignedUserRef.current) {
                                          socket.emit('vitals-update', { ...updated, reqId: assignedUserRef.current.id });
                                        }
                                        return updated;
                                      });
                                    }, 1000);
                                    bleIntervalRef.current = interval;
                                  }}
                                  style={{ flex: 1, padding: '10px 16px', background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                  ⚙️ MOCK BLE DEVICE
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Manual vital entry form */}
                      {vitalsSource === 'MANUAL' && patientLoaded && (
                        <div style={{ background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 10, padding: 15, marginBottom: 15 }}>
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
                                <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", display: 'block', marginBottom: 3 }}>{field.label}</label>
                                <input
                                  type="number" min={field.min} max={field.max} step={field.step || 1}
                                  value={vitals[field.key] || ''}
                                  onChange={(e) => handleManualVitalChange(field.key, e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 4, color: '#fff', fontSize: 12, fontFamily: "'Share Tech Mono'", outline: 'none', boxSizing: 'border-box' }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vital Cards Grid */}
                      {!patientLoaded ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', background: 'rgba(0,255,136,0.05)', borderRadius: 10, border: '1px dashed rgba(0,255,136,0.3)', marginBottom: 20 }}>
                          <div style={{ fontSize: 30, marginBottom: 10 }}>📥</div>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00ff88', fontWeight: 700, letterSpacing: 1 }}>PATIENT CONTACT ESTABLISHED</div>
                          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: 'rgba(0,255,136,0.6)', margin: '8px 0 20px' }}>CONNECT OPERATION SENSORS TO STANDBY TRANSMIT</div>
                          <button 
                            onClick={() => {
                              setPatientLoaded(true);
                              setStreaming(true);
                              if (socket && assignedUser) {
                                socket.emit('patient-onboard', { reqId: assignedUser.id });
                              }
                            }}
                            style={{ padding: '12px 24px', background: 'rgba(0,255,136,0.2)', border: '1px solid #00ff88', borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            🚀 PATIENT ONBOARD & MONITOR
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <VitalCard label="HEART RATE" value={vitals.heartRate} unit="bpm" color="#ff6b6b" icon="❤️" critical={vitals.heartRate > 110 || vitals.heartRate < 50} />
                            <VitalCard label="SpO2" value={vitals.spo2} unit="%" color="#00c8ff" icon="💧" critical={vitals.spo2 < 92} />
                            <VitalCard label="BLOOD PRESSURE" value={`${vitals.systolic}/${vitals.diastolic}`} unit="mmHg" color="#ffb800" icon="🩸" critical={vitals.systolic > 150} />
                            <VitalCard label="TEMPERATURE" value={vitals.temperature} unit="°C" color="#ff88aa" icon="🌡️" critical={vitals.temperature > 38.5} />
                            <VitalCard label="RESP RATE" value={vitals.respRate} unit="br/min" color="#88ff88" icon="🫁" critical={vitals.respRate > 25 || vitals.respRate < 12} />
                            <VitalCard label="BLOOD GLUCOSE" value={vitals.bloodGlucose || vitals.glucose} unit="mg/dL" color="#aa88ff" icon="🔬" critical={(vitals.bloodGlucose || vitals.glucose) > 200 || (vitals.bloodGlucose || vitals.glucose) < 70} />
                          </div>

                          {/* waveforms */}
                          <div style={{ marginTop: 16 }}>
                            <PhysiologicalWaveforms vitals={vitals} news2Score={
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
                            } />
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: '60px 20px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: '1px dashed rgba(160,200,255,0.2)' }}>
                      <div style={{ fontSize: 35, marginBottom: 15 }}>📋</div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: 'rgba(160,200,255,0.4)', fontWeight: 'bold' }}>
                        AWAITING PATIENT ENROLLMENT
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.3)', marginTop: 8 }}>
                        Please scan an ID card or choose a patient name from the selector above to enroll diagnostic workflows.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: COMMS & CHAT (Side-by-side telemedicine call and chat pane) */}
              {activeTab === 'comms' && (
                <div style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>
                  
                  {/* Telemedicine call panel */}
                  <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 }}>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 15 }}>
                        CLINICAL TELEMEDICINE COMM LINK
                      </div>
                      <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.5, marginBottom: 20 }}>
                        Establish a high-bandwidth WebRTC video connection to the receiving emergency wing or patient duty doctors.
                      </p>
                      
                      {assignedUser && (
                        <VideoCall 
                          socket={socket} 
                          role="paramedic" 
                          missionId={assignedUser?.id} 
                        />
                      )}
                    </div>
                  </div>

                  {/* Chat Panel */}
                  <div style={{ width: 380, background: 'rgba(3,10,28,0.95)', borderLeft: '1px solid rgba(0,200,255,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '14px', borderBottom: '1px solid rgba(0,200,255,0.1)', fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', fontWeight: 'bold' }}>
                      💬 WAR ROOM CHAT LINK
                    </div>
                    <div style={{ flex: 1, padding: '12px 16px 40px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <ChatPanel socket={socket} messages={messages} />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: CONSOLE SETTINGS (God Mode, Traffic, Breaks, identity switch) */}
              {activeTab === 'settings' && (
                <div style={{ padding: 24, overflowY: 'auto', background: 'rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* PROFILE SETTINGS SECTION */}
                  {(() => {
                    const AmbProfileSettings = () => {
                      const [unitForm, setUnitForm] = React.useState({ driverName: authUnit?.driverName || '', type: authUnit?.type || 'BLS', contactInfo: authUnit?.contactInfo || '' });
                      const [unitStatus, setUnitStatus] = React.useState(null);
                      const [unitLoading, setUnitLoading] = React.useState(false);
                      const [pwForm, setPwForm] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
                      const [pwStatus, setPwStatus] = React.useState(null);
                      const [pwLoading, setPwLoading] = React.useState(false);
                      const [mfaQR, setMfaQR] = React.useState(null);
                      const [mfaStatus, setMfaStatus] = React.useState(null);
                      const [mfaLoading, setMfaLoading] = React.useState(false);

                      const token = sessionStorage.getItem('rescuelink_token') || '';
                      const ambId = authUnit?.id || authUnit?.unitId;
                      const hdrs = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

                      const S = {
                        card: { background: 'rgba(5,15,40,0.85)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 },
                        label: { display: 'block', fontSize: 10, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.55)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' },
                        input: { width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '10px 12px', color: '#fff', outline: 'none', fontSize: 12, boxSizing: 'border-box', fontFamily: "'Share Tech Mono'" },
                        btn: (color) => ({ padding: '9px 20px', background: `rgba(${color},0.14)`, border: `1px solid rgba(${color},0.4)`, borderRadius: 8, color: `rgb(${color})`, fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 11, cursor: 'pointer' }),
                        sectionTitle: { fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', fontWeight: 700, marginBottom: 14 },
                        statusMsg: (ok) => ({ marginTop: 8, padding: '7px 12px', borderRadius: 6, background: ok ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', border: `1px solid ${ok ? '#00ff88' : '#ff4444'}`, color: ok ? '#00ff88' : '#ff4444', fontSize: 11, fontFamily: "'Share Tech Mono'" })
                      };

                      const handleSaveUnit = async () => {
                        if (!ambId) { setUnitStatus({ ok: false, msg: 'Unit ID not found in session' }); return; }
                        setUnitLoading(true);
                        try {
                          const res = await fetch(`/api/ambulances/${ambId}/settings`, { method: 'PUT', headers: hdrs, body: JSON.stringify(unitForm) });
                          const d = await res.json();
                          setUnitStatus({ ok: res.ok, msg: d.message || d.error || (res.ok ? 'Unit profile updated!' : 'Update failed') });
                        } catch (err) { setUnitStatus({ ok: false, msg: 'Connection error' }); }
                        setUnitLoading(false);
                        setTimeout(() => setUnitStatus(null), 4000);
                      };

                      const handleChangePw = async () => {
                        if (pwForm.newPassword !== pwForm.confirmPassword) { setPwStatus({ ok: false, msg: 'Passwords do not match' }); return; }
                        if (pwForm.newPassword.length < 6) { setPwStatus({ ok: false, msg: 'Min. 6 characters required' }); return; }
                        setPwLoading(true);
                        try {
                          const res = await fetch(`/api/ambulances/${ambId}/change-password`, { method: 'POST', headers: hdrs, body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) });
                          const d = await res.json();
                          setPwStatus({ ok: res.ok, msg: d.message || d.error });
                          if (res.ok) setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        } catch (err) { setPwStatus({ ok: false, msg: 'Connection error' }); }
                        setPwLoading(false);
                        setTimeout(() => setPwStatus(null), 5000);
                      };

                      const handleSetup2FA = async () => {
                        setMfaLoading(true);
                        try {
                          const res = await fetch('/api/mfa/setup', { method: 'POST', headers: hdrs });
                          const d = await res.json();
                          if (res.ok) setMfaQR(d.qrCode);
                          else setMfaStatus({ ok: false, msg: d.error || 'Setup failed' });
                        } catch { setMfaStatus({ ok: false, msg: 'Connection error' }); }
                        setMfaLoading(false);
                      };

                      const handleDisable2FA = async () => {
                        if (!window.confirm('Disable 2FA? This reduces account security.')) return;
                        setMfaLoading(true);
                        try {
                          const res = await fetch('/api/mfa/disable', { method: 'POST', headers: hdrs });
                          const d = await res.json();
                          setMfaStatus({ ok: res.ok, msg: d.message || d.error });
                          setMfaQR(null);
                        } catch { setMfaStatus({ ok: false, msg: 'Connection error' }); }
                        setMfaLoading(false);
                        setTimeout(() => setMfaStatus(null), 5000);
                      };

                      return (
                        <>
                          {/* 1. Edit Unit Profile */}
                          <div style={S.card}>
                            <div style={S.sectionTitle}>🚑 UNIT PROFILE SETTINGS</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div style={{ gridColumn: '1 / -1' }}>
                                <label style={S.label}>Driver / Paramedic Name</label>
                                <input style={S.input} value={unitForm.driverName} onChange={e => setUnitForm(p => ({ ...p, driverName: e.target.value }))} />
                              </div>
                              <div>
                                <label style={S.label}>Unit Type</label>
                                <select value={unitForm.type} onChange={e => setUnitForm(p => ({ ...p, type: e.target.value }))} style={{ ...S.input, appearance: 'none' }}>
                                  <option value="BLS">BLS — Basic Life Support</option>
                                  <option value="ALS">ALS — Advanced Life Support</option>
                                </select>
                              </div>
                              <div>
                                <label style={S.label}>Contact Number</label>
                                <input style={S.input} value={unitForm.contactInfo} onChange={e => setUnitForm(p => ({ ...p, contactInfo: e.target.value }))} placeholder="+91 XXXXXXXXXX" />
                              </div>
                            </div>
                            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                              <button onClick={handleSaveUnit} disabled={unitLoading} style={{ ...S.btn('0,200,255'), opacity: unitLoading ? 0.5 : 1 }}>
                                {unitLoading ? 'SAVING…' : '💾 SAVE UNIT PROFILE'}
                              </button>
                              {unitStatus && <div style={S.statusMsg(unitStatus.ok)}>{unitStatus.ok ? '✅' : '❌'} {unitStatus.msg}</div>}
                            </div>
                          </div>

                          {/* 2. Change Password */}
                          <div style={S.card}>
                            <div style={S.sectionTitle}>🔑 CHANGE LOGIN PASSWORD</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
                              {[['currentPassword', 'Current Password'], ['newPassword', 'New Password (min. 6 chars)'], ['confirmPassword', 'Confirm New Password']].map(([key, lbl]) => (
                                <div key={key}>
                                  <label style={S.label}>{lbl}</label>
                                  <input type="password" style={S.input} value={pwForm[key]} onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))} placeholder="••••••••" />
                                </div>
                              ))}
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                                <button onClick={handleChangePw} disabled={pwLoading} style={{ ...S.btn('255,184,0'), opacity: pwLoading ? 0.5 : 1 }}>
                                  {pwLoading ? 'UPDATING…' : '🔐 UPDATE PASSWORD'}
                                </button>
                                {pwStatus && <div style={S.statusMsg(pwStatus.ok)}>{pwStatus.ok ? '✅' : '❌'} {pwStatus.msg}</div>}
                              </div>
                            </div>
                          </div>

                          {/* 3. Two-Factor Authentication */}
                          <div style={S.card}>
                            <div style={S.sectionTitle}>🛡️ TWO-FACTOR AUTHENTICATION</div>
                            <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', marginBottom: 14, fontFamily: "'Share Tech Mono'", lineHeight: 1.6 }}>
                              Secure your unit login with TOTP. Use Google Authenticator or Authy to scan the QR code.
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <button onClick={handleSetup2FA} disabled={mfaLoading} style={{ ...S.btn('0,255,136'), opacity: mfaLoading ? 0.5 : 1 }}>
                                {mfaLoading ? '⏳ LOADING…' : '🔒 ENABLE 2FA'}
                              </button>
                              <button onClick={handleDisable2FA} disabled={mfaLoading} style={{ ...S.btn('255,68,68'), opacity: mfaLoading ? 0.5 : 1 }}>
                                🔓 DISABLE 2FA
                              </button>
                            </div>
                            {mfaQR && (
                              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'", letterSpacing: '0.1em' }}>SCAN QR CODE WITH AUTHENTICATOR APP</div>
                                <img src={mfaQR} alt="MFA QR" style={{ width: 160, height: 160, background: '#fff', borderRadius: 6, padding: 4, border: '2px solid rgba(0,255,136,0.3)' }} />
                              </div>
                            )}
                            {mfaStatus && <div style={{ ...S.statusMsg(mfaStatus.ok), marginTop: 12 }}>{mfaStatus.ok ? '✅' : '❌'} {mfaStatus.msg}</div>}
                          </div>
                        </>
                      );
                    };
                    return <AmbProfileSettings key="amb-profile-settings" />;
                  })()}

                  {/* Simulation / God Mode panel */}
                  <div style={{ background: 'rgba(10, 0, 20, 0.4)', border: '1px solid rgba(204,0,255,0.2)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#cc00ff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 15 }}>
                      🛠️ GOD MODE & SIMULATION ENGINE
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      <button
                        onClick={() => setSimulateCrisis(!simulateCrisis)}
                        style={{
                          background: simulateCrisis ? 'rgba(255,40,40,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${simulateCrisis ? '#ff4444' : 'rgba(255,255,255,0.2)'}`,
                          padding: 12, borderRadius: 6, color: simulateCrisis ? '#ff4444' : '#fff',
                          fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer'
                        }}
                      >
                        {simulateCrisis ? '🛑 CANCEL CRISIS' : '⚠️ TRIGGER CARDIAC ARREST'}
                      </button>

                      <button
                        onClick={() => setSimulateTraffic(!simulateTraffic)}
                        style={{
                          background: simulateTraffic ? 'rgba(255,184,0,0.2)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${simulateTraffic ? '#ffb800' : 'rgba(255,255,255,0.2)'}`,
                          padding: 12, borderRadius: 6, color: simulateTraffic ? '#ffb800' : '#fff',
                          fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer'
                        }}
                      >
                        {simulateTraffic ? '🛣️ CLEAR TRAFFIC' : '🚧 SIMULATE TRAFFIC JAM'}
                      </button>

                      <button
                        onClick={() => setIsOffline(!isOffline)}
                        style={{
                          background: isOffline ? 'rgba(100,100,100,0.4)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isOffline ? '#aaa' : 'rgba(255,255,255,0.2)'}`,
                          padding: 12, borderRadius: 6, color: isOffline ? '#aaa' : '#fff',
                          fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer'
                        }}
                      >
                        {isOffline ? '📡 RESTORE SIGNAL' : '📡 FORCE OFFLINE (BLACKOUT)'}
                      </button>
                    </div>
                  </div>

                  {/* Manual Identity reset controls */}
                  <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20 }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 15 }}>
                      ⚙️ CONSOLE IDENTITY RESET
                    </div>
                    <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.5, marginBottom: 20 }}>
                      Resetting the console will clear local cache profiles and return the terminal to the operational gateway login page.
                    </p>
                    <button
                      onClick={() => {
                        if (window.confirm("Switch unit identity? All active unit session data will be reset.")) {
                          localStorage.removeItem('ambulance_auth');
                          sessionStorage.clear();
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
                        padding: '10px 20px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444',
                        borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold', cursor: 'pointer'
                      }}
                    >
                      💥 SWITCH IDENTITY / RESET TERMINAL
                    </button>
                  </div>
                </div>
              )}

          {/* Reroute Confirmation Modal */}
          {rerouteTarget && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
              <div style={{ width: '100%', maxWidth: 450, background: '#050d1a', border: '1px solid #ff4444', borderRadius: 12, padding: 24, boxShadow: '0 0 50px rgba(255,0,0,0.2)' }}>
                <div style={{ fontFamily: "'Orbitron'", color: '#ff4444', fontSize: 16, marginBottom: 16 }}>⚠️ CONFIRM REROUTE</div>
                <div style={{ fontSize: 14, color: '#e0eaff', marginBottom: 20, lineHeight: 1.5 }}>
                  You are changing destination to <span style={{ color: '#00c8ff', fontWeight: 'bold' }}>{rerouteTarget?.name}</span>.<br />
                  Current connected hospital: <span style={{ color: '#ffb800' }}>{selectedHospital?.name || 'None'}</span>.
                </div>

                <div style={{ background: 'rgba(0,200,255,0.05)', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(0,200,255,0.2)' }}>
                  <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", marginBottom: 10 }}>CAPABILITY VERIFICATION</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.ventilatorReady ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.ventilatorReady ? '✓' : '✗'} VENTILATORS
                    </div>
                    <div style={{ fontSize: 11, color: rerouteTarget?.simulatedResources?.otPrepared ? '#00ff88' : '#ff4444' }}>
                      {rerouteTarget?.simulatedResources?.otPrepared ? '✓' : '✗'} OT PREPARED
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 15, justifyContent: 'flex-end' }}>
                  <button onClick={() => setRerouteTarget(null)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}>CANCEL</button>
                  <button 
                    onClick={() => {
                      if (socket && assignedUser) {
                        socket.emit('paramedic-request-reroute', { reqId: assignedUser.id, hospitalId: rerouteTarget.id });
                        setSelectedHospital(rerouteTarget);
                        setRerouteTarget(null);
                        showAlert('🔄 Reroute request sent to central coordination.');
                      }
                    }}
                    style={{ padding: '8px 16px', background: '#ff4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold' }}
                  >CONFIRM REROUTE</button>
                </div>
              </div>
            </div>
          )}

          {/* Incoming Dispatch Request Alert Modal */}
          {incomingRequest && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: 20 }}>
              <div style={{ width: '100%', maxWidth: 500, background: 'linear-gradient(135deg, #07152e 0%, #030a1c 100%)', border: '1px solid #ffb800', borderRadius: 12, padding: 30, boxShadow: '0 0 50px rgba(255,184,0,0.15)', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,184,0,0.2)', paddingBottom: 15 }}>
                  <span style={{ fontSize: 32, animation: 'pulse 1s infinite' }}>🚨</span>
                  <div>
                    <div style={{ fontFamily: "'Orbitron'", color: '#ffb800', fontSize: 18, fontWeight: 'bold', letterSpacing: '0.1em' }}>INCOMING EMERGENCY DISPATCH</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>MISSION ID: {incomingRequest.id}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  {/* Patient Info Card */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 10 }}>PATIENT EMERGENCY DETAILS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>NAME</div>
                        <div style={{ fontSize: 13, color: '#fff', fontWeight: 'bold' }}>{incomingRequest.patientDetails?.name || 'Emergency Patient'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>CONDITION / CHIEF COMPLAINT</div>
                        <div style={{ fontSize: 13, color: '#ff4444', fontWeight: 'bold' }}>{incomingRequest.patientDetails?.condition || 'Unknown / SOS'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>AGE / GENDER</div>
                        <div style={{ fontSize: 13, color: '#fff' }}>{incomingRequest.patientDetails?.age || 'N/A'} yrs / {incomingRequest.patientDetails?.gender || 'N/A'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>TRIAGE LEVEL</div>
                        <div style={{ 
                          display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold', marginTop: 4,
                          background: incomingRequest.patientDetails?.riskLevel === 'HIGH' || incomingRequest.fallbackBLS ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
                          color: incomingRequest.patientDetails?.riskLevel === 'HIGH' || incomingRequest.fallbackBLS ? '#ff4444' : '#00ff88',
                          border: `1px solid ${incomingRequest.patientDetails?.riskLevel === 'HIGH' || incomingRequest.fallbackBLS ? '#ff4444' : '#00ff88'}`
                        }}>
                          {incomingRequest.patientDetails?.riskLevel || (incomingRequest.fallbackBLS ? 'HIGH' : 'STANDARD')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location Card */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 6 }}>PICKUP ADDRESS / LOCATION</div>
                    <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.4 }}>{incomingRequest.patientDetails?.address || 'GPS Location Coordinates'}</div>
                    <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Share Tech Mono'", marginTop: 6 }}>
                      Coords: {incomingRequest.userLocation?.lat?.toFixed(4)}, {incomingRequest.userLocation?.lng?.toFixed(4)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 15, marginTop: 10 }}>
                  <button 
                    onClick={rejectRequest} 
                    style={{ flex: 1, padding: '12px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: 6, color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.target.style.background = 'rgba(255,68,68,0.2)'}
                    onMouseLeave={e => e.target.style.background = 'rgba(255,68,68,0.1)'}
                  >
                    DECLINE REQUEST
                  </button>
                  <button 
                    onClick={acceptRequest} 
                    style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #00ff88 0%, #00b359 100%)', border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold', boxShadow: '0 0 20px rgba(0,255,136,0.3)', transition: 'transform 0.2s' }}
                    onMouseEnter={e => e.target.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                  >
                    ACCEPT DISPATCH
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function ClinicalAIDiagnosticAdvisor({ vitals, patient }) {
  const [advisorState, setAdvisorState] = useState({ diff: [], meds: [], warning: '' });

  useEffect(() => {
    if (!vitals || vitals.heartRate === 0) return;
    
    let diff = [];
    let meds = [];
    let warning = '';

    // Advanced Clinical Decision Logic
    if (vitals.heartRate > 130 || (vitals.heartRate > 110 && vitals.systolic < 90)) {
      diff = [
        { name: "STEMI / Acute Coronary Syndrome", prob: "High (89%)", desc: "ST-elevation myocardial infarction threat based on hypotension and tachydysrhythmia." },
        { name: "Septic Shock / Systemic Inflammatory Response", prob: "Medium (45%)", desc: "Consider sepsis protocol if infectious focus is suspected." }
      ];
      meds = [
        { name: "Aspirin", dose: "325 mg PO (Chewable)", action: "Antiplatelet aggregate initialization" },
        { name: "Normal Saline Bolus", dose: "500 mL IV/IO", action: "Volume expansion for hypoperfusion" },
        { name: "Epinephrine (ACLS)", dose: "1 mg IV/IO every 3-5 mins", action: "Vasopressor support for cardiac instability" }
      ];
    } else if (vitals.spo2 < 90) {
      diff = [
        { name: "Acute Hypoxemic Respiratory Failure", prob: "High (94%)", desc: "Severe ventilation-perfusion mismatch or hypoventilation." },
        { name: "Pulmonary Embolism / Acute Pulmonary Edema", prob: "Medium (60%)", desc: "Inspect for signs of fluid overload or deep vein thrombosis." }
      ];
      meds = [
        { name: "Supplemental Oxygen", dose: "15 L/min via Non-Rebreather Mask", action: "Correct systemic arterial hypoxemia" },
        { name: "Albuterol Nebulizer", dose: "2.5 mg / 3 mL inhalational", action: "Bronchodilator for airway constriction" }
      ];
    } else {
      diff = [
        { name: "Hemodynamically Stable Emergency", prob: "Stable", desc: "No critical early warning threshold triggers active." }
      ];
      meds = [
        { name: "Normal Saline KVO", dose: "Keep Vein Open rate", action: "Maintain vascular patency" }
      ];
    }

    // Check Allergies
    const allergies = patient?.allergies || ['Penicillin'];
    if (allergies.some(a => a.toLowerCase().includes('penicillin'))) {
      warning = "⚠️ CONTRAINDICATION ALERT: Patient is allergic to PENICILLIN. Do not administer beta-lactam antibiotics (Amoxicillin/Piperacillin-Tazobactam).";
    }

    setAdvisorState({ diff, meds, warning });
  }, [vitals, patient]);

  if (!vitals || vitals.heartRate === 0) return null;

  return (
    <div style={{ background: 'rgba(5,20,45,0.85)', border: '1px solid rgba(255,180,0,0.3)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ffb800', letterSpacing: '0.1em' }}>🤖 CLINICAL AI DIAGNOSTIC ADVISOR (ACLS Guideline-v4)</div>
        <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,184,0,0.1)', color: '#ffb800', borderRadius: 4, fontFamily: "'Share Tech Mono'" }}>REAL-TIME NLP DECISION</span>
      </div>

      {advisorState.warning && (
        <div style={{ background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', color: '#ff4444', borderRadius: 6, padding: 10, fontSize: 11, marginBottom: 15, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>
          {advisorState.warning}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8, fontFamily: "'Orbitron'" }}>DIFFERENTIAL DIAGNOSES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {advisorState.diff.map((d, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 'bold', color: '#fff' }}>
                  <span>{d.name}</span>
                  <span style={{ color: d.prob.includes('High') ? '#ff4444' : '#00ff88' }}>{d.prob}</span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginTop: 4 }}>{d.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 240, borderLeft: '1px solid rgba(160,200,255,0.15)', paddingLeft: 20 }}>
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginBottom: 8, fontFamily: "'Orbitron'" }}>RECOMMENDED ACLS THERAPY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {advisorState.meds.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 6, padding: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 'bold', color: '#00c8ff' }}>{m.name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>{m.action}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', fontFamily: "'Share Tech Mono'" }}>{m.dose}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AIStrokeCopilot() {
  const [scanning, setScanning] = useState(false);
  const [score, setScore] = useState(null);
  const [features, setFeatures] = useState({ droop: 0, drift: 0, speech: 0 });

  const startScan = () => {
    setScanning(true);
    setScore(null);
    setTimeout(() => {
      setFeatures({ droop: 1, drift: 2, speech: 1 });
      setScore(4); // LAMS Score 4
      setScanning(false);
    }, 2500);
  };

  return (
    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>🧠 AI NEUROLOGICAL STROKE COPILOT (LAMS scale)</div>
        <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 4, fontFamily: "'Share Tech Mono'" }}>FACIAL TRACKING ACTIVE</span>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ 
          width: 140, height: 140, background: '#02040b', border: '1px solid rgba(0,200,255,0.2)', 
          borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {scanning ? (
            <>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#00ff88',
                boxShadow: '0 0 10px #00ff88', animation: 'scanBeam 1.5s linear infinite'
              }} />
              <span style={{ fontSize: 32, animation: 'pulse 1s infinite' }}>👤</span>
              <span style={{ fontSize: 9, color: '#00ff88', marginTop: 8, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>TRACKING POINTS...</span>
            </>
          ) : score !== null ? (
            <>
              <span style={{ fontSize: 32 }}>👤</span>
              <div style={{ position: 'absolute', top: '35%', left: '42%', width: 4, height: 4, borderRadius: '50%', background: '#ff3333', boxShadow: '0 0 4px #ff3333' }} />
              <div style={{ position: 'absolute', top: '33%', left: '55%', width: 4, height: 4, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
              <div style={{ position: 'absolute', top: '48%', left: '40%', width: 4, height: 4, borderRadius: '50%', background: '#ff3333', boxShadow: '0 0 4px #ff3333' }} />
              <div style={{ position: 'absolute', top: '46%', left: '58%', width: 4, height: 4, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 4px #00ff88' }} />
              <span style={{ fontSize: 9, color: '#00ff88', marginTop: 8, fontFamily: "'Share Tech Mono'" }}>POINTS LOCKED</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 32, opacity: 0.3 }}>👤</span>
              <button 
                onClick={startScan}
                style={{
                  marginTop: 10, padding: '6px 12px', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
                  borderRadius: 4, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 9, fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                START SCAN
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          {score !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'" }}>LAMS ASSESSMENT</span>
                <span style={{ 
                  fontSize: 11, padding: '2px 8px', background: 'rgba(255,68,68,0.15)', color: '#ff4444', 
                  border: '1px solid #ff4444', borderRadius: 4, fontFamily: "'Orbitron'", fontWeight: 'bold' 
                }}>
                  LAMS SCORE: {score} / 5
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4 }}>
                <span>Facial Droop (0-1)</span>
                <span style={{ color: '#ffb800' }}>{features.droop} (Moderate/Severe)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4 }}>
                <span>Arm Drift (0-2)</span>
                <span style={{ color: '#ff4444' }}>{features.drift} (Rapid Fall/Drift)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4 }}>
                <span>Grip Strength (0-2)</span>
                <span style={{ color: '#ffb800' }}>{features.speech} (Weak Grip)</span>
              </div>
              <div style={{ fontSize: 10, color: '#ff4444', fontWeight: 'bold', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>
                🚨 Warning: Score &gt;= 4 indicates high likelihood of Large Vessel Occlusion (LVO). Pre-alert Comprehensive Stroke Center.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontStyle: 'italic', lineHeight: 1.5 }}>
              Scan the patient's face to map facial symmetry grids and estimate a Los Angeles Motor Scale (LAMS) stroke score.
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes scanBeam {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
      `}</style>
    </div>
  );
}

function AIVoiceDispatcher({ vitals, patient }) {
  const [calling, setCalling] = useState(false);
  const [log, setLog] = useState([]);

  const triggerCall = () => {
    if (!window.speechSynthesis) {
      alert("Speech synthesis is not supported on this browser.");
      return;
    }
    setCalling(true);
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Establishing AI outbound voice telemetry link...`]);

    const name = patient?.name || "Unknown Patient";
    const hr = vitals?.heartRate || 75;
    const spo2 = vitals?.spo2 || 98;
    const cond = patient?.condition || "Trauma";
    const text = `Critical Alert. Outbound AI dispatch telemetry link established for patient ${name}. Current heart rate is ${hr} beats per minute. Oxygen saturation level is ${spo2} percent. Diagnosis indicates suspected ${cond}. Preparing clinical reception area.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      setCalling(false);
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] AI Outbound VoIP call completed successfully.`]);
    };

    utterance.onerror = (e) => {
      setCalling(false);
      setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] VoIP Link Error: ${e.error}`]);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>📞 AI VOICE TELEMETRY DISPATCH (WebRTC Fallback)</div>
        <span style={{ fontSize: 8, padding: '2px 6px', background: calling ? 'rgba(255,50,50,0.2)' : 'rgba(160,200,255,0.1)', color: calling ? '#ff4444' : 'rgba(160,200,255,0.6)', borderRadius: 4, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>
          {calling ? '● ON-CALL' : 'STANDBY'}
        </span>
      </div>

      <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.5, margin: '0 0 12px 0' }}>
        Initiate an automated AI VoIP fallback voice transmission to the hospital, reading critical patient diagnostics aloud over the voice channel.
      </p>

      <button
        onClick={triggerCall}
        disabled={calling}
        style={{
          width: '100%', padding: '10px', background: calling ? 'rgba(255,68,68,0.2)' : 'linear-gradient(135deg, #00c8ff 0%, #0072ff 100%)',
          border: 'none', borderRadius: 6, color: '#fff', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
        }}
      >
        {calling ? '🎙️ AI TRANSMITTING TELEMETRY...' : '🔊 INITIATE AUTOMATED AI VOICE CALL'}
      </button>

      {log.length > 0 && (
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', marginTop: 12, maxHeight: 80, overflowY: 'auto' }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: '#00ff88', marginBottom: 4 }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

