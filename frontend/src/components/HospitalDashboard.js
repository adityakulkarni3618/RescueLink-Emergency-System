import React, { useState, useEffect, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VideoCall from './VideoCall';
import PhysiologicalWaveforms from './PhysiologicalWaveforms';
import { showAlert } from '../utils/alert';
import InsurancePanel from './InsurancePanel';
import MassCasualtyPanel from './MassCasualtyPanel';
import HeartbeatViz from './HeartbeatViz';
import HospitalAnalytics from './HospitalAnalytics';
import BloodEmergencyNetwork from './BloodEmergencyNetwork';
import { MfaVerifyScreen } from './MfaVerifyScreen';
import OfflineTileLayer from './OfflineTileLayer';
import AIEmergencyCorridorView from './AIEmergencyCorridorView';
import LiveRouteMap from './LiveRouteMap';
// THREE is dynamically imported inside ThreeDResuscitationMonitor to prevent TDZ crash


function CustomAlert({ title, message, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#0a1526', border: '1px solid #00c8ff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 0 30px rgba(0,200,255,0.2)', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.9)', marginBottom: 24, lineHeight: 1.5 }}>{message}</div>
        <button onClick={onClose} style={{
          background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)', padding: '10px 24px', borderRadius: 6,
          fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%'
        }}>ACKNOWLEDGE</button>
      </div>
    </div>
  );
}
let audioCtx = null;
function playAlertBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
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
  } catch (err) { console.warn('Audio alert failed', err); }
}

function playChirp() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;

    // First beep: 900Hz
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(900, ctx.currentTime);
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.08);

    // Second beep: 1300Hz (80ms later)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1300, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08 + 0.08);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start();
    osc2.stop(ctx.currentTime + 0.16);
  } catch (err) {
    console.warn('[Audio] Chirp failed:', err);
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
  }
} catch (e) {}

const CLINICAL_PROTOCOLS = {
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

// FIX C6: HOSPITALS constant removed — all hospital routing now done server-side via networkHospitals.
// This prevents the system from defaulting to hardcoded Indian GPS coordinates for non-Indian clients.
// The hospital network is populated dynamically from the active server socket registry.

/* ─── Map recenter helper ─────────────────────────────────────────────────── */
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center.lat !== undefined && center.lng !== undefined && !isNaN(center.lat) && !isNaN(center.lng)) {
      map.panTo([center.lat, center.lng], { animate: true, duration: 1 });
    }
  }, [center, map]);
  return null;
}

function SmartMapController({ ambulanceLoc, userLoc, hospitalLoc }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    const points = [];
    if (ambulanceLoc && ambulanceLoc.lat !== undefined && ambulanceLoc.lng !== undefined && !isNaN(ambulanceLoc.lat) && !isNaN(ambulanceLoc.lng)) {
      points.push([ambulanceLoc.lat, ambulanceLoc.lng]);
    }
    if (userLoc && userLoc.lat !== undefined && userLoc.lng !== undefined && !isNaN(userLoc.lat) && !isNaN(userLoc.lng)) {
      points.push([userLoc.lat, userLoc.lng]);
    }
    if (hospitalLoc && hospitalLoc.lat !== undefined && hospitalLoc.lng !== undefined && !isNaN(hospitalLoc.lat) && !isNaN(hospitalLoc.lng)) {
      points.push([hospitalLoc.lat, hospitalLoc.lng]);
    }

    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      const boundsStr = bounds.toBBoxString();
      if (boundsStr !== lastBoundsRef.current) {
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
        lastBoundsRef.current = boundsStr;
      }
    } else if (points.length === 1) {
      map.panTo(points[0], { animate: true });
    }
  }, [ambulanceLoc, userLoc, hospitalLoc, map]);

  return null;
}



/* ─── Live Chart component ────────────────────────────────────────────────── */
function VitalChart({ data, dataKey, color, label, unit, critHigh, critLow, domain }) {
  const lastVal = data.length > 0 ? data[data.length - 1][dataKey] : null;
  const isCrit = lastVal !== null && ((critHigh && lastVal > critHigh) || (critLow && lastVal < critLow));

  return (
    <div style={{
      background: 'rgba(5,15,40,0.8)',
      border: `1px solid ${isCrit ? 'rgba(255,80,80,0.5)' : 'rgba(0,200,255,0.12)'}`,
      borderRadius: 10, padding: 16,
      transition: 'border-color 0.3s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: isCrit ? '#ff6060' : 'rgba(160,200,255,0.5)', letterSpacing: '0.1em' }}>
          {label} {isCrit && '⚠'}
        </div>
        <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 22, color: isCrit ? '#ff4444' : color, fontWeight: 700 }}>
          {lastVal ?? '--'} <span style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)' }}>{unit}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.05)" />
          <YAxis domain={domain} tick={{ fontSize: 9, fill: 'rgba(160,200,255,0.3)', fontFamily: "'Share Tech Mono'" }} />
          <XAxis hide />
          <Tooltip
            contentStyle={{ background: '#050d1a', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, fontSize: 11 }}
            labelStyle={{ display: 'none' }}
            formatter={(v) => [`${v} ${unit}`, label]}
          />
          {critHigh && <ReferenceLine y={critHigh} stroke="rgba(255,80,80,0.3)" strokeDasharray="4 4" />}
          {critLow && <ReferenceLine y={critLow} stroke="rgba(255,80,80,0.3)" strokeDasharray="4 4" />}
          <Line
            type="basis" dataKey={dataKey} stroke={isCrit ? '#ff4444' : color}
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const fetchIpLocation = async () => {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data && data.latitude && data.longitude) {
      return { lat: data.latitude, lng: data.longitude };
    }
  } catch (err) { console.warn('IP Location failed', err); }
  return { lat: 12.9716, lng: 77.5946 }; // Default to Bengaluru
};

