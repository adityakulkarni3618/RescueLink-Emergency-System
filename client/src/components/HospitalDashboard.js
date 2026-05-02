import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
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

export const HOSPITALS = [
  { id: 'narayangaon', name: 'Narayangaon District Hospital', pos: { lat: 19.1901, lng: 73.9501 } },
  { id: 'junnar', name: 'Junnar City Clinic', pos: { lat: 19.2040, lng: 73.8820 } },
  { id: 'pune', name: 'Pune General Trauma Center', pos: { lat: 18.5204, lng: 73.8567 } },
  { id: 'otur', name: 'Otur Rural Health Center', pos: { lat: 19.1562, lng: 73.9750 } },
  { id: 'manchar', name: 'Manchar Multispeciality Hospital', pos: { lat: 19.0047, lng: 73.9552 } },
  { id: 'chakan', name: 'Chakan Industrial Hospital', pos: { lat: 18.7610, lng: 73.8630 } },
  { id: 'shirur', name: 'Shirur Cardiac & Neuro Center', pos: { lat: 18.8271, lng: 74.3798 } },
  { id: 'alephata', name: 'Alephata Primary Health Center', pos: { lat: 19.1350, lng: 73.8250 } },
];

/* ─── Map recenter helper ─────────────────────────────────────────────────── */
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.panTo([center.lat, center.lng], { animate: true, duration: 1 });
  }, [center, map]);
  return null;
}

/* ─── Alert beep using Web Audio API ─────────────────────────────────────── */
function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.12);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.12);
    });
  } catch (e) {}
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
            type="monotone" dataKey={dataKey} stroke={isCrit ? '#ff4444' : color}
            strokeWidth={2} dot={false} isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Auto-Triage Logic ───────────────────────────────────────────────────── */
function calculateTriage(vitals) {
  if (!vitals) return { level: 'PENDING', color: 'rgba(160,200,255,0.4)', label: 'AWAITING DATA' };
  
  if (vitals.spo2 < 90 || vitals.heartRate > 130 || vitals.heartRate < 40 || vitals.systolic < 90) {
    return { level: 'RED', color: '#ff4444', label: 'IMMEDIATE (RED)' };
  }
  if (vitals.spo2 < 94 || vitals.heartRate > 110 || vitals.heartRate < 50 || vitals.systolic > 160 || vitals.temperature > 39) {
    return { level: 'YELLOW', color: '#ffb800', label: 'URGENT (YELLOW)' };
  }
  return { level: 'GREEN', color: '#00ff88', label: 'STABLE (GREEN)' };
}

