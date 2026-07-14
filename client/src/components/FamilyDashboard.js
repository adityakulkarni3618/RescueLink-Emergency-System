import React, { useState, useEffect } from 'react';

// Family Dashboard — Read-only real-time tracking view for patient's family members
// Accessible via shareable link: /?role=family&reqId=XXX

export default function FamilyDashboard({ socket, connected, reqId: propReqId }) {
  const [reqId, setReqId] = useState(propReqId || new URLSearchParams(window.location.search).get('reqId'));
  const [manualInput, setManualInput] = useState('');
  const [status, setStatus] = useState('connecting');
  const [missionData, setMissionData] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [eta, setEta] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [vitals, setVitals] = useState(null);

  // Enterprise specific features for Family
  const [showIndoorNav, setShowIndoorNav] = useState(false);
  const [reportSummary, setReportSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Register as family watcher
  useEffect(() => {
    if (!socket || !connected || !reqId) return;
    socket.emit('register-family', { reqId });

    const addTimeline = (event, color = '#00c8ff') => {
      setTimeline(prev => [{
        time: new Date().toLocaleTimeString(), event, color
      }, ...prev].slice(0, 20));
    };

    socket.on('mission-status-update', (data) => {
      setMissionData(data);
      setStatus(data.status || 'active');
      addTimeline(`Status updated: ${data.status?.replace(/_/g, ' ')?.toUpperCase()}`, '#00c8ff');
    });

    socket.on('location-update', (data) => {
      if (data && data.lat) setAmbulanceLocation(data);
    });

    socket.on('vitals-update', (data) => setVitals(data));

    socket.on('route-update', (data) => {
      if (data.eta) setEta(data.eta);
    });

    socket.on('ambulance-arrived', () => {
      setStatus('ambulance_arrived');
      addTimeline('Ambulance arrived at patient location!', '#ffb800');
    });

    socket.on('patient-onboard', () => {
      setStatus('patient_onboard');
      addTimeline('Patient loaded into ambulance', '#00ff88');
    });

    socket.on('hospital-request-response', (data) => {
      if (data.status === 'hospital_accepted' && data.assignedHospital) {
        addTimeline(`Hospital accepted: ${data.assignedHospital.name}`, '#00ff88');
      }
    });

    socket.on('mission-completed', () => {
      setStatus('completed');
      addTimeline('Mission completed — patient delivered to hospital', '#00ff88');
    });

    socket.on('chat-message', (msg) => {
      setChatMessages(prev => [...prev, msg].slice(-50));
    });

    socket.on('error-alert', (data) => {
      setError(data.message || 'Connection error');
      setStatus('error');
    });

    setStatus('connected');
    addTimeline('Family tracking connected', '#00ff88');

    return () => {
      socket.off('mission-status-update');
      socket.off('location-update');
      socket.off('vitals-update');
      socket.off('route-update');
      socket.off('ambulance-arrived');
      socket.off('patient-onboard');
      socket.off('hospital-request-response');
      socket.off('mission-completed');
      socket.off('chat-message');
      socket.off('error-alert');
    };
  }, [socket, connected, reqId]);

  const STATUS_LABELS = {
    connecting: { label: 'Connecting...', color: '#ffb800', icon: '⏳' },
    connected: { label: 'Live Tracking Active', color: '#00ff88', icon: '📡' },
    pending_ambulance: { label: 'Finding Nearest Ambulance', color: '#ffb800', icon: '🔍' },
    ambulance_accepted: { label: 'Ambulance En Route', color: '#ff6b35', icon: '🚑' },
    ambulance_arrived: { label: 'Ambulance At Scene', color: '#ffb800', icon: '📍' },
    patient_onboard: { label: 'Patient On Board — Heading To Hospital', color: '#00c8ff', icon: '🏥' },
    pending_hospital: { label: 'Selecting Destination Hospital', color: '#ffb800', icon: '🏥' },
    admission_request: { label: 'Requesting Hospital Admission', color: '#ffb800', icon: '🏥' },
    advance_notice: { label: 'Hospital Notified — En Route', color: '#00c8ff', icon: '🏥' },
    hospital_accepted: { label: 'Hospital Ready & Waiting', color: '#00ff88', icon: '✅' },
    completed: { label: 'Mission Complete', color: '#00ff88', icon: '✅' },
    error: { label: 'Connection Error', color: '#ff4444', icon: '⚠️' },
  };

  const current = STATUS_LABELS[status] || STATUS_LABELS.connecting;

  if (!reqId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020812', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 32, background: 'rgba(5,15,40,0.8)', borderRadius: 16, border: '1px solid rgba(0,200,255,0.2)', boxShadow: '0 0 30px rgba(0,200,255,0.1)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👨‍👩‍👧</div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#00c8ff', marginBottom: 12, letterSpacing: '0.1em' }}>FAMILY TRACKING PORTAL</div>
          <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.6)', lineHeight: 1.6, marginBottom: 24 }}>
            Enter the Mission ID (e.g. REQ-12345) shared by the patient or hospital to begin live tracking.
          </div>
          <input 
            type="text" 
            placeholder="Enter Mission ID..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value.toUpperCase())}
            style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, color: '#fff', fontFamily: "'Share Tech Mono'", fontSize: 16, textAlign: 'center', marginBottom: 16, outline: 'none' }}
          />
          <button 
            onClick={() => {
              let val = manualInput.trim();
              if (val.includes('REQID=')) {
                val = val.split('REQID=')[1].split('&')[0];
              }
              if (val) setReqId(val);
            }}
            style={{ width: '100%', padding: '12px', background: '#00c8ff', border: 'none', borderRadius: 8, color: '#000', fontFamily: "'Orbitron'", fontWeight: 'bold', cursor: 'pointer' }}
          >
            START LIVE TRACKING
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'radial-gradient(ellipse at 20% 50%, rgba(0,50,100,0.15) 0%, #020812 70%)',
      fontFamily: "'Rajdhani', sans-serif", color: '#e0eaff'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap');
        @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes slideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes globeRotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes radarSweep { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'rgba(0,200,255,0.05)', borderBottom: '1px solid rgba(0,200,255,0.15)',
        padding: '16px 450px 16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 32 }}>💗</div>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700 }}>
              RESCUELINK FAMILY TRACKER
            </div>
            <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
              Mission ID: {reqId} • Read-Only Live View
            </div>
          </div>
        </div>
        <div style={{
          padding: '8px 16px', borderRadius: 20,
          background: `${current.color}22`, border: `1px solid ${current.color}66`,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: status === 'ambulance_accepted' || status === 'patient_onboard' ? 'statusPulse 2s ease-in-out infinite' : 'none'
        }}>
          <span style={{ fontSize: 16 }}>{current.icon}</span>
          <span style={{ fontFamily: "'Orbitron'", fontSize: 10, color: current.color, fontWeight: 700, letterSpacing: '0.05em' }}>
            {current.label}
          </span>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,68,68,0.1)', borderBottom: '1px solid rgba(255,68,68,0.3)', padding: '12px 24px', color: '#ff6666', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Status Tracker */}
        <div style={{ gridColumn: '1/-1' }}>
          <div style={{
            background: 'rgba(5,15,40,0.8)', borderRadius: 16, padding: '24px',
            border: `2px solid ${current.color}44`,
            boxShadow: `0 0 40px ${current.color}11`
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12, animation: status !== 'completed' && status !== 'error' ? 'statusPulse 2s ease-in-out infinite' : 'none' }}>
                {current.icon}
              </div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 20, color: current.color, fontWeight: 700, marginBottom: 8 }}>
                {current.label}
              </div>
              {missionData?.patientDetails && (
                <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.7)' }}>
                  Patient: <strong>{missionData.patientDetails.name || 'Your family member'}</strong>
                  {missionData.patientDetails.condition && ` • ${missionData.patientDetails.condition}`}
                </div>
              )}
              {eta && (
                <div style={{ marginTop: 12, fontFamily: "'Share Tech Mono'", fontSize: 28, color: '#ffb800', fontWeight: 700 }}>
                  ETA: {typeof eta === 'number' ? `${eta} min` : eta}
                </div>
              )}
            </div>

            {/* Progress Steps */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', padding: '0 20px' }}>
              <div style={{ position: 'absolute', top: 15, left: '10%', right: '10%', height: 2, background: 'rgba(255,255,255,0.1)' }} />
              {[
                { key: 'pending_ambulance', label: 'Dispatching', icon: '🔍' },
                { key: 'ambulance_accepted', label: 'En Route', icon: '🚑' },
                { key: 'ambulance_arrived', label: 'Arrived', icon: '📍' },
                { key: 'patient_onboard', label: 'To Hospital', icon: '🏥' },
                { key: 'completed', label: 'Delivered', icon: '✅' },
              ].map((step, i) => {
                const getProgressIndex = (currentStatus) => {
                  if (currentStatus === 'pending_ambulance') return 0;
                  if (currentStatus === 'ambulance_accepted') return 1;
                  if (currentStatus === 'ambulance_arrived') return 2;
                  if (['patient_onboard', 'pending_hospital', 'admission_request', 'advance_notice', 'hospital_accepted'].includes(currentStatus)) return 3;
                  if (currentStatus === 'completed') return 4;
                  return -1;
                };
                const currentIdx = getProgressIndex(status);
                const stepIdx = i;
                const isDone = stepIdx <= currentIdx;
                const isCurrent = stepIdx === currentIdx;
                return (
                  <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? current.color : 'rgba(255,255,255,0.1)',
                      border: `2px solid ${isDone ? current.color : 'rgba(255,255,255,0.2)'}`,
                      fontSize: 14, boxShadow: isCurrent ? `0 0 15px ${current.color}` : 'none',
                      animation: isCurrent ? 'statusPulse 1.5s ease-in-out infinite' : 'none'
                    }}>
                      {isDone ? step.icon : i + 1}
                    </div>
                    <div style={{ fontSize: 9, color: isDone ? current.color : 'rgba(160,200,255,0.3)', fontFamily: "'Orbitron'", textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Vitals (if available) */}
        {vitals && (
          <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.15)' }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>
              📊 LIVE VITALS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Heart Rate', value: vitals.heartRate, unit: 'bpm', icon: '❤️' },
                { label: 'SpO2', value: vitals.spo2, unit: '%', icon: '🫧' },
                { label: 'Blood Pressure', value: `${vitals.systolic}/${vitals.diastolic}`, unit: 'mmHg', icon: '🩺' },
                { label: 'Temperature', value: vitals.temperature, unit: '°C', icon: '🌡️' },
              ].map((v, i) => (
                <div key={i} style={{ background: 'rgba(0,200,255,0.05)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginBottom: 4 }}>{v.icon} {v.label}</div>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 18, color: '#e0eaff', fontWeight: 700 }}>
                    {v.value} <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>{v.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(160,200,255,0.3)', fontStyle: 'italic' }}>
              Live data streamed by paramedic unit
            </div>
          </div>
        )}

        {/* Live Timeline */}
        <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.15)' }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>
            📋 MISSION TIMELINE
          </div>
          {timeline.length === 0 ? (
            <div style={{ color: 'rgba(160,200,255,0.3)', fontSize: 12, textAlign: 'center', padding: 20 }}>Awaiting updates...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timeline.map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, animation: `slideIn 0.3s ease` }}>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 10, color: 'rgba(160,200,255,0.3)', whiteSpace: 'nowrap', minWidth: 60 }}>
                    {entry.time}
                  </div>
                  <div style={{ width: 2, background: entry.color + '44', borderRadius: 1 }} />
                  <div style={{ fontSize: 12, color: 'rgba(220,230,255,0.8)', lineHeight: 1.4 }}>{entry.event}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* === ENTERPRISE FAMILY FEATURES === */}
        <div style={{ gridColumn: '1/-1', display: 'flex', gap: 16 }}>
          
          {/* AI Report Summarizer */}
          <div style={{ flex: 1, background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.15)' }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>🤖 AI REPORT SUMMARIZER</div>
            {!reportSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>Upload a complex medical report to get a simplified explanation.</div>
                <button onClick={() => {
                  setIsSummarizing(true);
                  setTimeout(() => {
                    setIsSummarizing(false);
                    setReportSummary("Patient experienced an Acute Myocardial Infarction (Heart Attack). They are currently stable. The blockage was treated, and they require rest and observation in the ICU.");
                  }, 2000);
                }} style={{ padding: '10px', background: 'rgba(0,200,255,0.1)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 6, color: '#00c8ff', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}>
                  {isSummarizing ? '⏳ ANALYZING DOCUMENT...' : '📄 UPLOAD MOCK REPORT'}
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 8, fontWeight: 'bold' }}>SIMPLIFIED SUMMARY:</div>
                <div style={{ fontSize: 13, color: '#e0eaff', lineHeight: 1.5 }}>{reportSummary}</div>
                <button onClick={() => setReportSummary(null)} style={{ marginTop: 10, padding: '4px 8px', background: 'transparent', border: '1px solid rgba(0,255,136,0.5)', borderRadius: 4, color: '#00ff88', fontSize: 9, cursor: 'pointer' }}>CLEAR</button>
              </div>
            )}
          </div>

          {/* Indoor Navigation */}
          <div style={{ flex: 1, background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.15)' }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>📍 INDOOR NAVIGATION</div>
            {!showIndoorNav ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>Get an indoor route map to the assigned ICU/Emergency ward.</div>
                <button onClick={() => setShowIndoorNav(true)} disabled={status !== 'ambulance_arrived' && status !== 'patient_onboard' && status !== 'completed' && status !== 'hospital_accepted'} 
                  style={{ padding: '10px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, color: '#00ff88', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, opacity: (status !== 'ambulance_arrived' && status !== 'patient_onboard' && status !== 'completed' && status !== 'hospital_accepted') ? 0.5 : 1 }}>
                  🗺️ GENERATE INDOOR ROUTE
                </button>
              </div>
            ) : (
              <div style={{ background: '#020812', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginBottom: 8 }}>ROUTING: ENTRANCE ➔ ICU WARD 3</div>
                <svg width="100%" height="80" viewBox="0 0 200 80">
                  <path d="M10,40 L60,40 L60,10 L150,10 L150,60 L180,60" fill="none" stroke="rgba(0,200,255,0.2)" strokeWidth="6" />
                  <path d="M10,40 L60,40 L60,10 L150,10 L150,60 L180,60" fill="none" stroke="#00ff88" strokeWidth="2" strokeDasharray="5,5">
                    <animate attributeName="stroke-dashoffset" from="100" to="0" dur="2s" repeatCount="indefinite" />
                  </path>
                  <circle cx="10" cy="40" r="4" fill="#ffb800" />
                  <circle cx="180" cy="60" r="4" fill="#ff4444" />
                </svg>
                <button onClick={() => setShowIndoorNav(false)} style={{ position: 'absolute', top: 5, right: 5, background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 12 }}>✖</button>
              </div>
            )}
          </div>

        </div>

        {/* Ambulance Communications (read-only) */}
        {chatMessages.length > 0 && (
          <div style={{ gridColumn: '1/-1', background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.15)', maxHeight: 250, overflowY: 'auto' }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 16 }}>
              💬 PARAMEDIC COMMUNICATIONS (READ-ONLY)
            </div>
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 8, padding: '8px 12px', background: 'rgba(0,200,255,0.05)', borderRadius: 8, borderLeft: '2px solid rgba(0,200,255,0.3)' }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginBottom: 2 }}>{msg.fromLabel}</div>
                <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.9)' }}>{msg.text}</div>
              </div>
            ))}
          </div>
        )}

        {/* Emergency Contacts / Notes */}
        <div style={{ gridColumn: '1/-1', background: 'rgba(0,200,255,0.03)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', lineHeight: 1.7 }}>
            📱 This is a <strong style={{ color: '#00c8ff' }}>read-only</strong> family tracking view.<br />
            This page updates automatically in real-time.<br />
            <span style={{ color: '#ffb800' }}>For emergencies, call 108 (India) or 911</span>
          </div>
        </div>
      </div>
    </div>
  );
}
