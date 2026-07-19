import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import BloodEmergencyNetwork from './BloodEmergencyNetwork';
import { MfaVerifyScreen } from './MfaVerifyScreen';

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
    if (center) map.panTo([center.lat, center.lng], { animate: true, duration: 1 });
  }, [center, map]);
  return null;
}

function SmartMapController({ ambulanceLoc, userLoc, hospitalLoc }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    const points = [];
    if (ambulanceLoc && ambulanceLoc.lat) points.push([ambulanceLoc.lat, ambulanceLoc.lng]);
    if (userLoc && userLoc.lat) points.push([userLoc.lat, userLoc.lng]);
    if (hospitalLoc && hospitalLoc.lat) points.push([hospitalLoc.lat, hospitalLoc.lng]);

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

  const requestOtp = () => {
    if (!abhaId) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(2);
    }, 1200);
  };

  const verifyOtp = () => {
    if (!otp) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLinked(abhaId);
      onClose();
    }, 1500);
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

  if (!patient) return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.12)',
      borderRadius: 10, padding: 20, textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
      <div style={{ color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", fontSize: 12 }}>
        AWAITING PATIENT SELECTION<br/>FROM AMBULANCE UNIT
      </div>
    </div>
  );

  const token = sessionStorage.getItem('rescuelink_token') || '';

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

  const riskColors = { HIGH: '#ff4444', MEDIUM: '#ffb800', LOW: '#00ff88' };

  return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.2)',
      borderRadius: 10, padding: 20,
    }}>
      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>
        PATIENT RECORD — {patient?.id}
      </div>

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
            onClick={handleDischarge}
            style={{
              flex: 1, padding: '10px', background: 'rgba(0,255,136,0.1)',
              border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
              fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
            🏥 DISCHARGE SUMMARY
          </button>
          <button
            onClick={() => setShowSpecialistModal(true)}
            style={{
              flex: 1, padding: '10px', background: 'rgba(128,80,255,0.1)',
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

      {showAbdmModal && <AbdmConnectModal patient={patient} onClose={() => setShowAbdmModal(false)} onLinked={(abhaId) => setAbdmLinked(true)} />}
      {alertData && <CustomAlert title={alertData.title} message={alertData.message} onClose={() => setAlertData(null)} />}
    </div>
  );
}

/* ─── Hospital Readiness Panel ────────────────────────────────────────────── */
function ResourcePanel({ socket }) {
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
            const reportText = `
=========================================
      RESCUELINK CLINICAL REPORT
=========================================
DATE: ${now.toLocaleString()}
PATIENT: ${patient.name} (${patient?.id})
AGE: ${patient.age} | BLOOD: ${patient.bloodGroup}
-----------------------------------------
TRIAGE: ${triage.label.toUpperCase()}
RISK SCORE: ${riskScore}/10
-----------------------------------------
VITALS SNAPSHOT:
- Heart Rate: ${vitals?.heartRate} bpm
- SpO2: ${vitals?.spo2}%
- Blood Pressure: ${vitals?.systolic}/${vitals?.diastolic} mmHg
- Temp: ${vitals?.temperature}°C
- Glucose: ${vitals?.bloodGlucose} mg/dL
-----------------------------------------
PARAMEDIC NOTES:
${notes.length > 0 ? notes.map(n => `[${new Date(n.timestamp).toLocaleTimeString()}] ${n.note}`).join('\n') : 'No field notes recorded.'}
=========================================
`;
            const el = document.createElement('a');
            el.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportText));
            el.setAttribute('download', `REPORT_${patient?.id}_${Date.now()}.txt`);
            el.click();
          }} style={{
            background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)', padding: '10px 24px', borderRadius: 6,
            fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>📥 DOWNLOAD</button>
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

export default function HospitalDashboard({ socket, connected }) {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authHospital, setAuthHospital] = useState(() => {
    const saved = localStorage.getItem('hospital_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.hospitalId && parsed.hospitalId.includes('@')) {
        localStorage.removeItem('hospital_auth');
        return null;
      }
      return parsed;
    }
    return null;
  });
  useEffect(() => {
    if (authHospital) {
      setIsAuthenticated(true);
      localStorage.setItem('hospital_auth', JSON.stringify(authHospital));
    } else {
      setIsAuthenticated(false);
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
  const lastAlertedIdRef = useRef(null);
  const lastVitalsBeepTimeRef = useRef(0);
  const [activeMissions, setActiveMissions] = useState({}); // { [reqId]: { patient, vitals, messages, notes, route, history } }
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

  // Fleet Visibility States
  const [ambulances, setAmbulances] = useState({});
  const [networkHospitals, setNetworkHospitals] = useState({});
  const [showArchives, setShowArchives] = useState(false);
  const [isAuthInModal, setIsAuthInModal] = useState(false); // New state for modal login
  const [showManualLogin, setShowManualLogin] = useState(false);

  const [connectedRoles, setConnectedRoles] = useState({ ambulance: 0, hospital: 0 });
  const [pendingResumeMission, setPendingResumeMission] = useState(null);
  const [aiAlert, setAiAlert] = useState(null);
  const [showHandover, setShowHandover] = useState(false);
  const [activeHospitalId, setActiveHospitalId] = useState(null); // FIX C6: No longer relies on hardcoded HOSPITALS array
  const [isHandoverSyncing, setIsHandoverSyncing] = useState(false);
  const [requestQueue, setRequestQueue] = useState([]); // High-density scaling for city-wide infrastructure
  const [incomingRequest, setIncomingRequest] = useState(null); // The one currently being viewed in modal

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
        const found = HOSPITAL_CREDENTIALS.find(c => c.hospitalId === inputId) || {
          hospitalId: data.user?.hospital_id || inputId,
          name: data.user?.role === 'doctor' ? 'Manipal Global Trauma Center' : 'Emergency Center',
          adminName: data.user?.name || 'Dr. Command',
          internalId: (data.user?.hospital_id || inputId).toLowerCase(),
          lat: data.lat || 18.5204,
          lng: data.lng || 73.8567
        };

        setAuthHospital(found);
        setIsAuthenticated(true);
        setLoginError('');
        if (found.internalId) setActiveHospitalId(found.internalId);
        
        // Dynamically locate the hospital so it appears in the same city as the user for the demo
        let hospitalGps = null;
        try {
          const baseLoc = await fetchIpLocation();
          // Add deterministic small offset based on hospital ID so they don't overlap
          const hash = inputId.split('').reduce((a,b)=>a+b.charCodeAt(0),0);
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
    
    const found = HOSPITAL_CREDENTIALS.find(c => c.hospitalId === finalInputId) || {
      hospitalId: finalInputId,
      name: user.role === 'doctor' ? 'Manipal Global Trauma Center' : 'Emergency Center',
      adminName: user.name || 'Dr. Command',
      internalId: finalInputId.toLowerCase(),
      lat: user.lat || 18.5204,
      lng: user.lng || 73.8567
    };

    setAuthHospital(found);
    setIsAuthenticated(true);
    setLoginError('');
    if (found.internalId) setActiveHospitalId(found.internalId);
    
    let hospitalGps = null;
    try {
      const baseLoc = await fetchIpLocation();
      const hash = finalInputId.split('').reduce((a,b)=>a+b.charCodeAt(0),0);
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

    // If not authenticated, we MUST authenticate to "claim" this patient
    if (!isAuthenticated) {
      setIsAuthInModal(true);
      setLoginError('Authentication required to accept regional admission.');
      return;
    }

    // If we ARE authenticated, proceed with the official response
    setAdmissionStep(1); // Show report immediately

    socket.emit('hospital-response', {
      reqId: incomingRequest?.id,
      hospitalId: authHospital?.hospitalId || activeHospitalId,
      status: 'hospital_accepted',
      readyServices
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
      resourceLocks: { traumaBay: false, bloodUnits: false, ventilatorStandby: false }
    });

    setIncomingRequest(null);
    setAdmissionStep(0);
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
        const data = missions[0]; // For now, focus on primary active mission
        if (ignoredMissionsRef.current.has(data.id) || activeMissionId === data.id) {
          console.log(`[RECOVERY] Mission ${data.id} already active or ignored, skipping prompt.`);
          return;
        }
        updateMissionData(data.id, {
          patient: data.patientDetails,
          vitals: data.fieldReport?.vitals,
          messages: data.chatMessages || [],
          incidentNotes: data.incidentNotes || [],
          routePath: data.routePath,
          ambulanceSocket: data.ambulanceSocket,
          checklist: data.checklist || {}
        });
        setPendingResumeMission(data);
      }
    });

    socket.on('rejoin-mission', (data) => {
      console.log(`[PERSISTENCE] Single mission recovery: ${data.id}`, data);
      if (ignoredMissionsRef.current.has(data.id) || activeMissionId === data.id) {
        console.log(`[RECOVERY] Mission ${data.id} already active or ignored, skipping prompt.`);
        return;
      }
      updateMissionData(data.id, {
        patient: data.patientDetails,
        vitals: data.fieldReport?.vitals,
        messages: data.chatMessages || [],
        incidentNotes: data.incidentNotes || [],
        routePath: data.routePath,
        ambulanceSocket: data.ambulanceSocket,
        checklist: data.checklist || {}
      });
      setPendingResumeMission(data);
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

      if (reqId === activeMissionId) {
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
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const token = sessionStorage.getItem('rescuelink_token') || '';
      const response = await fetch(`/api/fhir/${targetId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Mission not found on server");
      const data = await response.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FHIR_Record_${targetId}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
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

  if (mfaToken) {
    return (
      <MfaVerifyScreen
        mfaToken={mfaToken}
        onLoginSuccess={handleMfaSuccess}
        onCancel={() => setMfaToken(null)}
      />
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

      {/* LEFT SIDEBAR - MISSION SELECTOR */}
      {isAuthenticated && Object.keys(activeMissions).length > 0 && (
        <div style={{
          width: 200, background: 'rgba(5, 15, 40, 0.95)', borderRight: '1px solid rgba(0,200,255,0.2)',
          display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 10px 70px 10px'
        }}>
          <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'", letterSpacing: 1.5, marginBottom: 10, textAlign: 'center' }}>ACTIVE MISSIONS</div>
          {Object.values(activeMissions).map(m => (
            <div
              key={m.id}
              onClick={() => switchMission(m.id)}
              style={{
                padding: '12px 10px', borderRadius: 8, cursor: 'pointer',
                background: activeMissionId === m.id ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeMissionId === m.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div style={{ fontSize: 11, fontFamily: "'Share Tech Mono'", color: activeMissionId === m.id ? '#fff' : 'rgba(160,200,255,0.6)' }}>{m.id}</div>
              <div style={{ fontSize: 10, color: activeMissionId === m.id ? '#00ff88' : 'rgba(255,255,255,0.3)', marginTop: 4 }}>{m.patient?.name || 'Inbound Patient'}</div>
              {m.vitals?.heartRate > 110 && (
                <div style={{ position: 'absolute', top: 5, right: 5, fontSize: 10, animation: 'blink 0.5s infinite' }}>⚠️</div>
              )}
            </div>
          ))}
          <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(0,200,255,0.1)', paddingTop: 20 }}>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 8, textAlign: 'center', letterSpacing: '0.05em' }}>MANUAL RECOVERY</div>
            <div style={{ display: 'flex', gap: 6, height: 32 }}>
              <input
                value={manualRecoveryId}
                onChange={e => setManualRecoveryId(e.target.value)}
                onKeyDown={handleManualSearch}
                placeholder="REQ ID"
                style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, padding: '0 10px', color: '#fff', fontSize: 12, outline: 'none', height: '100%', boxSizing: 'border-box' }}
              />
              <button onClick={handleManualRecover} style={{ height: '100%', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', color: '#00c8ff', borderRadius: 4, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontFamily: "'Orbitron'", fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>GO</button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      `}</style>

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
          <div style={{ padding: '20px', height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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
            <div style={{
              background: 'rgba(3,8,22,0.95)',
              borderBottom: `1px solid ${isCritical ? 'rgba(255,80,80,0.4)' : 'rgba(0,200,255,0.15)'}`,
              padding: '10px 450px 10px 24px',
              display: 'flex', alignItems: 'center', gap: 15, minHeight: 60, height: 'auto', flexWrap: 'wrap',
              backdropFilter: 'blur(15px)', transition: 'border-color 0.3s',
            }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>🏥</div>
              <div style={{ flexShrink: 0, minWidth: 'fit-content' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 14, fontWeight: 700, color: '#00c8ff', letterSpacing: '0.1em' }}>
                  {authHospital?.hospitalId || 'HOSPITAL'} — {authHospital?.adminName || 'DR. DASHBOARD'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                  {authHospital?.name?.toUpperCase() || activeHospital?.name?.toUpperCase() || 'EMERGENCY WING'} · EMERGENCY WING
                </div>
              </div>

              {/* ICU BEDS INVENTORY */}
              <div style={{ marginLeft: 20, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.3)', padding: '5px 15px', borderRadius: 20, border: `1px solid ${icuBeds > 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.5)'}` }}>
                <div style={{ fontSize: 10, color: icuBeds > 0 ? '#00ff88' : '#ff4444', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>
                  ICU BEDS: {icuBeds} {icuBeds === 0 && '(DIVERTING)'}
                </div>
                <input 
                  type="range" min="0" max="50" value={icuBeds} 
                  onChange={(e) => setIcuBeds(parseInt(e.target.value))}
                  style={{ width: 100, cursor: 'pointer', accentColor: icuBeds > 0 ? '#00ff88' : '#ff4444' }}
                />
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>

                {/* Handover & FHIR Buttons */}
                {patient ? (
                  <>
                    <button onClick={downloadFHIR} style={{
                      background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
                      padding: '0 12px', height: '32px', borderRadius: 4, color: '#00ff88',
                      fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s',
                      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      boxSizing: 'border-box'
                    }}>
                      📥 FHIR HL7
                    </button>
                    <button onClick={() => setShowHandover(true)} style={{
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

                <button onClick={() => setShowArchives(true)} style={{
                  background: 'rgba(160,200,255,0.05)', border: '1px solid rgba(160,200,255,0.2)',
                  padding: '0 12px', height: '32px', borderRadius: 4, color: 'rgba(160,200,255,0.7)',
                  fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s',
                  whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  boxSizing: 'border-box'
                }}>
                  📜 ARCHIVES {savedReports.length > 0 && <span style={{ color: '#00ff88', marginLeft: 4 }}>({savedReports.length})</span>}
                </button>

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

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

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

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
                  onClick={() => setAutoSync(!autoSync)}
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

                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />

                <button
                  onClick={() => {
                    if (window.confirm("Perform hard reset? This will clear all local mission data.")) {
                      localStorage.removeItem('hospital_auth');
                      localStorage.removeItem('active_mission_id');
                      sessionStorage.clear();
                      window.location.reload();
                    }
                  }}
                  style={{ padding: '0 12px', height: '32px', background: 'rgba(255,40,40,0.1)', border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4, color: '#ff6b6b', fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'", whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', boxSizing: 'border-box' }}
                >
                  🛑 RESET
                </button>

                {/* Switch Hospital Button */}
                <button
                  onClick={() => {
                    if (window.confirm("Switch hospital profile? Active mission context will be preserved.")) {
                      localStorage.removeItem('hospital_auth');
                      sessionStorage.clear();
                      window.location.reload();
                    }
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

            {/* TABS NAVIGATION */}
            <div style={{ display: 'flex', gap: 10, padding: '0 24px 10px 24px', borderBottom: '1px solid rgba(0,200,255,0.1)' }}>
              {[
                { id: 'triage', label: '🚑 LIVE TRIAGE' },
                { id: 'er_queue', label: '⏳ ER QUEUE & BEDS' },
                { id: 'blood_bank', label: '🩸 BLOOD BANK' },
                { id: 'insurance', label: '🛡️ INSURANCE AUTO-PAY' },
                { id: 'mass_casualty', label: '⚠️ MASS CASUALTY' },
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

            {/* Main Content Area Based on Active Tab */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              {activeTab === 'triage' && (
                <div className="hospital-triage-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', flex: 1, overflow: 'hidden', width: '100%' }}>

              {/* LEFT: Charts + Map */}
              <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                    <MapContainer
                      center={
                        hospitalGps ? [hospitalGps.lat, hospitalGps.lng] :
                          activeHospital?.pos ? [activeHospital.pos.lat, activeHospital.pos.lng] :
                            [12.9716, 77.5946]
                      }
                      zoom={hospitalGps ? 12 : 2}
                      style={{ height: '100%', width: '100%', background: '#050d1a' }}
                      zoomControl={false}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; OpenStreetMap &copy; CARTO'
                      />
                      <SmartMapController 
                        ambulanceLoc={location} 
                        userLoc={incidentLocation} 
                        hospitalLoc={hospitalGps || activeHospital?.pos}
                      />

                      {/* ANCHOR FIX: SOS Pin — shows exactly where the emergency was triggered */}
                      {incidentLocation && incidentLocation.lat && (
                        <Marker
                          position={[incidentLocation.lat, incidentLocation.lng]}
                          icon={L.divIcon({
                            className: '',
                            html: `<div style="
                            width:36px; height:36px; background:rgba(255,30,30,0.9);
                            border:3px solid #fff; border-radius:50%;
                            display:flex; align-items:center; justify-content:center;
                            font-size:18px; box-shadow:0 0 25px rgba(255,30,30,0.8);
                            animation:pulse 1s ease infinite;
                          ">🆘</div>
                          <style>@keyframes pulse{0%,100%{box-shadow:0 0 10px rgba(255,30,30,0.4)}50%{box-shadow:0 0 40px rgba(255,30,30,1)}}</style>`,
                            iconSize: [36, 36],
                            iconAnchor: [18, 18],
                          })}
                        >
                          <Popup>
                            <strong>🆘 SOS INCIDENT SITE</strong><br />
                            This is where the emergency was triggered.<br />
                            Lat: {incidentLocation.lat.toFixed(4)}<br />
                            Lng: {incidentLocation.lng.toFixed(4)}
                          </Popup>
                        </Marker>
                      )}

                      {/* Hospital self-marker using real GPS */}
                      {(hospitalGps || activeHospital?.pos) && (
                        <Marker
                          position={hospitalGps ? [hospitalGps.lat, hospitalGps.lng] : [activeHospital.pos.lat, activeHospital.pos.lng]}
                          icon={hospitalIcon}
                        >
                          <Popup><strong>🏥 {activeHospital?.name || authHospital?.name || 'This Hospital'}</strong></Popup>
                        </Marker>
                      )}
                      {routePath && (
                        <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
                      )}
                      {locationHistory.length > 1 && (
                        <Polyline positions={locationHistory} color={trafficDelay ? "#ffb800" : "#00c8ff"} weight={2} opacity={0.5} dashArray="6,4" />
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

                      {/* Fleet Overview: All Active Ambulances */}
                      {Object.entries(ambulances).map(([id, amb]) => {
                        if (!amb.location) return null;
                        return (
                          <Marker key={id} position={[amb.location.lat, amb.location.lng]} icon={ambulanceIcon}>
                            <Popup>
                              <strong>🚑 {amb.name || 'Ambulance'}</strong><br />
                              {amb.available ? '🟢 Available' : '🔴 On Mission'}<br />
                              {amb.type} Unit
                            </Popup>
                          </Marker>
                        );
                      })}

                      {/* Fleet Overview: All Other Hospitals */}
                      {Object.entries(networkHospitals).map(([id, hosp]) => {
                        const pos = hosp.location || hosp.pos;
                        if (!pos || id === socket.id) return null;
                        return (
                          <Marker key={id} position={[pos.lat, pos.lng]} icon={hospitalIcon}>
                            <Popup>
                              <strong>🏥 {hosp.name}</strong><br />
                              {hosp.isOnline ? '🟢 Online' : '⚪ Offline'}<br />
                              {hosp.isBusy ? '🔴 Busy' : '🟢 Ready'}
                            </Popup>
                          </Marker>
                        );
                      })}
                    </MapContainer>

                    {!location && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(5,15,40,0.7)', flexDirection: 'column', gap: 8, zIndex: 1000,
                      }}>
                        <div style={{ fontSize: 24 }}>📡</div>
                        <div style={{ color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'", fontSize: 12 }}>
                          GPS SIGNAL PENDING...
                        </div>
                      </div>
                    )}
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
                  <ResourcePanel socket={socket} />
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

              {/* Other Tabs */}
              {activeTab === 'er_queue' && (
                <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 24, color: '#ffb800', marginBottom: 20 }}>ER QUEUE & BEDS</div>
                  <div style={{ color: 'rgba(160,200,255,0.7)' }}>ER queue and smart bed management interface will be displayed here.</div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