/* ─── Patient panel ───────────────────────────────────────────────────────── */
function PatientPanel({ patient, vitals }) {
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

  const riskColors = { HIGH: '#ff4444', MEDIUM: '#ffb800', LOW: '#00ff88' };

  return (
    <div style={{
      background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.2)',
      borderRadius: 10, padding: 20,
    }}>
      <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>
        PATIENT RECORD — {patient.id}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e0eaff', marginBottom: 2 }}>{patient.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
            Age: {patient.age} · Blood: {patient.bloodGroup}
          </div>
        </div>
        
        {/* Dynamic Triage Badge */}
        {vitals && (
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
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#ff6b6b', fontFamily: "'Orbitron'", letterSpacing: '0.1em', marginBottom: 6 }}>
          ⚠ ALLERGIES
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {patient.allergies.length === 0 ? (
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
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.1em', marginBottom: 6 }}>
          MEDICAL HISTORY
        </div>
        {patient.medicalHistory.map((h, i) => (
          <div key={i} style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', marginBottom: 3, paddingLeft: 12, borderLeft: '2px solid rgba(0,200,255,0.3)' }}>
            {h}
          </div>
        ))}
      </div>

      {patient.currentMedications.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", letterSpacing: '0.1em', marginBottom: 6 }}>
            CURRENT MEDICATIONS
          </div>
          {patient.currentMedications.map((m, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', marginBottom: 3 }}>
              💊 {m}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", marginTop: 8 }}>
        EC: {patient.emergencyContact}
      </div>
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
            <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: resources[key] ? '#00ff88' : 'rgba(160,200,255,0.5)', letterSpacing: '0.05em', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.35)' }}>{desc}</div>
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
function ChatPanel({ socket, messages }) {
  const [msg, setMsg] = useState('');
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!msg.trim() || !socket) return;
    socket.emit('chat-message', { text: msg, from: 'hospital', fromLabel: '🏥 Dr. Command' });
    setMsg('');
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 0 0' }}>
        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Guide paramedic..."
          style={{
            flex: 1, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: 6, padding: '8px 12px', color: '#e0eaff', fontSize: 13,
            fontFamily: "'Rajdhani'", outline: 'none',
          }}
        />
        <button onClick={send} style={{
          background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.35)',
          borderRadius: 6, padding: '8px 14px', color: '#00c8ff',
          cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
        }}>SEND</button>
      </div>
    </div>
  );
}

/* ─── Handover Report Modal ─────────────────────────────────────────────── */
function HandoverModal({ patient, vitals, notes, onClose, previousReports, onSave }) {

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
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
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Full Name:</span> {patient.name}</div>
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Patient ID:</span> {patient.id}</div>
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Age:</span> {patient.age} years</div>
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Blood Group:</span> <span style={{color:'#ff4444',fontWeight:700}}>{patient.bloodGroup}</span></div>
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Risk Level:</span> <span style={{color:'#ffb800',fontWeight:700}}>{patient.riskLevel || 'HIGH'}</span></div>
              <div><span style={{color: 'rgba(160,200,255,0.5)'}}>Emergency Contact:</span> {patient.emergencyContact}</div>
            </div>
          </div>

          {/* 2. Triage & Risk Assessment */}
          <div>
            <div style={{ ...sectionStyle, color: '#ff6b6b' }}>🚨 2. TRIAGE CLASSIFICATION & RISK SCORE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ ...cardBg, borderLeft: `4px solid ${triage.color}`, textAlign: 'center' }}>
                <div style={{fontSize:11,color:'rgba(160,200,255,0.5)',marginBottom:4}}>TRIAGE LEVEL</div>
                <div style={{fontSize:28,fontWeight:700,color:triage.color,fontFamily:"'Orbitron'"}}>{triage.label}</div>
              </div>
              <div style={{ ...cardBg, borderLeft: '4px solid #ff6b6b', textAlign: 'center' }}>
                <div style={{fontSize:11,color:'rgba(160,200,255,0.5)',marginBottom:4}}>SEVERITY RISK SCORE</div>
                <div style={{fontSize:28,fontWeight:700,color: riskScore>=7?'#ff4444':riskScore>=4?'#ffb800':'#00ff88',fontFamily:"'Orbitron'"}}>{riskScore}/10</div>
                <div style={{fontSize:11,color:'rgba(160,200,255,0.4)',marginTop:4}}>{riskScore>=7?'CRITICAL — IMMEDIATE INTERVENTION':'ELEVATED — CLOSE MONITORING'}</div>
              </div>
            </div>
          </div>

          {/* 3. AI Clinical Summary */}
          <div>
            <div style={{ ...sectionStyle, color: '#ffb800' }}>🤖 3. AI-GENERATED CLINICAL ASSESSMENT</div>
            <div style={{ background: 'rgba(255,180,0,0.08)', borderLeft: '4px solid #ffb800', padding: 20, borderRadius: '0 8px 8px 0', fontSize: 14, lineHeight: 1.8, color: 'rgba(220,230,255,0.9)' }}>
              <strong>Primary Presentation:</strong> Patient {patient.name} (Age: {patient.age}, Blood Type: {patient.bloodGroup}) was transported via emergency ambulance service to the receiving facility. 
              {vitals ? ` At the time of handover, the patient's vital signs showed a heart rate of ${vitals.heartRate} bpm (${vitals.heartRate>100?'tachycardic':vitals.heartRate<60?'bradycardic':'within normal range'}), oxygen saturation of ${vitals.spo2}% (${vitals.spo2<92?'CRITICALLY LOW — supplemental O2 required':vitals.spo2<95?'borderline — monitor closely':'adequate'}), blood pressure of ${vitals.systolic}/${vitals.diastolic} mmHg (${vitals.systolic>140?'hypertensive':vitals.systolic<90?'hypotensive':'normotensive'}), respiratory rate of ${vitals.respRate} breaths/min, core temperature of ${vitals.temperature}°C, and blood glucose of ${vitals.bloodGlucose} mg/dL.` : ' Vitals data pending from ambulance unit.'}
              <br/><br/>
              <strong>Clinical Interpretation:</strong> Based on the automated AI triage algorithm, the patient has been classified as <span style={{color:triage.color,fontWeight:700}}>{triage.label}</span> with a computed severity risk score of {riskScore}/10. 
              {vitals && vitals.spo2 < 94 ? ' The low SpO2 reading suggests possible respiratory compromise or cardiovascular insufficiency. Immediate arterial blood gas (ABG) analysis and chest imaging are recommended.' : ''}
              {vitals && vitals.heartRate > 110 ? ' Persistent tachycardia detected — consider 12-lead ECG, cardiac enzyme panel (troponin, CK-MB), and echocardiography evaluation.' : ''}
              {vitals && vitals.systolic > 150 ? ' Elevated systolic blood pressure warrants antihypertensive protocol initiation and continuous hemodynamic monitoring.' : ''}
              {vitals && vitals.temperature > 38.5 ? ' Pyrexia noted — blood cultures and empirical antimicrobial therapy should be considered pending infectious workup.' : ''}
              <br/><br/>
              <strong>Known Allergies:</strong> {patient.allergies?.length > 0 ? patient.allergies.join(', ') + '. ALL CARE TEAMS MUST BE ALERTED.' : 'No known drug allergies (NKDA).'}
              <br/><br/>
              <strong>Transit Summary:</strong> {notes.length > 0 ? `${notes.length} incident notes were recorded by the paramedic during transit. Field observations indicate active monitoring throughout transport. Priority attention is recommended based on the clinical acuity documented in the field reports.` : 'No critical incidents reported by the paramedic team during transit. Patient was stable throughout transport with continuous vitals monitoring.'}
              <br/><br/>
              <strong>Medical History Considerations:</strong> {patient.medicalHistory?.length > 0 ? patient.medicalHistory.join('; ') + '. These pre-existing conditions should be factored into the treatment plan and medication interactions.' : 'No significant past medical history on file.'}
            </div>
          </div>

          {/* 4. Vitals Snapshot */}
          <div>
            <div style={{ ...sectionStyle, color: '#00c8ff' }}>📈 4. LATEST VITALS SNAPSHOT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {vitals ? [
                {k:'heartRate',label:'HEART RATE',unit:'bpm',warn:vitals.heartRate>110||vitals.heartRate<50},
                {k:'spo2',label:'SpO2',unit:'%',warn:vitals.spo2<94},
                {k:'systolic',label:'SYSTOLIC BP',unit:'mmHg',warn:vitals.systolic>150},
                {k:'diastolic',label:'DIASTOLIC BP',unit:'mmHg',warn:false},
                {k:'respRate',label:'RESP RATE',unit:'br/min',warn:vitals.respRate>25||vitals.respRate<12},
                {k:'temperature',label:'TEMPERATURE',unit:'°C',warn:vitals.temperature>38.5},
                {k:'bloodGlucose',label:'BLOOD GLUCOSE',unit:'mg/dL',warn:vitals.bloodGlucose>180||vitals.bloodGlucose<70},
              ].map(({k,label,unit,warn}) => (
                <div key={k} style={{ ...cardBg, borderLeft: warn?'3px solid #ff4444':'3px solid rgba(0,200,255,0.2)' }}>
                  <div style={{fontSize:10,color:warn?'#ff6b6b':'rgba(160,200,255,0.5)'}}>{label}</div>
                  <div style={{fontSize:20,color:warn?'#ff4444':'#e0eaff',fontFamily:"'Share Tech Mono'",fontWeight:700}}>{vitals[k]} <span style={{fontSize:11,color:'rgba(160,200,255,0.4)'}}>{unit}</span></div>
                </div>
              )) : <div style={{color:'rgba(255,255,255,0.3)',gridColumn:'1/-1',textAlign:'center',padding:20}}>No vitals recorded</div>}
            </div>
          </div>

          {/* 5. Treatment Recommendations */}
          <div>
            <div style={{ ...sectionStyle, color: '#00ff88' }}>💊 5. AI TREATMENT RECOMMENDATIONS</div>
            <div style={{ ...cardBg, borderLeft: '4px solid #00ff88' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, lineHeight: 1.6 }}>
                {vitals && vitals.spo2 < 94 && <div>• <strong style={{color:'#ff6b6b'}}>URGENT:</strong> Initiate supplemental oxygen via non-rebreather mask at 15L/min. Target SpO2 ≥ 95%.</div>}
                {vitals && vitals.heartRate > 110 && <div>• <strong style={{color:'#ffb800'}}>CARDIAC:</strong> Obtain 12-lead ECG immediately. Draw troponin I and CK-MB levels. Consider beta-blocker if no contraindications.</div>}
                {vitals && vitals.systolic > 150 && <div>• <strong style={{color:'#ffb800'}}>HYPERTENSION:</strong> Administer IV labetalol 20mg slow push. Recheck BP in 10 minutes. Target MAP reduction of 20%.</div>}
                {vitals && vitals.temperature > 38.5 && <div>• <strong style={{color:'#ffb800'}}>FEVER:</strong> Obtain blood cultures x2, urinalysis, and chest X-ray. Consider empirical antibiotics per hospital protocol.</div>}
                {vitals && vitals.bloodGlucose > 180 && <div>• <strong style={{color:'#ffb800'}}>HYPERGLYCEMIA:</strong> Initiate insulin sliding scale protocol. Check HbA1c if not recently obtained.</div>}
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
                    <span style={{ fontSize: 10, color: 'rgba(255,100,100,0.5)', fontFamily: "'Share Tech Mono'" }}>{new Date(n.timestamp).toLocaleTimeString()}</span><br/>
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
                      <div>Triage at time of report: <span style={{color:r.triageColor,fontWeight:700}}>{r.triageLabel}</span></div>
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
              <div><div style={{fontSize:10,color:'rgba(160,200,255,0.4)'}}>DISPATCH TIME</div><div style={{fontFamily:"'Share Tech Mono'",fontSize:14,color:'#00c8ff'}}>{new Date(now.getTime() - 900000).toLocaleTimeString()}</div></div>
              <div style={{color:'rgba(0,200,255,0.3)',fontSize:20}}>→</div>
              <div><div style={{fontSize:10,color:'rgba(160,200,255,0.4)'}}>EN ROUTE</div><div style={{fontFamily:"'Share Tech Mono'",fontSize:14,color:'#ffb800'}}>{new Date(now.getTime() - 600000).toLocaleTimeString()}</div></div>
              <div style={{color:'rgba(0,200,255,0.3)',fontSize:20}}>→</div>
              <div><div style={{fontSize:10,color:'rgba(160,200,255,0.4)'}}>HANDOVER</div><div style={{fontFamily:"'Share Tech Mono'",fontSize:14,color:'#00ff88'}}>{now.toLocaleTimeString()}</div></div>
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
PATIENT: ${patient.name} (${patient.id})
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
            el.setAttribute('download', `REPORT_${patient.id}_${Date.now()}.txt`);
            el.click();
          }} style={{
            background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)', padding: '10px 24px', borderRadius: 6,
            fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>📥 DOWNLOAD</button>
          <button onClick={() => {
            const reportObj = { 
              id: patient.id, 
              name: patient.name, 
              time: now.toLocaleString(), 
              triage: triage.label,
              color: triage.color,
              risk: riskScore
            };
            // In a real app this goes to a DB. For demo, we save to local state + alert.
            alert(`✅ Patient ${patient.name} record successfully transmitted to Hospital EMR (Epic/Cerner Protocol).`);
            onSave(reportObj);
            onClose();
          }} style={{
            background: '#00c8ff', color: '#000', border: 'none', padding: '10px 24px', borderRadius: 6,
            fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>SAVE TO EMR</button>

        </div>
      </div>
    </div>
  );
}

/* ─── Hospital Credentials DB (Demo) ─────────────────────────────────── */
const HOSPITAL_CREDENTIALS = [
  { hospitalId: 'HOSP-001', password: 'hospital001', name: 'Narayangaon District Hospital', adminName: 'Dr. Anil Joshi', internalId: 'narayangaon' },
  { hospitalId: 'HOSP-002', password: 'hospital002', name: 'Junnar City Clinic', adminName: 'Dr. Priya Mane', internalId: 'junnar' },
  { hospitalId: 'HOSP-003', password: 'hospital003', name: 'Pune General Trauma Center', adminName: 'Dr. Rajesh Kulkarni', internalId: 'pune' },
  { hospitalId: 'HOSP-004', password: 'hospital004', name: 'Manchar Multispeciality Hospital', adminName: 'Dr. Sunita Pawar', internalId: 'manchar' },
  { hospitalId: 'HOSP-005', password: 'hospital005', name: 'Shirur Cardiac & Neuro Center', adminName: 'Dr. Vikram Desai', internalId: 'shirur' },
];

export default function HospitalDashboard({ socket, connected }) {
  // ── Auth State ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authHospital, setAuthHospital] = useState(null);
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const MAX_HISTORY = 30;
  const [chartData, setChartData] = useState([]);
  const [latestVitals, setLatestVitals] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [patient, setPatient] = useState(null);
  const [isCritical, setIsCritical] = useState(false);
  const [critReasons, setCritReasons] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [incidentNotes, setIncidentNotes] = useState([]);
  const [savedReports, setSavedReports] = useState([]);
  const [showArchives, setShowArchives] = useState(false);

  const [connectedRoles, setConnectedRoles] = useState({ ambulance: 0, hospital: 0 });
  const [aiAlert, setAiAlert] = useState(null);
  const [showHandover, setShowHandover] = useState(false);
  const [activeHospitalId, setActiveHospitalId] = useState(HOSPITALS[0].id);
  const [isHandoverSyncing, setIsHandoverSyncing] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [routePath, setRoutePath] = useState(null);
  const [previousReports, setPreviousReports] = useState([]);
  const [admissionStep, setAdmissionStep] = useState(0);
  const [readyServices, setReadyServices] = useState({ otPrepared: false, ventilatorReady: false, cardiologistAssigned: false, bloodBankAlerted: false });
  const [trafficDelay, setTrafficDelay] = useState(false);
  const [arrivedAtUser, setArrivedAtUser] = useState(false);
  const [rerouteAlert, setRerouteAlert] = useState(null);
  const [autoSync, setAutoSync] = useState(true); // Toggle for auto-authentication
  const autoSyncRef = useRef(true);
  useEffect(() => { autoSyncRef.current = autoSync; }, [autoSync]);
  const critTimeoutRef = useRef(null);


  const handleLogin = () => {
    const inputId = loginId.trim();
    const inputPass = loginPass.trim();
    
    console.log(`[LOGIN] Attempting login with ID: "${inputId}" and Pass: "${inputPass}"`);

    const found = HOSPITAL_CREDENTIALS.find(c => {
      const normalizedInput = inputId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const normalizedId = c.hospitalId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const passMatch = c.password === inputPass;
      
      if (normalizedId === normalizedInput) {
        console.log(`[LOGIN] ID Match Found: ${c.hospitalId}. Password Match: ${passMatch}`);
      }
      
      return normalizedId === normalizedInput && passMatch;
    });

    if (found) {
      console.log(`[LOGIN] Success! Authenticated as ${found.name}`);
      setAuthHospital(found);
      setIsAuthenticated(true);
      setLoginError('');
      if (found.internalId) setActiveHospitalId(found.internalId);
      if (socket) socket.emit('register-hospital', { hospitalId: found.hospitalId, name: found.name, adminName: found.adminName, id: found.internalId });
    } else {
      console.warn(`[LOGIN] Failed. No matching credentials found.`);
      setLoginError('Invalid Hospital ID or Password');
    }
  };

  const activeHospital = HOSPITALS.find(h => h.id === activeHospitalId) || HOSPITALS[0];

  useEffect(() => {
    if (!socket || !connected) return;

    
    // Register Hospital immediately
    socket.emit('register-hospital', { location: activeHospital.pos, available: true, id: activeHospital.id, name: activeHospital.name });

    socket.on('vitals-update', (data) => {
      setLatestVitals(data);
      setChartData(prev => [...prev.slice(-(MAX_HISTORY - 1)), { ...data, t: Date.now() }]);
    });

    socket.on('bulk-vitals-update', (bulkData) => {
      if (!bulkData || bulkData.length === 0) return;
      setLatestVitals(bulkData[bulkData.length - 1]);
      setChartData(prev => {
        const newData = bulkData.map(d => ({ ...d, t: d.timestamp || Date.now() }));
        return [...prev, ...newData].slice(-MAX_HISTORY);
      });
    });

    socket.on('location-update', (data) => {
      setLocation(data);
      if (data.trafficDelay !== undefined) setTrafficDelay(data.trafficDelay);
      setLocationHistory(prev => [...prev.slice(-99), [data.lat, data.lng]]);

      if (data.destinationId) {
        setActiveHospitalId(prev => {
          if (prev !== data.destinationId) {
            setIsHandoverSyncing(true);
            setTimeout(() => setIsHandoverSyncing(false), 2500);
            return data.destinationId;
          }
          return prev;
        });
      }
    });

    socket.on('patient-data', (data) => setPatient(data));

    socket.on('critical-alert', (data) => {
      setIsCritical(true);
      setCritReasons(data.reasons);
      setAlertCount(c => c + 1);
      playAlertBeep();
      clearTimeout(critTimeoutRef.current);
      critTimeoutRef.current = setTimeout(() => setIsCritical(false), 8000);
    });

    const onHistory = (msgs) => setMessages(msgs);
    const onChatMessage = (msg) => setMessages(prev => [...prev, msg]);
    const onNote = (n) => setIncidentNotes(prev => [n, ...prev].slice(0, 10));
    const onRoles = (roles) => setConnectedRoles(roles);
    
    const onAiAlert = (data) => {
      setAiAlert(data);
      setTimeout(() => setAiAlert(null), 10000);
    };
    
    const onIncomingHospitalRequest = (req) => {
      setIncomingRequest(req);
      if (req.previousReports) setPreviousReports(req.previousReports);
      if (req.arrivedAtUser) setArrivedAtUser(true);
      if (req.fieldReport) {
        setLatestVitals(req.fieldReport.vitals || { heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 37.0, respRate: 16, glucose: 100 });
      }
    };


    const onHospitalResponse = (req) => {
      if (req.status === 'hospital_accepted' && req.routePath) {
        setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      }
    };
    
    socket.on('chat-history', onHistory);
    socket.on('chat-message', onChatMessage);
    socket.on('incident-note', onNote);
    socket.on('roles-update', onRoles);
    socket.on('ai-prediction-alert', onAiAlert);
    socket.on('incoming-hospital-request', onIncomingHospitalRequest);
    socket.on('hospital-request-response', onHospitalResponse);
    
    socket.on('reroute-hospital', (data) => {
       const myCurrentId = authHospital?.hospitalId || activeHospitalId;
       const isAlreadyMe = data.newHospitalId === authHospital?.hospitalId || data.newHospitalId === activeHospitalId;

       // Use ref to check current toggle state inside the socket listener
       if (autoSyncRef.current && data.newHospitalId && !isAlreadyMe) {
         const newHospCreds = HOSPITAL_CREDENTIALS.find(c => 
           c.internalId === data.newHospitalId || c.hospitalId === data.newHospitalId
         );

         if (newHospCreds) {
           console.log(`[REROUTE] Auto-switching dashboard to ${newHospCreds.name}`);
           setRerouteAlert(`REROUTING: Switching to ${newHospCreds.name}...`);
           
           setTimeout(() => {
             setIsAuthenticated(true);
             setAuthHospital(newHospCreds);
             if (newHospCreds.internalId) setActiveHospitalId(newHospCreds.internalId);
             
             // Bootstrap with the data sent in the reroute packet
             if (data.fieldReport) {
               setIncomingRequest({ id: data.reqId, fieldReport: data.fieldReport });
               setLatestVitals(data.fieldReport.vitals);
             }
             if (data.previousReports) setPreviousReports(data.previousReports);
             setArrivedAtUser(true);

             socket.emit('register-hospital', { 
               hospitalId: newHospCreds.hospitalId, 
               name: newHospCreds.name, 
               adminName: newHospCreds.adminName, 
               id: newHospCreds.internalId 
             });

             setRerouteAlert(null);
           }, 2000);
         }
       }
    });



    return () => {
      socket.off('vitals-update');
      socket.off('bulk-vitals-update');
      socket.off('location-update');
      socket.off('patient-data');
      socket.off('critical-alert');
      socket.off('chat-history', onHistory);
      socket.off('chat-message', onChatMessage);
      socket.off('incident-note', onNote);
      socket.off('roles-update', onRoles);
      socket.off('ai-prediction-alert', onAiAlert);
      socket.off('incoming-hospital-request', onIncomingHospitalRequest);
      socket.off('hospital-request-response', onHospitalResponse);
    };
  }, [socket, connected]);

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at 80% 20%, #0a1e3a 0%, #050d1a 60%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Rajdhani', sans-serif" }}>
        <div style={{ background:'rgba(5,20,45,0.9)', border:'2px solid rgba(0,200,255,0.3)', borderRadius:16, padding:40, width:420, boxShadow:'0 0 40px rgba(0,200,255,0.1)' }}>
          <div style={{ textAlign:'center', marginBottom:30 }}>
            <div style={{ fontSize:50, marginBottom:8 }}>🏥</div>
            <div style={{ fontFamily:"'Orbitron'", fontSize:18, color:'#00c8ff', letterSpacing:'0.15em' }}>HOSPITAL UNIT LOGIN</div>
            <div style={{ fontSize:12, color:'rgba(160,200,255,0.4)', fontFamily:"'Share Tech Mono'", marginTop:4 }}>RESCUELINK COMMAND CENTER v2.0</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ fontSize:11, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", letterSpacing:'0.1em', display:'block', marginBottom:4 }}>HOSPITAL ID</label>
              <input value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="e.g. HOSP-001" style={{ width:'100%', padding:'10px 14px', background:'rgba(0,200,255,0.05)', border:'1px solid rgba(0,200,255,0.2)', borderRadius:6, color:'#e0eaff', fontSize:14, fontFamily:"'Share Tech Mono'", outline:'none', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", letterSpacing:'0.1em', display:'block', marginBottom:4 }}>PASSWORD</label>
              <input type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()} placeholder="Enter hospital password" style={{ width:'100%', padding:'10px 14px', background:'rgba(0,200,255,0.05)', border:'1px solid rgba(0,200,255,0.2)', borderRadius:6, color:'#e0eaff', fontSize:14, fontFamily:"'Share Tech Mono'", outline:'none', boxSizing:'border-box' }} />
            </div>
            {loginError && <div style={{ color:'#ff4444', fontSize:12, fontFamily:"'Share Tech Mono'", textAlign:'center' }}>⚠ {loginError}</div>}
            <button onClick={handleLogin} style={{ padding:'12px', background:'rgba(0,200,255,0.15)', border:'1px solid rgba(0,200,255,0.4)', borderRadius:8, color:'#00c8ff', fontFamily:"'Orbitron'", fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.1em' }}>AUTHENTICATE & CONNECT</button>
          </div>
          <div style={{ marginTop:20, fontSize:10, color:'rgba(160,200,255,0.25)', fontFamily:"'Share Tech Mono'", textAlign:'center', lineHeight:1.6 }}>
            Demo Hospitals: HOSP-001 to HOSP-005<br/>Password: hospital + number (e.g. hospital001)
          </div>
        </div>
      </div>
    );
  }

  const dismissAlert = () => {
    setIsCritical(false);
    clearTimeout(critTimeoutRef.current);
  };

  const acceptRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('hospital-response', { reqId: incomingRequest.id, accepted: true, readyServices });
    socket.emit('resources-update', readyServices);
    setIncomingRequest(null);
    setAdmissionStep(0);
  };

  const rejectRequest = () => {
    if (!socket || !incomingRequest) return;
    socket.emit('hospital-response', { reqId: incomingRequest.id, accepted: false });
    setIncomingRequest(null);
    setAdmissionStep(0);
  };

  const toggleReadyService = (key) => {
    setReadyServices(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: isCritical
        ? 'radial-gradient(ellipse at 50% 20%, #1a0505 0%, #050d1a 60%)'
        : 'radial-gradient(ellipse at 50% 20%, #050a1e 0%, #050d1a 70%)',
      fontFamily: "'Rajdhani', sans-serif",
      color: '#e0eaff',
      transition: 'background 0.5s ease',
    }}>
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
        onSave={(report) => setSavedReports(prev => [report, ...prev].slice(0, 10))}
        onClose={() => setShowHandover(false)} 
      />
    )}

    {/* Saved Reports Archive Sidebar/Modal */}
    {showArchives && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
        <div style={{ background: '#0a1e3a', border: '1px solid #00c8ff', borderRadius: 12, width: 450, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0,200,255,0.4)', padding: 24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div style={{ fontFamily:"'Orbitron'", color:'#00c8ff', fontSize:14 }}>📜 EMR ARCHIVES (RECENT SAVES)</div>
            <button onClick={() => setShowArchives(false)} style={{ background:'transparent', border:'none', color:'#ff4444', fontSize:20, cursor:'pointer' }}>×</button>
          </div>
          {savedReports.length === 0 ? (
            <div style={{ textAlign:'center', color:'#555', padding:40, fontFamily:"'Share Tech Mono'" }}>NO SAVED RECORDS FOUND</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {savedReports.map((r, i) => (
                <div key={i} style={{ background:'rgba(0,200,255,0.05)', border:'1px solid rgba(0,200,255,0.1)', borderRadius:8, padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontWeight:'bold', color:'#e0eaff' }}>{r.name}</span>
                    <span style={{ color: r.color, fontSize:10, fontFamily:"'Orbitron'" }}>{r.triage}</span>
                  </div>
                  <div style={{ fontSize:11, color:'rgba(160,200,255,0.4)', fontFamily:"'Share Tech Mono'" }}>ID: {r.id} • Saved at {r.time.split(',')[1]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}


      {/* Incoming Request Modal — Multi-step */}
      {incomingRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#0a1e3a', border: '2px solid #00c8ff', borderRadius: 12, width: 540, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 0 30px rgba(0,200,255,0.3)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(0,200,255,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>🚨</div>
              <h2 style={{ color: '#00c8ff', fontFamily: "'Orbitron'", margin: '0 0 4px', fontSize: 15 }}>INCOMING ADMISSION REQUEST</h2>
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:8 }}>
                {['SUMMARY','VIEW REPORT','SELECT SERVICES'].map((s,i)=>(
                  <div key={i} style={{ padding:'3px 10px', borderRadius:4, fontSize:10, fontFamily:"'Orbitron'", background: admissionStep===i?'rgba(0,200,255,0.2)':'rgba(0,0,0,0.2)', color: admissionStep===i?'#00c8ff':'#555', border: admissionStep===i?'1px solid #00c8ff':'1px solid #333' }}>{s}</div>
                ))}
              </div>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* STEP 0: Summary */}
              {admissionStep === 0 && (<>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,200,255,0.06)', padding:12, borderRadius:8 }}>
                  <div>
                    <div style={{ fontSize:14 }}>Patient: <strong>{incomingRequest.patientDetails?.name||'Unknown'}</strong></div>
                    <div style={{ fontSize:12, color:'#aaa' }}>Condition: {incomingRequest.fieldReport?.condition||'General'}</div>
                  </div>
                  <div style={{ padding:'4px 12px', borderRadius:4, background:'rgba(255,180,0,0.15)', border:'1px solid rgba(255,180,0,0.4)', color:'#ffb800', fontWeight:'bold', fontSize:12 }}>{incomingRequest.patientDetails?.riskLevel||'CRITICAL'}</div>
                </div>
                {incomingRequest.fieldReport && (
                  <div style={{ background:'rgba(255,100,0,0.08)', borderLeft:'3px solid #ff6b35', padding:12, borderRadius:'0 8px 8px 0' }}>
                    <div style={{ fontSize:10, color:'#ff6b35', fontFamily:"'Orbitron'", marginBottom:4 }}>TRIAGE</div>
                    <div style={{ fontSize:16, fontWeight:700, color: incomingRequest.fieldReport.triageLevel?.includes('RED')?'#ff4444':incomingRequest.fieldReport.triageLevel?.includes('YELLOW')?'#ffb800':'#00ff88' }}>{incomingRequest.fieldReport.triageLevel}</div>
                  </div>
                )}
                {incomingRequest.previousReports?.length > 0 && (
                  <div style={{ background:'rgba(255,100,150,0.06)', border:'1px solid rgba(255,100,150,0.2)', borderRadius:8, padding:10, fontSize:11, color:'#ff88aa' }}>🔄 REROUTED — {incomingRequest.previousReports.length} prior report(s) attached</div>
                )}
              </>)}

              {/* STEP 1: Full Report */}
              {admissionStep === 1 && incomingRequest.fieldReport && (<>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                  {[{l:'HR',v:incomingRequest.fieldReport.initialVitals?.heartRate,u:'bpm'},{l:'SpO2',v:incomingRequest.fieldReport.initialVitals?.spo2,u:'%'},{l:'BP',v:`${incomingRequest.fieldReport.initialVitals?.systolic||'--'}/${incomingRequest.fieldReport.initialVitals?.diastolic||'--'}`,u:'mmHg'},{l:'Resp',v:incomingRequest.fieldReport.initialVitals?.respRate,u:'br/m'},{l:'Temp',v:incomingRequest.fieldReport.initialVitals?.temperature,u:'°C'},{l:'Gluc',v:incomingRequest.fieldReport.initialVitals?.bloodGlucose,u:'mg/dL'}].map(({l,v,u})=>(
                    <div key={l} style={{ background:'rgba(0,0,0,0.3)', padding:'6px 8px', borderRadius:4, textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'rgba(160,200,255,0.4)' }}>{l}</div>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Share Tech Mono'" }}>{v||'--'} <span style={{fontSize:9,color:'#888'}}>{u}</span></div>
                    </div>
                  ))}
                </div>
                <div><div style={{ fontSize:10, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", marginBottom:6 }}>REQUIRED SERVICES</div><div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{(incomingRequest.fieldReport.requiredServices||[]).map(s=>(<span key={s} style={{ padding:'3px 8px', background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.3)', borderRadius:4, fontSize:11, color:'#ffb800' }}>{s}</span>))}</div></div>
                <div style={{ background:'rgba(0,200,255,0.04)', borderLeft:'3px solid #00c8ff', padding:12, borderRadius:'0 8px 8px 0', fontSize:12, lineHeight:1.6, color:'rgba(200,220,255,0.8)' }}>
                  <div style={{ fontSize:10, color:'#00c8ff', fontFamily:"'Orbitron'", marginBottom:4 }}>PARAMEDIC FIELD NOTES</div>
                  {incomingRequest.fieldReport.fieldNotes}
                </div>
                {incomingRequest.previousReports?.length > 0 && (
                  <div style={{ background:'rgba(255,100,150,0.06)', border:'1px solid rgba(255,100,150,0.2)', borderRadius:8, padding:12 }}>
                    <div style={{ fontSize:10, color:'#ff88aa', fontFamily:"'Orbitron'", marginBottom:6 }}>🔄 PRIOR HOSPITAL REPORTS</div>
                    {incomingRequest.previousReports.map((r,i)=>(<div key={i} style={{ background:'rgba(0,0,0,0.2)', padding:8, borderRadius:4, marginBottom:4, fontSize:11, borderLeft:'2px solid #ff88aa' }}><strong style={{color:'#ff88aa'}}>{r.hospitalName}</strong> — {r.triageLabel}<br/><span style={{color:'#888'}}>{r.notes}</span></div>))}
                  </div>
                )}
              </>)}
              {admissionStep === 1 && !incomingRequest.fieldReport && (<div style={{ textAlign:'center', padding:20, color:'#888' }}>No field report attached.</div>)}

              {/* STEP 2: Select Ready Services */}
              {admissionStep === 2 && (<>
                <div style={{ fontSize:10, color:'rgba(160,200,255,0.5)', fontFamily:"'Orbitron'", letterSpacing:'0.1em' }}>CONFIRM AVAILABLE READY SERVICES</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[{k:'otPrepared',label:'OT PREPARED',icon:'🔪',desc:'Operation theater ready'},{k:'ventilatorReady',label:'VENTILATOR',icon:'🫁',desc:'Ventilator standby'},{k:'cardiologistAssigned',label:'CARDIOLOGIST',icon:'🫀',desc:'Specialist assigned'},{k:'bloodBankAlerted',label:'BLOOD BANK',icon:'🩸',desc:'Cross-match ready'}].map(({k,label,icon,desc})=>(
                    <div key={k} onClick={()=>toggleReadyService(k)} style={{ padding:12, borderRadius:8, cursor:'pointer', background: readyServices[k]?'rgba(0,255,100,0.1)':'rgba(0,200,255,0.04)', border:`1px solid ${readyServices[k]?'rgba(0,255,100,0.4)':'rgba(0,200,255,0.12)'}` }}>
                      <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
                      <div style={{fontFamily:"'Orbitron'",fontSize:10,color:readyServices[k]?'#00ff88':'rgba(160,200,255,0.5)',marginBottom:2}}>{label}</div>
                      <div style={{fontSize:10,color:'rgba(160,200,255,0.35)'}}>{desc}</div>
                      <div style={{marginTop:6,fontFamily:"'Share Tech Mono'",fontSize:11,color:readyServices[k]?'#00ff88':'rgba(160,200,255,0.3)'}}>{readyServices[k]?'✓ READY':'○ PENDING'}</div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign:'center', fontSize:12, color: Object.values(readyServices).filter(Boolean).length>0?'#00ff88':'#ffb800', fontFamily:"'Share Tech Mono'" }}>{Object.values(readyServices).filter(Boolean).length}/4 services ready</div>
              </>)}
            </div>

            {/* Step-aware Action Buttons */}
            <div style={{ padding:'16px 24px', borderTop:'1px solid rgba(0,200,255,0.15)', display:'flex', gap:10, justifyContent:'center' }}>
              {admissionStep===0 && (<><button onClick={()=>setAdmissionStep(1)} style={{ padding:'10px 24px', background:'#00c8ff', border:'none', borderRadius:6, color:'#000', fontWeight:'bold', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:12 }}>📋 VIEW FIELD REPORT</button><button onClick={rejectRequest} style={{ padding:'10px 24px', background:'#ff4444', border:'none', borderRadius:6, color:'#fff', fontWeight:'bold', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:12 }}>✗ REJECT</button></>)}
              {admissionStep===1 && (<><button onClick={()=>setAdmissionStep(0)} style={{ padding:'10px 16px', background:'rgba(160,200,255,0.1)', border:'1px solid rgba(160,200,255,0.3)', borderRadius:6, color:'#aaa', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:11 }}>← BACK</button><button onClick={()=>setAdmissionStep(2)} style={{ padding:'10px 24px', background:'#00c8ff', border:'none', borderRadius:6, color:'#000', fontWeight:'bold', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:12 }}>⚙ SELECT SERVICES</button></>)}
              {admissionStep===2 && (<><button onClick={()=>setAdmissionStep(1)} style={{ padding:'10px 16px', background:'rgba(160,200,255,0.1)', border:'1px solid rgba(160,200,255,0.3)', borderRadius:6, color:'#aaa', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:11 }}>← BACK</button><button onClick={acceptRequest} style={{ padding:'10px 24px', background:'#00ff88', border:'none', borderRadius:6, color:'#000', fontWeight:'bold', cursor:'pointer', fontFamily:"'Orbitron'", fontSize:12 }}>✓ CONFIRM ADMISSION</button></>)}
            </div>
          </div>
        </div>
      )}

      {/* Handover Syncing Overlay */}
      {isHandoverSyncing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(5, 13, 26, 0.85)', backdropFilter: 'blur(5px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#00c8ff', fontFamily: "'Orbitron'",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse-ring 1s infinite' }}>🔄</div>
          <div style={{ fontSize: 24, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>
            HANDOVER PROTOCOL INITIATED
          </div>
          <div style={{ fontSize: 14, fontFamily: "'Share Tech Mono'", color: '#e0eaff', opacity: 0.8 }}>
            SYNCING ENTIRE TRANSIT HISTORY TO {activeHospital.name.toUpperCase()}...
          </div>
          <div style={{ width: 300, height: 4, background: 'rgba(0,200,255,0.2)', marginTop: 20, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: '#00c8ff', animation: 'progress 2.5s ease-in-out' }} />
          </div>
          <style>{`
            @keyframes progress { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 100%; } }
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
        padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 20, height: 60,
        backdropFilter: 'blur(10px)', transition: 'border-color 0.3s',
      }}>
        <div style={{ fontSize: 22 }}>🏥</div>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 14, fontWeight: 700, color: '#00c8ff', letterSpacing: '0.1em' }}>
            {authHospital?.hospitalId || 'HOSPITAL'} — {authHospital?.adminName || 'DR. DASHBOARD'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
            {authHospital?.name?.toUpperCase() || activeHospital.name.toUpperCase()} · EMERGENCY WING
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, alignItems: 'center' }}>
          
          {/* Handover Button */}
          {patient && (
            <button onClick={() => setShowHandover(true)} style={{
              background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
              padding: '8px 16px', borderRadius: 6, color: '#00c8ff',
              fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s'
            }}>
              📄 GENERATE REPORT
            </button>
          )}

          <button onClick={() => setShowArchives(true)} style={{
            background: 'rgba(160,200,255,0.05)', border: '1px solid rgba(160,200,255,0.2)',
            padding: '8px 16px', borderRadius: 6, color: 'rgba(160,200,255,0.7)',
            fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s'
          }}>
            📜 ARCHIVES {savedReports.length > 0 && <span style={{ color:'#00ff88', marginLeft:4 }}>({savedReports.length})</span>}
          </button>


          {/* Connection indicators */}
          {[
            { label: '🚑 AMBULANCE', count: connectedRoles.ambulance, color: '#ff8855' },
            { label: '🏥 DOCTORS', count: connectedRoles.hospital, color: '#00c8ff' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", letterSpacing: '0.1em' }}>{label}</div>
              <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 18, color: count > 0 ? color : 'rgba(160,200,255,0.2)', fontWeight: 700 }}>{count}</div>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: connected ? '#00ff88' : '#ff4444',
              boxShadow: connected ? '0 0 8px #00ff88' : '0 0 8px #ff4444',
            }} />
            <span style={{ fontSize: 12, color: connected ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'" }}>
              {connected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>

          {alertCount > 0 && (
            <div style={{
              padding: '4px 14px', background: 'rgba(255,40,40,0.15)',
              border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4,
              fontFamily: "'Orbitron'", fontSize: 11, color: '#ff6060',
              animation: 'blink 1s step-end infinite',
            }}>
              ⚠ {alertCount} ALERT{alertCount > 1 ? 'S' : ''}
            </div>
          )}

          {/* Auto-Sync Toggle */}
          <div 
            onClick={() => setAutoSync(!autoSync)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
              background: autoSync ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${autoSync ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 20, cursor: 'pointer', transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: autoSync ? '#00ff88' : '#888',
              boxShadow: autoSync ? '0 0 8px #00ff88' : 'none'
            }} />
            <span style={{ fontSize: 10, fontFamily: "'Orbitron'", color: autoSync ? '#00ff88' : '#888', letterSpacing: 1 }}>
              AUTO-SYNC: {autoSync ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Critical alert banner */}
      <div style={{ position: 'relative', zIndex: 50 }}>
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
            <button onClick={() => setAiAlert(null)} style={{
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

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', height: `calc(100vh - ${isCritical ? 114 : 60}px)` }}>

        {/* LEFT: Charts + Map */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em' }}>
            LIVE VITALS MONITORING
          </div>

          {chartData.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(160,200,255,0.3)', fontFamily: "'Share Tech Mono'", fontSize: 13,
              flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 40 }}>📡</div>
              <div>AWAITING AMBULANCE STREAM...</div>
              <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.2)' }}>Start streaming from the Ambulance window</div>
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
                center={[19.2, 73.9]}
                zoom={12}
                style={{ height: '100%', width: '100%', background: '#050d1a' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap &copy; CARTO'
                />
                {location && location.lat && (
                  <>
                    <Marker position={[location.lat, location.lng]} icon={ambulanceIcon}>
                      <Popup><strong>🚑 Ambulance</strong><br />Lat: {location.lat.toFixed(4)}<br />Lng: {location.lng.toFixed(4)}</Popup>
                    </Marker>
                    <MapUpdater center={location} />
                  </>
                )}
                {activeHospital && activeHospital.pos && (
                  <Marker position={[activeHospital.pos.lat, activeHospital.pos.lng]} icon={hospitalIcon}>
                    <Popup><strong>🏥 {activeHospital.name}</strong></Popup>
                  </Marker>
                )}
                {routePath && (
                  <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
                )}
                {locationHistory.length > 1 && (
                  <Polyline positions={locationHistory} color={trafficDelay ? "#ffb800" : "#00c8ff"} weight={2} opacity={0.5} dashArray="6,4" />
                )}
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
            <PatientPanel patient={patient} vitals={latestVitals} />
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

          <VideoCall socket={socket} />

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

          <div style={{ flex: 1, padding: '12px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel socket={socket} messages={messages} />
          </div>
        </div>
      </div>
    </div>
  );
}
