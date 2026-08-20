import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin);

export default function PatientPortal() {
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fhirPreview, setFhirPreview] = useState(null);

  // Profile Edit states
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [groupNumber, setGroupNumber] = useState('');
  const [consentToShareData, setConsentToShareData] = useState(false);
  const [abhaNumber, setAbhaNumber] = useState('');
  const [abhaAddress, setAbhaAddress] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const fetchPatientData = async () => {
      const token = sessionStorage.getItem('rescuelink_token');
      try {
        // Fetch Profile Info
        const profileRes = await fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const profileData = await profileRes.json();
        setProfile(profileData);
        
        setName(profileData.name || '');
        setMobile(profileData.mobile || '');
        setBloodGroup(profileData.blood_group || '');
        setAllergies(profileData.allergies || '');
        setChronicConditions(profileData.chronic_conditions || '');
        setDob(profileData.dob || '');
        setGender(profileData.gender || '');
        setEmergencyContactName(profileData.emergency_contact_name || '');
        setEmergencyContactRelationship(profileData.emergency_contact_relationship || '');
        setEmergencyContactPhone(profileData.emergency_contact_phone || '');
        setInsuranceProvider(profileData.insurance_provider || '');
        setPolicyNumber(profileData.policy_number || '');
        setGroupNumber(profileData.group_number || '');
        setConsentToShareData(profileData.consent_to_share_data || false);
        setAbhaNumber(profileData.abha_number || '');
        setAbhaAddress(profileData.abha_address || '');

        // Fetch Incident History
        const incidentsRes = await fetch(`${SERVER_URL}/api/users/me/incidents`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const incidentsData = await incidentsRes.json();
        if (Array.isArray(incidentsData)) setIncidents(incidentsData);

        // Fetch Vitals History
        const vitalsRes = await fetch(`${SERVER_URL}/api/users/me/vitals-history`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const vitalsData = await vitalsRes.json();
        if (Array.isArray(vitalsData)) {
          // Format timestamp for chart readability
          const formatted = vitalsData.map(v => ({
            ...v,
            timeLabel: new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));
          setVitalsHistory(formatted);
        }

        // Fetch Prescriptions
        const prescriptionsRes = await fetch(`${SERVER_URL}/api/prescriptions/patient/${profileData.id || 'me'}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const prescriptionsData = await prescriptionsRes.json();
        if (Array.isArray(prescriptionsData)) setPrescriptions(prescriptionsData);

      } catch (err) {
        console.error('Failed to load patient portal data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, []);

  const handleDownloadFHIR = async (incidentId) => {
    const token = sessionStorage.getItem('rescuelink_token');
    try {
      const res = await fetch(`${SERVER_URL}/api/fhir/${incidentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setFhirPreview(data);
      
      // Trigger file download
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `FHIR-Record-${incidentId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e) {
      alert('Failed to download FHIR HL7 record.');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    const token = sessionStorage.getItem('rescuelink_token');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          mobile,
          bloodGroup,
          allergies,
          chronicConditions,
          dob,
          gender,
          emergencyContactName,
          emergencyContactRelationship,
          emergencyContactPhone,
          insuranceProvider,
          policyNumber,
          groupNumber,
          consentToShareData,
          abhaNumber,
          abhaAddress
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      setProfile(data);
      setSaveMessage('✅ Profile updated successfully!');
    } catch (err) {
      setSaveMessage(`❌ Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff', fontFamily: "'Orbitron'" }}>
        INITIALIZING PATIENT SECURE DATABASE FEED...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1200, margin: '20px auto', padding: '0 20px', fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid rgba(0,200,255,0.15)', paddingBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', margin: 0, fontSize: 24, letterSpacing: '0.1em' }}>🧍 PATIENT EMER-HEALTH PORTAL</h2>
          <p style={{ color: 'rgba(160,200,255,0.6)', margin: '4px 0 0 0', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>ABHA Link ID: {profile?.abha_number || 'UNLINKED'}</p>
        </div>
        <div style={{ padding: '6px 12px', background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', borderRadius: 4, color: '#00ff88', fontSize: 11, fontFamily: "'Orbitron'", fontWeight: 'bold' }}>
          🔒 HL7 SECURED END-TO-END
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { id: 'overview', label: '📋 PROFILE OVERVIEW' },
          { id: 'incidents', label: '🚑 DISPATCH HISTORY' },
          { id: 'vitals', label: '📈 HEART & VITAL TRENDS' },
          { id: 'prescriptions', label: '💊 DISCHARGE PRESCRIPTIONS' },
          { id: 'profile', label: '⚙️ MANAGE PROFILE' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: activeTab === tab.id ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${activeTab === tab.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8,
              color: activeTab === tab.id ? '#00c8ff' : 'rgba(160,200,255,0.6)',
              fontFamily: "'Orbitron'",
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Panels */}
      <div style={{ background: 'rgba(5, 15, 40, 0.8)', border: '1px solid rgba(0, 200, 255, 0.2)', borderRadius: 12, padding: 24 }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <h3 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', borderBottom: '1px solid rgba(0,200,255,0.1)', paddingBottom: 8 }}>DEMOGRAPHICS</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e0eaff', fontSize: 14 }}>
                <tbody>
                  {[
                    { label: 'Full Name', value: profile?.name },
                    { label: 'Email', value: profile?.email },
                    { label: 'Mobile', value: profile?.mobile || 'Not provided' },
                    { label: 'Date of Birth', value: profile?.dob || 'Not provided' },
                    { label: 'Gender', value: profile?.gender || 'Not provided' },
                    { label: 'ABHA Address', value: profile?.abha_address || 'Not registered' }
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 0', color: 'rgba(160,200,255,0.6)' }}>{row.label}</td>
                      <td style={{ padding: '12px 0', fontWeight: 'bold', textAlign: 'right' }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontFamily: "'Orbitron'", color: '#ffb800', borderBottom: '1px solid rgba(255,184,0,0.2)', paddingBottom: 8 }}>EMERGENCY PROFILE & ALLERGIES</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e0eaff', fontSize: 14 }}>
                <tbody>
                  {[
                    { label: 'Blood Group', value: profile?.blood_group || 'UNKNOWN' },
                    { label: 'Drug / Food Allergies', value: profile?.allergies || 'No allergies recorded' },
                    { label: 'Chronic Conditions', value: profile?.chronic_conditions || 'No chronic conditions recorded' }
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 0', color: 'rgba(160,200,255,0.6)' }}>{row.label}</td>
                      <td style={{ padding: '12px 0', fontWeight: 'bold', textAlign: 'right', color: row.label === 'Blood Group' ? '#00ff88' : '#e0eaff' }}>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'incidents' && (
          <div>
            <h3 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 16 }}>DISPATCH HISTORY LOGS</h3>
            {incidents.length === 0 ? (
              <p style={{ color: 'rgba(160,200,255,0.4)', textAlign: 'center', padding: '40px 0' }}>No emergency runs logged for this patient profile.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {incidents.map(inc => (
                  <div key={inc.id} style={{ border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 'bold', color: '#fff' }}>{inc.id}</div>
                      <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', marginTop: 4 }}>
                        Date: {new Date(inc.createdAt).toLocaleString()} · Condition: {inc.status || 'Resolved'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadFHIR(inc.id)}
                      style={{
                        padding: '8px 16px', background: 'rgba(0,255,136,0.15)',
                        border: '1px solid #00ff88', borderRadius: 6,
                        color: '#00ff88', fontSize: 11, fontFamily: "'Orbitron'",
                        fontWeight: 'bold', cursor: 'pointer'
                      }}
                    >
                      📥 EXPORT FHIR HL7
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'vitals' && (
          <div>
            <h3 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 20 }}>HISTORICAL VITALS TELEMETRY</h3>
            {vitalsHistory.length === 0 ? (
              <p style={{ color: 'rgba(160,200,255,0.4)', textAlign: 'center', padding: '40px 0' }}>No vitals stream records found in emergency history.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ height: 220 }}>
                  <h4 style={{ fontSize: 11, fontFamily: "'Orbitron'", color: '#ff4444', marginBottom: 8 }}>HEART RATE HISTORY (BPM)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={vitalsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="timeLabel" stroke="rgba(160,200,255,0.4)" tick={{ fontSize: 9 }} />
                      <YAxis stroke="rgba(160,200,255,0.4)" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: '#0a1e3a', border: '1px solid #00c8ff', color: '#fff' }} />
                      <Line type="monotone" dataKey="heartRate" stroke="#ff4444" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ height: 220 }}>
                  <h4 style={{ fontSize: 11, fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 8 }}>OXYGEN SATURATION (SpO2 %)</h4>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={vitalsHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="timeLabel" stroke="rgba(160,200,255,0.4)" tick={{ fontSize: 9 }} />
                      <YAxis stroke="rgba(160,200,255,0.4)" tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: '#0a1e3a', border: '1px solid #00c8ff', color: '#fff' }} />
                      <Line type="monotone" dataKey="spo2" stroke="#00c8ff" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prescriptions' && (
          <div>
            <h3 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 16 }}>ISSUED PRESCRIPTIONS & ADVISORIES</h3>
            {prescriptions.length === 0 ? (
              <p style={{ color: 'rgba(160,200,255,0.4)', textAlign: 'center', padding: '40px 0' }}>No active prescriptions or discharge advisories issued.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {prescriptions.map(pres => (
                  <div key={pres.id} style={{ border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 20, background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: 15, color: '#00ff88' }}>Diagnosis: {pres.diagnosis}</div>
                        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.4)', marginTop: 2 }}>Prescription ID: {pres.id}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>
                        Date: {new Date(pres.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#00c8ff', fontFamily: "'Orbitron'", marginBottom: 6 }}>MEDICATIONS</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {JSON.parse(pres.medications || '[]').map((med, i) => (
                          <div key={i} style={{ padding: '6px 12px', background: 'rgba(0,200,255,0.04)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span><strong>{med.name}</strong> ({med.dosage})</span>
                            <span style={{ color: 'rgba(160,200,255,0.6)' }}>{med.instructions}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {pres.notes && (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(220,230,255,0.8)', background: 'rgba(255,184,0,0.03)', padding: 10, borderRadius: 4, borderLeft: '3px solid #ffb800' }}>
                        <strong>Doctor Notes:</strong> {pres.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div style={{ color: '#fff' }}>
            <h3 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 16 }}>⚙️ MANAGE EMER-HEALTH PROFILE</h3>
            {saveMessage && (
              <div style={{
                padding: 12, borderRadius: 6,
                background: saveMessage.includes('✅') ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                border: `1px solid ${saveMessage.includes('✅') ? '#00ff88' : '#ff4444'}`,
                color: saveMessage.includes('✅') ? '#00ff88' : '#ff4444',
                marginBottom: 16, fontSize: 13, fontFamily: "'Share Tech Mono'"
              }}>
                {saveMessage}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Profile Block */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>FULL NAME</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>MOBILE NUMBER</label>
                  <input type="text" value={mobile} onChange={e => setMobile(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
              </div>

              {/* ABDM Registry Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ABHA CARD NUMBER</label>
                  <input type="text" value={abhaNumber} onChange={e => setAbhaNumber(e.target.value)} placeholder="12-3456-7890-12" style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ABHA ADDRESS ID</label>
                  <input type="text" value={abhaAddress} onChange={e => setAbhaAddress(e.target.value)} placeholder="name@abdm" style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
              </div>

              {/* Clinical Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>BLOOD GROUP</label>
                  <input type="text" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>DATE OF BIRTH</label>
                  <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>GENDER</label>
                  <select value={gender} onChange={e => setGender(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Allergies & Conditions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ALLERGIES</label>
                  <input type="text" value={allergies} onChange={e => setAllergies(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CHRONIC CONDITIONS</label>
                  <input type="text" value={chronicConditions} onChange={e => setChronicConditions(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#fff' }} />
                </div>
              </div>

              {/* Emergency Contact */}
              <div style={{ padding: 16, border: '1px solid rgba(255,184,0,0.2)', borderRadius: 8, background: 'rgba(255,184,0,0.02)' }}>
                <h4 style={{ color: '#ffb800', fontFamily: "'Orbitron'", margin: '0 0 12px 0', fontSize: 12 }}>🚨 EMERGENCY CONTACT (NEXT OF KIN)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CONTACT NAME</label>
                    <input type="text" value={emergencyContactName} onChange={e => setEmergencyContactName(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>RELATIONSHIP</label>
                    <input type="text" value={emergencyContactRelationship} onChange={e => setEmergencyContactRelationship(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PHONE NUMBER</label>
                    <input type="text" value={emergencyContactPhone} onChange={e => setEmergencyContactPhone(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,184,0,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                </div>
              </div>

              {/* Insurance */}
              <div style={{ padding: 16, border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, background: 'rgba(0,255,136,0.02)' }}>
                <h4 style={{ color: '#00ff88', fontFamily: "'Orbitron'", margin: '0 0 12px 0', fontSize: 12 }}>💳 INSURANCE & COVERAGE DETAILS</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PROVIDER</label>
                    <input type="text" value={insuranceProvider} onChange={e => setInsuranceProvider(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>POLICY NUMBER</label>
                    <input type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>GROUP NUMBER</label>
                    <input type="text" value={groupNumber} onChange={e => setGroupNumber(e.target.value)} style={{ padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 6, color: '#fff' }} />
                  </div>
                </div>
              </div>

              {/* Consent check */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#e0eaff', cursor: 'pointer' }}>
                <input type="checkbox" checked={consentToShareData} onChange={e => setConsentToShareData(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#00ff88' }} />
                <span>I explicitly consent to let dispatch teams view my vital emergency profile parameters during live triage runs.</span>
              </label>

              <button type="submit" disabled={saving} style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #00c8ff22, #00c8ff55)',
                border: '1px solid #00c8ff',
                borderRadius: 8,
                color: '#00c8ff',
                fontFamily: "'Orbitron'",
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                letterSpacing: '0.1em',
                transition: 'all 0.2s',
                alignSelf: 'flex-start'
              }}>
                {saving ? 'SAVING PROFILE CONFIG...' : '💾 SAVE PROFILE CHANGES'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