/* ─── Auto-Triage Logic ───────────────────────────────────────────────────── */
function calculateTriage(vitals) {
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

function AbdmConnectModal({ patient, onClose, onLinked }) {
  const [step, setStep] = useState(1);
  const [abhaId, setAbhaId] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const requestOtp = async () => {
    if (!abhaId) return;
    setLoading(true);
    try {
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const res = await fetch(`${SERVER_URL}/api/auth/lookup-abha/${abhaId}`);
      const data = await res.json();
      if (res.ok) {
        setStep(2);
      } else {
        alert(data.error || 'ABHA credential not found in registry.');
      }
    } catch (err) {
      alert('ABDM registry lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp) return;
    setLoading(true);
    try {
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const res = await fetch(`${SERVER_URL}/api/auth/lookup-abha/${abhaId}`);
      const data = await res.json();
      if (res.ok) {
        let computedAge = 'N/A';
        if (data.dob) {
          computedAge = new Date().getFullYear() - new Date(data.dob).getFullYear();
        }
        const abhaProfile = {
          name: data.name,
          age: computedAge,
          bloodGroup: data.blood_group || 'N/A',
          mobile: data.mobile || 'N/A',
          allergies: data.allergies || 'None',
          chronicConditions: data.chronic_conditions || 'None',
          abhaAddress: data.abha_address || abhaId
        };
        onLinked(abhaProfile);
        onClose();
      } else {
        alert('Failed to retrieve health records.');
      }
    } catch (err) {
      alert('ABDM consent verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#0a1526', border: '1px solid #00c8ff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 450, boxShadow: '0 0 30px rgba(0,200,255,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em' }}>🔗 ABDM SANDBOX LINKING</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        {step === 1 ? (
          <div>
            <div style={{ fontSize: 12, color: 'rgba(220,230,255,0.8)', marginBottom: 16 }}>Enter the patient's Ayushman Bharat Health Account (ABHA) ID to pull longitudinal health records.</div>
            <input
              value={abhaId} onChange={e => setAbhaId(e.target.value)}
              placeholder="e.g. 12-3456-7890-1234 or name@abdm"
              style={{ width: '100%', padding: '12px', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <button onClick={requestOtp} disabled={loading} style={{
              background: 'rgba(0,200,255,0.15)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.4)', padding: '12px', borderRadius: 6,
              fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%'
            }}>{loading ? 'CONNECTING TO GATEWAY...' : 'REQUEST OTP'}</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: 'rgba(220,230,255,0.8)', marginBottom: 16 }}>Enter the 6-digit OTP sent to the patient's registered mobile number for consent.</div>
            <input
              value={otp} onChange={e => setOtp(e.target.value)}
              placeholder="6-digit OTP" type="number"
              style={{ width: '100%', padding: '12px', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff', marginBottom: 16, boxSizing: 'border-box', letterSpacing: '0.2em', textAlign: 'center', fontSize: 18 }}
            />
            <button onClick={verifyOtp} disabled={loading} style={{
              background: '#00ff8822', color: '#00ff88', border: '1px solid #00ff8855', padding: '12px', borderRadius: 6,
              fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%'
            }}>{loading ? 'VERIFYING CONSENT...' : 'CONFIRM & LINK RECORD'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Patient panel ───────────────────────────────────────────────────────── */
function PatientPanel({ patient, vitals, activeMissionId }) {
  const [alertData, setAlertData] = useState(null);
  const [showAbdmModal, setShowAbdmModal] = useState(false);
  const [abdmLinked, setAbdmLinked] = useState(false);

  // New HIS & Telemedicine states
  const [admission, setAdmission] = useState(null);
  const [ehrRecord, setEhrRecord] = useState(null);
  const [consultStatus, setConsultStatus] = useState('');
  const [specialists, setSpecialists] = useState([]);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);

  // Chronic Disease Management & AI Prediction States
  const [chronicLogs, setChronicLogs] = useState([]);
  const [aiPrediction, setAiPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [showChronicTab, setShowChronicTab] = useState(false);

  // Prescription & Discharge Management States
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxNotes, setRxNotes] = useState('');
  const [rxFollowUpDate, setRxFollowUpDate] = useState('');
  const [rxMedications, setRxMedications] = useState([{ name: '', dosage: '', instructions: '' }]);

  const token = sessionStorage.getItem('rescuelink_token') || '';

  useEffect(() => {
    if (!patient?.id) return;
    const fetchChronicLogs = async () => {
      try {
        const res = await fetch(`/api/chronic/logs/${patient.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.error) {
          setChronicLogs(data);
        }
      } catch (err) {
        console.warn('Failed to fetch chronic logs', err);
      }
    };
    fetchChronicLogs();
    setAiPrediction(null); // Reset prediction when patient changes
  }, [patient?.id, token]);

  const handlePredictRisk = async () => {
    if (!patient?.id) return;
    setPredicting(true);
    try {
      const res = await fetch(`/api/chronic/predict-risk/${patient.id}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiPrediction(data);
    } catch (err) {
      setAlertData({ title: "AI Prediction Failed", message: err.message });
    } finally {
      setPredicting(false);
    }
  };

  if (!patient) return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.12)',
      borderRadius: 10, padding: 20, textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
      <div style={{ color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", fontSize: 12 }}>
        AWAITING PATIENT SELECTION<br />FROM AMBULANCE UNIT
      </div>
    </div>
  );

  const handleHisAdmit = async () => {
    try {
      const res = await fetch('/api/his/admit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incidentId: activeMissionId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAdmission(data);
      setAlertData({
        title: "🏥 HIS ADMISSION SUCCESSFUL",
        message: `Admission ID: ${data.admissionId}\nAssigned Bed: ${data.bedAssigned}\nWard: ${data.wardName}`
      });
    } catch (err) {
      setAlertData({ title: "❌ ADMISSION FAILED", message: err.message });
    }
  };

  const handleOrderRx = async () => {
    const drugName = window.prompt("Enter medication name (e.g. Aspirin 75mg, Epinephrine 1mg):");
    if (!drugName) return;
    try {
      const res = await fetch('/api/his/order/drug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patientId: patient.id, drugName })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAlertData({
        title: "💊 RX DISPATCH SUCCESSFUL",
        message: `Order Reference: ${data.orderId}\nMedication: ${data.medication}\nStatus: ${data.status}`
      });
    } catch (err) {
      setAlertData({ title: "❌ ORDER FAILED", message: err.message });
    }
  };

  const handleFetchHisEhr = async () => {
    try {
      const abha = patient.abha_number || '91-1234-5678-9012';
      const res = await fetch(`/api/his/patient/${abha}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEhrRecord(data);
    } catch (err) {
      setAlertData({ title: "❌ EHR FETCH FAILED", message: err.message });
    }
  };

  const handleDischarge = async () => {
    const summary = window.prompt("Enter Discharge Summary:");
    if (!summary) return;
    try {
      const res = await fetch(`/api/his/discharge/${activeMissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ summary })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAlertData({
        title: "📄 DISCHARGE COMPLETED",
        message: `Document Reference: ${data.documentId}\nStatus: ${data.status}\nUploaded to ABDM & HIS HIE`
      });
    } catch (err) {
      setAlertData({ title: "❌ DISCHARGE FAILED", message: err.message });
    }
  };

  const handlePrescribeSubmit = async (e) => {
    e.preventDefault();
    try {
      const activeMedications = rxMedications.filter(m => m.name.trim());
      if (activeMedications.length === 0) {
        alert("Please add at least one medication.");
        return;
      }
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          incidentId: activeMissionId,
          patientId: patient.id,
          medications: activeMedications,
          diagnosis: rxDiagnosis,
          notes: rxNotes,
          followUpDate: rxFollowUpDate
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit prescription');
      
      setAlertData({
        title: "💊 PRESCRIPTION FILED SUCCESSFULLY",
        message: `Diagnosis: ${rxDiagnosis}\nMedications Prescribed: ${activeMedications.length}\nInstructions dispatched to Patient Portal.`
      });
      setShowPrescribeModal(false);
      // Reset form
      setRxDiagnosis('');
      setRxNotes('');
      setRxFollowUpDate('');
      setRxMedications([{ name: '', dosage: '', instructions: '' }]);
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  const handleTeleConsult = async (spec) => {
    setShowSpecialistModal(false);
    setConsultStatus(`Requesting ${spec} Consult...`);
    try {
      const res = await fetch('/api/tele/request-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ incidentId: activeMissionId, speciality: spec })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConsultStatus(`Requested ${spec}. Waiting for doctor...`);
    } catch (err) {
      setConsultStatus('Consultation request failed.');
      setAlertData({ title: "❌ CONSULT ERROR", message: err.message });
    }
  };

  const generatePrognosisReport = () => {
    setGeneratingPrognosis(true);
    setTimeout(() => {
      let condition = "General Assessment";
      let riskLevel = "LOW RISK";
      let riskColor = "#00ff88";
      let details = "";
      let recommendations = [];

      const hr = latestVitals?.heartRate || 75;
      const o2 = latestVitals?.spo2 || 98;
      const sys = latestVitals?.systolic || 120;
      const temp = latestVitals?.temperature || 36.6;

      if (o2 < 92 || hr > 130 || sys < 90) {
        condition = "High Risk: Acute Cardiorespiratory Crisis";
        riskLevel = "CRITICAL / RED";
        riskColor = "#ff4444";
        details = "Smart telemetry analysis shows acute deterioration. Low blood oxygenation coupled with severe tachycardia/hypotension indicates potential cardiogenic shock or respiratory failure.";
        recommendations = [
          "Establish high-flow oxygen therapy (15 L/min non-rebreather).",
          "Obtain immediate arterial blood gas (ABG) & cardiac panels.",
          "Prepare trauma bay for immediate intubation/mechanical ventilation.",
          "Alert critical care coordinator (ICU Command) for standby bed lock."
        ];
      } else if (hr > 105 || o2 < 95 || sys > 145 || temp > 38.0) {
        condition = "Moderate Risk: Elevated Hemodynamic Acuity";
        riskLevel = "MODERATE / YELLOW";
        riskColor = "#ffb800";
        details = "Smart telemetry analysis shows early-stage hypertensive distress or systemic infection. Mild tachycardia & sub-optimal blood oxygen saturation require close monitoring.";
        recommendations = [
          "Initiate continuous vitals polling (15-min intervals).",
          "Draw peripheral blood cultures x2 and perform septic screen.",
          "Obtain emergency 12-lead ECG to rule out ischemic changes.",
          "Standby IV access line hydration (0.9% Normal Saline at 100 mL/hr)."
        ];
      } else {
        condition = "Normal Hemodynamic Profile";
        riskLevel = "STABLE / GREEN";
        riskColor = "#00ff88";
        details = "Vitals are within physiological limits. Wearable streams indicate stable cardiovascular state. Standard emergency triage protocols apply.";
        recommendations = [
          "Continue routine vital sign monitoring (30-min intervals).",
          "Verify standard electronic health record (EHR) medication reconciliation.",
          "Clear for standard emergency room triage assessment."
        ];
      }

      setAiPrognosisReport({
        condition,
        riskLevel,
        riskColor,
        details,
        recommendations,
        generatedAt: new Date().toLocaleTimeString()
      });
      setGeneratingPrognosis(false);
    }, 1500);
  };

  const riskColors = { HIGH: '#ff4444', MEDIUM: '#ffb800', LOW: '#00ff88' };

  return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.2)',
      borderRadius: 10, padding: 20,
    }}>
      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>PATIENT RECORD — {patient?.id}</span>
        <button onClick={() => setShowChronicTab(!showChronicTab)} style={{
          background: showChronicTab ? 'rgba(0, 200, 255, 0.2)' : 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(0, 200, 255, 0.4)', color: '#00c8ff', padding: '2px 8px', borderRadius: 4, fontFamily: "'Orbitron'", fontSize: 9, cursor: 'pointer'
        }}>
          {showChronicTab ? '🏥 VIEW CLINICAL OVERVIEW' : '📈 VIEW CHRONIC CARE & AI'}
        </button>
      </div>

      {!showChronicTab ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e0eaff', marginBottom: 2 }}>
                {patient.name}
                {abdmLinked && (
                  <span style={{
                    marginLeft: 10, background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid #00ff88',
                    borderRadius: 12, padding: '2px 6px', fontSize: 9, fontFamily: "'Orbitron'",
                    display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle'
                  }}>
                    ✅ ABDM VERIFIED
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
                Age: {patient.age} · Blood: {patient.bloodGroup}
              </div>
            </div>

            {/* Dynamic Triage & Source Badges */}
            {vitals && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
                <div style={{
                  padding: '6px 12px', borderRadius: 4,
                  background: `${vitals.source === 'LIVE' ? '#00ff88' : vitals.source === 'MANUAL' ? '#ffb800' : '#00c8ff'}22`,
                  border: `1px solid ${vitals.source === 'LIVE' ? '#00ff88' : vitals.source === 'MANUAL' ? '#ffb800' : '#00c8ff'}66`,
                  color: vitals.source === 'LIVE' ? '#00ff88' : vitals.source === 'MANUAL' ? '#ffb800' : '#00c8ff',
                  fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
                }}>
                  {vitals.source || 'SIMULATED'}
                </div>
              </div>
            )}
          </div>

          {consentStatus !== 'APPROVED' ? (
            <div style={{
              margin: '15px 0', padding: 20, background: 'rgba(255,184,0,0.03)',
              border: '1px dashed rgba(255,184,0,0.3)', borderRadius: 10, textAlign: 'center', boxSizing: 'border-box'
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🛡️</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ffb800', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: 4 }}>
                ABDM DPDP CONSENT REQUIRED
              </div>
              <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', lineHeight: 1.4, margin: '0 0 15px 0' }}>
                Pursuant to India's DPDP Act 2023, access to this patient's clinical history and allergy records requires explicit consent. Request access on the patient's device.
              </p>
              
              {consentStatus === 'PENDING' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>
                  ⏳ Awaiting patient validation...
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (socket && activeMissionId) {
                      socket.emit('hospital-request-consent', { reqId: activeMissionId, hospitalName: 'Apollo Hospital (RescueLink Command)' });
                      setConsentStatus('PENDING');
                    }
                  }}
                  style={{
                    padding: '8px 16px', background: 'rgba(255,184,0,0.15)',
                    border: '1px solid #ffb800', borderRadius: 6, color: '#ffb800',
                    fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  ⚡ REQUEST DATA CONSENT
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#ff6b6b', fontFamily: "'Orbitron'", letterSpacing: '0.1em', marginBottom: 6 }}>
                  ⚠ ALLERGIES
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(!patient.allergies || patient.allergies.length === 0) ? (
                    <span style={{ color: '#00ff88', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>NONE KNOWN</span>
                  ) : patient.allergies.map(a => (
                    <span key={a} style={{
                      padding: '3px 10px', background: 'rgba(255,80,80,0.15)',
                      border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
                      color: '#ff8888', fontSize: 12, fontFamily: "'Share Tech Mono'",
                    }}>{a}</span>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.1em' }}>
                    MEDICAL HISTORY
                  </div>
                  <button onClick={handleFetchHisEhr} style={{ background: 'transparent', border: '1px solid rgba(0,200,255,0.3)', color: '#00c8ff', fontSize: 10, fontFamily: "'Orbitron'", padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
                    🔄 SYNC HIS
                  </button>
                </div>

                {ehrRecord ? (
                  <div>
                    <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 4 }}>✓ HIS Connected • Diagnoses Loaded:</div>
                    {ehrRecord.diagnoses.map((d, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#e0eaff', marginBottom: 2 }}>
                        • {d.description} ({d.date})
                      </div>
                    ))}
                  </div>
                ) : (
                  patient.medicalHistory?.map((h, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', marginBottom: 3, paddingLeft: 12, borderLeft: '2px solid rgba(0,200,255,0.3)' }}>
                      {h}
                    </div>
                  )) || <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.3)', fontFamily: "'Share Tech Mono'" }}>NO RECORDS AVAILABLE</div>
                )}
              </div>

              {/* Clinical OCR Scanner Drop Zone */}
              <div style={{
                marginTop: 16, padding: 16, background: 'rgba(0,200,255,0.02)',
                border: '1px dashed rgba(0,200,255,0.2)', borderRadius: 8,
                textAlign: 'center', boxSizing: 'border-box'
              }}>
                <div style={{ fontSize: 18, marginBottom: 6 }}>📄</div>
                <div style={{ fontSize: 11, fontFamily: "'Orbitron'", color: '#00c8ff', fontWeight: 'bold' }}>
                  CLINICAL OCR DOCUMENT PARSER
                </div>
                <p style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', margin: '4px 0 10px 0' }}>
                  Paste raw clinical report text below to automatically extract allergies, blood group, and chronic histories.
                </p>
                <textarea
                  placeholder="Example: Patient Type: O- | DOB: 12/04/1990 | Allergies: Penicillin, Sulfa | History: Asthma..."
                  style={{
                    width: '100%', height: 60, background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(0,200,255,0.15)', borderRadius: 4,
                    color: '#fff', fontSize: 11, padding: 8, boxSizing: 'border-box',
                    fontFamily: "'Share Tech Mono'", outline: 'none', resize: 'none'
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      const text = e.target.value;
                      if (!text.trim()) return;
                      try {
                        const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
                        const res = await fetch(`${SERVER_URL}/api/ocr/parse-report`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text })
                        });
                        const payload = await res.json();
                        if (payload.success && payload.data) {
                          const parsed = payload.data;
                          setPatient(prev => ({
                            ...prev,
                            blood_group: parsed.bloodGroup || prev.blood_group,
                            allergies: parsed.allergies.length > 0 ? parsed.allergies : prev.allergies,
                            chronic_conditions: parsed.chronicConditions.length > 0 ? parsed.chronicConditions : prev.chronic_conditions,
                            dob: parsed.dob || prev.dob,
                            gender: parsed.gender || prev.gender
                          }));
                          showAlert('✅ Successfully extracted clinical parameters from scanned document text!');
                          e.target.value = '';
                        }
                      } catch (err) {
                        showAlert('❌ Document scanning failed: ' + err.message);
                      }
                    }
                  }}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontFamily: "'Orbitron'", color: '#e0eaff', fontWeight: 'bold' }}>📈 CHRONIC VITAL HISTORY</span>
            <button onClick={handlePredictRisk} disabled={predicting} style={{
              background: 'linear-gradient(135deg, #00c8ff 0%, #0072ff 100%)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6,
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer'
            }}>
              {predicting ? 'RUNNING AI ENGINE...' : '🧠 PROACTIVE AI PREDICTION'}
            </button>
          </div>

          {/* AI prediction display panel */}
          {aiPrediction && (
            <div style={{
              background: 'rgba(0, 200, 255, 0.05)', border: `1px solid ${aiPrediction.status === 'CRITICAL' ? '#ff4444' : aiPrediction.status === 'MODERATE' ? '#ffb800' : '#00ff88'}`,
              borderRadius: 8, padding: 12, marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Orbitron'", fontSize: 11, marginBottom: 8 }}>
                <span style={{ color: '#00c8ff' }}>AI RISK PREDICTION ({aiPrediction.model})</span>
                <span style={{ color: aiPrediction.status === 'CRITICAL' ? '#ff4444' : aiPrediction.status === 'MODERATE' ? '#ffb800' : '#00ff88', fontWeight: 'bold' }}>
                  {aiPrediction.status} (RISK: {aiPrediction.riskScore}/10)
                </span>
              </div>

              <div style={{ fontSize: 11, color: '#ff8888', marginBottom: 6, fontWeight: 'bold' }}>ALERTS:</div>
              {aiPrediction.alerts.map((al, idx) => (
                <div key={idx} style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', paddingLeft: 10, borderLeft: '2px solid #ff4444', marginBottom: 4 }}>
                  ⚠️ {al}
                </div>
              ))}

              <div style={{ fontSize: 11, color: '#00ff88', marginTop: 10, marginBottom: 6, fontWeight: 'bold' }}>REC:</div>
              {aiPrediction.recommendations.map((rec, idx) => (
                <div key={idx} style={{ fontSize: 11, color: 'rgba(200,240,255,0.95)', paddingLeft: 10, borderLeft: '2px solid #00ff88', marginBottom: 4 }}>
                  • {rec}
                </div>
              ))}
            </div>
          )}

          {/* Visualizing chronic logs */}
          {chronicLogs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.1)', borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", marginBottom: 6 }}>BLOOD GLUCOSE TRENDS (mg/dL)</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={[...chronicLogs].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.05)" />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'rgba(160,200,255,0.4)' }} />
                    <Tooltip contentStyle={{ background: '#050d1a', border: '1px solid rgba(0,200,255,0.2)', fontSize: 10 }} />
                    <Line type="monotone" dataKey="blood_glucose" stroke="#00ff88" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.1)', borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 10, color: '#ffb800', fontFamily: "'Orbitron'", marginBottom: 6 }}>BLOOD PRESSURE TRENDS (mmHg)</div>
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={[...chronicLogs].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.05)" />
                    <XAxis dataKey="timestamp" hide />
                    <YAxis tick={{ fontSize: 8, fill: 'rgba(160,200,255,0.4)' }} />
                    <Tooltip contentStyle={{ background: '#050d1a', border: '1px solid rgba(0,200,255,0.2)', fontSize: 10 }} />
                    <Line type="monotone" dataKey="systolic_bp" stroke="#ff4444" strokeWidth={2} name="Systolic" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="diastolic_bp" stroke="#ffb800" strokeWidth={2} name="Diastolic" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px dashed rgba(0,200,255,0.2)' }}>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>NO CHRONIC LOG DIARY FOUND</div>
            </div>
          )}
        </div>
      )}

      {/* EHR & Telemedicine Actions Section */}
      <div style={{ marginTop: 24, borderTop: '1px solid rgba(0,200,255,0.2)', paddingTop: 16, display: 'flex', gap: 8, flexDirection: 'column' }}>
        <div style={{ flexDirection: 'row', display: 'flex', gap: 8 }}>
          <button
            onClick={handleHisAdmit}
            style={{
              flex: 1, padding: '10px', background: 'rgba(0,200,255,0.1)',
              border: '1px solid #00c8ff', borderRadius: 6, color: '#00c8ff',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            🏨 HIS ADMIT TO ER
          </button>
          <button
            onClick={handleOrderRx}
            style={{
              flex: 1, padding: '10px', background: 'rgba(255,184,0,0.1)',
              border: '1px solid #ffb800', borderRadius: 6, color: '#ffb800',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            💊 DISPATCH RX ORDER
          </button>
        </div>

        <div style={{ flexDirection: 'row', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowPrescribeModal(true)}
            style={{
              flex: 1, padding: '10px', background: 'rgba(255,100,255,0.1)',
              border: '1px solid #ff66ff', borderRadius: 6, color: '#ff66ff',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            📝 WRITE PRESCRIPTION
          </button>
          <button
            onClick={handleDischarge}
            style={{
              flex: 1, padding: '10px', background: 'rgba(0,255,136,0.1)',
              border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            🏥 DISCHARGE SUMMARY
          </button>
        </div>

        <div style={{ flexDirection: 'row', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowSpecialistModal(true)}
            style={{
              width: '100%', padding: '10px', background: 'rgba(128,80,255,0.1)',
              border: '1px solid #8050ff', borderRadius: 6, color: '#8050ff',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            📹 REMOTE CONSULT
          </button>
        </div>

        {consultStatus ? (
          <div style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', padding: '6px 12px', borderRadius: 6, fontSize: 11, color: '#00c8ff', textAlign: 'center' }}>
            🛰️ {consultStatus}
          </div>
        ) : null}

        {admission ? (
          <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)', padding: '6px 12px', borderRadius: 6, fontSize: 11, color: '#00ff88', textAlign: 'center' }}>
            ✓ Admitted: Bed {admission.bedAssigned} ({admission.wardName})
          </div>
        ) : null}

        <button
          onClick={() => {
            setAlertData({
              title: "🚀 ENTERPRISE PACS/DICOM VIEWER",
              message: "PENDING HARDWARE\n\nTo view real-time 12-Lead ECG & Point-of-Care Ultrasound (POCUS) streams, please ensure the Ambulance IoT Scanner is securely paired via Bluetooth Low Energy (BLE) to the streaming tablet."
            });
          }}
          style={{
            width: '100%', padding: '10px', background: 'rgba(0,200,255,0.05)',
            border: '1px solid rgba(0,200,255,0.3)', borderRadius: 6, color: '#00c8ff',
            fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
          <span>🩻</span> VIEW FIELD DICOM SCANS
        </button>

        {!abdmLinked && (
          <button
            onClick={() => setShowAbdmModal(true)}
            style={{
              width: '100%', padding: '10px', background: 'rgba(0,255,136,0.1)',
              border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
              fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}>
            <span>🔗</span> FETCH ABDM EMR
          </button>
        )}

        {/* AI Care Advisor Panel */}
        <button
          onClick={generatePrognosisReport}
          disabled={generatingPrognosis}
          style={{
            width: '100%', padding: '10px', background: 'rgba(0, 255, 136, 0.08)',
            border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
            fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
          <span>🧠</span> {generatingPrognosis ? 'GENERATING AI PROGNOSIS...' : 'GENERATE AI CARE PROGNOSIS'}
        </button>

        {aiPrognosisReport && (
          <div style={{
            background: 'rgba(0, 200, 255, 0.04)', border: `1px solid ${aiPrognosisReport.riskColor}`,
            borderRadius: 8, padding: 12, marginTop: 10, textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Orbitron'", fontSize: 10, marginBottom: 6 }}>
              <span style={{ color: '#00c8ff' }}>AI CARE DECISION ADVISOR</span>
              <span style={{ color: aiPrognosisReport.riskColor, fontWeight: 'bold' }}>{aiPrognosisReport.riskLevel}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#e0eaff', marginBottom: 4 }}>
              Prognosis: {aiPrognosisReport.condition}
            </div>
            <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.7)', margin: '4px 0 8px 0', lineHeight: 1.4 }}>
              {aiPrognosisReport.details}
            </p>
            <div style={{ fontSize: 10, color: '#00ff88', fontWeight: 'bold', marginBottom: 4 }}>RECOMMENDED PROTOCOLS:</div>
            {aiPrognosisReport.recommendations.map((rec, idx) => (
              <div key={idx} style={{ fontSize: 10, color: 'rgba(200,240,255,0.9)', paddingLeft: 8, borderLeft: `2px solid ${aiPrognosisReport.riskColor}`, marginBottom: 3 }}>
                • {rec}
              </div>
            ))}
            <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.3)', marginTop: 8, textAlign: 'right', fontFamily: "'Share Tech Mono'" }}>
              GENERATED AT {aiPrognosisReport.generatedAt}
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginTop: 8 }}>
        EC: {patient.emergencyContact}
      </div>

      {showSpecialistModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#07162c', border: '1px solid #8050ff', borderRadius: 12, padding: 24, width: 320, maxWidth: '90%' }}>
            <div style={{ fontFamily: "'Orbitron'", color: '#8050ff', fontSize: 14, marginBottom: 16 }}>REQUEST SPECIALIST CONSULT</div>
            {['Cardiology', 'Neurology', 'Trauma', 'Toxicology'].map(s => (
              <button key={s} onClick={() => handleTeleConsult(s)} style={{ width: '100%', padding: '12px', background: 'rgba(128,80,255,0.15)', border: '1px solid rgba(128,80,255,0.4)', color: '#fff', borderRadius: 6, cursor: 'pointer', marginBottom: 8, fontFamily: "'Orbitron'", fontSize: 12 }}>
                {s.toUpperCase()} SPECIALIST
              </button>
            ))}
            <button onClick={() => setShowSpecialistModal(false)} style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, marginTop: 8 }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {showPrescribeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.85)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#0a1526', border: '1px solid #ff66ff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 0 35px rgba(255,102,255,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,102,255,0.2)', paddingBottom: 10 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff66ff', fontWeight: 700, letterSpacing: '0.1em' }}>💊 DISCHARGE & PRESCRIPTION ROUTING</div>
              <button onClick={() => setShowPrescribeModal(false)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            
            <form onSubmit={handlePrescribeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>DIAGNOSIS / INDICATIONS</label>
                <input
                  type="text"
                  value={rxDiagnosis}
                  onChange={e => setRxDiagnosis(e.target.value)}
                  placeholder="e.g. Acute Coronary Syndrome (ACS) post-triage"
                  required
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,102,255,0.2)', borderRadius: 6, color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>MEDICATIONS</label>
                  <button
                    type="button"
                    onClick={() => setRxMedications([...rxMedications, { name: '', dosage: '', instructions: '' }])}
                    style={{ background: 'rgba(255,102,255,0.1)', border: '1px solid rgba(255,102,255,0.3)', color: '#ff66ff', fontSize: 9, fontFamily: "'Orbitron'", padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
                  >
                    + ADD MED
                  </button>
                </div>

                {rxMedications.map((med, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Medication name"
                      value={med.name}
                      required
                      onChange={e => {
                        const updated = [...rxMedications];
                        updated[index].name = e.target.value;
                        setRxMedications(updated);
                      }}
                      style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#fff', fontSize: 11 }}
                    />
                    <input
                      type="text"
                      placeholder="Dosage"
                      value={med.dosage}
                      required
                      onChange={e => {
                        const updated = [...rxMedications];
                        updated[index].dosage = e.target.value;
                        setRxMedications(updated);
                      }}
                      style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#fff', fontSize: 11 }}
                    />
                    <input
                      type="text"
                      placeholder="Instructions"
                      value={med.instructions}
                      required
                      onChange={e => {
                        const updated = [...rxMedications];
                        updated[index].instructions = e.target.value;
                        setRxMedications(updated);
                      }}
                      style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#fff', fontSize: 11 }}
                    />
                    {rxMedications.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRxMedications(rxMedications.filter((_, i) => i !== index))}
                        style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 16, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>CLINICAL NOTES & DISCHARGE DIRECTIONS</label>
                <textarea
                  value={rxNotes}
                  onChange={e => setRxNotes(e.target.value)}
                  placeholder="Additional observations, dietary restrictions, or emergency red flags..."
                  rows={3}
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,102,255,0.2)', borderRadius: 6, color: '#fff', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>RECOMMENDED FOLLOW-UP DATE</label>
                <input
                  type="date"
                  value={rxFollowUpDate}
                  onChange={e => setRxFollowUpDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,102,255,0.2)', borderRadius: 6, color: '#fff', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowPrescribeModal(false)}
                  style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  style={{ flex: 2, padding: 12, background: '#ff66ff', border: 'none', borderRadius: 8, color: '#000', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, boxShadow: '0 0 20px rgba(255,102,255,0.3)' }}
                >
                  DISPATCH & SYNC Rx
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAbdmModal && (
        <AbdmConnectModal
          patient={patient}
          onClose={() => setShowAbdmModal(false)}
          onLinked={(abhaProfile) => {
            setAbdmLinked(true);
            setPatient(prev => ({ ...prev, ...abhaProfile }));
            if (activeMissionId && socket) {
              socket.emit('patient-data', { reqId: activeMissionId, ...abhaProfile, isVerified: true });
            }
          }}
        />
      )}
      {alertData && <CustomAlert title={alertData.title} message={alertData.message} onClose={() => setAlertData(null)} />}
    </div>
  );
}

/* ─── Hospital Readiness Panel ────────────────────────────────────────────── */
function ResourcePanel({ socket, bedsList, setBedsList, hospitalId }) {
  const [resources, setResources] = useState({
    otPrepared: false,
    ventilatorReady: false,
    cardiologistAssigned: false,
    bloodBankAlerted: false,
  });

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => setResources(data);
    socket.on('resources-update', handler);
    return () => socket.off('resources-update', handler);
  }, [socket]);

  const toggle = (key) => {
    const updated = { ...resources, [key]: !resources[key] };
    setResources(updated);
    if (socket) socket.emit('resources-update', updated);
  };

  const items = [
    { key: 'otPrepared', label: 'OT PREPARED', icon: '🔪', desc: 'Operation theater ready' },
    { key: 'ventilatorReady', label: 'VENTILATOR READY', icon: '🫁', desc: 'Mechanical ventilator standby' },
    { key: 'cardiologistAssigned', label: 'CARDIOLOGIST ON CALL', icon: '🫀', desc: 'Specialist assigned & alerted' },
    { key: 'bloodBankAlerted', label: 'BLOOD BANK ALERTED', icon: '🩸', desc: 'Cross-match initiated' },
  ];

  const readyCount = Object.values(resources).filter(Boolean).length;

  const defaultBeds = [
    { id: 1, status: 'RESERVED', label: 'Bed 01' },
    { id: 2, status: 'AVAILABLE', label: 'Bed 02' },
    { id: 3, status: 'OCCUPIED', label: 'Bed 03' },
    { id: 4, status: 'AVAILABLE', label: 'Bed 04' },
    { id: 5, status: 'AVAILABLE', label: 'Bed 05' },
    { id: 6, status: 'OCCUPIED', label: 'Bed 06' },
    { id: 7, status: 'AVAILABLE', label: 'Bed 07' },
    { id: 8, status: 'AVAILABLE', label: 'Bed 08' },
    { id: 9, status: 'OCCUPIED', label: 'Bed 09' },
    { id: 10, status: 'AVAILABLE', label: 'Bed 10' },
    { id: 11, status: 'AVAILABLE', label: 'Bed 11' },
    { id: 12, status: 'AVAILABLE', label: 'Bed 12' }
  ];

  const activeBeds = bedsList && bedsList.length > 0 ? bedsList : defaultBeds;

  const handleBedClick = async (bed) => {
    const nextStatus = bed.status === 'AVAILABLE' ? 'RESERVED' : bed.status === 'RESERVED' ? 'OCCUPIED' : 'AVAILABLE';
    const updatedBeds = activeBeds.map(b => b.id === bed.id ? { ...b, status: nextStatus } : b);
    
    if (setBedsList) setBedsList(updatedBeds);
    showAlert(`Bed ${bed.id} status updated to ${nextStatus}.`);

    if (hospitalId) {
      const token = sessionStorage.getItem('rescuelink_token');
      try {
        await fetch(`/api/hospitals/${hospitalId}/beds`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ beds: updatedBeds })
        });
      } catch (err) {
        console.error('Failed to sync beds status to DB:', err);
      }
    }
  };

  return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.12)',
      borderRadius: 10, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
          HOSPITAL READINESS
        </div>
        <div style={{
          fontFamily: "'Share Tech Mono'", fontSize: 13,
          color: readyCount === 4 ? '#00ff88' : readyCount > 0 ? '#ffb800' : 'rgba(160,200,255,0.4)',
        }}>
          {readyCount}/4 READY
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {items.map(({ key, label, icon, desc }) => (
          <div
            key={key}
            onClick={() => toggle(key)}
            style={{
              padding: '12px',
              background: resources[key] ? 'rgba(0,255,100,0.1)' : 'rgba(0,200,255,0.04)',
              border: `1px solid ${resources[key] ? 'rgba(0,255,100,0.4)' : 'rgba(0,200,255,0.12)'}`,
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: resources[key] ? '#00ff88' : 'rgba(160,200,255,0.5)', letterSpacing: '0.05em', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.35)' }}>{desc}</div>
            <div style={{ marginTop: 6, fontFamily: "'Share Tech Mono'", fontSize: 11, color: resources[key] ? '#00ff88' : 'rgba(160,200,255,0.3)' }}>
              {resources[key] ? '✓ READY' : '○ PENDING'}
            </div>
          </div>
        ))}
      </div>

      {/* Interactive ER Bed Tracker & Grid */}
      <div style={{ marginTop: 20, borderTop: '1px solid rgba(0,200,255,0.15)', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
            ER BED OCCUPANCY TRACKER
          </div>
          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color: 'rgba(160,200,255,0.5)' }}>
            12 BEDS TOTAL
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {activeBeds.map((bed) => {
            const statusColor = bed.status === 'OCCUPIED' ? '#ff4444' : bed.status === 'RESERVED' ? '#ffb800' : '#00ff88';
            return (
              <button
                key={bed.id}
                onClick={() => handleBedClick(bed)}
                style={{
                  background: 'rgba(5, 10, 30, 0.4)',
                  border: `1px solid ${statusColor}44`,
                  borderRadius: 6,
                  padding: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span style={{ fontSize: 13 }}>🛏️</span>
                <span style={{ fontSize: 9, color: '#e0eaff', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>{bed.label}</span>
                <span style={{ fontSize: 8, color: statusColor, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>{bed.status}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Chat Panel ──────────────────────────────────────────────────────────── */
function ChatPanel({ socket, messages, activeMissionId }) {
  const [msg, setMsg] = useState('');
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!msg.trim() || !socket || !activeMissionId) return;
    socket.emit('chat-message', { reqId: activeMissionId, text: msg, from: 'hospital', fromLabel: '🏥 Dr. Command' });
    setMsg('');
  };

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert("Browser does not support speech recognition.");

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      if (e.results[0].isFinal) setMsg(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const [isListening, setIsListening] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ color: 'rgba(160,200,255,0.3)', fontSize: 12, textAlign: 'center', marginTop: 20, fontFamily: "'Share Tech Mono'" }}>
            No messages yet
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 8, textAlign: m.from === 'hospital' ? 'right' : 'left' }}>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginBottom: 2, fontFamily: "'Share Tech Mono'" }}>
              {m.fromLabel}
            </div>
            <div style={{
              display: 'inline-block', padding: '8px 12px', borderRadius: 8, maxWidth: '80%',
              background: m.from === 'hospital' ? 'rgba(0,200,255,0.15)' : 'rgba(255,107,53,0.15)',
              border: m.from === 'hospital' ? '1px solid rgba(0,200,255,0.25)' : '1px solid rgba(255,107,53,0.25)',
              color: '#e0eaff', fontSize: 13,
            }}>
              {m.image && <img src={m.image} alt="Upload" style={{ width: '100%', borderRadius: 4, marginBottom: m.text ? 8 : 0 }} />}
              {m.text && <div>{m.text}</div>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 0 40px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Guide..."
            style={{
              width: '100%', background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)',
              borderRadius: 6, padding: '8px 30px 8px 10px', color: '#e0eaff', fontSize: 13,
              fontFamily: "'Rajdhani'", outline: 'none',
            }}
          />
          <button
            onClick={toggleListening}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14,
              color: isListening ? '#ff4444' : 'rgba(0,200,255,0.4)', transition: 'all 0.2s',
              animation: isListening ? 'blink 1s infinite' : 'none'
            }}
          >
            {isListening ? '🛑' : '🎤'}
          </button>
        </div>
        <button onClick={send} style={{
          background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.35)',
          borderRadius: 6, padding: '8px 12px', color: '#00c8ff',
          cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
          minWidth: '60px'
        }}>SEND</button>
      </div>
    </div>
  );
}

/* ─── Handover Report Modal ─────────────────────────────────────────────── */
function HandoverModal({ patient, vitals, notes, onClose, previousReports, onSave }) {
  const [alertData, setAlertData] = useState(null);

  if (!patient) return null;
  const triage = calculateTriage(vitals);
  const now = new Date();
  const riskScore = vitals ? Math.min(10, Math.round(
    (vitals.heartRate > 110 ? 2 : 0) + (vitals.heartRate < 50 ? 3 : 0) +
    (vitals.spo2 < 92 ? 3 : vitals.spo2 < 95 ? 1 : 0) +
    (vitals.systolic > 150 ? 2 : vitals.systolic < 90 ? 3 : 0) +
    (vitals.temperature > 38.5 ? 1 : 0) + (vitals.respRate > 25 ? 1 : vitals.respRate < 12 ? 2 : 0)
  )) : 0;
  const sectionStyle = { fontFamily: "'Orbitron'", fontSize: 12, letterSpacing: '0.1em', marginBottom: 8 };
  const cardBg = { background: 'rgba(0,200,255,0.05)', padding: 16, borderRadius: 8, border: '1px solid rgba(0,200,255,0.1)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.9)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#0a1526', border: '1px solid #00c8ff', borderRadius: 12, width: '90%', maxWidth: 900, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0,200,255,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,200,255,0.03)' }}>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em' }}>🏥 COMPREHENSIVE PATIENT HANDOVER REPORT</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>AI-GENERATED CLINICAL DOCUMENT • {now.toLocaleString()} • REF: HR-{now.getTime().toString(36).toUpperCase()}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 1. Patient Demographics */}
          <div>
            <div style={{ ...sectionStyle, color: '#88ff88' }}>📋 1. PATIENT DEMOGRAPHICS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, ...cardBg }}>
              <div>
                <span style={{ color: 'rgba(160,200,255,0.5)' }}>Full Name:</span> {patient.name}
                {patient.isVerified && (
                  <span style={{
                    marginLeft: 8, background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid #00ff88',
                    borderRadius: 12, padding: '2px 6px', fontSize: 9, fontFamily: "'Orbitron'",
                    display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 0 10px rgba(0,255,136,0.2)'
                  }}>
                    <span style={{ fontSize: 10 }}>✅</span> ABDM VERIFIED
                  </span>
                )}
              </div>
              <div><span style={{ color: 'rgba(160,200,255,0.5)' }}>Patient ID:</span> {patient?.id}</div>
              <div><span style={{ color: 'rgba(160,200,255,0.5)' }}>Age:</span> {patient.age} years</div>
              <div><span style={{ color: 'rgba(160,200,255,0.5)' }}>Blood Group:</span> <span style={{ color: '#ff4444', fontWeight: 700 }}>{patient.bloodGroup}</span></div>
              <div><span style={{ color: 'rgba(160,200,255,0.5)' }}>Risk Level:</span> <span style={{ color: '#ffb800', fontWeight: 700 }}>{patient.riskLevel || 'HIGH'}</span></div>
              <div><span style={{ color: 'rgba(160,200,255,0.5)' }}>Emergency Contact:</span> {patient.emergencyContact}</div>
            </div>
          </div>

          {/* 2. Triage & Risk Assessment */}
          <div>
            <div style={{ ...sectionStyle, color: '#ff6b6b' }}>🚨 2. TRIAGE CLASSIFICATION & RISK SCORE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...cardBg, borderLeft: `4px solid ${triage.color}`, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', marginBottom: 4 }}>TRIAGE LEVEL</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: triage.color, fontFamily: "'Orbitron'" }}>{triage.label}</div>
              </div>
              <div style={{ ...cardBg, borderLeft: '4px solid #ff6b6b', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', marginBottom: 4 }}>SEVERITY RISK SCORE</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: riskScore >= 7 ? '#ff4444' : riskScore >= 4 ? '#ffb800' : '#00ff88', fontFamily: "'Orbitron'" }}>{riskScore}/10</div>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', marginTop: 4 }}>{riskScore >= 7 ? 'CRITICAL — IMMEDIATE INTERVENTION' : 'ELEVATED — CLOSE MONITORING'}</div>
              </div>
            </div>
          </div>

          {/* 3. AI Clinical Summary */}
          <div>
            <div style={{ ...sectionStyle, color: '#ffb800' }}>🤖 3. AI-GENERATED CLINICAL ASSESSMENT</div>
            <div style={{ background: 'rgba(255,180,0,0.08)', borderLeft: '4px solid #ffb800', padding: 20, borderRadius: '0 8px 8px 0', fontSize: 14, lineHeight: 1.8, color: 'rgba(220,230,255,0.9)' }}>
              <strong>Primary Presentation:</strong> Patient {patient.name} (Age: {patient.age}, Blood Type: {patient.bloodGroup}) was transported via emergency ambulance service to the receiving facility.
              {vitals ? ` At the time of handover, the patient's vital signs showed a heart rate of ${vitals.heartRate} bpm (${vitals.heartRate > 100 ? 'tachycardic' : vitals.heartRate < 60 ? 'bradycardic' : 'within normal range'}), oxygen saturation of ${vitals.spo2}% (${vitals.spo2 < 92 ? 'CRITICALLY LOW — supplemental O2 required' : vitals.spo2 < 95 ? 'borderline — monitor closely' : 'adequate'}), blood pressure of ${vitals.systolic}/${vitals.diastolic} mmHg (${vitals.systolic > 140 ? 'hypertensive' : vitals.systolic < 90 ? 'hypotensive' : 'normotensive'}), respiratory rate of ${vitals.respRate} breaths/min, core temperature of ${vitals.temperature}°C, and blood glucose of ${vitals.bloodGlucose} mg/dL.` : ' Vitals data pending from ambulance unit.'}
              <br /><br />
              <strong>Clinical Interpretation:</strong> Based on the automated AI triage algorithm, the patient has been classified as <span style={{ color: triage.color, fontWeight: 700 }}>{triage.label}</span> with a computed severity risk score of {riskScore}/10.
              {vitals && vitals.spo2 < 94 ? ' The low SpO2 reading suggests possible respiratory compromise or cardiovascular insufficiency. Immediate arterial blood gas (ABG) analysis and chest imaging are recommended.' : ''}
              {vitals && vitals.heartRate > 110 ? ' Persistent tachycardia detected — consider 12-lead ECG, cardiac enzyme panel (troponin, CK-MB), and echocardiography evaluation.' : ''}
              {vitals && vitals.systolic > 150 ? ' Elevated systolic blood pressure warrants antihypertensive protocol initiation and continuous hemodynamic monitoring.' : ''}
              {vitals && vitals.temperature > 38.5 ? ' Pyrexia noted — blood cultures and empirical antimicrobial therapy should be considered pending infectious workup.' : ''}
              <br /><br />
              <strong>Known Allergies:</strong> {patient.allergies?.length > 0 ? patient.allergies.join(', ') + '. ALL CARE TEAMS MUST BE ALERTED.' : 'No known drug allergies (NKDA).'}
              <br /><br />
              <strong>Transit Summary:</strong> {notes.length > 0 ? `${notes.length} incident notes were recorded by the paramedic during transit. Field observations indicate active monitoring throughout transport. Priority attention is recommended based on the clinical acuity documented in the field reports.` : 'No critical incidents reported by the paramedic team during transit. Patient was stable throughout transport with continuous vitals monitoring.'}
              <br /><br />
              <strong>Medical History Considerations:</strong> {patient.medicalHistory?.length > 0 ? patient.medicalHistory.join('; ') + '. These pre-existing conditions should be factored into the treatment plan and medication interactions.' : 'No significant past medical history on file.'}
            </div>
          </div>

          {/* Incident Commander Console */}
          <MCITriageCommander />

          {/* Resource Bottleneck Forecaster */}
          <ResourceBottleneckPredictor />

          {/* Interactive 3D Resuscitation Avatar */}
          <ThreeDResuscitationMonitor vitals={vitals} />

          {/* 4. Vitals Snapshot */}
          <div>
            <div style={{ ...sectionStyle, color: '#00c8ff' }}>📈 4. LATEST VITALS SNAPSHOT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {vitals ? [
                { k: 'heartRate', label: 'HEART RATE', unit: 'bpm', warn: vitals.heartRate > 110 || vitals.heartRate < 50 },
                { k: 'spo2', label: 'SpO2', unit: '%', warn: vitals.spo2 < 94 },
                { k: 'systolic', label: 'SYSTOLIC BP', unit: 'mmHg', warn: vitals.systolic > 150 },
                { k: 'diastolic', label: 'DIASTOLIC BP', unit: 'mmHg', warn: false },
                { k: 'respRate', label: 'RESP RATE', unit: 'br/min', warn: vitals.respRate > 25 || vitals.respRate < 12 },
                { k: 'temperature', label: 'TEMPERATURE', unit: '°C', warn: vitals.temperature > 38.5 },
                { k: 'bloodGlucose', label: 'BLOOD GLUCOSE', unit: 'mg/dL', warn: vitals.bloodGlucose > 180 || vitals.bloodGlucose < 70 },
              ].map(({ k, label, unit, warn }) => (
                <div key={k} style={{ ...cardBg, borderLeft: warn ? '3px solid #ff4444' : '3px solid rgba(0,200,255,0.2)' }}>
                  <div style={{ fontSize: 10, color: warn ? '#ff6b6b' : 'rgba(160,200,255,0.5)' }}>{label}</div>
                  <div style={{ fontSize: 20, color: warn ? '#ff4444' : '#e0eaff', fontFamily: "'Share Tech Mono'", fontWeight: 700 }}>{vitals[k]} <span style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)' }}>{unit}</span></div>
                </div>
              )) : <div style={{ color: 'rgba(255,255,255,0.3)', gridColumn: '1/-1', textAlign: 'center', padding: 20 }}>No vitals recorded</div>}
            </div>
          </div>

          {/* 5. Treatment Recommendations */}
          <div>
            <div style={{ ...sectionStyle, color: '#00ff88' }}>💊 5. AI TREATMENT RECOMMENDATIONS</div>
            <div style={{ ...cardBg, borderLeft: '4px solid #00ff88' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, lineHeight: 1.6 }}>
                {vitals && vitals.spo2 < 94 && <div>• <strong style={{ color: '#ff6b6b' }}>URGENT:</strong> Initiate supplemental oxygen via non-rebreather mask at 15L/min. Target SpO2 ≥ 95%.</div>}
                {vitals && vitals.heartRate > 110 && <div>• <strong style={{ color: '#ffb800' }}>CARDIAC:</strong> Obtain 12-lead ECG immediately. Draw troponin I and CK-MB levels. Consider beta-blocker if no contraindications.</div>}
                {vitals && vitals.systolic > 150 && <div>• <strong style={{ color: '#ffb800' }}>HYPERTENSION:</strong> Administer IV labetalol 20mg slow push. Recheck BP in 10 minutes. Target MAP reduction of 20%.</div>}
                {vitals && vitals.temperature > 38.5 && <div>• <strong style={{ color: '#ffb800' }}>FEVER:</strong> Obtain blood cultures x2, urinalysis, and chest X-ray. Consider empirical antibiotics per hospital protocol.</div>}
                {vitals && vitals.bloodGlucose > 180 && <div>• <strong style={{ color: '#ffb800' }}>HYPERGLYCEMIA:</strong> Initiate insulin sliding scale protocol. Check HbA1c if not recently obtained.</div>}
                <div>• Establish two large-bore IV access (18G or larger). Initiate 0.9% NaCl at 125mL/hr unless contraindicated.</div>
                <div>• Continuous cardiac monitoring with pulse oximetry. Vitals q15 minutes until stable, then q30 minutes.</div>
                <div>• {patient.allergies?.length > 0 ? `⚠️ ALLERGY ALERT: Patient is allergic to ${patient.allergies.join(', ')}. Ensure allergy band placed and all medications cross-checked.` : 'No known drug allergies — standard formulary protocols apply.'}</div>
                <div>• Notify attending physician and specialist on call. Prepare for possible admission to {vitals && (vitals.heartRate > 110 || vitals.spo2 < 92) ? 'ICU/CCU' : 'acute care ward'}.</div>
              </div>
            </div>
          </div>

          {/* 6. Current Medications */}
          {patient.currentMedications?.length > 0 && (
            <div>
              <div style={{ ...sectionStyle, color: '#aa88ff' }}>💊 6. CURRENT MEDICATIONS</div>
              <div style={{ ...cardBg }}>
                {patient.currentMedications.map((m, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: i < patient.currentMedications.length - 1 ? '1px solid rgba(0,200,255,0.08)' : 'none', fontSize: 13 }}>💊 {m}</div>
                ))}
                <div style={{ marginTop: 10, fontSize: 11, color: '#ffb800', fontStyle: 'italic' }}>⚠ Verify all current medications for potential interactions before administering new treatments.</div>
              </div>
            </div>
          )}

          {/* 7. Paramedic Field Notes */}
          {notes.length > 0 && (
            <div>
              <div style={{ ...sectionStyle, color: '#ff6b6b' }}>📝 7. PARAMEDIC FIELD NOTES & OBSERVATIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.map((n, i) => (
                  <div key={i} style={{ background: 'rgba(255,100,100,0.05)', padding: 12, borderRadius: 6, borderLeft: '2px solid #ff6b6b' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,100,100,0.5)', fontFamily: "'Share Tech Mono'" }}>{new Date(n.timestamp).toLocaleTimeString()}</span><br />
                    {n.note}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. Previous Hospital Reports (for rerouted patients) */}
          {previousReports && previousReports.length > 0 && (
            <div>
              <div style={{ ...sectionStyle, color: '#ff88aa' }}>🔄 8. PRIOR HOSPITAL REPORTS (REROUTED PATIENT)</div>
              <div style={{ background: 'rgba(255,100,150,0.06)', border: '1px solid rgba(255,100,150,0.2)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#ff88aa', marginBottom: 10, fontStyle: 'italic' }}>This patient was previously routed to another facility. The following reports were generated prior to rerouting:</div>
                {previousReports.map((r, i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: 14, borderRadius: 6, marginBottom: 10, borderLeft: '3px solid #ff88aa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ff88aa' }}>🏥 {r.hospitalName}</span>
                      <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>{r.timestamp}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(220,230,255,0.8)' }}>
                      <div>Triage at time of report: <span style={{ color: r.triageColor, fontWeight: 700 }}>{r.triageLabel}</span></div>
                      <div>Vitals recorded: HR {r.vitals?.heartRate || '--'} bpm, SpO2 {r.vitals?.spo2 || '--'}%, BP {r.vitals?.systolic || '--'}/{r.vitals?.diastolic || '--'} mmHg</div>
                      <div>Notes: {r.notes || 'No additional observations.'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. Transport Timeline */}
          <div>
            <div style={{ ...sectionStyle, color: 'rgba(160,200,255,0.6)' }}>🕐 {previousReports?.length > 0 ? '9' : '8'}. TRANSPORT TIMELINE</div>
            <div style={{ ...cardBg, display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
              <div><div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>DISPATCH TIME</div><div style={{ fontFamily: "'Share Tech Mono'", fontSize: 14, color: '#00c8ff' }}>{new Date(now.getTime() - 900000).toLocaleTimeString()}</div></div>
              <div style={{ color: 'rgba(0,200,255,0.3)', fontSize: 20 }}>→</div>
              <div><div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>EN ROUTE</div><div style={{ fontFamily: "'Share Tech Mono'", fontSize: 14, color: '#ffb800' }}>{new Date(now.getTime() - 600000).toLocaleTimeString()}</div></div>
              <div style={{ color: 'rgba(0,200,255,0.3)', fontSize: 20 }}>→</div>
              <div><div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>HANDOVER</div><div style={{ fontFamily: "'Share Tech Mono'", fontSize: 14, color: '#00ff88' }}>{now.toLocaleTimeString()}</div></div>
            </div>
          </div>

          {/* Legal Disclaimer */}
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.25)', lineHeight: 1.5, padding: '10px 0', borderTop: '1px solid rgba(0,200,255,0.08)' }}>
            DISCLAIMER: This report was auto-generated by the RescueLink AI Clinical Assistant based on real-time telemetry data received from the ambulance unit. All treatment recommendations are advisory and must be validated by qualified medical personnel. Clinical decisions remain the responsibility of the treating physician. Document generated in compliance with emergency medical services reporting standards.
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)' }}>
          <button onClick={() => {
            const doc = new jsPDF();

            // Header banner
            doc.setFillColor(7, 22, 44);
            doc.rect(0, 0, 210, 35, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont("Helvetica", "bold");
            doc.setFontSize(18);
            doc.text("RESCUELINK EMERGENCY CLINICAL HANDOVER", 15, 22);

            doc.setFontSize(10);
            doc.setFont("Helvetica", "normal");
            doc.text(`DATE/TIME: ${now.toLocaleString()}`, 15, 29);
            doc.text(`PATIENT ID: ${patient?.id || 'N/A'}`, 140, 29);

            // Demographics Section
            doc.setFontSize(12);
            doc.setFont("Helvetica", "bold");
            doc.setTextColor(7, 22, 44);
            doc.text("1. Patient Demographics", 15, 48);

            doc.line(15, 50, 195, 50);
            doc.setFontSize(10);
            doc.setFont("Helvetica", "normal");
            doc.text(`Full Name: ${patient.name}`, 15, 57);
            doc.text(`Age: ${patient.age} years`, 15, 63);
            doc.text(`Blood Group: ${patient.bloodGroup}`, 15, 69);
            doc.text(`Emergency Contact: ${patient.emergencyContact}`, 100, 57);
            doc.text(`Allergies: ${patient.allergies?.join(', ') || 'No Known Allergies'}`, 100, 63);
            doc.text(`ABDM Verification Status: ABDM VERIFIED`, 100, 69);

            // Triage Evaluation
            doc.setFontSize(12);
            doc.setFont("Helvetica", "bold");
            doc.text("2. Triage & Severity Assessment", 15, 82);
            doc.line(15, 84, 195, 84);

            doc.setFontSize(10);
            doc.setFont("Helvetica", "normal");
            doc.text(`Triage Category: ${triage.label.toUpperCase()}`, 15, 91);
            doc.text(`Early Warning Risk Score: ${riskScore} / 10`, 100, 91);

            // Vitals Table
            doc.setFontSize(12);
            doc.setFont("Helvetica", "bold");
            doc.text("3. Physiological Vital Signs Snapshot", 15, 104);
            doc.line(15, 106, 195, 106);

            doc.setFontSize(10);
            doc.setFont("Helvetica", "normal");
            let yPos = 113;
            const vitalsList = [
              { label: "Heart Rate", val: `${vitals?.heartRate || '--'} bpm` },
              { label: "Blood Oxygen (SpO2)", val: `${vitals?.spo2 || '--'}%` },
              { label: "Blood Pressure", val: `${vitals?.systolic || '--'}/${vitals?.diastolic || '--'} mmHg` },
              { label: "Core Temperature", val: `${vitals?.temperature || '--'} °C` },
              { label: "Blood Glucose", val: `${vitals?.bloodGlucose || '--'} mg/dL` }
            ];

            vitalsList.forEach(v => {
              doc.text(v.label, 15, yPos);
              doc.text(v.val, 100, yPos);
              yPos += 6;
            });

            // AI Clinical Summary
            doc.setFontSize(12);
            doc.setFont("Helvetica", "bold");
            doc.text("4. Attending AI Clinical Summary", 15, 153);
            doc.line(15, 155, 195, 155);

            doc.setFontSize(9);
            doc.setFont("Helvetica", "normal");

            const summaryString = `Primary Assessment: Patient ${patient.name} presented to receiving emergency team. Real-time telemetry calculations indicate ${triage.label.toUpperCase()} acuity level. Recommended treatment protocols: establishment of vascular access, active continuous hemodynamic recording, and immediate specialist review.`;
            const splitSummary = doc.splitTextToSize(summaryString, 180);
            doc.text(splitSummary, 15, 162);

            // Recommendations
            doc.setFontSize(12);
            doc.setFont("Helvetica", "bold");
            doc.text("5. Recommended Emergency Protocols", 15, 190);
            doc.line(15, 192, 195, 192);

            doc.setFontSize(9);
            doc.setFont("Helvetica", "normal");
            let recY = 199;
            const recommendationsList = [
              "- Establish large-bore IV access (18G or larger).",
              "- Continuous cardiac oximetry and vitals updates.",
              "- Prepare for hospital admission workflow."
            ];
            recommendationsList.forEach(r => {
              doc.text(r, 15, recY);
              recY += 6;
            });

            // Legal Disclaimer
            doc.setFontSize(7);
            doc.setFont("Helvetica", "oblique");
            doc.setTextColor(120, 120, 120);
            doc.text("DISCLAIMER: Generated by RescueLink AI. Advisory only. Attending emergency physician signature required.", 15, 280);

            doc.save(`HANDOVER_REPORT_${patient.id || 'PATIENT'}.pdf`);
          }} style={{
            background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)', padding: '10px 24px', borderRadius: 6,
            fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>📥 DOWNLOAD PDF</button>
          <button onClick={() => {
            const reportObj = {
              id: patient?.id,
              name: patient.name,
              time: now.toLocaleString(),
              triage: triage.label,
              color: triage.color,
              risk: riskScore
            };
            setAlertData({
              title: "✅ EMR SYNC SUCCESSFUL",
              message: `Patient ${patient.name} record successfully transmitted to Hospital EMR (Epic/Cerner Protocol).`
            });
            onSave(reportObj);
            setTimeout(() => onClose(), 2500); // Auto close after 2.5s
          }} style={{
            background: '#00c8ff', color: '#000', border: 'none', padding: '10px 24px', borderRadius: 6,
            fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>SAVE TO EMR</button>

        </div>
      </div>
      {alertData && <CustomAlert title={alertData.title} message={alertData.message} onClose={() => setAlertData(null)} />}
    </div>
  );
}

/* ─── Hospital Credentials DB (Demo) ─────────────────────────────────── */
const HOSPITAL_CREDENTIALS = [
  { hospitalId: 'HOSP-001', password: 'rescue123', name: 'Manipal Global Trauma Center', adminName: 'Dr. Sarah Mitchell', internalId: 'manipal-trauma', lat: 12.9592, lng: 77.6444 },
  { hospitalId: 'HOSP-002', password: 'rescue123', name: "St. John's Medical College", adminName: 'Dr. James Wilson', internalId: 'st-johns', lat: 12.9344, lng: 77.6111 },
  { hospitalId: 'HOSP-003', password: 'rescue123', name: 'Apollo Hospital Bengaluru', adminName: 'Dr. Emily Chen', internalId: 'apollo-bengaluru', lat: 12.8958, lng: 77.5983 },
  { hospitalId: 'HOSP-004', password: 'rescue123', name: 'Metropolitan Multispeciality', adminName: 'Dr. David Foster', internalId: 'metro-multi', lat: 12.9716, lng: 77.5946 },
  { hospitalId: 'HOSP-005', password: 'rescue123', name: 'Cardiac & Neuro Institute', adminName: 'Dr. Maria Garcia', internalId: 'cardiac-neuro', lat: 13.0116, lng: 77.5501 },
];

export default function HospitalDashboard({ socket, connected, onLogout, onSwitchRole, onShowSecurity }) {
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  const [authHospital, setAuthHospital] = useState(() => {
    // If we have a logged-in user in sessionStorage, use their details
    const token = sessionStorage.getItem('rescuelink_token');
    const userStr = sessionStorage.getItem('rescuelink_user');
    if (token && userStr) {
      const user = JSON.parse(userStr);
      if (user.role === 'doctor' || user.role === 'hospital_admin') {
        return {
          hospitalId: user.hospital_id || 'HOSP-001',
          name: user.name || 'Manipal Global Trauma Center',
          adminName: user.name || 'Dr. Command',
          internalId: (user.hospital_id || 'manipal-trauma').toLowerCase(),
          lat: user.lat || 12.9592,
          lng: user.lng || 77.6444,
          ...user
        };
      }
    }
    const saved = localStorage.getItem('hospital_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.hospitalId && parsed.hospitalId.includes('@')) {
        localStorage.removeItem('hospital_auth');
        return null;
      }
      return parsed;
    }
    // Default fallback so we don't have null authHospital when bypassing the login screen
    return {
      hospitalId: 'HOSP-001',
      name: 'Manipal Global Trauma Center',
      adminName: 'Dr. Sarah Mitchell',
      internalId: 'manipal-trauma',
      lat: 12.9592,
      lng: 77.6444
    };
  });

  useEffect(() => {
    if (authHospital) {
      localStorage.setItem('hospital_auth', JSON.stringify(authHospital));
    } else {
      localStorage.removeItem('hospital_auth');
    }
  }, [authHospital]);
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  // ANCHOR FIX: Hospital registers itself at its real GPS coordinates, not a hardcoded position.
  // This means a hospital in London will show on the London map, not in Pune.
  const [hospitalGps, setHospitalGps] = useState(null);
  const [incidentLocation, setIncidentLocation] = useState(null); // Where the SOS was triggered
  const [activeTab, setActiveTab] = useState('triage'); // triage, er_queue, blood_bank, insurance, mass_casualty
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fhirPreviewData, setFhirPreviewData] = useState(null);
  useEffect(() => {
    const fetchIpLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
          return { lat: data.latitude, lng: data.longitude };
        }
      } catch (err) { console.warn('IP Location failed', err); }
      return null;
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setHospitalGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        async () => {
          const loc = await fetchIpLocation();
          setHospitalGps(loc);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      fetchIpLocation().then(loc => setHospitalGps(loc));
    }
  }, []);

  // Sync tab state with URL hash (e.g. #hospital/settings, #hospital/triage)
  useEffect(() => {
    const syncHash = () => {
      const parts = window.location.hash.split('/');
      if (parts[0] === '#hospital' && parts[1]) {
        setActiveTab(parts[1]);
      }
    };
    window.addEventListener('hashchange', syncHash);
    syncHash();
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = `hospital/${tabId}`;
  };

  const [checklist, setChecklist] = useState({});
  const [trafficIncidents, setTrafficIncidents] = useState({});

  const MAX_HISTORY = 60; // 1 minute of history at 1Hz
  const [icuBeds, setIcuBeds] = useState(10);

  useEffect(() => {
    if (socket && isAuthenticated) {
      socket.emit('update-hospital-inventory', { beds: icuBeds });
    }
  }, [icuBeds, socket, isAuthenticated]);

  const [chartData, setChartData] = useState([]);

  const [latestVitals, setLatestVitals] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [patient, setPatient] = useState(null);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [resourceLocks, setResourceLocks] = useState({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
  const [incomingLockRequest, setIncomingLockRequest] = useState(null);
  const [consentStatus, setConsentStatus] = useState(''); // '', 'PENDING', 'APPROVED', 'DENIED'
  const lastAlertedIdRef = useRef(null);
  const lastVitalsBeepTimeRef = useRef(0);
  const [showDocAssignModal, setShowDocAssignModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hardResetConfirm, setHardResetConfirm] = useState(false);
  const [switchProfileConfirm, setSwitchProfileConfirm] = useState(false);
  const [attendingDocName, setAttendingDocName] = useState('');
  const [attendingDocSpecialty, setAttendingDocSpecialty] = useState('');
  const [attendingNurses, setAttendingNurses] = useState('');

  const [activeMissions, setActiveMissions] = useState({}); // { [reqId]: { patient, vitals, messages, notes, route, history } }
  const [greenCorridorActive, setGreenCorridorActive] = useState(false);
  const [standbyAlerts, setStandbyAlerts] = useState([]);
  const ignoredMissionsRef = useRef(new Set());

  // High-reliability helper to update a specific mission's data
  const updateMissionData = useCallback((reqId, updates) => {
    setActiveMissions(prev => {
      const existing = prev[reqId] || {
        id: reqId,
        patient: null,
        vitals: null,
        messages: [],
        incidentNotes: [],
        routePath: null,
        chartData: []
      };
      return {
        ...prev,
        [reqId]: { ...existing, ...updates }
      };
    });
  }, []);
  const [manualRecoveryId, setManualRecoveryId] = useState('');
  const [ambulanceSocketId, setAmbulanceSocketId] = useState(null);
  const [isCritical, setIsCritical] = useState(false);
  const isCriticalRef = useRef(false);
  useEffect(() => { isCriticalRef.current = isCritical; }, [isCritical]);
  const [critReasons, setCritReasons] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [incidentNotes, setIncidentNotes] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [aiPrognosisReport, setAiPrognosisReport] = useState(null);
  const [generatingPrognosis, setGeneratingPrognosis] = useState(false);

  // Fleet Visibility States
  const [ambulances, setAmbulances] = useState({});
  const [networkHospitals, setNetworkHospitals] = useState({});
  const [showArchives, setShowArchives] = useState(false);
  const [isAuthInModal, setIsAuthInModal] = useState(false); // New state for modal login
  const [showManualLogin, setShowManualLogin] = useState(false);

  // Doctors and Beds management states
  const [activeHospitalId, setActiveHospitalId] = useState(null); // FIX C6: No longer relies on hardcoded HOSPITALS array - moved before useEffect that depends on it
  const [bedsList, setBedsList] = useState([]);
  const [doctorsList, setDoctorsList] = useState([]);
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorEmail, setNewDoctorEmail] = useState('');
  const [newDoctorPassword, setNewDoctorPassword] = useState('');
  const [newDoctorSpecialty, setNewDoctorSpecialty] = useState('');
  const [newDoctorMobile, setNewDoctorMobile] = useState('');
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);

  useEffect(() => {
    const hospId = authHospital?.hospitalId || activeHospitalId;
    if (hospId && isAuthenticated) {
      const token = sessionStorage.getItem('rescuelink_token');
      // Fetch Beds
      fetch(`/api/hospitals/${hospId}/beds`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setBedsList(data); })
        .catch(err => console.error('Failed to fetch beds:', err));

      // Fetch Doctors
      fetch(`/api/hospitals/${hospId}/doctors`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setDoctorsList(data); })
        .catch(err => console.error('Failed to fetch doctors:', err));
    }
  }, [authHospital, activeHospitalId, isAuthenticated]);

  const [connectedRoles, setConnectedRoles] = useState({ ambulance: 0, hospital: 0 });
  const [pendingResumeMission, setPendingResumeMission] = useState(null);
  const [aiAlert, setAiAlert] = useState(null);
  const [showHandover, setShowHandover] = useState(false);
  // activeHospitalId moved above to fix TDZ — was causing 'Cannot access Pt before initialization'
  const [isHandoverSyncing, setIsHandoverSyncing] = useState(false);
  const [requestQueue, setRequestQueue] = useState([]); // High-density scaling for city-wide infrastructure
  const [incomingRequest, setIncomingRequest] = useState(null); // The one currently being viewed in modal
  const [insurancePreAuth, setInsurancePreAuth] = useState(null);
  const [reservationLock, setReservationLock] = useState(null);
  const [oxygenWarning, setOxygenWarning] = useState(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);

  // --- HUGE CONNECTIONS: Auto-Next Logic ---
  useEffect(() => {
    // If we're not busy with a mission or a modal, and there's someone in the queue...
    if (!activeMissionId && !incomingRequest && requestQueue.length > 0) {
      setIncomingRequest(requestQueue[0]);
    }
  }, [requestQueue, incomingRequest, activeMissionId]);
  const [routePath, setRoutePath] = useState(null);
  const [previousReports, setPreviousReports] = useState([]);
  const [admissionStep, setAdmissionStep] = useState(0);
  const [readyServices, setReadyServices] = useState({ otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: false });
  const [trafficDelay, setTrafficDelay] = useState(false);
  const [arrivedAtUser, setArrivedAtUser] = useState(false);
  const [rerouteAlert, setRerouteAlert] = useState(null);
  const [autoSync, setAutoSync] = useState(true); // Toggle for auto-authentication
  const [advanceNotice, setAdvanceNotice] = useState(null); // Stage 1 alert state
  const autoSyncRef = useRef(true);
  const dismissedRef = useRef(new Set()); // HIGH-RELIABILITY: Ref prevents stale state in socket listener
  useEffect(() => { autoSyncRef.current = autoSync; }, [autoSync]);
  const critTimeoutRef = useRef(null);

  useEffect(() => {
    if (incomingRequest && incomingRequest?.id === activeMissionId) {
      const ambSocket = incomingRequest.ambulanceSocket || incomingRequest.fromSocketId;
      if (ambSocket && ambSocket !== ambulanceSocketId) {
        setAmbulanceSocketId(ambSocket);
      }
    }
  }, [incomingRequest, activeMissionId, ambulanceSocketId]);


  const handleLogin = async () => {
    const rawId = loginId.trim();
    const inputId = rawId.includes('@') ? rawId.toLowerCase() : rawId.toUpperCase();
    const inputPass = loginPass.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inputId, password: inputPass, role: 'hospital' })
      });
      const data = await res.json();

      if (data.requiresMFA) {
        setMfaToken(data.mfaToken);
        setLoginError('');
        return;
      }

      if (res.ok && data.token) {
        sessionStorage.setItem('rescuelink_token', data.token);

        // Find in local registry for UI metadata or fallback to response
        const found = {
          ...(HOSPITAL_CREDENTIALS.find(c => c.hospitalId === inputId) || {
            name: data.user?.role === 'doctor' ? 'Manipal Global Trauma Center' : 'Emergency Center',
            adminName: data.user?.name || 'Dr. Command',
            internalId: (data.user?.hospital_id || inputId).toLowerCase(),
            lat: data.lat || 18.5204,
            lng: data.lng || 73.8567
          })
        };

        // Always overwrite hospitalId with the real database UUID returned by the server
        if (data.user?.hospital_id) {
          found.hospitalId = data.user.hospital_id;
        }

        setAuthHospital(found);
        setIsAuthenticated(true);
        setLoginError('');
        if (found.internalId) setActiveHospitalId(found.internalId);

        // Dynamically locate the hospital so it appears in the same city as the user for the demo
        let hospitalGps = null;
        try {
          const baseLoc = await fetchIpLocation();
          // Add deterministic small offset based on hospital ID so they don't overlap
          const hash = inputId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
          hospitalGps = {
            lat: baseLoc.lat + (hash % 10) * 0.005,
            lng: baseLoc.lng + (hash % 7) * 0.005
          };
        } catch (e) {
          hospitalGps = { lat: found.lat || data.lat, lng: found.lng || data.lng };
        }

        if (socket) socket.emit('register-hospital', {
          hospitalId: found.hospitalId,
          name: found.name,
          adminName: found.adminName,
          id: found.hospitalId,
          lat: hospitalGps ? hospitalGps.lat : (found.lat || data.lat),
          lng: hospitalGps ? hospitalGps.lng : (found.lng || data.lng),
          pos: { lat: hospitalGps ? hospitalGps.lat : (found.lat || data.lat), lng: hospitalGps ? hospitalGps.lng : (found.lng || data.lng) },
          token: data.token
        });

        // If we were in the middle of accepting an admission, complete it now
        if (incomingRequest) {
          console.log(`[AUTH] Authentication successful. Completing admission for ${incomingRequest?.id}...`);
          if (incomingRequest.fieldReport) {
            setLatestVitals(incomingRequest.fieldReport.vitals);
            setPatient(incomingRequest.patientDetails || { name: incomingRequest.fieldReport.patientName || 'Emergency Patient' });
          }
          socket.emit('hospital-response', {
            reqId: incomingRequest?.id,
            hospitalId: inputId,
            status: 'hospital_accepted',
            readyServices
          });
          setIncomingRequest(null);
          setRequestQueue(prev => prev.filter(r => r.id !== incomingRequest?.id));
          setActiveMissionId(incomingRequest?.id);
          setAmbulanceSocketId(incomingRequest.ambulanceSocket || incomingRequest.fromSocketId || incomingRequest.fromSocket);
          setAdmissionStep(0);
          setShowManualLogin(false);
          setIsAuthInModal(false);
        }
      } else {
        setLoginError(data.error || 'Invalid Hospital ID or Password');
      }
    } catch (err) {
      console.error('[AUTH FAIL]', err);
      setLoginError('Authentication Server Offline');
    }
  };

  const handleMfaSuccess = async (viewRole, token) => {
    const userStr = sessionStorage.getItem('rescuelink_user');
    const user = userStr ? JSON.parse(userStr) : {};

    sessionStorage.setItem('rescuelink_token', token);

    const finalInputId = loginId || user.hospital_id || 'HOSP-GENERIC';

    const found = {
      ...(HOSPITAL_CREDENTIALS.find(c => c.hospitalId === finalInputId) || {
        name: user.role === 'doctor' ? 'Manipal Global Trauma Center' : 'Emergency Center',
        adminName: user.name || 'Dr. Command',
        internalId: finalInputId.toLowerCase(),
        lat: user.lat || 18.5204,
        lng: user.lng || 73.8567
      })
    };

    // Always overwrite hospitalId with the real database UUID returned by the server
    if (user.hospital_id) {
      found.hospitalId = user.hospital_id;
    }

    setAuthHospital(found);
    setIsAuthenticated(true);
    setLoginError('');
    if (found.internalId) setActiveHospitalId(found.internalId);

    let hospitalGps = null;
    try {
      const baseLoc = await fetchIpLocation();
      const hash = finalInputId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      hospitalGps = {
        lat: baseLoc.lat + (hash % 10) * 0.005,
        lng: baseLoc.lng + (hash % 7) * 0.005
      };
    } catch (e) {
      hospitalGps = { lat: found.lat || user.lat, lng: found.lng || user.lng };
    }

    if (socket) socket.emit('register-hospital', {
      hospitalId: found.hospitalId,
      name: found.name,
      adminName: found.adminName,
      location: hospitalGps,
      available: true,
      token: token
    });

    if (incomingRequest) {
      console.log(`[AUTH] Authentication successful. Completing admission for ${incomingRequest?.id}...`);
      if (incomingRequest.fieldReport) {
        setLatestVitals(incomingRequest.fieldReport.vitals);
        setPatient(incomingRequest.patientDetails || { name: incomingRequest.fieldReport.patientName || 'Emergency Patient' });
      }
      socket.emit('hospital-response', {
        reqId: incomingRequest?.id,
        hospitalId: finalInputId,
        status: 'hospital_accepted',
        readyServices
      });
      setIncomingRequest(null);
      setRequestQueue(prev => prev.filter(r => r.id !== incomingRequest?.id));
      setActiveMissionId(incomingRequest?.id);
      setAmbulanceSocketId(incomingRequest.ambulanceSocket || incomingRequest.fromSocketId || incomingRequest.fromSocket);
      setAdmissionStep(0);
      setShowManualLogin(false);
      setIsAuthInModal(false);
    }

    setMfaToken(null);
  };

  const handleAcceptAdmission = () => {
    if (!socket || !incomingRequest) return;

    if (!isAuthenticated) {
      setIsAuthInModal(true);
      setLoginError('Authentication required to accept regional admission.');
      return;
    }

    // Open Doctor & Assistant Team Assignment Modal instead of accepting immediately
    setAttendingDocName('');
    setAttendingDocSpecialty('');
    setAttendingNurses('');
    setShowDocAssignModal(true);
  };

  const handleConfirmTeamAndAccept = () => {
    if (!socket || !incomingRequest) return;

    setAdmissionStep(1); // Show report immediately

    socket.emit('hospital-response', {
      reqId: incomingRequest?.id,
      hospitalId: authHospital?.hospitalId || activeHospitalId,
      status: 'hospital_accepted',
      readyServices,
      attendingDoctorName: attendingDocName.trim() || 'Dr. Command',
      attendingDoctorSpecialty: attendingDocSpecialty.trim() || 'Trauma & Emergency Specialist',
      attendingTeamDetails: {
        nurses: attendingNurses.split(',').map(n => n.trim()).filter(Boolean),
        timestamp: new Date().toLocaleTimeString()
      }
    });

    dismissedRef.current.add(incomingRequest?.id);
    setRequestQueue(prev => prev.filter(r => r.id !== incomingRequest?.id));
    setActiveMissionId(incomingRequest?.id);
    setAmbulanceSocketId(incomingRequest.ambulanceSocket || incomingRequest.fromSocketId || incomingRequest.fromSocket);
    setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });

    // Seed multi-mission state
    updateMissionData(incomingRequest?.id, {
      patient: incomingRequest.patientDetails,
      vitals: incomingRequest.fieldReport?.vitals,
      messages: [],
      incidentNotes: [],
      ambulanceSocket: incomingRequest.ambulanceSocket || incomingRequest.fromSocketId,
      resourceLocks: { traumaBay: false, bloodUnits: false, ventilatorStandby: false },
      attendingDoctorName: attendingDocName.trim() || 'Dr. Command',
      attendingDoctorSpecialty: attendingDocSpecialty.trim() || 'Trauma & Emergency Specialist',
      attendingTeamDetails: {
        nurses: attendingNurses.split(',').map(n => n.trim()).filter(Boolean),
        timestamp: new Date().toLocaleTimeString()
      }
    });

    setIncomingRequest(null);
    setShowDocAssignModal(false);
    setAdmissionStep(0);
  };

  const performMissionRestoration = (data) => {
    ignoredMissionsRef.current.add(data.id);
    console.log(`[RECOVERY] Starting restoration for mission ${data.id}`, data);

    try {
      // RESTORE AUTH STATE
      if (data.hospitalId) {
        const found = HOSPITAL_CREDENTIALS.find(c => c.hospitalId === data.hospitalId);
        if (found) {
          console.log(`[RECOVERY] Restoring hospital auth: ${found.hospitalId}`);
          setAuthHospital(found);
          if (found.internalId) setActiveHospitalId(found.internalId);
        }
      }

      setActiveMissionId(data.id);
      setAmbulanceSocketId(data.ambulanceSocket || data.fromSocketId);

      if (data.fieldReport) {
        setLatestVitals(data.fieldReport.vitals || null);
        setPatient(data.patientDetails || { name: data.fieldReport.patientName });
        // If we have a report, we're definitely in the middle of a mission
        setAdmissionStep(0);
      } else if (data.patientDetails) {
        setPatient(data.patientDetails);
      }

      if (data.readyServices) setReadyServices(data.readyServices);

      if (data.routePath && Array.isArray(data.routePath)) {
        setRoutePath(data.routePath.map(pos => (Array.isArray(pos) ? pos : [pos.lat, pos.lng])));
      }

      if (data.ambulanceLocation) setLocation(data.ambulanceLocation);

      setArrivedAtUser(!!data.arrivedAtUser);
      if (data.chatMessages) setMessages(data.chatMessages);
      if (data.incidentNotes) setIncidentNotes(data.incidentNotes);
      if (data.checklist) setChecklist(data.checklist);
      else setChecklist({});

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

  const handleAbortResume = () => {
    if (socket && pendingResumeMission) {
      socket.emit('reject-resume-mission', { reqId: pendingResumeMission?.id });
      ignoredMissionsRef.current.add(pendingResumeMission.id);
    }
    setPendingResumeMission(null);
    setActiveMissionId(null);
    setPatient(null);
  };

  // FIX C6: activeHospital now derived from live networkHospitals, not deleted HOSPITALS constant
  const activeHospital = Object.values(networkHospitals).find(h => h.id === activeHospitalId) ||
    Object.values(networkHospitals)[0] ||
    null;

  // --- UTILITY HANDLERS MOVED OUTSIDE EFFECT ---
  const onNote = (n) => setIncidentNotes(prev => [n, ...prev].slice(0, 10));
  const onRoles = (roles) => setConnectedRoles(roles);
  const onAiAlert = (data) => {
    setAishowAlert(data);
    setTimeout(() => setAishowAlert(null), 10000);
  };

  const onHistory = (msgs) => setMessages(msgs);
  const onChatMessage = (msg) => setMessages(prev => [...prev, msg]);

  const onBulkUpdate = (vitalsHistory) => {
    setChartData(prev => [...prev, ...vitalsHistory].slice(-MAX_HISTORY));
    if (vitalsHistory.length > 0) {
      const latest = vitalsHistory[vitalsHistory.length - 1];
      setLatestVitals(latest);

      const reasons = [];
      if (latest.heartRate > 110) reasons.push("Tachycardia detected (>110 BPM)");
      if (latest.heartRate < 50) reasons.push("Bradycardia detected (<50 BPM)");
      if (latest.spo2 < 92) reasons.push("Oxygen Desaturation (<92%)");
      if (latest.systolic > 150) reasons.push("Severe Hypertension (>150 mmHg)");

      if (reasons.length > 0) {
        if (!isCriticalRef.current) {
          setIsCritical(true);
          setCritReasons(reasons);
          setAlertCount(prev => prev + 1);
        }
        playAlertBeep();
      }
    }
  };

  const onIncomingHospitalRequest = (req) => {
    if (!req.id || dismissedRef.current.has(req.id)) return;
    playAlertBeep();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance('Attention. New incoming critical patient dispatch request.'));
    }
    console.log('[HOSPITAL] Queuing incoming request:', req);

    // ANCHOR FIX: Stash the ambulance socket ID for direct WebRTC signaling
    if (req.ambulanceSocket) {
      setAmbulanceSocketId(req.ambulanceSocket);
    }

    if (req.incidentLocation || req.userLocation) {
      setIncidentLocation(req.incidentLocation || req.userLocation);
    }

    setRequestQueue(prev => {
      if (prev.find(r => r.id === req.id)) return prev;
      return [...prev, req];
    });

    setIncomingRequest(prev => {
      const isUpgrade = req.status === 'admission_request' && activeMissionId === req.id;
      if (!prev && (!activeMissionId || isUpgrade)) {
        setAdvanceNotice(null);
        return req;
      }
      return prev;
    });

    if (req.status === 'advance_notice') {
      setAdvanceNotice(req);
      setTimeout(() => setAdvanceNotice(null), 30000);
    }
    if (req && req.id !== lastAlertedIdRef.current) {
      lastAlertedIdRef.current = req.id;
      playAlertBeep();
    }
  };

  // --- CORE EVENT LISTENERS ---
  useEffect(() => {
    if (!socket || !connected || !isAuthenticated) return;

    socket.on('hospital-request-response', (req) => {
      if (req.status === 'hospital_accepted' && req.routePath) {
        setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      }
    });

    socket.on('insurance-preauth-updated', (data) => {
      console.log('[HOSPITAL] Received insurance pre-auth update:', data);
      if (data && data.preAuth) setInsurancePreAuth(data.preAuth);
    });

    socket.on('hospital-inventory-locked', (data) => {
      console.log('[HOSPITAL] Received inventory hold-lock update:', data);
      if (data && data.reservationLock) setReservationLock(data.reservationLock);
    });

    socket.on('hospital-oxygen-warning', (data) => {
      console.log('[HOSPITAL] Low oxygen warning received:', data);
      if (data) setOxygenWarning(data);
    });

    socket.on('error-alert', (data) => {
      if (data && data.message && data.message.startsWith('PENDING_APPROVAL')) {
        setIsPendingApproval(true);
      }
    });

    socket.on('hospital-request-taken', (data) => {
      const { reqId, acceptedBy } = data;
      setRequestQueue(prev => prev.filter(r => r.id !== reqId));
      setIncomingRequest(prev => {
        if (prev && prev.id === reqId && acceptedBy !== socket.id) {
          showAlert('This mission has been accepted by another hospital.');
          return null;
        }
        return prev;
      });
    });

    socket.on('active-missions-update', (missions) => {
      console.log(`[RECOVERY] Received ${missions.length} active missions`);
      if (missions.length > 0) {
        const data = missions[0]; // Focus on primary active mission
        updateMissionData(data.id, {
          patient: data.patientDetails,
          vitals: data.fieldReport?.vitals,
          messages: data.chatMessages || [],
          incidentNotes: data.incidentNotes || [],
          routePath: data.routePath,
          ambulanceSocket: data.ambulanceSocket,
          checklist: data.checklist || {}
        });
        performMissionRestoration(data);
      }
    });

    socket.on('rejoin-mission', (data) => {
      console.log(`[PERSISTENCE] Single mission recovery: ${data.id}`, data);
      updateMissionData(data.id, {
        patient: data.patientDetails,
        vitals: data.fieldReport?.vitals,
        messages: data.chatMessages || [],
        incidentNotes: data.incidentNotes || [],
        routePath: data.routePath,
        ambulanceSocket: data.ambulanceSocket,
        checklist: data.checklist || {}
      });
      performMissionRestoration(data);
    });

    socket.on('vitals-update', (data) => {
      const { reqId, ...vitals } = data;
      updateMissionData(reqId, { vitals });

      setActiveMissions(prev => {
        const m = prev[reqId];
        if (!m) return prev;
        const newChart = [...(m.chartData || []).slice(-(MAX_HISTORY - 1)), { ...vitals, t: Date.now() }];
        return { ...prev, [reqId]: { ...m, chartData: newChart, vitals } };
      });

      if (reqId && activeMissionId && reqId === activeMissionId) {
        setLatestVitals(vitals);
        setChartData(prev => [...prev.slice(-(MAX_HISTORY - 1)), { ...vitals, t: Date.now() }]);

        const reasons = [];
        if (vitals.heartRate > 0 && vitals.heartRate > 130) reasons.push("Tachycardia detected (>130 BPM)");
        if (vitals.heartRate > 0 && vitals.heartRate < 45) reasons.push("Bradycardia detected (<45 BPM)");
        if (vitals.spo2 > 0 && vitals.spo2 < 91) reasons.push("Oxygen Desaturation (<91%)");
        if (vitals.systolic > 0 && vitals.systolic > 180) reasons.push("Severe Hypertension (>180 mmHg)");

        if (reasons.length > 0) {
          if (!isCriticalRef.current) {
            setIsCritical(true);
            setCritReasons(reasons);
            setAlertCount(prev => prev + 1);
          }
          const now = Date.now();
          if (now - lastVitalsBeepTimeRef.current > 8000) {
            playAlertBeep();
            lastVitalsBeepTimeRef.current = now;
          }
        }
      }
    });

    socket.on('smart-resource-alert', (data) => {
      playAlertBeep();
      if (data.autoLocks && Array.isArray(data.autoLocks)) {
        setReadyServices(prev => {
          const next = { ...prev };
          data.autoLocks.forEach(key => next[key] = true);
          return next;
        });
      }
      if (!isCriticalRef.current) setIsCritical(true);
      setCritReasons(prev => [...new Set([...prev, "🤖 " + data.message])]);
      setAlertCount(prev => prev + 1);
    });

    socket.on('sensor-error', (data) => {
      setCritReasons(prev => [...new Set([...prev, '⚠️ ' + data.message])]);
      setIsCritical(true);
      playAlertBeep();
    });

    socket.on('location-update', (data) => {
      const { reqId } = data;
      updateMissionData(reqId, { location: data });
      if (reqId === activeMissionId) {
        setLocation(data);
        if (data.trafficDelay !== undefined) setTrafficDelay(data.trafficDelay);
        setLocationHistory(prev => [...prev.slice(-99), [data.lat, data.lng]]);
      }
    });

    socket.on('consent-response', (data) => {
      if (data && data.reqId === activeMissionId) {
        if (data.approved) {
          setConsentStatus('APPROVED');
          showAlert('✅ Patient approved clinical record access.');
        } else {
          setConsentStatus('DENIED');
          showAlert('❌ Patient denied clinical record access.');
        }
      }
    });

    socket.on('patient-data', (data) => {
      updateMissionData(data.reqId, { patient: data });
      if (data.reqId === activeMissionId) setPatient(data);
    });

    socket.on('chat-message', (data) => {
      const reqId = data.reqId || activeMissionId;
      if (reqId) {
        setActiveMissions(prev => {
          const m = prev[reqId];
          if (!m) return prev;
          return { ...prev, [reqId]: { ...m, messages: [...(m.messages || []), data] } };
        });
        if (reqId === activeMissionId) setMessages(prev => [...prev, data]);
      }
    });

    socket.on('incident-note', (data) => {
      const reqId = data.reqId || activeMissionId;
      if (reqId) {
        setActiveMissions(prev => {
          const m = prev[reqId];
          if (!m) return prev;
          return { ...prev, [reqId]: { ...m, incidentNotes: [...(m.incidentNotes || []), data] } };
        });
        if (reqId === activeMissionId) setIncidentNotes(prev => [...prev, data]);
      }
    });

    socket.on('incoming-hospital-request', onIncomingHospitalRequest);

    socket.on('initial-hospital-facility-check', (data) => {
      setStandbyAlerts(prev => {
        if (prev.some(a => a.reqId === data.reqId)) return prev;
        return [...prev, { ...data, timestamp: Date.now() }];
      });
      if (typeof playAlertBeep === 'function') {
        playAlertBeep();
      }
    });

    socket.on('reroute-hospital', (data) => {
      const isAlreadyMe = data.newHospitalId === authHospital?.hospitalId || data.newHospitalId === activeHospitalId;
      if (data.newHospitalId && !isAlreadyMe) {
        setRerouteshowAlert(`INBOUND REDIRECTION: Patient from ${data.oldHospitalName || 'another unit'} is being rerouted here.`);
      }
    });

    socket.on('clinical-checklist-update', (data) => {
      const { reqId, checklist } = data;
      updateMissionData(reqId, { checklist });
      if (reqId === activeMissionId) {
        setChecklist(checklist || {});
      }
    });

    socket.on('traffic-incidents-update', (data) => {
      setTrafficIncidents(data || {});
    });

    socket.on('green-corridor-status', (data) => {
      if (data && data.reqId === activeMissionId) {
        setGreenCorridorActive(data.active);
      }
    });

    socket.on('mission-completed', (data) => {
      setPendingResumeMission(null);
      if (data && data.reqId) ignoredMissionsRef.current.delete(data.reqId);
      setActiveMissionId(null);
      setAmbulanceSocketId(null);
      setIncomingRequest(null);
      setPatient(null);
      setLatestVitals(null);
      setChartData([]);
      setIncidentNotes([]);
      setMessages([]);
      setRoutePath(null);
      setResourceLocks({ traumaBay: false, bloodUnits: false, ventilatorStandby: false });
      setChecklist({});
    });

    socket.on('ambulances-update', (data) => setAmbulances(data));
    socket.on('hospitals-update', (data) => setNetworkHospitals(data));

    socket.on('hospital-resources-locked', (data) => {
      const { reqId, locks } = data;
      console.log(`[EMR LOCK] Hospital resources locked event for mission ${reqId}:`, locks);

      // Update in activeMissions registry
      setActiveMissions(prev => {
        const existing = prev[reqId];
        if (!existing) return prev;
        return {
          ...prev,
          [reqId]: { ...existing, resourceLocks: locks }
        };
      });

      // If this corresponds to the currently active mission, update state
      if (reqId === activeMissionId) {
        setResourceLocks(locks);
      }

      // Play dual-pitch chirp sound
      playChirp();
    });

    return () => {
      if (!socket) return;
      socket.off('vitals-update');
      socket.off('location-update');
      socket.off('patient-data');
      socket.off('chat-message');
      socket.off('incident-note');
      socket.off('incoming-hospital-request');
      socket.off('active-missions-update');
      socket.off('mission-completed');
      socket.off('reroute-hospital');
      socket.off('hospital-request-taken');
      socket.off('ambulances-update');
      socket.off('hospitals-update');
      socket.off('hospital-request-response');
      socket.off('rejoin-mission');
      socket.off('hospital-resources-locked');
      socket.off('bulk-vitals-update');
      socket.off('chat-history');
      socket.off('roles-update');
      socket.off('ai-prediction-alert');
      socket.off('hospital-request-response');
      socket.off('patient-onboard');
      socket.off('sensor-error');
      socket.off('smart-resource-alert');
      socket.off('clinical-checklist-update');
      socket.off('traffic-incidents-update');
      socket.off('green-corridor-status');
      socket.off('initial-hospital-facility-check');
    };
  }, [socket, activeMissionId, authHospital, activeHospitalId, updateMissionData, incomingRequest, isAuthenticated]);

  // --- REGISTRATION SYNC: Re-register whenever GPS or Identity changes ---
  useEffect(() => {
    if (socket && connected && isAuthenticated) {
      console.log('[GPS_SYNC] Registering hospital at device coordinates:', hospitalGps || 'PENDING');
      const token = sessionStorage.getItem('rescuelink_token');
      socket.emit('register-hospital', {
        location: hospitalGps, // CRITICAL: Sends null if GPS pending, but server handles it
        available: true,
        id: authHospital?.hospitalId || 'HOSP-GENERIC',
        name: authHospital?.name || 'District General Hospital',
        lat: authHospital?.lat,
        lng: authHospital?.lng,
        token
      });
    }
  }, [socket, connected, hospitalGps, authHospital, isAuthenticated]);

  const dismissAlert = () => {
    setIsCritical(false);
    setCritReasons([]);
    clearTimeout(critTimeoutRef.current);
  };

  const downloadFHIR = async () => {
    const targetId = incomingRequest?.id || activeMissionId;
    if (!targetId) return showAlert("No active mission to export.");
    try {
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const response = await fetch(`/api/fhir/${targetId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Mission not found on server");
      const data = await response.json();
      setFhirPreviewData(data);
    } catch (err) {
      console.error("Failed to download FHIR record:", err);
      showAlert("Failed to export FHIR record. Ensure server is running and mission is active.");
    }
  };

  const rejectRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('hospital-response', { reqId: incomingRequest?.id, accepted: false });
    dismissedRef.current.add(incomingRequest?.id);
    setRequestQueue(prev => prev.filter(r => r.id !== incomingRequest?.id));
    setIncomingRequest(null);
    setAdmissionStep(0);
  };

  const toggleReadyService = (key) => {
    setReadyServices(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleManualSearch = (e) => {
    if (e.key === 'Enter') handleManualRecover();
  };

  const handleManualRecover = () => {
    if (!manualRecoveryId.trim() || !socket) return;
    console.log(`[MANUAL_RECOVERY] Requesting data for mission: ${manualRecoveryId}`);
    ignoredMissionsRef.current.delete(manualRecoveryId.trim());
    socket.emit('get-mission-data', manualRecoveryId.trim());
    setManualRecoveryId('');
  };

  const switchMission = (id) => {
    if (!activeMissions[id]) return;
    const m = activeMissions[id];
    console.log(`[SWITCH] Switching view to mission: ${id}`);
    setActiveMissionId(id);
    setPatient(m.patient);
    setLatestVitals(m.vitals);
    setMessages(m.messages || []);
    setIncidentNotes(m.incidentNotes || []);
    setRoutePath(m.routePath);
    setChartData(m.chartData || []);
    setAmbulanceSocketId(m.ambulanceSocket);
    setResourceLocks(m.resourceLocks || { traumaBay: false, bloodUnits: false, ventilatorStandby: false });
    setChecklist(m.checklist || {});
  };

  const headerActions = (isMobileView = false) => (
    <>
      {patient ? (
        <>
          <button onClick={() => { downloadFHIR(); if (isMobileView) setMobileMenuOpen(false); }} style={{
            background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
            padding: '0 12px', height: '32px', borderRadius: 4, color: '#00ff88',
            fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s',
            whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box'
          }}>
            📥 FHIR HL7
          </button>
          <button onClick={() => { setShowHandover(true); if (isMobileView) setMobileMenuOpen(false); }} style={{
            background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)',
            padding: '0 12px', height: '32px', borderRadius: 4, color: '#00c8ff',
            fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s',
            whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxSizing: 'border-box'
          }}>
            📄 REPORT
          </button>
        </>
      ) : (
        <button disabled style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '0 12px', height: '32px', borderRadius: 4, color: 'rgba(255,255,255,0.3)',
          fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
          cursor: 'not-allowed', letterSpacing: '0.05em', whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box'
        }}>
          📄 AWAITING PATIENT
        </button>
      )}

      <button onClick={() => { setShowArchives(true); if (isMobileView) setMobileMenuOpen(false); }} style={{
        background: 'rgba(160,200,255,0.05)', border: '1px solid rgba(160,200,255,0.2)',
        padding: '0 12px', height: '32px', borderRadius: 4, color: 'rgba(160,200,255,0.7)',
        fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
        cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s',
        whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxSizing: 'border-box'
      }}>
        📜 ARCHIVES {savedReports.length > 0 && <span style={{ color: '#00ff88', marginLeft: 4 }}>({savedReports.length})</span>}
      </button>

      {/* Connection indicators */}
      {[
        { label: 'AMBULANCE', count: connectedRoles.ambulance, color: '#ff8855', icon: '🚑' },
        { label: 'DOCTORS', count: connectedRoles.hospital, color: '#00c8ff', icon: '🏥' },
      ].map(({ label, count, color, icon }) => (
        <div key={label} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '32px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4,
          fontFamily: "'Share Tech Mono'", fontSize: 10, color: 'rgba(160,200,255,0.7)',
          boxSizing: 'border-box', whiteSpace: 'nowrap'
        }}>
          <span>{icon}</span>
          <span>{label}:</span>
          <strong style={{ color: count > 0 ? color : 'rgba(160,200,255,0.25)', fontSize: 11, fontWeight: 700 }}>{count}</strong>
        </div>
      ))}

      {alertCount > 0 && (
        <div style={{
          padding: '0 12px', height: '32px', background: 'rgba(255,40,40,0.15)',
          border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4,
          fontFamily: "'Orbitron'", fontSize: 11, color: '#ff6060',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          animation: 'blink 1s step-end infinite', boxSizing: 'border-box', whiteSpace: 'nowrap'
        }}>
          ⚠ {alertCount} ALERT{alertCount > 1 ? 'S' : ''}
        </div>
      )}

      {/* Auto-Sync Toggle */}
      <div
        onClick={() => { setAutoSync(!autoSync); if (isMobileView) setMobileMenuOpen(false); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '32px',
          background: autoSync ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${autoSync ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 4, cursor: 'pointer', transition: 'all 0.3s',
          whiteSpace: 'nowrap', boxSizing: 'border-box'
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: autoSync ? '#00ff88' : '#888',
          boxShadow: autoSync ? '0 0 8px #00ff88' : 'none'
        }} />
        <span style={{ fontSize: 11, fontFamily: "'Orbitron'", color: autoSync ? '#00ff88' : '#aaa', fontWeight: 700, letterSpacing: '0.05em' }}>
          AUTO-SYNC: {autoSync ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* LIVE Connection Badge */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '32px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, position: 'relative', boxSizing: 'border-box', whiteSpace: 'nowrap' }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? '#00ff88' : '#ff4444',
          boxShadow: connected ? '0 0 10px #00ff88' : '0 0 8px #ff4444',
          position: 'relative', zIndex: 2,
          animation: connected ? 'pulse-opacity 1s ease-in-out infinite' : 'none'
        }} />
        {connected && (
          <div style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(0,255,136,0.4)', animation: 'pulse-ring 2s ease-out infinite',
            zIndex: 1
          }} />
        )}
        <span style={{ fontSize: 11, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'", fontWeight: 700, letterSpacing: '0.05em' }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      {activeMissionId && (
        <div style={{ padding: '0 12px', height: '32px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 4, fontFamily: "'Share Tech Mono'", fontSize: 11, color: '#00c8ff', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
          ID: {activeMissionId}
        </div>
      )}

      <button
        onClick={() => {
          setHardResetConfirm(true);
          if (isMobileView) setMobileMenuOpen(false);
        }}
        style={{ padding: '0 12px', height: '32px', background: 'rgba(255,40,40,0.1)', border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4, color: '#ff6b6b', fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'", whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}
      >
        🛑 RESET
      </button>

      <button
        onClick={() => {
          setSwitchProfileConfirm(true);
          if (isMobileView) setMobileMenuOpen(false);
        }}
        style={{
          padding: '0 12px', height: '32px', background: 'rgba(255,68,68,0.1)',
          border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4,
          color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer',
          fontWeight: 'bold', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box'
        }}
      >
        🚪 SWITCH
      </button>
    </>
  );

  if (mfaToken) {
    return (
      <MfaVerifyScreen
        mfaToken={mfaToken}
        onLoginSuccess={handleMfaSuccess}
        onCancel={() => setMfaToken(null)}
      />
    );
  }

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
            Your hospital registration has been recorded. For public safety and authentication, all clinical nodes must be verified and approved by the <strong>City Administrator</strong> before access is granted.
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
      background: isCritical
        ? 'radial-gradient(ellipse at 50% 20%, #1a0505 0%, #050d1a 60%)'
        : 'radial-gradient(ellipse at 50% 20%, #050a1e 0%, #050d1a 70%)',
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      display: 'flex',
      flexDirection: 'row', // Change to row to accommodate sidebar
      overflow: 'hidden',
      transition: 'background 0.5s ease',
    }}>
      
      {/* ── HARD RESET CONFIRM MODAL ── */}
      {hardResetConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setHardResetConfirm(false)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,68,68,0.4)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%', boxShadow: '0 0 40px rgba(255,68,68,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 15, color: '#ff4444', fontWeight: 900, marginBottom: 10 }}>🛑 PERFORM HARD RESET?</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 22, lineHeight: 1.7 }}>
              This will clear all local mission data and log you out.<br /><br />
              <strong style={{ color: '#ff4444' }}>This action is irreversible.</strong>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setHardResetConfirm(false);
                  localStorage.removeItem('hospital_auth');
                  localStorage.removeItem('active_mission_id');
                  sessionStorage.clear();
                  window.location.reload();
                }}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,68,68,0.15)', border: '1px solid rgba(255,68,68,0.5)', borderRadius: 8, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                🗑 RESET
              </button>
              <button onClick={() => setHardResetConfirm(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SWITCH PROFILE CONFIRM MODAL ── */}
      {switchProfileConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSwitchProfileConfirm(false)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%', boxShadow: '0 0 40px rgba(255,184,0,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 15, color: '#ffb800', fontWeight: 900, marginBottom: 10 }}>🚪 SWITCH HOSPITAL PROFILE</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 22, lineHeight: 1.7 }}>
              You are about to switch hospital profiles.<br /><br />
              <strong style={{ color: '#ffb800' }}>Active mission context will be preserved on the server.</strong>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setSwitchProfileConfirm(false);
                  localStorage.removeItem('hospital_auth');
                  sessionStorage.clear();
                  window.location.reload();
                }}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.5)', borderRadius: 8, color: '#ffb800', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                🔄 SWITCH PROFILE
              </button>
              <button onClick={() => setSwitchProfileConfirm(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR NAVIGATION & MISSION SELECTOR */}
      {isAuthenticated && (
        <div 
          className={`sidebar-backdrop ${sidebarOpen ? 'open' : 'closed'}`} 
          onClick={() => setSidebarOpen(false)} 
        />
      )}
      {isAuthenticated && (
        <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div style={{ padding: '20px 10px 10px 10px', borderBottom: '1px solid rgba(0,200,255,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#00c8ff', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>RESCUELINK</div>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>CLINICAL PORTAL</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '15px 0' }}>
            {[
              { id: 'triage', label: 'LIVE TRIAGE', icon: '🚑' },
              { id: 'corridor', label: 'AI CORRIDOR', icon: '🚥' },
              { id: 'er_queue', label: 'ER QUEUE & BEDS', icon: '⏳' },
              { id: 'blood_bank', label: 'BLOOD BANK', icon: '🩸' },
              { id: 'insurance', label: 'INSURANCE CLAIM', icon: '🛡️' },
              { id: 'mass_casualty', label: 'MASS CASUALTY', icon: '⚠️' },
              { id: 'analytics', label: 'ANALYTICS', icon: '📊' },
              { id: 'settings', label: 'SETTINGS', icon: '⚙️' },
            ].map(tab => (
              <div
                key={tab.id}
                onClick={() => {
                  handleTabChange(tab.id);
                  if (window.innerWidth <= 768) setSidebarOpen(false); // Auto-close on mobile
                }}
                className={`sidebar-item ${activeTab === tab.id ? 'active' : ''}`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </div>
            ))}
          </div>

          {/* Active Missions block in the same sidebar */}
          {Object.keys(activeMissions).length > 0 && (
            <div style={{ borderTop: '1px solid rgba(0,200,255,0.1)', padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", letterSpacing: 1.5, marginBottom: 5, textAlign: 'center' }}>ACTIVE MISSIONS</div>
              {Object.values(activeMissions).map(m => (
                <div
                  key={m.id}
                  onClick={() => switchMission(m.id)}
                  style={{
                    padding: '10px', borderRadius: 6, cursor: 'pointer',
                    background: activeMissionId === m.id ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${activeMissionId === m.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono'", color: activeMissionId === m.id ? '#fff' : 'rgba(160,200,255,0.6)' }}>{m.id ? m.id.slice(0, 8) : 'N/A'}...</div>
                  <div style={{ fontSize: 9, color: activeMissionId === m.id ? '#00ff88' : 'rgba(255,255,255,0.3)', marginTop: 2 }}>{m.patient?.name || 'Inbound Patient'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Connection & Sync Status Panel */}
          <div style={{ borderTop: '1px solid rgba(0,200,255,0.1)', padding: '15px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", letterSpacing: 1, marginBottom: 4 }}>NODE TELEMETRY</div>
            
            {/* Live Connection & Auto-Sync in one row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              {/* LIVE Connection Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, flex: 1 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#00ff88' : '#ff4444' }} />
                <span style={{ fontSize: 9, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'", fontWeight: 700 }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
              </div>
 
              {/* Auto-Sync Toggle */}
              <div
                onClick={() => setAutoSync(!autoSync)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  background: autoSync ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${autoSync ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 4, cursor: 'pointer', flex: 1
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: autoSync ? '#00ff88' : '#888' }} />
                <span style={{ fontSize: 9, fontFamily: "'Orbitron'", color: autoSync ? '#00ff88' : '#aaa', fontWeight: 700 }}>SYNC: {autoSync ? 'ON' : 'OFF'}</span>
              </div>
            </div>
 
            {/* Connection counts (Ambulance, Doctors) */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.7)' }}>
                <span>🚑</span> AMB: <strong style={{ color: '#ff8855' }}>{connectedRoles.ambulance}</strong>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.7)' }}>
                <span>🏥</span> DOC: <strong style={{ color: '#00c8ff' }}>{connectedRoles.hospital}</strong>
              </div>
            </div>
 
            {/* Archives button */}
            <button
              onClick={() => setShowArchives(true)}
              style={{
                width: '100%', height: '30px', background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)',
                borderRadius: 4, color: 'rgba(160,200,255,0.8)', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s', marginTop: 4
              }}
            >
              📜 VIEW EMR ARCHIVES {savedReports.length > 0 && `(${savedReports.length})`}
            </button>
          </div>
 
          {/* Manual Recovery at the bottom of the sidebar */}
          <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0,200,255,0.1)', padding: '15px 10px' }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 6, textAlign: 'center' }}>MANUAL RECOVERY</div>
            <div style={{ display: 'flex', gap: 4, height: 28 }}>
              <input
                value={manualRecoveryId}
                onChange={e => setManualRecoveryId(e.target.value)}
                onKeyDown={handleManualSearch}
                placeholder="REQ ID"
                style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: '0 8px', color: '#fff', fontSize: 10, outline: 'none' }}
              />
              <button onClick={handleManualRecover} style={{ background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', color: '#00c8ff', borderRadius: 4, padding: '0 8px', cursor: 'pointer', fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>GO</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <style>{`
        @keyframes critBg {
          0%,100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink { 0%,49%{opacity:1}50%,100%{opacity:0} }

        /* Sidebar styles */
        .sidebar {
          width: 260px;
          background: rgba(5, 15, 40, 0.95);
          border-right: 1px solid rgba(0, 200, 255, 0.2);
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
          background: rgba(0, 200, 255, 0.05);
          color: #00c8ff;
        }
        .sidebar-item.active {
          background: rgba(0, 200, 255, 0.1);
          color: #00c8ff;
          border-left-color: #00c8ff;
        }

        /* Mobile controls */
        .mobile-nav-trigger {
          display: none;
        }

        /* Responsive styles */
        @media (max-width: 1024px) {
          .hospital-triage-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        .sidebar-backdrop {
          display: none;
        }

        @media (max-width: 768px) {
          .sidebar-backdrop.open {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 3, 12, 0.7);
            backdrop-filter: blur(4px);
            z-index: 998;
          }
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
          .hospital-triage-grid {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
          }
          
          .desktop-nav-group {
            display: none !important;
          }
          .mobile-nav-trigger {
            display: inline-flex !important;
            background: rgba(0, 200, 255, 0.1);
            border: 1px solid rgba(0, 200, 255, 0.3);
            border-radius: 4px;
            color: #00c8ff;
            padding: 6px 12px;
            font-family: 'Orbitron';
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
          }
        }
      `}</style>

        {fhirPreviewData && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div style={{ background: '#0a1e3a', border: '1px solid #00c8ff', borderRadius: 12, width: 600, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0,200,255,0.4)', padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron'", color: '#00c8ff', fontSize: 14 }}>📥 HL7 FHIR RECORD PREVIEW (v4.0.1)</div>
                <button onClick={() => setFhirPreviewData(null)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 20, cursor: 'pointer' }}>×</button>
              </div>
              <pre style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.1)', padding: 12, borderRadius: 8, color: '#00ff88', fontFamily: "'Share Tech Mono'", fontSize: 11, overflowX: 'auto', maxHeight: '50vh' }}>
                {JSON.stringify(fhirPreviewData, null, 2)}
              </pre>
              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button
                  onClick={() => setFhirPreviewData(null)}
                  style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}
                >
                  CLOSE
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(fhirPreviewData, null, 2)], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `FHIR_Record_${incomingRequest?.id || activeMissionId}.json`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    setFhirPreviewData(null);
                  }}
                  style={{ flex: 2, padding: 12, background: '#00ff88', border: 'none', borderRadius: 8, color: '#000', fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, boxShadow: '0 0 20px rgba(0,255,136,0.3)' }}
                >
                  DOWNLOAD BUNDLE JSON
                </button>
              </div>
            </div>
          </div>
        )}

        {showHandover && (
          <HandoverModal
            patient={patient}
            vitals={latestVitals}
            notes={incidentNotes}
            previousReports={previousReports}
            onSave={(report) => {
              setSavedReports(prev => [report, ...prev].slice(0, 10));
              if (socket && activeMissionId) {
                socket.emit('complete-mission', { reqId: activeMissionId });
                setActiveMissionId(null);
                setPatient(null);
                setLatestVitals(null);
                setChartData([]);
                setIncidentNotes([]);
              }
            }}
            onClose={() => setShowHandover(false)}
          />
        )}

        {/* Saved Reports Archive Sidebar/Modal */}
        {showArchives && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div style={{ background: '#0a1e3a', border: '1px solid #00c8ff', borderRadius: 12, width: 450, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0,200,255,0.4)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontFamily: "'Orbitron'", color: '#00c8ff', fontSize: 14 }}>📜 EMR ARCHIVES (RECENT SAVES)</div>
                <button onClick={() => setShowArchives(false)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 20, cursor: 'pointer' }}>×</button>
              </div>
              {savedReports.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#555', padding: 40, fontFamily: "'Share Tech Mono'" }}>NO SAVED RECORDS FOUND</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {savedReports.map((r, i) => (
                    <div key={i} style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.1)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 'bold', color: '#e0eaff' }}>{r.name}</span>
                        <span style={{ color: r.color, fontSize: 10, fontFamily: "'Orbitron'" }}>{r.triage}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>ID: {r.id} • Saved at {r.time.split(',')[1]}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}


        {/* Stage 1: Advance Notice Banner */}
        {advanceNotice && (
          <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 11000, width: 450, animation: 'slideDown 0.4s ease' }}>
            <div style={{ background: '#0a1e3a', border: '2px solid #ffb800', borderRadius: 8, padding: '12px 20px', boxShadow: '0 4px 20px rgba(255,184,0,0.3)', display: 'flex', alignItems: 'center', gap: 15 }}>
              <div style={{ fontSize: 24, animation: 'blink 1s infinite' }}>🚨</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#ffb800', letterSpacing: 1, fontWeight: 'bold', marginBottom: 4 }}>ADVANCE EMERGENCY NOTICE</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{advanceNotice.message}</div>
                  <button
                    onClick={() => {
                      // Manually trigger the Stage 2 modal using Stage 1 data
                      onIncomingHospitalRequest({ ...advanceNotice, status: 'admission_request' });
                      setAdvanceNotice(null);
                    }}
                    style={{ background: '#ffb800', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, fontWeight: 'bold', color: '#000', cursor: 'pointer', fontFamily: "'Orbitron'" }}
                  >
                    VIEW & PREPARE
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 20, marginTop: 8, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>📍 EMERGENCY LOCATION</div>
                    <div style={{ fontSize: 11, color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>
                      {advanceNotice.userLocation?.lat.toFixed(4)}°N, {advanceNotice.userLocation?.lng.toFixed(4)}°E
                    </div>
                  </div>
                  <div style={{ flex: 1, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 10 }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>🚑 UNIT DETAILS</div>
                    <div style={{ fontSize: 11, color: '#ffb800' }}>
                      {advanceNotice.ambulanceDetails?.vehicleNo} · <span style={{ opacity: 0.7 }}>{advanceNotice.ambulanceDetails?.type}</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 10, color: 'rgba(0,255,136,0.8)', fontFamily: "'Share Tech Mono'", marginTop: 6, fontWeight: 'bold' }}>
                  ⏱ ETA TO SCENE: ~{Math.ceil(advanceNotice.distance / 0.5) || 5} MINS
                </div>
              </div>
              <button onClick={() => setAdvanceNotice(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          </div>
        )}
        {/* Mission Resume Guard Overlay */}
        {pendingResumeMission && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
            <div style={{ background: 'linear-gradient(135deg, #0a1e3a 0%, #020814 100%)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 16, width: 480, padding: 40, textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 40, marginBottom: 20, animation: 'pulse-opacity 1s infinite' }}>📡</div>
              <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', margin: '0 0 10px', fontSize: 20, letterSpacing: 2 }}>MISSION RECOVERY DETECTED</h2>
              <p style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', marginBottom: 30, lineHeight: 1.5 }}>
                The central server has an active mission (<strong>{pendingResumeMission?.id}</strong>) assigned to this dashboard.
                Would you like to resume command duties or reset the terminal?
              </p>

              <div style={{ marginBottom: 20, padding: 15, background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(0,200,255,0.1)' }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 8 }}>DIFFERENT MISSION? ENTER ID:</div>
                <div style={{ display: 'flex', gap: 10, height: 38 }}>
                  <input
                    value={manualRecoveryId}
                    onChange={e => setManualRecoveryId(e.target.value)}
                    onKeyDown={handleManualSearch}
                    placeholder="REQ-XXXXXX"
                    style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: '0 12px', color: '#fff', fontSize: 12, outline: 'none', height: '100%', boxSizing: 'border-box' }}
                  />
                  <button onClick={handleManualRecover} style={{ height: '100%', background: 'rgba(0,200,255,0.2)', border: '1px solid #00c8ff', color: '#00c8ff', borderRadius: 4, padding: '0 18px', cursor: 'pointer', fontSize: 12, fontFamily: "'Orbitron'", fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>GO</button>
                </div>
              </div>
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
                  RESUME SESSION
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incoming Request Modal — Multi-step */}
        {incomingRequest && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
            <div style={{
              background: '#0a1e3a',
              border: '2px solid #ff4444',
              borderRadius: 12,
              width: 540,
              boxShadow: '0 0 40px rgba(255,60,60,0.4)',
              animation: 'critFlash 0.5s ease infinite alternate'
            }}>
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🚑</div>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginBottom: 12, borderBottom: '1px solid rgba(0,200,255,0.1)', paddingBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>🚨 {incomingRequest.status === 'advance_notice' ? 'ADVANCE NOTICE' : 'ADMISSION REQUEST'}</span>
                  <span style={{ fontSize: 9, opacity: 0.6 }}>ID: {incomingRequest?.id}</span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 16, textAlign: 'left', marginBottom: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, color: '#ff4444', fontFamily: "'Orbitron'", marginBottom: 6, fontWeight: 'bold' }}>PRIMARY CLINICAL REPORT</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                        {!isAuthInModal && incomingRequest.fieldReport?.patientName
                          ? incomingRequest.fieldReport.patientName.split(' ').map(n => n[0] + '*'.repeat(Math.max(n.length - 1, 0))).join(' ')
                          : incomingRequest.fieldReport?.patientName || 'EMERGENCY CASE'}
                        {!isAuthInModal && <span style={{ fontSize: 10, color: '#ffb800', marginLeft: 8 }}>🔒 PROTECTED</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>Condition: {incomingRequest.fieldReport?.condition}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>TRIAGE LEVEL</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#ff4444' }}>{incomingRequest.fieldReport?.triageLevel?.split('—')[0]}</div>
                    </div>
                  </div>

                  {incomingRequest.fieldReport?.vitals && (
                    <div style={{ display: 'flex', gap: 15, marginTop: 12, padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                      <div style={{ fontSize: 11 }}><span style={{ opacity: 0.5 }}>HR:</span> <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>{incomingRequest.fieldReport.vitals.heartRate}</span></div>
                      <div style={{ fontSize: 11 }}><span style={{ opacity: 0.5 }}>SpO2:</span> <span style={{ color: '#00c8ff', fontWeight: 'bold' }}>{incomingRequest.fieldReport.vitals.spo2}%</span></div>
                      <div style={{ fontSize: 11 }}><span style={{ opacity: 0.5 }}>BP:</span> <span style={{ color: '#ffb800', fontWeight: 'bold' }}>{incomingRequest.fieldReport.vitals.systolic}/{incomingRequest.fieldReport.vitals.diastolic}</span></div>
                    </div>
                  )}
                </div>

                {/* Resource Verification Section */}
                <div style={{ background: 'rgba(0,200,255,0.03)', borderRadius: 8, padding: 16, textAlign: 'left', marginBottom: 24, border: '1px solid rgba(0,200,255,0.1)' }}>
                  <div style={{ fontSize: 10, color: '#ffb800', fontFamily: "'Orbitron'", marginBottom: 12, fontWeight: 'bold' }}>RESOURCE RESERVATION (LOCK)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { key: 'otPrepared', label: 'OT Room 1', icon: '🔪' },
                      { key: 'ventilatorReady', label: 'ICU Ventilator', icon: '🫁' },
                      { key: 'cardiologistAssigned', label: 'Cardiologist On-Call', icon: '👨‍⚕️' },
                      { key: 'bloodBankAlerted', label: 'Blood Type O-', icon: '🩸' }
                    ].map(service => (
                      <div
                        key={service.key}
                        onClick={() => toggleReadyService(service.key)}
                        style={{
                          padding: '8px 12px', background: readyServices[service.key] ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${readyServices[service.key] ? '#ffb800' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ filter: readyServices[service.key] ? 'none' : 'grayscale(1)', opacity: readyServices[service.key] ? 1 : 0.3 }}>{service.icon}</span>
                        <span style={{ fontSize: 11, color: readyServices[service.key] ? '#ffb800' : 'rgba(255,255,255,0.5)', fontWeight: readyServices[service.key] ? 'bold' : 'normal', flex: 1 }}>{service.label}</span>
                        {readyServices[service.key] && <span style={{ fontSize: 10, color: '#ffb800' }}>🔒 LOCKED</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {isAuthInModal ? (
                  <div style={{ animation: 'slideDown 0.3s ease', padding: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 15, textAlign: 'center' }}>🔒 SECURE AUTHENTICATION REQUIRED</div>
                    <input value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="EMAIL" style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 12, color: '#fff', marginBottom: 12, outline: 'none' }} />
                    <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="PASSWORD" style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 12, color: '#fff', marginBottom: 12, outline: 'none' }} />
                    {loginError && <div style={{ color: '#ff4444', fontSize: 11, marginBottom: 12 }}>{loginError}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setIsAuthInModal(false)} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: '#aaa', cursor: 'pointer' }}>CANCEL</button>
                      <button onClick={handleLogin} style={{ flex: 2, padding: 12, background: '#00c8ff', border: 'none', borderRadius: 8, color: '#000', fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer' }}>VERIFY & ACCEPT</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button onClick={rejectRequest} style={{ flex: 1, padding: '12px', background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', borderRadius: 8, color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>REJECT</button>
                    <button onClick={handleAcceptAdmission} style={{ flex: 2, padding: '12px', background: '#00ff88', border: 'none', borderRadius: 8, color: '#000', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>ACCEPT ADMISSION</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Paramedic Resource Lock Request Modal */}
        {incomingLockRequest && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
            <div style={{
              background: '#0a1526',
              border: '2px solid #ff6b35',
              borderRadius: 12,
              width: 420,
              padding: 24,
              boxShadow: '0 0 35px rgba(255,107,53,0.3)',
              fontFamily: "'Rajdhani', sans-serif"
            }}>
              <h3 style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff6b35', marginBottom: 12, textAlign: 'center', letterSpacing: '0.1em' }}>
                🚨 INCOMING RESOURCE LOCK REQUEST
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', textAlign: 'center', marginBottom: 20 }}>
                Ambulance paramedic is requesting a 20-min temporary hold on the following critical EMR-bound resources:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,107,53,0.2)', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>🏨 Trauma Bay</span>
                  <span style={{ color: incomingLockRequest.locks.traumaBay ? '#00ff88' : '#888', fontWeight: 'bold' }}>{incomingLockRequest.locks.traumaBay ? 'REQUIRED' : 'NO'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>🫁 Ventilator Standby</span>
                  <span style={{ color: incomingLockRequest.locks.ventilatorStandby ? '#00ff88' : '#888', fontWeight: 'bold' }}>{incomingLockRequest.locks.ventilatorStandby ? 'REQUIRED' : 'NO'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>🩸 Blood Units</span>
                  <span style={{ color: incomingLockRequest.locks.bloodUnits ? '#00ff88' : '#888', fontWeight: 'bold' }}>{incomingLockRequest.locks.bloodUnits ? 'REQUIRED' : 'NO'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => {
                    socket.emit('hospital-respond-lock', { reqId: incomingLockRequest.reqId, approved: false });
                    setIncomingLockRequest(null);
                  }}
                  style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}
                >
                  DENY LOCK
                </button>
                <button
                  onClick={() => {
                    socket.emit('hospital-respond-lock', { reqId: incomingLockRequest.reqId, approved: true });
                    setIncomingLockRequest(null);
                  }}
                  style={{ flex: 2, padding: 12, background: 'rgba(255,107,53,0.2)', border: '1px solid #ff6b35', borderRadius: 8, color: '#ff6b35', fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer', fontSize: 11 }}
                >
                  APPROVE LOCK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Attending Team Assignment Modal Overlay */}
        {showDocAssignModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
            <div style={{
              background: '#0a1526',
              border: '1px solid #00c8ff',
              borderRadius: 12,
              width: 480,
              padding: 24,
              boxShadow: '0 0 35px rgba(0,200,255,0.3)',
              fontFamily: "'Rajdhani', sans-serif"
            }}>
              <h3 style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', marginBottom: 12, textAlign: 'center', letterSpacing: '0.1em' }}>
                👨‍⚕️ ATTENDING TEAM ALLOCATION
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', textAlign: 'center', marginBottom: 20 }}>
                Please specify the emergency physician and staff roster assigned to handle this patient's arrival.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PHYSICIAN IN CHARGE (DOCTOR NAME)</label>
                  <input
                    type="text"
                    value={attendingDocName}
                    onChange={(e) => setAttendingDocName(e.target.value)}
                    placeholder="e.g. Dr. Robert Chen"
                    required
                    style={{ padding: '10px', background: 'rgba(5,15,40,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PHYSICIAN SPECIALIZATION</label>
                  <input
                    type="text"
                    value={attendingDocSpecialty}
                    onChange={(e) => setAttendingDocSpecialty(e.target.value)}
                    placeholder="e.g. Cardiologist / Trauma Surgeon"
                    required
                    style={{ padding: '10px', background: 'rgba(5,15,40,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ASSISTANT NURSES & STAFF (COMMA SEPARATED)</label>
                  <input
                    type="text"
                    value={attendingNurses}
                    onChange={(e) => setAttendingNurses(e.target.value)}
                    placeholder="e.g. Nurse Sarah, Nurse David, Resident James"
                    style={{ padding: '10px', background: 'rgba(5,15,40,0.6)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowDocAssignModal(false)}
                  style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleConfirmTeamAndAccept}
                  disabled={!attendingDocName.trim() || !attendingDocSpecialty.trim()}
                  style={{
                    flex: 2, padding: 12,
                    background: (!attendingDocName.trim() || !attendingDocSpecialty.trim()) ? 'rgba(0,255,136,0.2)' : '#00ff88',
                    border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer',
                    fontFamily: "'Orbitron'", fontWeight: 'bold', fontSize: 11
                  }}
                >
                  CONFIRM TEAM & ADMIT →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* standby screen - only show if NOT authenticated AND NO incoming request */}
        {!isAuthenticated && !incomingRequest && !pendingResumeMission && (
          <div key="standby" style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 80% 20%, #0a1e3a 0%, #050d1a 60%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Rajdhani', sans-serif" }}>
            <div style={{ background: 'rgba(5,20,45,0.9)', border: '2px solid rgba(0,200,255,0.3)', borderRadius: 16, padding: 40, width: 420, boxShadow: '0 0 40px rgba(0,200,255,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: 60, marginBottom: 10 }}>🏥</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#00c8ff', letterSpacing: '0.2em', marginBottom: 10 }}>GLOBAL MONITORING ACTIVE</div>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'", lineHeight: 1.6, marginBottom: 20 }}>
                Scanning for regional emergency requests...<br />
                <span style={{ color: '#00ff88', animation: 'blink 1.5s infinite' }}>● SYSTEM STANDBY</span>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, fontSize: 9, color: 'rgba(0,200,255,0.6)', fontFamily: "'Share Tech Mono'", textAlign: 'left', marginBottom: 20, maxHeight: 100, overflowY: 'auto', border: '1px solid rgba(0,200,255,0.1)' }}>
                <div style={{ borderBottom: '1px solid rgba(0,200,255,0.1)', marginBottom: 4, paddingBottom: 2 }}>SIGNAL_LOG:</div>
                {incomingRequest ? (
                  <div style={{ color: '#00ff88' }}>[{new Date().toLocaleTimeString()}] EMERGENCY_INBOUND: {incomingRequest?.id}</div>
                ) : (
                  <div>[{new Date().toLocaleTimeString()}] SEARCHING_NETWORKS...</div>
                )}
              </div>

              <div style={{ borderTop: '1px solid rgba(0,200,255,0.1)', paddingTop: 20 }}>
                {showManualLogin ? (
                  <div style={{ animation: 'slideDown 0.3s ease' }}>
                    <input value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="EMAIL" style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 12, color: '#fff', marginBottom: 12, outline: 'none' }} />
                    <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="PASSWORD" style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 12, color: '#fff', marginBottom: 12, outline: 'none' }} />
                    {loginError && <div style={{ color: '#ff4444', fontSize: 11, marginBottom: 12 }}>{loginError}</div>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setShowManualLogin(false)} style={{ flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: '#aaa', cursor: 'pointer' }}>CANCEL</button>
                      <button onClick={handleLogin} style={{ flex: 2, padding: 12, background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', borderRadius: 8, color: '#00c8ff', fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer' }}>LOGIN</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowManualLogin(true)} style={{ background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)', color: 'rgba(160,200,255,0.5)', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10 }}>
                    🔓 ADMINISTRATOR LOGIN
                  </button>
                )}

              </div>
            </div>
          </div>
        )}

        {isAuthenticated && (
          <div style={{ padding: '20px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Handover Syncing Overlay */}
            {isHandoverSyncing && (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 12000,
                background: 'rgba(5, 13, 26, 0.85)', backdropFilter: 'blur(5px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: '#00c8ff', fontFamily: "'Orbitron'",
              }}>
                <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse-ring 1s infinite' }}>🔄</div>
                <div style={{ fontSize: 24, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>
                  HANDOVER PROTOCOL INITIATED
                </div>
                <div style={{ fontSize: 14, fontFamily: "'Share Tech Mono'", color: '#e0eaff', opacity: 0.8 }}>
                  SYNCING ENTIRE TRANSIT HISTORY TO {activeHospital?.name?.toUpperCase() || 'HOSPITAL'}...
                </div>
                <div style={{ width: 300, height: 4, background: 'rgba(0,200,255,0.2)', marginTop: 20, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: '#00c8ff', animation: 'progress 2.5s ease-in-out' }} />
                </div>
                <style>{`
            @keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 100%; } }
            @media (max-width: 768px) {
              .hospital-triage-grid {
                grid-template-columns: 1fr !important;
                overflow-y: auto !important;
              }
            }
          `}</style>
              </div>
            )}

            {/* Critical overlay flash */}
            {isCritical && (
              <div style={{
                position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100,
                background: 'rgba(255,0,0,0.06)',
                animation: 'critBg 0.6s ease infinite',
              }} />
            )}

            {/* Header */}
            {/* Slim, Clean Header */}
            <div style={{
              background: 'rgba(3,8,22,0.95)',
              borderBottom: `1px solid ${isCritical ? 'rgba(255,80,80,0.4)' : 'rgba(0,200,255,0.15)'}`,
              padding: '10px 24px',
              display: 'flex', alignItems: 'center', gap: 15, minHeight: 50, height: 'auto', flexWrap: 'wrap',
              backdropFilter: 'blur(15px)', transition: 'border-color 0.3s',
            }}>
              {/* Sidebar toggle button (Hamburger) */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  background: 'rgba(0, 200, 255, 0.05)',
                  border: '1px solid rgba(0, 200, 255, 0.2)',
                  borderRadius: 6,
                  color: '#00c8ff',
                  padding: '6px 12px',
                  fontFamily: "'Orbitron'",
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                ☰ {sidebarOpen ? 'CLOSE' : 'MENU'}
              </button>
              <div style={{ fontSize: 22, flexShrink: 0 }}>🏥</div>
              <div style={{ flexShrink: 0, minWidth: 'fit-content' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, color: '#00c8ff', letterSpacing: '0.05em' }}>
                  {authHospital?.name || 'EMERGENCY WING'}
                </div>
              </div>
 
              {/* ICU BEDS INVENTORY */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.3)', padding: '5px 15px', borderRadius: 20, border: `1px solid ${icuBeds > 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.5)'}` }}>
                <div style={{ fontSize: 10, color: icuBeds > 0 ? '#00ff88' : '#ff4444', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>
                  ICU BEDS: {icuBeds} {icuBeds === 0 && '(DIVERTING)'}
                </div>
                <input
                  type="range" min="0" max="50" value={icuBeds}
                  onChange={(e) => setIcuBeds(parseInt(e.target.value))}
                  style={{ width: 100, cursor: 'pointer', accentColor: icuBeds > 0 ? '#00ff88' : '#ff4444' }}
                />
              </div>

              {/* Action buttons embedded natively in the flex layout */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {patient && (
                  <>
                    <button onClick={downloadFHIR} style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', padding: '6px 12px', borderRadius: 4, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      📥 FHIR HL7
                    </button>
                    <button onClick={() => setShowHandover(true)} style={{ background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', padding: '6px 12px', borderRadius: 4, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      📄 REPORT
                    </button>
                  </>
                )}
                
                <button onClick={onSwitchRole} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10 }}>
                  ROLE 🔄
                </button>
                <button onClick={onShowSecurity} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10 }}>
                  SECURITY 🛡️
                </button>
                <button onClick={onLogout} className="rl-btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 10, background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)', border: 'none', color: '#fff' }}>
                  LOGOUT ⏻
                </button>
              </div>
            </div>
 
            {/* Connection Banner */}
            {patient && (
              <div style={{
                background: 'linear-gradient(90deg, rgba(0,255,136,0.15) 0%, rgba(0,255,136,0.02) 100%)',
                borderBottom: '1px solid rgba(0,255,136,0.5)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12,
                zIndex: 50, position: 'relative'
              }}>
                <span style={{ fontSize: 20 }}>🔗</span>
                <div>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', fontWeight: 700, letterSpacing: '0.1em' }}>
                    SECURE HANDSHAKE ESTABLISHED
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: "'Share Tech Mono'", marginTop: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span>PATIENT: <strong style={{ color: '#fff' }}>{patient?.name || 'Awaiting Data...'}</strong> ({patient?.id || 'NO_ID'})</span>
                    {patient?.isVerified && (
                      <span style={{
                        background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid #00ff88',
                        borderRadius: 12, padding: '2px 6px', fontSize: 9, fontFamily: "'Orbitron'",
                        display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 0 10px rgba(0,255,136,0.2)',
                        transform: 'translateY(-1px)'
                      }}>
                        <span style={{ fontSize: 10 }}>✅</span> ABDM VERIFIED
                      </span>
                    )}
                    <span>· UNIT: <strong style={{ color: '#fff' }}>Paramedic Ambulance (ALS)</strong> | Status: <strong style={{ color: '#ffb800' }}>EN ROUTE</strong></span>
                  </div>
                </div>
              </div>
            )}
 
            {/* Critical alert banner */}
            <div style={{ position: 'relative', zIndex: 50 }}>
              {/* Green Corridor Active Banner */}
             {greenCorridorActive && (
               <div style={{
                 background: 'linear-gradient(90deg, rgba(0,255,136,0.25) 0%, rgba(0,255,136,0.05) 100%)',
                 borderBottom: '2px solid #00ff88',
                 padding: '12px 24px',
                 display: 'flex', alignItems: 'center', gap: 12,
                 animation: 'sosGlow 2s ease infinite',
                 zIndex: 60,
                 position: 'relative'
               }}>
                 <span style={{ fontSize: 20 }}>🟢</span>
                 <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00ff88', fontWeight: 700, letterSpacing: '0.1em' }}>
                   GREEN CORRIDOR ACTIVE - EMERGENCY SIGNAL PREEMPTION ENGAGED
                 </div>
               </div>
             )}
 
             {icuBeds === 0 && (
                <div style={{
                  background: 'linear-gradient(90deg, rgba(255,0,0,0.35) 0%, rgba(255,0,0,0.1) 100%)',
                  borderBottom: '2px solid #ff4444',
                  padding: '12px 24px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  animation: 'blink 1.5s infinite',
                  zIndex: 60,
                  position: 'relative'
                }}>
                  <span style={{ fontSize: 20 }}>⚠️</span>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff4444', fontWeight: 700, letterSpacing: '0.1em' }}>
                    ER DIVERT ACTIVE - ZERO BED CAPACITY
                  </div>
                </div>
              )}
 
              {aiAlert && (
                <div style={{
                  background: 'linear-gradient(90deg, rgba(255,180,0,0.2) 0%, rgba(255,180,0,0.05) 100%)',
                  borderBottom: '2px solid rgba(255,180,0,0.6)',
                  padding: '12px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  animation: 'slideDown 0.3s ease',
                }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
                  <button onClick={() => setAishowAlert(null)} style={{
                    padding: '6px 16px', background: 'rgba(255,180,0,0.1)',
                    border: '1px solid rgba(255,180,0,0.3)', borderRadius: 4,
                    color: '#ffb800', fontFamily: "'Orbitron'", fontSize: 10, cursor: 'pointer',
                  }}>ACKNOWLEDGE</button>
                </div>
              )}
 
              {rerouteAlert && (
                <div style={{
                  background: 'linear-gradient(90deg, rgba(255,180,0,0.3) 0%, rgba(255,180,0,0.1) 100%)',
                  borderBottom: '2px solid #ffb800',
                  padding: '12px 24px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  animation: 'slideDown 0.4s ease-out'
                }}>
                  <span style={{ fontSize: 18 }}>🔄</span>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ffb800', fontWeight: 700, letterSpacing: '0.05em' }}>
                    DIVERTER ALERT: <span style={{ color: '#fff', fontWeight: 500 }}>{rerouteAlert}</span>
                  </div>
                </div>
              )}
 
 
              {isCritical && !aiAlert && (
                <div style={{
                  background: 'rgba(255,30,30,0.2)', borderBottom: '2px solid rgba(255,80,80,0.5)',
                  padding: '12px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  animation: 'slideDown 0.3s ease',
                }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 24 }}>🚨</span>
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff4444', fontWeight: 700, letterSpacing: '0.1em' }}>
                        CRITICAL PATIENT ALERT
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,160,160,0.8)', fontFamily: "'Share Tech Mono'", marginTop: 2 }}>
                        {critReasons.join(' · ')}
                      </div>
                    </div>
                  </div>
                  <button onClick={dismissAlert} style={{
                    padding: '6px 16px', background: 'rgba(255,80,80,0.2)',
                    border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4,
                    color: '#ff8888', fontFamily: "'Orbitron'", fontSize: 10, cursor: 'pointer',
                  }}>ACKNOWLEDGE</button>
                </div>
              )}
            </div>
 
            {/* Main Content Area Based on Active Tab */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              {activeTab === 'triage' && (
                <div className="hospital-triage-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', flex: 1, overflow: 'hidden', width: '100%' }}>

                  {/* LEFT: Charts + Map */}
                  <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* --- STANDBY ALERTS: Facility Check Standby Alerts --- */}
                    {standbyAlerts.length > 0 && (
                      <div style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: 15 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', letterSpacing: '0.1em', fontWeight: 700 }}>
                            📢 INBOUND STANDBY ALERTS ({standbyAlerts.length})
                          </div>
                          <button
                            onClick={() => setStandbyAlerts([])}
                            style={{
                              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
                              fontSize: 10, fontFamily: "'Share Tech Mono'", cursor: 'pointer'
                            }}
                          >
                            CLEAR
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {standbyAlerts.map(alert => {
                            const isAttached = alert.attachedHospitalId === authHospital?.hospitalId || alert.attachedHospitalId === activeHospitalId;
                            return (
                              <div key={alert.reqId} style={{
                                background: 'rgba(0,255,136,0.02)',
                                border: `1px solid ${isAttached ? '#00ff88' : 'rgba(255,255,255,0.05)'}`,
                                borderRadius: 6, padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}>
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff' }}>
                                    Standby Alert: {alert.patientDetails?.name || 'Emergency Patient'}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>
                                    Vitals Standby Check • {isAttached ? '🚨 Closest Primary Attached Hospital' : 'Alternative Standby Support'}
                                  </div>
                                </div>
                                <div style={{ fontSize: 10, fontFamily: "'Share Tech Mono'", color: isAttached ? '#00ff88' : 'rgba(255,255,255,0.4)' }}>
                                  {isAttached ? 'PRIMARY TARGET' : 'STANDBY'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* --- HUGE CONNECTIONS SCALING: Request Queue --- */}
                    {requestQueue.length > 0 && (
                      <div style={{ background: 'rgba(255,184,0,0.05)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 10, padding: 15 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ffb800', letterSpacing: '0.1em', fontWeight: 700 }}>
                            ⚡ REGIONAL ADMISSION QUEUE ({requestQueue.length})
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {requestQueue.map(req => (
                            <div key={req.id} style={{
                              background: incomingRequest?.id === req.id ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${incomingRequest?.id === req.id ? '#ffb800' : 'rgba(255,255,255,0.1)'}`,
                              borderRadius: 6, padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 'bold' }}>{req.fieldReport?.patientName || 'Emergency Case'}</div>
                                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>{req.ambulanceDetails?.unitId} · {req.fieldReport?.condition}</div>
                              </div>
                              <button
                                onClick={() => {
                                  setIncomingRequest(req);
                                  setAdmissionStep(0);
                                }}
                                style={{
                                  background: '#ffb800', border: 'none', borderRadius: 4, padding: '4px 10px',
                                  color: '#000', fontSize: 10, fontWeight: 'bold', fontFamily: "'Orbitron'", cursor: 'pointer'
                                }}
                              >
                                OPEN TRIAGE
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
                      LIVE VITALS MONITORING
                    </div>

                    {chartData.length === 0 ? (
                      <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(160,200,255,0.3)', fontFamily: "'Share Tech Mono'", fontSize: 13,
                        flexDirection: 'column', gap: 12, padding: '40px 0'
                      }}>
                        <div style={{ fontSize: 32 }}>📟</div>
                        <div>{activeMissionId ? "AWAITING PATIENT ONBOARDING (AMBULANCE)" : "AWAITING ACTIVE MISSION CONNECTION"}</div>
                      </div>
                    ) : (
                      <>
                        <VitalChart data={chartData} dataKey="heartRate" color="#ff6b6b" label="HEART RATE" unit="bpm" critHigh={110} critLow={50} domain={[40, 140]} />
                        <VitalChart data={chartData} dataKey="spo2" color="#00c8ff" label="SpO2 SATURATION" unit="%" critLow={92} domain={[85, 102]} />
                        <VitalChart data={chartData} dataKey="systolic" color="#ffb800" label="SYSTOLIC BP" unit="mmHg" critHigh={150} domain={[70, 200]} />
                        <VitalChart data={chartData} dataKey="respRate" color="#88ff88" label="RESPIRATORY RATE" unit="br/min" critHigh={25} critLow={12} domain={[8, 40]} />
                        <VitalChart data={chartData} dataKey="temperature" color="#ff88aa" label="TEMPERATURE" unit="°C" critHigh={38.5} domain={[34, 42]} />
                      </>
                    )}

                    {/* Incident notes */}
                    {incidentNotes.length > 0 && (
                      <div style={{
                        background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)',
                        borderRadius: 10, padding: 16,
                      }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ffb800', letterSpacing: '0.1em', marginBottom: 10 }}>
                          📋 FIELD NOTES FROM PARAMEDIC
                        </div>
                        {incidentNotes.map((n, i) => (
                          <div key={i} style={{ fontSize: 13, color: 'rgba(160,200,255,0.8)', marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid rgba(255,180,0,0.3)' }}>
                            {n.note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CENTRE: Map + Patient */}
                  <div style={{ padding: '20px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, borderLeft: '1px solid rgba(0,200,255,0.08)' }}>
                    {/* Map */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
                          🗺 LIVE AMBULANCE TRACKING
                        </div>
                        {trafficDelay && (
                          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: '#ffb800', animation: 'blink 1s step-end infinite' }}>
                            ⚠ HEAVY TRAFFIC DELAY
                          </div>
                        )}
                      </div>
                      <div style={{
                        borderRadius: 10, overflow: 'hidden',
                        border: '1px solid rgba(0,200,255,0.2)',
                        height: 320, position: 'relative',
                      }}>
                        <LiveRouteMap
                          routeGeometry={routePath ? { type: 'LineString', coordinates: routePath.map(p => [p[1] || p.lng, p[0] || p.lat]) } : null}
                          ambulancePosition={location ? { lat: location.lat, lng: location.lng, heading: location.heading } : null}
                          originMarker={incidentLocation}
                          destinationMarker={hospitalGps || activeHospital?.pos}
                          junctions={[]}
                          mode="hospital"
                        />
                      </div>
                    </div>

                    {/* Patient Record */}
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
                        📋 PATIENT RECORD
                      </div>
                      <PatientPanel patient={patient} vitals={latestVitals} activeMissionId={activeMissionId} />

                      {patient && latestVitals && (
                        <div style={{ marginTop: 16 }}>
                          <PhysiologicalWaveforms
                            vitals={latestVitals}
                            news2Score={calculateTriage(latestVitals).level === 'RED' ? 7 : 0}
                          />
                        </div>
                      )}

                      {activeMissionId && (
                        <div style={{
                          marginTop: 16,
                          background: 'rgba(5, 15, 40, 0.8)',
                          border: '1px solid rgba(0, 200, 255, 0.2)',
                          borderRadius: 10,
                          padding: 16,
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                        }}>
                          <div style={{
                            fontFamily: "'Orbitron'",
                            fontSize: 11,
                            color: '#00ff88',
                            letterSpacing: '0.1em',
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <span>📋 PRE-HOSPITAL CLINICAL CHECKLIST</span>
                            <span style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>REAL-TIME SYNC</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {Object.entries(CLINICAL_PROTOCOLS).map(([protoName, steps]) => {
                              const activeSteps = steps.filter(step => checklist[step]);
                              const progressCount = activeSteps.length;
                              return (
                                <div key={protoName} style={{
                                  border: '1px solid rgba(160,200,255,0.08)',
                                  borderRadius: 6,
                                  padding: 10,
                                  background: progressCount > 0 ? 'rgba(0,200,255,0.02)' : 'rgba(0,0,0,0.2)'
                                }}>
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: 10,
                                    fontFamily: "'Orbitron'",
                                    color: progressCount === steps.length ? '#00ff88' : progressCount > 0 ? '#ffb800' : 'rgba(160,200,255,0.6)',
                                    marginBottom: 8,
                                    fontWeight: 'bold'
                                  }}>
                                    <span>{protoName}</span>
                                    <span>{progressCount}/{steps.length} DONE</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {steps.map((step) => {
                                      const completedTime = checklist[step];
                                      return (
                                        <div key={step} style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '4px 8px',
                                          background: completedTime ? 'rgba(0,255,136,0.05)' : 'transparent',
                                          borderRadius: 4,
                                          border: `1px solid ${completedTime ? 'rgba(0,255,136,0.2)' : 'transparent'}`
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color: completedTime ? '#00ff88' : 'rgba(160,200,255,0.3)', fontSize: 12 }}>
                                              {completedTime ? '✓' : '○'}
                                            </span>
                                            <span style={{
                                              fontSize: 11,
                                              color: completedTime ? '#00ff88' : '#e0eaff',
                                              textDecoration: completedTime ? 'line-through' : 'none',
                                              opacity: completedTime ? 1 : 0.7
                                            }}>{step}</span>
                                          </div>
                                          {completedTime && (
                                            <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(0,255,136,0.7)' }}>
                                              {completedTime}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {patient && activeMissionId && (
                        <div style={{
                          marginTop: 16,
                          background: 'rgba(5, 20, 50, 0.6)',
                          backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(0, 200, 255, 0.2)',
                          borderRadius: 10,
                          padding: 16,
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                        }}>
                          <div style={{
                            fontFamily: "'Orbitron'",
                            fontSize: 11,
                            color: '#00ff88',
                            letterSpacing: '0.1em',
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}>
                            🔒 EMR LOCK & RESERVE PANEL
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                              { key: 'traumaBay', label: '🏥 Trauma Bay 1' },
                              { key: 'bloodUnits', label: '🩸 Blood Units (O-Neg)' },
                              { key: 'ventilatorStandby', label: '🫁 Ventilator Standby' }
                            ].map(item => {
                              const isLocked = resourceLocks[item.key];
                              return (
                                <label
                                  key={item.key}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: isLocked ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                                    border: `1px solid ${isLocked ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                                    borderRadius: 6,
                                    padding: '10px 14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    fontFamily: "'Share Tech Mono'",
                                    fontSize: 13,
                                    color: isLocked ? '#00ff88' : '#e0eaff'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span>{isLocked ? '✅' : '🔓'}</span>
                                    <span>{item.label}</span>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={isLocked || false}
                                    onChange={(e) => {
                                      const updatedLocks = {
                                        ...resourceLocks,
                                        [item.key]: e.target.checked
                                      };
                                      setResourceLocks(updatedLocks);
                                      // Update local activeMissions registry entry
                                      setActiveMissions(prev => {
                                        const existing = prev[activeMissionId];
                                        if (!existing) return prev;
                                        return {
                                          ...prev,
                                          [activeMissionId]: { ...existing, resourceLocks: updatedLocks }
                                        };
                                      });
                                      // Emit event to server
                                      socket?.emit('hospital-lock-resources', { reqId: activeMissionId, locks: updatedLocks });
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Previous Hospital Reports (Reroute History) */}
                    {previousReports && previousReports.length > 0 && (
                      <div style={{
                        background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
                        borderRadius: 10, padding: 16, marginTop: 4
                      }}>
                        <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', letterSpacing: '0.1em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          🔄 REROUTE HISTORY <span style={{ fontSize: 9, opacity: 0.6 }}>(PRIOR HOSPITALS)</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {previousReports.map((report, i) => (
                            <div key={i} style={{
                              fontSize: 12,
                              borderLeft: `2px solid ${report.triageColor || '#00ff88'}`,
                              paddingLeft: 12,
                              marginBottom: i < previousReports.length - 1 ? 8 : 0,
                              paddingBottom: i < previousReports.length - 1 ? 8 : 0,
                              borderBottom: i < previousReports.length - 1 ? '1px solid rgba(160,200,255,0.05)' : 'none'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <div style={{ color: '#e0eaff', fontWeight: 600, fontFamily: "'Rajdhani'" }}>{report.hospitalName}</div>
                                <div style={{
                                  fontSize: 9, padding: '2px 6px', borderRadius: 3,
                                  background: `${report.triageColor}22`, color: report.triageColor,
                                  fontFamily: "'Orbitron'", fontWeight: 700
                                }}>{report.triageLabel}</div>
                              </div>
                              <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 10, fontFamily: "'Share Tech Mono'", marginBottom: 6 }}>{report.timestamp}</div>
                              <div style={{ color: 'rgba(160,200,255,0.7)', fontSize: 11, lineHeight: 1.4, fontStyle: 'italic' }}>
                                "{report.notes}"
                              </div>
                              {report.vitals && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 6, opacity: 0.8 }}>
                                  <div style={{ fontSize: 9, color: '#ff6b6b' }}>❤️ {report.vitals.heartRate}</div>
                                  <div style={{ fontSize: 9, color: '#00c8ff' }}>💧 {report.vitals.spo2}%</div>
                                  <div style={{ fontSize: 9, color: '#ffb800' }}>🩸 {report.vitals.systolic}/{report.vitals.diastolic}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Hospital Readiness */}
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 12 }}>
                        ⚙ RESOURCE PREPARATION
                      </div>
                      <ResourcePanel socket={socket} bedsList={bedsList} setBedsList={setBedsList} hospitalId={authHospital?.hospitalId || activeHospitalId} />
                    </div>
                  </div>

                  {/* RIGHT: Chat */}
                  <div style={{
                    background: 'rgba(3,8,20,0.95)',
                    borderLeft: '1px solid rgba(0,200,255,0.1)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid rgba(0,200,255,0.1)',
                      fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em',
                    }}>
                      📞 PARAMEDIC COMM LINK
                    </div>

                    <VideoCall
                      socket={socket}
                      role="hospital"
                      missionId={activeMissionId}
                    />

                    {/* Quick directives */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,200,255,0.08)' }}>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginBottom: 8, letterSpacing: '0.1em' }}>
                        QUICK DIRECTIVES
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          'Administer O2 at 15L/min',
                          'Start IV line – 0.9% NaCl',
                          'Give Aspirin 325mg now',
                          'Do NOT give morphine – allergy',
                          'ETA: prepare trauma bay 2',
                        ].map(d => (
                          <button key={d} onClick={() => socket?.emit('chat-message', { text: d, from: 'hospital', fromLabel: '🏥 Dr. Command' })}
                            style={{
                              padding: '6px 10px', textAlign: 'left',
                              background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.15)',
                              borderRadius: 5, color: 'rgba(160,200,255,0.7)', fontSize: 11,
                              cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Rajdhani'",
                            }}
                          >{d}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ flex: 1, padding: '12px 16px 40px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <ChatPanel socket={socket} messages={messages} activeMissionId={activeMissionId} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'corridor' && (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden', width: '100%' }}>
                  {(() => {
                    const mission = activeMissions[activeMissionId];
                    return (
                      <AIEmergencyCorridorView
                        socket={socket}
                        connected={connected}
                        activeMissionId={activeMissionId}
                        patientLoc={mission?.patient?.userLocation || incidentLocation}
                        ambulanceLoc={mission?.location}
                        hospitalLoc={hospitalGps || authHospital}
                        hospitalName={authHospital?.name || 'Your Trauma Center'}
                        routePath={mission?.routePath}
                        etaSeconds={mission?.etaSeconds || 180}
                        distanceKm={mission?.distanceRemaining || 1.8}
                        speedKmh={mission?.speedKmh || 55}
                        onBack={() => handleTabChange('triage')}
                      />
                    );
                  })()}
                </div>
              )}

              {/* Other Tabs */}
              {activeTab === 'er_queue' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
                  
                  {/* Bed Occupancy Grid */}
                  <div style={{ background: 'rgba(5, 15, 40, 0.8)', border: '1px solid rgba(0, 200, 255, 0.2)', borderRadius: 12, padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <h3 style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', margin: 0, letterSpacing: '0.05em' }}>🛌 REAL-TIME ER BED OCCUPANCY TRACKER</h3>
                        <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', margin: '4px 0 0 0' }}>Click a bed to toggle its current status. Changes are saved instantly to the database.</p>
                      </div>
                      <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 13, color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '4px 10px', borderRadius: 4 }}>
                        DATABASE STORAGE PERSISTENCE ACTIVE
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                      {(bedsList && bedsList.length > 0 ? bedsList : Array.from({ length: 12 }, (_, i) => ({
                        id: i + 1,
                        status: 'AVAILABLE',
                        label: `Bed ${(i + 1).toString().padStart(2, '0')}`
                      }))).map((bed) => {
                        const statusColor = bed.status === 'OCCUPIED' ? '#ff4444' : bed.status === 'RESERVED' ? '#ffb800' : '#00ff88';
                        return (
                          <button
                            key={bed.id}
                            onClick={async () => {
                              const nextStatus = bed.status === 'AVAILABLE' ? 'RESERVED' : bed.status === 'RESERVED' ? 'OCCUPIED' : 'AVAILABLE';
                              const activeBeds = bedsList && bedsList.length > 0 ? bedsList : Array.from({ length: 12 }, (_, i) => ({
                                id: i + 1,
                                status: 'AVAILABLE',
                                label: `Bed ${(i + 1).toString().padStart(2, '0')}`
                              }));
                              const updatedBeds = activeBeds.map(b => b.id === bed.id ? { ...b, status: nextStatus } : b);
                              setBedsList(updatedBeds);
                              
                              const hospId = authHospital?.hospitalId || activeHospitalId;
                              if (hospId) {
                                const token = sessionStorage.getItem('rescuelink_token');
                                try {
                                  await fetch(`/api/hospitals/${hospId}/beds`, {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ beds: updatedBeds })
                                  });
                                } catch (err) {
                                  console.error('Failed to sync beds status to DB:', err);
                                }
                              }
                            }}
                            style={{
                              background: 'rgba(5, 10, 30, 0.4)',
                              border: `1px solid ${statusColor}44`,
                              borderRadius: 8,
                              padding: 16,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.2s'
                            }}
                          >
                            <span style={{ fontSize: 20 }}>🛏️</span>
                            <span style={{ fontSize: 11, color: '#e0eaff', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>{bed.label}</span>
                            <span style={{ fontSize: 9, color: statusColor, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>{bed.status}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Attending Staff Management */}
                  <div style={{ background: 'rgba(5, 15, 40, 0.8)', border: '1px solid rgba(0, 200, 255, 0.2)', borderRadius: 12, padding: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <div>
                        <h3 style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', margin: 0, letterSpacing: '0.05em' }}>👨‍⚕️ HOSPITAL STAFF & DUTY ROSTER</h3>
                        <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', margin: '4px 0 0 0' }}>Manage emergency physicians, toggle active shift duty, and assign specialization parameters.</p>
                      </div>
                      <button
                        onClick={() => setShowAddDoctorModal(true)}
                        style={{
                          background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
                          borderRadius: 6, padding: '8px 16px', color: '#00c8ff',
                          fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        + REGISTER NEW DOCTOR
                      </button>
                    </div>

                    {doctorsList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", fontSize: 12 }}>
                        NO DOCTORS REGISTERED IN HOSPITAL DEPT. CLICK REGISTER ABOVE TO OBOARD A PHYSICIAN.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(0,200,255,0.2)', color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 10 }}>
                              <th style={{ padding: 12 }}>NAME</th>
                              <th style={{ padding: 12 }}>SPECIALITY</th>
                              <th style={{ padding: 12 }}>CONTACT</th>
                              <th style={{ padding: 12 }}>EMAIL</th>
                              <th style={{ padding: 12 }}>SHIFT STATUS</th>
                              <th style={{ padding: 12 }}>CURRENT STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {doctorsList.map((doc) => (
                              <tr key={doc.id} style={{ borderBottom: '1px solid rgba(160,200,255,0.05)', color: '#e0eaff' }}>
                                <td style={{ padding: 12, fontWeight: 'bold' }}>{doc.name}</td>
                                <td style={{ padding: 12 }}>{doc.specialty}</td>
                                <td style={{ padding: 12, fontFamily: "'Share Tech Mono'" }}>{doc.mobile || 'N/A'}</td>
                                <td style={{ padding: 12, fontSize: 12, opacity: 0.8 }}>{doc.email}</td>
                                <td style={{ padding: 12 }}>
                                  <button
                                    onClick={async () => {
                                      const hospId = authHospital?.hospitalId || activeHospitalId;
                                      const token = sessionStorage.getItem('rescuelink_token');
                                      try {
                                        const res = await fetch(`/api/hospitals/${hospId}/doctors/${doc.id}`, {
                                          method: 'PUT',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`
                                          },
                                          body: JSON.stringify({ isOnDuty: !doc.is_on_duty })
                                        });
                                        if (res.ok) {
                                          const updated = await res.json();
                                          setDoctorsList(prev => prev.map(d => d.id === doc.id ? { ...d, is_on_duty: updated.is_on_duty } : d));
                                          showAlert(`${doc.name} shift toggled to ${updated.is_on_duty ? 'ON DUTY' : 'OFF DUTY'}`);
                                        }
                                      } catch (e) {
                                        console.error(e);
                                      }
                                    }}
                                    style={{
                                      padding: '4px 10px',
                                      background: doc.is_on_duty ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                                      border: `1px solid ${doc.is_on_duty ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                                      borderRadius: 4,
                                      color: doc.is_on_duty ? '#00ff88' : 'rgba(255,255,255,0.6)',
                                      fontSize: 10,
                                      fontFamily: "'Orbitron'",
                                      fontWeight: 'bold',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {doc.is_on_duty ? 'ON SHIFT' : 'OFF DUTY'}
                                  </button>
                                </td>
                                <td style={{ padding: 12 }}>
                                  <select
                                    value={doc.doctor_status || 'AVAILABLE'}
                                    onChange={async (e) => {
                                      const hospId = authHospital?.hospitalId || activeHospitalId;
                                      const token = sessionStorage.getItem('rescuelink_token');
                                      try {
                                        const res = await fetch(`/api/hospitals/${hospId}/doctors/${doc.id}`, {
                                          method: 'PUT',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`
                                          },
                                          body: JSON.stringify({ doctorStatus: e.target.value })
                                        });
                                        if (res.ok) {
                                          const updated = await res.json();
                                          setDoctorsList(prev => prev.map(d => d.id === doc.id ? { ...d, doctor_status: updated.doctor_status } : d));
                                          showAlert(`${doc.name} status updated to ${updated.doctor_status}`);
                                        }
                                      } catch (err) {
                                        console.error(err);
                                      }
                                    }}
                                    style={{
                                      background: 'rgba(5, 10, 30, 0.6)',
                                      border: '1px solid rgba(0,200,255,0.2)',
                                      borderRadius: 4,
                                      padding: '4px 8px',
                                      color: doc.doctor_status === 'AVAILABLE' ? '#00ff88' : doc.doctor_status === 'BUSY' ? '#ffb800' : '#ff4444',
                                      fontWeight: 'bold',
                                      fontSize: 11,
                                      fontFamily: "'Share Tech Mono'",
                                      outline: 'none',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="AVAILABLE" style={{ color: '#00ff88', background: '#0a1526' }}>AVAILABLE</option>
                                    <option value="BUSY" style={{ color: '#ffb800', background: '#0a1526' }}>BUSY</option>
                                    <option value="IN_SURGERY" style={{ color: '#ff4444', background: '#0a1526' }}>IN SURGERY</option>
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Add Doctor Modal Overlay */}
                  {showAddDoctorModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
                      <div style={{ background: '#0a1526', border: '1px solid #00c8ff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 450, boxSizing: 'border-box', boxShadow: '0 0 30px rgba(0,200,255,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em' }}>👨‍⚕️ OBOARD MEDICAL STAFF</div>
                          <button onClick={() => setShowAddDoctorModal(false)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: 24, cursor: 'pointer' }}>×</button>
                        </div>

                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const hospId = authHospital?.hospitalId || activeHospitalId;
                          const token = sessionStorage.getItem('rescuelink_token');
                          try {
                            const res = await fetch(`/api/hospitals/${hospId}/doctors`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                name: newDoctorName,
                                email: newDoctorEmail,
                                password: newDoctorPassword,
                                specialty: newDoctorSpecialty,
                                mobile: newDoctorMobile
                              })
                            });
                            if (res.ok) {
                              const added = await res.json();
                              setDoctorsList(prev => [...prev, { ...added, is_on_duty: true, doctor_status: 'AVAILABLE' }]);
                              setNewDoctorName('');
                              setNewDoctorEmail('');
                              setNewDoctorPassword('');
                              setNewDoctorSpecialty('');
                              setNewDoctorMobile('');
                              setShowAddDoctorModal(false);
                              showAlert('✅ Doctor successfully added to hospital registry!');
                            } else {
                              const data = await res.json();
                              showAlert('⚠️ Registration failed: ' + (data.error || 'Unknown error'));
                            }
                          } catch (err) {
                            console.error(err);
                            showAlert('⚠️ Failed to add doctor.');
                          }
                        }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PHYSICIAN FULL NAME</label>
                            <input type="text" value={newDoctorName} onChange={(e) => setNewDoctorName(e.target.value)} required placeholder="e.g. Dr. Robert Chen" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>SPECIALITY</label>
                            <input type="text" value={newDoctorSpecialty} onChange={(e) => setNewDoctorSpecialty(e.target.value)} required placeholder="e.g. Cardiologist / Trauma Surgeon" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CONTACT PHONE NUMBER</label>
                            <input type="text" value={newDoctorMobile} onChange={(e) => setNewDoctorMobile(e.target.value)} required placeholder="e.g. 9876543210" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>EMAIL ADDRESS</label>
                            <input type="email" value={newDoctorEmail} onChange={(e) => setNewDoctorEmail(e.target.value)} required placeholder="dr.chen@rescuelink.com" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PASSWORD</label>
                            <input type="password" value={newDoctorPassword} onChange={(e) => setNewDoctorPassword(e.target.value)} required placeholder="••••••••" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                          </div>

                          <button type="submit" className="rl-btn-primary" style={{ width: '100%', marginTop: 8 }}>
                            VERIFY & ACTIVATE STAFF
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'blood_bank' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                  <BloodEmergencyNetwork socket={socket} userLocation={hospitalGps} />
                </div>
              )}

              {activeTab === 'insurance' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 600 }}>
                    <InsurancePanel hospitalId={authHospital?.hospitalId} />
                  </div>
                </div>
              )}

              {activeTab === 'mass_casualty' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 800 }}>
                    <MassCasualtyPanel socket={socket} />
                  </div>
                </div>
              )}

              {activeTab === 'analytics' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: '100%' }}>
                    <HospitalAnalytics hospitalId={authHospital?.hospitalId || activeHospitalId} />
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                  <HospitalProfileSettings
                    authHospital={authHospital}
                    setAuthHospital={setAuthHospital}
                    setHospitalGps={setHospitalGps}
                    setIcuBeds={setIcuBeds}
                    socket={socket}
                    icuBeds={icuBeds}
                  />
                </div>
              )}
            
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MCITriageCommander() {
  const [isActive, setIsActive] = useState(false);

  const mockPatients = [
    { name: 'Patient Alpha', age: 45, condition: 'Severe Trauma - Motor Vehicle Accident', status: 'RED', hr: 124, spo2: 89, eta: '4 mins' },
    { name: 'Patient Beta', age: 62, condition: 'Suspected Acute Myocardial Infarction', status: 'RED', hr: 110, spo2: 94, eta: '7 mins' },
    { name: 'Patient Gamma', age: 29, condition: 'Fracture / Laceration - Stable', status: 'YELLOW', hr: 88, spo2: 98, eta: '12 mins' },
    { name: 'Patient Delta', age: 19, condition: 'Minor Contusion', status: 'GREEN', hr: 72, spo2: 99, eta: '18 mins' }
  ];

  if (!isActive) {
    return (
      <div style={{ background: 'rgba(5,20,45,0.4)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Orbitron'", color: '#00c8ff', fontSize: 13 }}>🚨 MASS CASUALTY INCIDENT (MCI) MODE</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>Enable multi-patient triage feeds and Incident Commander maps.</p>
        </div>
        <button
          onClick={() => setIsActive(true)}
          style={{ background: '#ff3333', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontFamily: "'Orbitron'", fontWeight: 'bold', fontSize: 10, cursor: 'pointer', boxShadow: '0 0 15px rgba(255,50,50,0.4)' }}
        >
          ACTIVATE MCI MODE
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(25,5,5,0.85)', border: '2px solid #ff3333', borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 0 30px rgba(255,50,50,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,50,50,0.3)', paddingBottom: 10, marginBottom: 15 }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "'Orbitron'", color: '#ff4444', fontSize: 15, letterSpacing: '0.1em' }}>🚨 INCIDENT COMMANDER CONSOLE - ACTIVE MCI</h3>
          <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'rgba(255,100,100,0.7)', fontFamily: "'Share Tech Mono'" }}>LEVEL 1 DISASTER DECLARED • DUAL STREAMS DETECTED</p>
        </div>
        <button
          onClick={() => setIsActive(false)}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, color: '#fff', padding: '4px 10px', fontSize: 9, cursor: 'pointer', fontFamily: "'Orbitron'" }}
        >
          DEACTIVATE
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
        {mockPatients.map((p, idx) => {
          const colorMap = { RED: '#ff3333', YELLOW: '#ffb800', GREEN: '#00ff88', BLACK: '#333333' };
          return (
            <div key={idx} style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${colorMap[p.status]}40`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: 13, color: '#fff' }}>{p.name} ({p.age}y)</span>
                <span style={{ fontSize: 9, padding: '2px 8px', background: colorMap[p.status], color: p.status === 'GREEN' || p.status === 'YELLOW' ? '#000' : '#fff', borderRadius: 12, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>
                  {p.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(220,230,255,0.8)', marginBottom: 6 }}>{p.condition}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.6)' }}>
                <div>HR: <span style={{ color: p.hr > 100 ? '#ff4444' : '#00ff88', fontWeight: 'bold' }}>{p.hr} bpm</span></div>
                <div>SpO2: <span style={{ color: p.spo2 < 92 ? '#ff4444' : '#00e5ff', fontWeight: 'bold' }}>{p.spo2}%</span></div>
                <div>ETA: <span style={{ color: '#ffb800', fontWeight: 'bold' }}>{p.eta}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceBottleneckPredictor() {
  const data = [
    { time: '13:00 (Now)', currentOccupancy: 72, projectedOccupancy: 72 },
    { time: '14:00 (+1h)', currentOccupancy: null, projectedOccupancy: 76 },
    { time: '15:00 (+2h)', currentOccupancy: null, projectedOccupancy: 81 },
    { time: '16:00 (+3h)', currentOccupancy: null, projectedOccupancy: 88 },
    { time: '17:00 (+4h)', currentOccupancy: null, projectedOccupancy: 86 }
  ];

  return (
    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(255,100,100,0.25)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ffb800', letterSpacing: '0.1em' }}>⚠️ AI CAPACITY & BOTTLENECK FORECASTER (4-Hour Projection)</div>
        <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,68,68,0.15)', color: '#ff4444', borderRadius: 4, fontFamily: "'Share Tech Mono'", fontWeight: 'bold' }}>Saturation Risk: 92% (CRITICAL)</span>
      </div>

      <div style={{ background: 'rgba(255,68,68,0.06)', borderLeft: '4px solid #ff4444', padding: 12, borderRadius: '0 8px 8px 0', fontSize: 12, color: 'rgba(220,230,255,0.9)', marginBottom: 16, lineHeight: 1.5 }}>
        <strong>🤖 Dynamic Diversion Advisory:</strong> ICU & trauma bed utilization is projected to exceed the safe threshold (85%) by 16:00 due to local mass casualty intake. Automatic diversion recommended for non-critical inbound dispatches.
      </div>

      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="time" stroke="rgba(160,200,255,0.4)" tick={{ fontSize: 9 }} />
            <YAxis stroke="rgba(160,200,255,0.4)" domain={[40, 100]} tick={{ fontSize: 9 }} />
            <Tooltip contentStyle={{ background: '#0a1526', border: '1px solid rgba(0,200,255,0.2)', fontSize: 10 }} />
            <ReferenceLine y={85} stroke="#ff4444" strokeDasharray="4 4" label={{ value: 'SATURATION THRESHOLD', fill: '#ff4444', fontSize: 8, position: 'top' }} />
            <Line type="monotone" dataKey="projectedOccupancy" stroke="#ffb800" strokeWidth={2} dot={{ r: 4 }} name="Projected Util %" />
            <Line type="monotone" dataKey="currentOccupancy" stroke="#00c8ff" strokeWidth={3} dot={{ r: 6 }} name="Current Occupancy %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ThreeDResuscitationMonitor({ vitals }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;
    let animationFrameId;
    let cleanupFn;

    import('three').then((THREE) => {
    if (!mountRef.current) return;

    // Set up Three.js scene, camera, renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#030915');

    const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Create torso capsule wireframe avatar
    const bodyGroup = new THREE.Group();

    // Torso (capsule/cylinder)
    const torsoGeom = new THREE.CylinderGeometry(0.8, 0.6, 2.2, 16);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x00c8ff,
      wireframe: true,
      emissive: 0x002c44,
      transparent: true,
      opacity: 0.8
    });
    const torso = new THREE.Mesh(torsoGeom, bodyMat);
    bodyGroup.add(torso);

    // Head
    const headGeom = new THREE.SphereGeometry(0.5, 16, 16);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.position.y = 1.6;
    bodyGroup.add(head);

    // Glowing heart node
    const heartGeom = new THREE.SphereGeometry(0.18, 16, 16);
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xff0044 });
    const heart = new THREE.Mesh(heartGeom, heartMat);
    heart.position.set(0.2, 0.5, 0.6); // left chest area
    bodyGroup.add(heart);

    scene.add(bodyGroup);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00c8ff, 1.5);
    dirLight.position.set(2, 4, 6);
    scene.add(dirLight);

    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Torso breathing rate
      const rr = vitals?.respRate || 16;
      const breatheSpeed = (rr / 60) * Math.PI * 2;
      const breatheScale = 1.0 + Math.sin(time * breatheSpeed) * 0.08;
      torso.scale.set(breatheScale, 1, breatheScale);

      // Cyanosis skin tone
      const spo2 = vitals?.spo2 || 98;
      if (spo2 < 92) {
        bodyMat.color.setHex(0x3a55ff);
      } else {
        bodyMat.color.setHex(0x00c8ff);
      }

      // Heart pulse
      const hr = vitals?.heartRate || 75;
      const pulseSpeed = (hr / 60) * Math.PI * 2;
      const pulse = 1.0 + Math.abs(Math.sin(time * pulseSpeed)) * 0.35;
      heart.scale.set(pulse, pulse, pulse);

      bodyGroup.rotation.y = time * 0.4;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    cleanupFn = () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (mountRef.current && renderer.domElement) {
        try { mountRef.current.removeChild(renderer.domElement); } catch(e) {}
      }
      torsoGeom.dispose();
      headGeom.dispose();
      heartGeom.dispose();
      bodyMat.dispose();
      heartMat.dispose();
    };
    }); // end dynamic import

    return () => { if (cleanupFn) cleanupFn(); };
  }, [vitals]);

  return (
    <div style={{ background: 'rgba(5,20,45,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#00c8ff', letterSpacing: '0.1em' }}>🧍 INTERACTIVE 3D PATIENT RESUSCITATION AVATAR</div>
        <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 4, fontFamily: "'Share Tech Mono'" }}>WEBGL AVATAR ENGINE</span>
      </div>
      <div ref={mountRef} style={{ width: '100%', height: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(0,200,255,0.1)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(160,200,255,0.4)', marginTop: 8, fontFamily: "'Share Tech Mono'" }}>
        <span>HR Pulse: {vitals?.heartRate || '--'} bpm</span>
        <span>RR Expansion: {vitals?.respRate || '--'} br/min</span>
        <span>SpO2 Cyanosis check: {vitals?.spo2 || '--'}%</span>
      </div>
    </div>
  );
}

function HospitalProfileSettings({ authHospital, setAuthHospital, setHospitalGps, setIcuBeds, socket, icuBeds }) {
  const [pwForm, setPwForm] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwStatus, setPwStatus] = React.useState(null);
  const [pwLoading, setPwLoading] = React.useState(false);
  const [mfaStatus, setMfaStatus] = React.useState(null);
  const [mfaQR, setMfaQR] = React.useState(null);
  const [mfaLoading, setMfaLoading] = React.useState(false);
  const [disable2FAConfirmHosp, setDisable2FAConfirmHosp] = React.useState(false);
  const [notifPrefs, setNotifPrefs] = React.useState({ emailAlerts: true, smsAlerts: false, criticalOnly: false });
  const [saveStatus, setSaveStatus] = React.useState(null);

  const token = sessionStorage.getItem('rescuelink_token');
  const hdrs = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  const hospitalDbId = authHospital?.hospitalId;

  const [profileForm, setProfileForm] = React.useState({
    name: authHospital?.name || '',
    city: authHospital?.city || '',
    state: authHospital?.state || '',
    lat: authHospital?.lat || '',
    lng: authHospital?.lng || '',
    contact_number: authHospital?.contact_number || '',
    total_beds: authHospital?.total_beds || 0,
    icu_beds: icuBeds || authHospital?.icu_beds || 0,
    ventilators: authHospital?.ventilators || 0,
    license_number: authHospital?.license_number || '',
    departments: [],
    bay_capacity: 5,
    trauma_tier: '',
    accreditation_id: ''
  });

  React.useEffect(() => {
    const fetchHospitalDetails = async () => {
      if (!hospitalDbId) return;
      try {
        const res = await fetch(`/api/hospitals/${hospitalDbId}`, { headers: hdrs });
        if (res.ok) {
          const data = await res.json();
          let depts = [];
          try {
            depts = data.departments ? (Array.isArray(data.departments) ? data.departments : JSON.parse(data.departments)) : [];
          } catch (e) {
            depts = data.departments || [];
          }
          setProfileForm({
            name: data.name || '',
            city: data.city || '',
            state: data.state || '',
            lat: data.lat || 0.0,
            lng: data.lng || 0.0,
            contact_number: data.contact_number || '',
            total_beds: data.total_beds || 0,
            icu_beds: data.icu_beds || 0,
            ventilators: data.ventilators || 0,
            license_number: data.license_number || '',
            departments: depts,
            bay_capacity: data.bay_capacity || 5,
            trauma_tier: data.trauma_tier || '',
            accreditation_id: data.accreditation_id || ''
          });
        }
      } catch (e) {
        console.error("Failed to fetch hospital details", e);
      }
    };
    fetchHospitalDetails();
  }, [hospitalDbId]);

  const S = {
    card: { background: 'rgba(5,15,40,0.85)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 24, marginBottom: 0 },
    label: { display: 'block', fontSize: 10, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.55)', marginBottom: 6, letterSpacing: '0.07em', textTransform: 'uppercase' },
    input: { width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 12, color: '#fff', outline: 'none', fontSize: 13, boxSizing: 'border-box', fontFamily: "'Share Tech Mono'" },
    btn: (color) => ({ padding: '10px 22px', background: `rgba(${color},0.14)`, border: `1px solid rgba(${color},0.4)`, borderRadius: 8, color: `rgb(${color})`, fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em', transition: 'all 0.2s' }),
    sectionTitle: { fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 },
    statusMsg: (ok) => ({ marginTop: 10, padding: '8px 14px', borderRadius: 6, background: ok ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', border: `1px solid ${ok ? '#00ff88' : '#ff4444'}`, color: ok ? '#00ff88' : '#ff4444', fontSize: 11, fontFamily: "'Share Tech Mono'" })
  };

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`/api/hospitals/${hospitalDbId}`, {
        method: 'PUT', headers: hdrs,
        body: JSON.stringify(profileForm)
      });
      if (res.ok) {
        const data = await res.json();
        setSaveStatus({ ok: true, msg: 'Hospital profile updated and broadcast to network!' });
        setAuthHospital(prev => ({
          ...prev,
          name: data.name,
          lat: data.lat,
          lng: data.lng,
          ventilators: data.ventilators
        }));
        setHospitalGps({ lat: data.lat, lng: data.lng });
        setIcuBeds(data.icu_beds);
        if (socket) socket.emit('register-hospital', { hospitalId: data.id, name: data.name, adminName: authHospital.adminName, id: data.id, lat: data.lat, lng: data.lng, token });
      } else { const d = await res.json(); setSaveStatus({ ok: false, msg: d.error || 'Update failed' }); }
    } catch (err) { setSaveStatus({ ok: false, msg: 'Connection error' }); }
    setTimeout(() => setSaveStatus(null), 4000);
  };

  const handleChangePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwStatus({ ok: false, msg: 'Passwords do not match' }); return; }
    if (pwForm.newPassword.length < 6) { setPwStatus({ ok: false, msg: 'Password must be at least 6 characters' }); return; }
    setPwLoading(true);
    try {
      const res = await fetch(`/api/hospitals/${hospitalDbId}/change-password`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword })
      });
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
    } catch (err) { setMfaStatus({ ok: false, msg: 'Connection error' }); }
    setMfaLoading(false);
  };

  const handleDisable2FA = async () => {
    setDisable2FAConfirmHosp(false);
    setMfaLoading(true);
    try {
      const res = await fetch('/api/mfa/disable', { method: 'POST', headers: hdrs });
      const d = await res.json();
      setMfaStatus({ ok: res.ok, msg: d.message || d.error });
      setMfaQR(null);
    } catch (err) { setMfaStatus({ ok: false, msg: 'Connection error' }); }
    setMfaLoading(false);
    setTimeout(() => setMfaStatus(null), 5000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 2FA Disable Confirm Modal */}
      {disable2FAConfirmHosp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDisable2FAConfirmHosp(false)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,68,68,0.4)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%', boxShadow: '0 0 40px rgba(255,68,68,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ff4444', fontWeight: 900, marginBottom: 8 }}>🔓 DISABLE 2FA</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 20, lineHeight: 1.65 }}>
              Removing 2FA will leave your hospital account protected only by your password.<br /><br />
              <strong style={{ color: '#ffb800' }}>This reduces security significantly.</strong>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleDisable2FA} style={{ flex: 1, padding: '10px', background: 'rgba(255,40,40,0.14)', border: '1px solid rgba(255,40,40,0.5)', borderRadius: 8, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                🔓 YES, DISABLE 2FA
              </button>
              <button onClick={() => setDisable2FAConfirmHosp(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Edit Hospital Profile */}
      <div style={S.card}>
        <div style={S.sectionTitle}>🏥 Edit Hospital Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Hospital Name</label>
            <input style={S.input} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>City</label>
            <input style={S.input} value={profileForm.city} onChange={e => setProfileForm({ ...profileForm, city: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>State</label>
            <input style={S.input} value={profileForm.state} onChange={e => setProfileForm({ ...profileForm, state: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>Latitude</label>
            <input type="number" step="0.0001" style={S.input} value={profileForm.lat} onChange={e => setProfileForm({ ...profileForm, lat: parseFloat(e.target.value) || 0.0 })} />
          </div>
          <div>
            <label style={S.label}>Longitude</label>
            <input type="number" step="0.0001" style={S.input} value={profileForm.lng} onChange={e => setProfileForm({ ...profileForm, lng: parseFloat(e.target.value) || 0.0 })} />
          </div>
          <div>
            <label style={S.label}>Contact Number</label>
            <input style={S.input} value={profileForm.contact_number} onChange={e => setProfileForm({ ...profileForm, contact_number: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>Total Beds</label>
            <input type="number" style={S.input} value={profileForm.total_beds} onChange={e => setProfileForm({ ...profileForm, total_beds: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={S.label}>Total ICU Beds</label>
            <input type="number" style={S.input} value={profileForm.icu_beds} onChange={e => setProfileForm({ ...profileForm, icu_beds: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={S.label}>Ventilators Available</label>
            <input type="number" style={S.input} value={profileForm.ventilators} onChange={e => setProfileForm({ ...profileForm, ventilators: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={S.label}>License Number</label>
            <input style={S.input} value={profileForm.license_number} onChange={e => setProfileForm({ ...profileForm, license_number: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>Accreditation ID</label>
            <input style={S.input} value={profileForm.accreditation_id} onChange={e => setProfileForm({ ...profileForm, accreditation_id: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>Emergency Bay Capacity</label>
            <input type="number" style={S.input} value={profileForm.bay_capacity} onChange={e => setProfileForm({ ...profileForm, bay_capacity: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={S.label}>Trauma Tier</label>
            <select style={S.input} value={profileForm.trauma_tier} onChange={e => setProfileForm({ ...profileForm, trauma_tier: e.target.value })}>
              <option value="">-- Select Tier --</option>
              <option value="Tier-1">Level 1 — Comprehensive Trauma Center</option>
              <option value="Tier-2">Level 2 — Major Trauma Center</option>
              <option value="Tier-3">Level 3 — General Emergency Room</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <label style={S.label}>Active Departments</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Burn Unit', 'ICU'].map(dept => {
                const checked = profileForm.departments.includes(dept);
                return (
                  <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#e0eaff', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={checked} 
                      onChange={() => {
                        if (checked) {
                          setProfileForm(p => ({ ...p, departments: p.departments.filter(item => item !== dept) }));
                        } else {
                          setProfileForm(p => ({ ...p, departments: [...p.departments, dept] }));
                        }
                      }} 
                    />
                    {dept}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={handleSaveProfile} style={S.btn('0,200,255')}>💾 SAVE PROFILE & BROADCAST</button>
          {saveStatus && <div style={S.statusMsg(saveStatus.ok)}>{saveStatus.ok ? '✅' : '❌'} {saveStatus.msg}</div>}
        </div>
      </div>

      {/* 2. Change Login Credentials */}
      <div style={S.card}>
        <div style={S.sectionTitle}>🔑 Change Login Credentials</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
          <div>
            <label style={S.label}>Current Password</label>
            <input type="password" style={S.input} placeholder="Enter current password" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>New Password</label>
            <input type="password" style={S.input} placeholder="Min. 6 characters" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Confirm New Password</label>
            <input type="password" style={S.input} placeholder="Repeat new password" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <button onClick={handleChangePassword} disabled={pwLoading} style={{ ...S.btn('255,184,0'), opacity: pwLoading ? 0.5 : 1 }}>
              {pwLoading ? 'UPDATING…' : '🔐 UPDATE PASSWORD'}
            </button>
            {pwStatus && <div style={S.statusMsg(pwStatus.ok)}>{pwStatus.ok ? '✅' : '❌'} {pwStatus.msg}</div>}
          </div>
        </div>
      </div>

      {/* 3. Two-Factor Authentication */}
      <div style={S.card}>
        <div style={S.sectionTitle}>🛡️ Two-Factor Authentication (TOTP)</div>
        <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.55)', marginBottom: 16, fontFamily: "'Share Tech Mono'", lineHeight: 1.6 }}>
          TOTP-based 2FA adds an extra layer of security. Scan the QR code below with an authenticator app (Google Authenticator, Authy, etc.).
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleSetup2FA} disabled={mfaLoading} style={{ ...S.btn('0,255,136'), opacity: mfaLoading ? 0.5 : 1 }}>
            {mfaLoading ? '⏳ LOADING…' : '🔒 ENABLE 2FA — Generate QR'}
          </button>
          <button onClick={() => setDisable2FAConfirmHosp(true)} disabled={mfaLoading} style={{ ...S.btn('255,68,68'), opacity: mfaLoading ? 0.5 : 1 }}>
            🔓 DISABLE 2FA
          </button>
        </div>
        {mfaQR && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", letterSpacing: '0.08em' }}>SCAN WITH YOUR AUTHENTICATOR APP</div>
            <img src={mfaQR} alt="2FA QR Code" style={{ width: 180, height: 180, borderRadius: 8, border: '2px solid rgba(0,255,136,0.3)', background: '#fff', padding: 4 }} />
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>After scanning, enter the 6-digit code from your app at next login.</div>
          </div>
        )}
        {mfaStatus && <div style={{ ...S.statusMsg(mfaStatus.ok), marginTop: 14 }}>{mfaStatus.ok ? '✅' : '❌'} {mfaStatus.msg}</div>}
      </div>

      {/* 4. Notification Preferences */}
      <div style={S.card}>
        <div style={S.sectionTitle}>🔔 Notification Preferences</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[['emailAlerts', 'Email Alerts for new emergency requests'], ['smsAlerts', 'SMS/Push Alerts (requires mobile verified)'], ['criticalOnly', 'Critical incidents only (suppress routine alerts)']].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))} style={{ width: 42, height: 24, borderRadius: 12, background: notifPrefs[key] ? 'rgba(0,200,255,0.35)' : 'rgba(0,0,0,0.4)', border: `1px solid ${notifPrefs[key] ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`, position: 'relative', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: notifPrefs[key] ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: notifPrefs[key] ? '#00c8ff' : 'rgba(160,200,255,0.3)', transition: 'left 0.2s' }} />
              </div>
              <span style={{ fontSize: 12, color: notifPrefs[key] ? '#e0eaff' : 'rgba(160,200,255,0.45)', fontFamily: "'Share Tech Mono'" }}>{label}</span>
            </label>
          ))}
          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.3)', fontFamily: "'Share Tech Mono'", marginTop: 4 }}>
            Note: Notification delivery requires backend email/SMS integration. Preferences are saved locally.
          </div>
        </div>
      </div>
    </div>
  );
}


