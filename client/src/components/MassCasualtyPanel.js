import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export default function MassCasualtyPanel({ socket }) {
  const [activeMci, setActiveMci] = useState(null);
  const [mciList, setMciList] = useState([]);
  const [showDeclareModal, setShowDeclareModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ eventType: '', estimatedVictims: '', description: '' });

  // START Triage Wizard States
  const [triageStep, setTriageStep] = useState(0); // 0: inactive, 1-5: wizard steps
  const [victimName, setVictimName] = useState('');
  const [triageAnswers, setTriageAnswers] = useState({
    canWalk: null,
    breathing: null,
    respRateOver30: null,
    pulsePresent: null,
    followsCommands: null
  });

  // Resource Request States
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [newResource, setNewResource] = useState({ resourceType: 'Ambulance (ALS)', quantity: 1, sector: 'Alpha', urgency: 'HIGH' });

  // NDMA warnings feed
  const [ndmaAlerts, setNdmaAlerts] = useState([]);

  useEffect(() => {
    // Fetch active NDMA alerts
    fetch('/api/disaster/ndma-alerts')
      .then(res => res.json())
      .then(data => setNdmaAlerts(data || []))
      .catch(err => console.error('[NDMA FETCH ERROR]', err));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('mass-casualty-declared', (event) => {
      setActiveMci(event);
      setMciList(prev => [event, ...prev]);
    });

    socket.on('mass-casualty-update', (updatedEvent) => {
      setActiveMci(prev => (prev && prev.id === updatedEvent.id ? updatedEvent : prev));
      setMciList(prev => prev.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    });

    return () => {
      socket.off('mass-casualty-declared');
      socket.off('mass-casualty-update');
    };
  }, [socket]);

  const handleDeclareMci = () => {
    if (!newEvent.eventType || !newEvent.estimatedVictims) return;
    socket.emit('mass-casualty-declare', {
      eventType: newEvent.eventType,
      estimatedVictims: parseInt(newEvent.estimatedVictims, 10),
      description: newEvent.description,
      location: { lat: 12.9716, lng: 77.5946 }
    });
    setShowDeclareModal(false);
    setNewEvent({ eventType: '', estimatedVictims: '', description: '' });
  };

  // START Triage Logic
  const startTriageWizard = () => {
    setTriageStep(1);
    setVictimName('');
    setTriageAnswers({
      canWalk: null,
      breathing: null,
      respRateOver30: null,
      pulsePresent: null,
      followsCommands: null
    });
  };

  const handleTriageAnswer = (key, value) => {
    const updatedAnswers = { ...triageAnswers, [key]: value };
    setTriageAnswers(updatedAnswers);

    // Flowchart branching logic:
    if (key === 'canWalk' && value === true) {
      submitTriageResult('GREEN', updatedAnswers);
      return;
    }

    if (key === 'canWalk' && value === false) {
      setTriageStep(2); // Check breathing
      return;
    }

    if (key === 'breathing') {
      if (value === false) {
        submitTriageResult('BLACK', updatedAnswers);
      } else {
        setTriageStep(3); // Check Resp Rate
      }
      return;
    }

    if (key === 'respRateOver30') {
      if (value === true) {
        submitTriageResult('RED', updatedAnswers);
      } else {
        setTriageStep(4); // Check Perfusion (Pulse)
      }
      return;
    }

    if (key === 'pulsePresent') {
      if (value === false) {
        submitTriageResult('RED', updatedAnswers);
      } else {
        setTriageStep(5); // Check Mental Status
      }
      return;
    }

    if (key === 'followsCommands') {
      if (value === false) {
        submitTriageResult('RED', updatedAnswers);
      } else {
        submitTriageResult('YELLOW', updatedAnswers);
      }
      return;
    }
  };

  const submitTriageResult = (tag, answers) => {
    if (!activeMci) return;
    
    socket.emit('mci-triage-update', {
      mciId: activeMci.id,
      casualtyName: victimName || 'Casualty #' + (activeMci.casualties.length + 1),
      tag,
      symptoms: `Triage flowchart result. Breath: ${answers.breathing !== false}, Pulse: ${answers.pulsePresent !== false}`,
      vitals: {
        respRate: answers.respRateOver30 ? 32 : 20,
        pulsePresent: answers.pulsePresent !== false
      }
    });

    setTriageStep(0);
  };

  // Submit Resource Request
  const handleResourceRequest = (e) => {
    e.preventDefault();
    if (!activeMci) return;
    
    socket.emit('mci-resource-request', {
      mciId: activeMci.id,
      resourceType: newResource.resourceType,
      quantity: newResource.quantity,
      sector: newResource.sector,
      urgency: newResource.urgency
    });
    
    setShowResourceForm(false);
  };

  // Generate SitRep PDF Report
  const generateSitRepPDF = () => {
    if (!activeMci) return;

    const doc = new jsPDF();
    
    // Header Style
    doc.setFillColor(33, 37, 41);
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('RESCUELINK MCI EMERGENCY SITREP', 15, 25);
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 15, 35);

    // Meta Details section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Incident Details', 15, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Incident ID: ${activeMci.id}`, 15, 58);
    doc.text(`Incident Type: ${activeMci.eventType}`, 15, 66);
    doc.text(`Estimated Victims: ${activeMci.estimatedVictims}`, 15, 74);
    doc.text(`Description: ${activeMci.description || 'N/A'}`, 15, 82);
    doc.text(`Declaration Time: ${new Date(activeMci.timestamp).toLocaleString()}`, 15, 90);

    // Triage Stats Chart
    const totalCount = activeMci.casualties.length;
    const redCount = activeMci.casualties.filter(c => c.tag === 'RED').length;
    const yellowCount = activeMci.casualties.filter(c => c.tag === 'YELLOW').length;
    const greenCount = activeMci.casualties.filter(c => c.tag === 'GREEN').length;
    const blackCount = activeMci.casualties.filter(c => c.tag === 'BLACK').length;

    doc.setFont('helvetica', 'bold');
    doc.text('Casualty Summary', 15, 105);
    
    const summaryData = [
      ['RED (Immediate)', redCount],
      ['YELLOW (Delayed)', yellowCount],
      ['GREEN (Minor)', greenCount],
      ['BLACK (Deceased)', blackCount],
      ['TOTAL TRIAGED', totalCount]
    ];
    
    doc.autoTable({
      startY: 110,
      head: [['Classification', 'Count']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69] }
    });

    // Victims roster table
    const victimsRoster = activeMci.casualties.map((c, i) => [
      i + 1,
      c.casualtyName,
      c.tag,
      new Date(c.timestamp).toLocaleTimeString()
    ]);

    doc.setFont('helvetica', 'bold');
    doc.text('Casualty Roster', 15, doc.lastAutoTable.finalY + 15);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      head: [['#', 'Victim Name', 'Triage Tag', 'Time Triaged']],
      body: victimsRoster.length > 0 ? victimsRoster : [['-', 'No casualties triaged yet', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [52, 58, 64] }
    });

    // Save PDF
    doc.save(`RescueLink_MCI_SitRep_${activeMci.id}.pdf`);
  };

  return (
    <div style={{
      background: 'rgba(10, 22, 48, 0.85)',
      borderRadius: 12,
      padding: 24,
      border: activeMci ? '2px solid #ff3333' : '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
      fontFamily: "'Rajdhani', sans-serif",
      position: 'relative'
    }}>
      {activeMci && (
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 10,
          border: '2px dashed #ff3333',
          pointerEvents: 'none',
          animation: 'pulse-glow 2s infinite'
        }} />
      )}

      {/* Flashing Disaster Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: activeMci ? '#ff3333' : '#00c8ff', letterSpacing: '0.1em', fontWeight: 900 }}>
            {activeMci ? '🚨 MASS CASUALTY INCIDENT IN PROGRESS' : '🏥 DISASTER CONTROL DESK'}
          </div>
          <span style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
            MCI PROTOCOLS & NDMA COORDINATION REGISTER
          </span>
        </div>
        
        {!activeMci ? (
          <button onClick={() => setShowDeclareModal(true)} style={{
            padding: '10px 20px', background: 'rgba(255,50,50,0.15)', border: '1px solid #ff3333',
            borderRadius: 6, color: '#ff5555', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
          }}>
            DECLARE MCI
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={generateSitRepPDF} style={{
              padding: '8px 16px', background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
              borderRadius: 6, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
            }}>
              GENERATE SITREP 📄
            </button>
            <button onClick={() => setActiveMci(null)} style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6, color: 'rgba(160,200,255,0.7)', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
            }}>
              CLEAR MCI STATUS
            </button>
          </div>
        )}
      </div>

      {/* NDMA Active Alerts Ribbon */}
      {ndmaAlerts.length > 0 && (
        <div style={{
          padding: 12, background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.3)',
          borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800', fontFamily: "'Orbitron'" }}>
              NDMA DISASTER ADVISORY: {ndmaAlerts[0].event.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
              {ndmaAlerts[0].instruction} (Region: {ndmaAlerts[0].area})
            </div>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      {activeMci ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          {/* Left Column: Triage Wizard & Roster */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Triage Wizard Card */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 20 }}>
              <h4 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', marginBottom: 12, letterSpacing: '0.05em' }}>
                START CASUALTY TRIAGE WIZARD
              </h4>
              
              {triageStep === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <button onClick={startTriageWizard} style={{
                    padding: '12px 24px', background: 'linear-gradient(135deg, #ff333322, #ff333344)',
                    border: '1px solid #ff3333', borderRadius: 6, color: '#ff5555',
                    fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}>
                    START NEW TRIAGE TAGGING
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {triageStep === 1 && (
                    <>
                      <label style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)' }}>VICTIM IDENTITY / CODE NAME</label>
                      <input
                        type="text"
                        value={victimName}
                        onChange={e => setVictimName(e.target.value)}
                        placeholder="e.g. Sector-3 Casualty A"
                        style={{
                          padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)',
                          borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <span style={{ fontSize: 13, color: '#fff' }}>Can the patient walk?</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => handleTriageAnswer('canWalk', true)} style={{ padding: '6px 16px', background: '#00ff8822', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', cursor: 'pointer' }}>YES (MINOR)</button>
                          <button onClick={() => handleTriageAnswer('canWalk', false)} style={{ padding: '6px 16px', background: '#ff333322', border: '1px solid #ff3333', borderRadius: 4, color: '#ff5555', cursor: 'pointer' }}>NO</button>
                        </div>
                      </div>
                    </>
                  )}
                  {triageStep === 2 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>Is the patient breathing?</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleTriageAnswer('breathing', true)} style={{ padding: '6px 16px', background: '#00ff8822', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', cursor: 'pointer' }}>YES</button>
                        <button onClick={() => handleTriageAnswer('breathing', false)} style={{ padding: '6px 16px', background: '#ff333322', border: '1px solid #ff3333', borderRadius: 4, color: '#ff5555', cursor: 'pointer' }}>NO (DECEASED)</button>
                      </div>
                    </div>
                  )}
                  {triageStep === 3 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>Is respiratory rate &gt; 30/min?</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleTriageAnswer('respRateOver30', true)} style={{ padding: '6px 16px', background: '#ff333322', border: '1px solid #ff3333', borderRadius: 4, color: '#ff5555', cursor: 'pointer' }}>YES (IMMEDIATE)</button>
                        <button onClick={() => handleTriageAnswer('respRateOver30', false)} style={{ padding: '6px 16px', background: '#00ff8822', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', cursor: 'pointer' }}>NO</button>
                      </div>
                    </div>
                  )}
                  {triageStep === 4 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>Is radial pulse present?</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleTriageAnswer('pulsePresent', true)} style={{ padding: '6px 16px', background: '#00ff8822', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', cursor: 'pointer' }}>YES</button>
                        <button onClick={() => handleTriageAnswer('pulsePresent', false)} style={{ padding: '6px 16px', background: '#ff333322', border: '1px solid #ff3333', borderRadius: 4, color: '#ff5555', cursor: 'pointer' }}>NO (IMMEDIATE)</button>
                      </div>
                    </div>
                  )}
                  {triageStep === 5 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>Can the patient follow simple commands?</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleTriageAnswer('followsCommands', true)} style={{ padding: '6px 16px', background: '#00ff8822', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', cursor: 'pointer' }}>YES (DELAYED)</button>
                        <button onClick={() => handleTriageAnswer('followsCommands', false)} style={{ padding: '6px 16px', background: '#ff333322', border: '1px solid #ff3333', borderRadius: 4, color: '#ff5555', cursor: 'pointer' }}>NO (IMMEDIATE)</button>
                      </div>
                    </div>
                  )}

                  <button onClick={() => setTriageStep(0)} style={{
                    marginTop: 8, padding: 8, background: 'rgba(255,255,255,0.05)',
                    border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer'
                  }}>
                    ABORT WIZARD
                  </button>
                </div>
              )}
            </div>

            {/* Triaged Casualty list */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 20 }}>
              <h4 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: 'rgba(160,200,255,0.8)', marginBottom: 12 }}>
                TRIAGED CASUALTIES LIST ({activeMci.casualties.length})
              </h4>
              
              {activeMci.casualties.length === 0 ? (
                <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  No casualties triaged yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {activeMci.casualties.map(c => {
                    const tagColors = {
                      RED: '#ff3333',
                      YELLOW: '#ffb800',
                      GREEN: '#00ff88',
                      BLACK: '#333333'
                    };
                    return (
                      <div key={c.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                        borderLeft: `4px solid ${tagColors[c.tag] || '#fff'}`
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.casualtyName}</div>
                          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
                            Triage ID: {c.id} | {new Date(c.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 900,
                          padding: '3px 8px', borderRadius: 4, background: tagColors[c.tag] + '22',
                          border: `1px solid ${tagColors[c.tag]}`, color: tagColors[c.tag]
                        }}>
                          {c.tag}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: ICS command roster & Resource Requests */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ICS Organizational Chart Roster */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 20 }}>
              <h4 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', marginBottom: 12, letterSpacing: '0.05em' }}>
                INCIDENT COMMAND SYSTEM (ICS) ROSTER
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { role: 'Incident Commander', name: 'Dr. Aditya Kulkarni', contact: '+91-9876543210', status: 'ON-SITE' },
                  { role: 'Operations Chief', name: 'Commander Vivek Sen', contact: '+91-9988776655', status: 'ACTIVE' },
                  { role: 'Logistics Liaison', name: 'NHA Bridge Desk', contact: 'ABDM-SIM-GATEWAY', status: 'ONLINE' }
                ].map(member => (
                  <div key={member.role} style={{
                    padding: 10, background: 'rgba(5,15,40,0.5)', border: '1px solid rgba(0,200,255,0.1)',
                    borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>{member.role.toUpperCase()}</div>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{member.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.7)' }}>{member.contact}</div>
                    </div>
                    <span style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 700 }}>{member.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resource logs and Request Form */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: 'rgba(160,200,255,0.8)' }}>
                  RESOURCE ALLOCATION LOGS ({activeMci.resourceRequests.length})
                </h4>
                <button onClick={() => setShowResourceForm(!showResourceForm)} style={{
                  padding: '4px 8px', background: 'none', border: '1px solid rgba(0,200,255,0.3)',
                  borderRadius: 4, color: '#00c8ff', fontSize: 10, cursor: 'pointer'
                }}>
                  {showResourceForm ? 'CANCEL' : '+ REQUEST'}
                </button>
              </div>

              {showResourceForm ? (
                <form onSubmit={handleResourceRequest} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>RESOURCE TYPE</label>
                      <select
                        value={newResource.resourceType}
                        onChange={e => setNewResource({ ...newResource, resourceType: e.target.value })}
                        style={{ width: '100%', padding: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 12 }}
                      >
                        <option value="Ambulance (ALS)">Ambulance (ALS)</option>
                        <option value="Oxygen Concentrators">Oxygen Concentrators</option>
                        <option value="O- Negative Blood (Units)">O- Negative Blood (Units)</option>
                        <option value="Ventilator">Ventilator</option>
                        <option value="Triage Kits">Triage Kits</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>QUANTITY</label>
                      <input
                        type="number"
                        min="1"
                        value={newResource.quantity}
                        onChange={e => setNewResource({ ...newResource, quantity: parseInt(e.target.value, 10) || 1 })}
                        style={{ width: '100%', padding: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>SECTOR</label>
                      <input
                        type="text"
                        value={newResource.sector}
                        onChange={e => setNewResource({ ...newResource, sector: e.target.value })}
                        placeholder="e.g. Sector B"
                        style={{ width: '100%', padding: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>URGENCY</label>
                      <select
                        value={newResource.urgency}
                        onChange={e => setNewResource({ ...newResource, urgency: e.target.value })}
                        style={{ width: '100%', padding: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 4, color: '#fff', fontSize: 12 }}
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" style={{
                    padding: 10, background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
                    borderRadius: 4, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
                  }}>
                    SUBMIT RESOURCE DEPLOYMENT
                  </button>
                </form>
              ) : null}

              {activeMci.resourceRequests.length === 0 ? (
                <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, textAlign: 'center', padding: 15 }}>
                  No resource requests recorded.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {activeMci.resourceRequests.map(r => (
                    <div key={r.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 6
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{r.resourceType} (x{r.quantity})</div>
                        <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>
                          Sector: {r.sector} | Status: {r.status.toUpperCase()}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontFamily: "'Orbitron'", fontWeight: 900,
                        color: r.urgency === 'CRITICAL' ? '#ff3333' : '#ffb800'
                      }}>{r.urgency}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'rgba(160,200,255,0.4)', padding: '40px 0', fontSize: 14 }}>
          🟢 Disaster mode stand-by. No active mass casualty incidents declared in the network.
        </div>
      )}

      {/* Declare MCI Modal */}
      {showDeclareModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,5,15,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#0a1526', border: '1px solid #ff4444', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 0 30px rgba(255,68,68,0.2)', fontFamily: "'Rajdhani', sans-serif" }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff4444', marginBottom: 16, fontWeight: 900 }}>DECLARE MASS CASUALTY</div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', display: 'block', marginBottom: 4 }}>EVENT TYPE</label>
              <select value={newEvent.eventType} onChange={e => setNewEvent({...newEvent, eventType: e.target.value})}
                style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, color: '#ffcccc', fontSize: 13 }}>
                <option value="">Select Event Type</option>
                <option value="Multi-Vehicle Collision">Multi-Vehicle Collision</option>
                <option value="Building Collapse">Building Collapse</option>
                <option value="Fire / Explosion">Fire / Explosion</option>
                <option value="Natural Disaster">Natural Disaster</option>
                <option value="Chemical Leak / HazMat">Chemical Leak / HazMat</option>
              </select>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', display: 'block', marginBottom: 4 }}>ESTIMATED VICTIMS</label>
              <input type="number" value={newEvent.estimatedVictims} onChange={e => setNewEvent({...newEvent, estimatedVictims: e.target.value})}
                style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, color: '#ffcccc', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
              <input value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} placeholder="Location/Details"
                style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 6, color: '#ffcccc', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowDeclareModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(160,200,255,0.5)', cursor: 'pointer' }}>CANCEL</button>
              <button onClick={handleDeclareMci} style={{ flex: 2, padding: '10px', background: 'rgba(255,68,68,0.2)', border: '1px solid #ff4444', borderRadius: 6, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 700, cursor: 'pointer' }}>BROADCAST ALERT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
