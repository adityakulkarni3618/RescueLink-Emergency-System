import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import QRCode from 'qrcode';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const bloodBankIcon = L.divIcon({
  className: '', html: `<div style="width:32px;height:32px;background:rgba(220,30,30,0.9);border:2px solid rgba(255,100,100,0.8);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 15px rgba(220,30,30,0.5);">🩸</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const BLOOD_COMPATIBILITY = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
};

function InventoryBar({ type, count, max = 25 }) {
  const pct = Math.min(100, (count / max) * 100);
  const color = count === 0 ? '#ff4444' : count < 5 ? '#ffb800' : '#00ff88';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontFamily: "'Orbitron'", fontSize: 10, color: count === 0 ? '#ff4444' : 'rgba(160,200,255,0.7)', fontWeight: 700 }}>{type}</span>
        <span style={{ fontFamily: "'Share Tech Mono'", fontSize: 11, color, fontWeight: 700 }}>{count === 0 ? 'OUT' : `${count} units`}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.5s ease', boxShadow: count > 0 ? `0 0 6px ${color}` : 'none' }} />
      </div>
    </div>
  );
}

export default function BloodEmergencyNetwork({ socket, userLocation, patientDetails }) {
  const [activeTab, setActiveTab] = useState('map');
  const [bloodBanks, setBloodBanks] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [selectedBloodType, setSelectedBloodType] = useState('O-');
  const [patientName, setPatientName] = useState(patientDetails?.name || '');
  const [urgency, setUrgency] = useState('CRITICAL');
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [mapCenter, setMapCenter] = useState(userLocation || { lat: 12.9716, lng: 77.5946 });

  const fetchData = useCallback(async () => {
    try {
      const loc = userLocation || mapCenter;
      const [banksRes, reqRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/blood/banks?lat=${loc.lat}&lng=${loc.lng}`),
        fetch(`${SERVER_URL}/api/blood/requests`)
      ]);
      setBloodBanks(await banksRes.json());
      setActiveRequests(await reqRes.json());
    } catch(e) { console.warn('[BloodNetwork] Fetch failed', e); }
  }, [userLocation, mapCenter]);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 15000); return () => clearInterval(t); }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const handler = (req) => setActiveRequests(prev => [req, ...prev.slice(0, 19)]);
    socket.on('blood-emergency-broadcast', handler);
    return () => socket.off('blood-emergency-broadcast', handler);
  }, [socket]);

  const sendBloodRequest = async () => {
    if (!patientName || !selectedBloodType) return;
    setRequesting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/blood/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloodType: selectedBloodType, location: userLocation, patientName, urgency })
      });
      const data = await res.json();
      setRequestSent(data);
    } catch(e) { alert('Failed to send blood request'); }
    setRequesting(false);
  };

  const generateQRCard = async () => {
    const cardData = {
      name: patientName || patientDetails?.name || 'Unknown',
      bloodType: selectedBloodType,
      allergies: patientDetails?.allergies || [],
      emergencyContact: patientDetails?.emergencyContact || 'N/A',
      medicalHistory: patientDetails?.medicalHistory || [],
      generatedAt: new Date().toISOString()
    };
    const text = `RESCUELINK HEALTH CARD\n${JSON.stringify(cardData, null, 2)}`;
    try {
      const url = await QRCode.toDataURL(text, { width: 300, margin: 2, color: { dark: '#00c8ff', light: '#050f28' } });
      setQrDataUrl(url);
      setShowQR(true);
    } catch(e) { console.error('QR generation failed', e); }
  };

  const compatibleBanks = bloodBanks.filter(b => (b.inventory[selectedBloodType] || 0) > 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(2,8,25,0.95)', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif" }}>
      <style>{`
        @keyframes bloodPulse { 0%,100%{box-shadow:0 0 10px rgba(220,30,30,0.3)} 50%{box-shadow:0 0 25px rgba(220,30,30,0.7)} }
        @keyframes reqSlide { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(220,30,30,0.3)', background: 'rgba(220,30,30,0.08)' }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff4444', fontWeight: 700, letterSpacing: '0.1em' }}>
          🩸 BLOOD EMERGENCY NETWORK
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.5)', marginTop: 2, fontFamily: "'Share Tech Mono'" }}>
          {bloodBanks.length} blood banks • {activeRequests.length} active requests
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(220,30,30,0.2)' }}>
        {[['map', '🗺️ MAP'], ['request', '🚨 REQUEST'], ['qr', '📱 HEALTH CARD']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            flex: 1, padding: '10px', background: activeTab === id ? 'rgba(220,30,30,0.15)' : 'transparent',
            border: 'none', borderBottom: activeTab === id ? '2px solid #ff4444' : '2px solid transparent',
            color: activeTab === id ? '#ff6666' : 'rgba(160,200,255,0.5)',
            cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, letterSpacing: '0.05em', transition: 'all 0.2s'
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>

        {/* Map Tab */}
        {activeTab === 'map' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Blood Type Selector */}
            <div>
              <div style={{ fontSize: 10, color: 'rgba(220,30,30,0.7)', fontFamily: "'Orbitron'", marginBottom: 8, letterSpacing: '0.1em' }}>SELECT BLOOD TYPE TO FIND</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BLOOD_TYPES.map(t => (
                  <button key={t} onClick={() => setSelectedBloodType(t)} style={{
                    padding: '6px 14px', borderRadius: 20,
                    background: selectedBloodType === t ? '#ff4444' : 'rgba(220,30,30,0.08)',
                    border: `1px solid ${selectedBloodType === t ? '#ff4444' : 'rgba(220,30,30,0.25)'}`,
                    color: selectedBloodType === t ? '#fff' : 'rgba(220,150,150,0.7)',
                    fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                  }}>{t}</button>
                ))}
              </div>
            </div>

            {/* Availability Summary */}
            <div style={{
              padding: '12px 16px', borderRadius: 10,
              background: compatibleBanks.length > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)',
              border: `1px solid ${compatibleBanks.length > 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'}`,
              animation: compatibleBanks.length === 0 ? 'bloodPulse 1.5s ease infinite' : 'none'
            }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: compatibleBanks.length > 0 ? '#00ff88' : '#ff4444', marginBottom: 4 }}>
                {compatibleBanks.length > 0 ? `✅ ${compatibleBanks.length} BANKS HAVE ${selectedBloodType}` : `⚠️ NO BANKS HAVE ${selectedBloodType} IN STOCK`}
              </div>
              {compatibleBanks.length === 0 && (
                <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.7)' }}>
                  Compatible alternatives: {(BLOOD_COMPATIBILITY[selectedBloodType] || [selectedBloodType]).join(', ')}
                </div>
              )}
            </div>

            {/* Map */}
            <div style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(220,30,30,0.3)' }}>
              <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={13} style={{ width: '100%', height: '100%' }}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                {bloodBanks.map(bank => {
                  const hasStock = (bank.inventory[selectedBloodType] || 0) > 0;
                  return (
                    <Marker key={bank.id} position={[bank.lat, bank.lng]} icon={bloodBankIcon}>
                      <Popup>
                        <div style={{ background: '#050f28', padding: 12, minWidth: 200, color: '#e0eaff', fontFamily: "'Rajdhani'" }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ff4444', marginBottom: 8 }}>{bank.name}</div>
                          <div style={{ fontSize: 11, color: '#00ff88', marginBottom: 4 }}>{bank.phone}</div>
                          <div style={{ fontSize: 10, color: hasStock ? '#00ff88' : '#ff4444', fontWeight: 700 }}>
                            {selectedBloodType}: {bank.inventory[selectedBloodType] || 0} units {hasStock ? '✅' : '❌'}
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginTop: 4 }}>
                            {bank.emergency24x7 ? '🕐 24/7 Emergency' : 'Office hours only'}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                {userLocation && <Circle center={[userLocation.lat, userLocation.lng]} radius={1000} color="rgba(255,68,68,0.5)" fillOpacity={0.1} />}
              </MapContainer>
            </div>

            {/* Bank List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bloodBanks.map(bank => {
                const stockCount = bank.inventory[selectedBloodType] || 0;
                const hasStock = stockCount > 0;
                return (
                  <div key={bank.id} style={{
                    background: 'rgba(5,15,40,0.8)', borderRadius: 10, padding: 14,
                    border: `1px solid ${hasStock ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{bank.name}</div>
                        <div style={{ fontSize: 11, color: '#00c8ff', marginTop: 2 }}>{bank.phone}</div>
                      </div>
                      <div style={{
                        padding: '4px 10px', borderRadius: 20,
                        background: hasStock ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                        border: `1px solid ${hasStock ? '#00ff88' : '#ff4444'}`,
                        color: hasStock ? '#00ff88' : '#ff4444', fontFamily: "'Orbitron'", fontSize: 10
                      }}>
                        {selectedBloodType}: {stockCount} units
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                      {Object.entries(bank.inventory).slice(0, 4).map(([t, c]) => (
                        <div key={t} style={{ textAlign: 'center', padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                          <div style={{ fontFamily: "'Orbitron'", fontSize: 9, color: 'rgba(160,200,255,0.5)' }}>{t}</div>
                          <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 12, color: c === 0 ? '#ff4444' : c < 5 ? '#ffb800' : '#00ff88' }}>{c}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Request Tab */}
        {activeTab === 'request' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {requestSent ? (
              <div style={{
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.4)',
                borderRadius: 16, padding: 28, textAlign: 'center', animation: 'reqSlide 0.4s ease'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00ff88', marginBottom: 8 }}>REQUEST BROADCAST SENT</div>
                <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', lineHeight: 1.6 }}>
                  All hospitals and blood banks in the network have been alerted.<br />
                  <span style={{ color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>Request ID: {requestSent.id}</span>
                </div>
                <button onClick={() => setRequestSent(null)} style={{
                  marginTop: 16, padding: '10px 24px', background: 'rgba(0,200,255,0.1)',
                  border: '1px solid rgba(0,200,255,0.3)', borderRadius: 8, color: '#00c8ff',
                  cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
                }}>SEND ANOTHER</button>
              </div>
            ) : (
              <>
                <div style={{ background: 'rgba(220,30,30,0.08)', border: '1px solid rgba(220,30,30,0.3)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#ff6666', marginBottom: 12, letterSpacing: '0.1em' }}>🚨 EMERGENCY BLOOD REQUEST</div>

                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>PATIENT NAME</label>
                  <input value={patientName} onChange={e => setPatientName(e.target.value)}
                    placeholder="Full name of patient"
                    style={{ width: '100%', marginBottom: 12, padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(220,30,30,0.3)', borderRadius: 6, color: '#e0eaff', fontSize: 13, boxSizing: 'border-box' }} />

                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 6 }}>BLOOD TYPE REQUIRED</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {BLOOD_TYPES.map(t => (
                      <button key={t} onClick={() => setSelectedBloodType(t)} style={{
                        padding: '8px 16px', borderRadius: 20,
                        background: selectedBloodType === t ? '#ff4444' : 'rgba(220,30,30,0.08)',
                        border: `1px solid ${selectedBloodType === t ? '#ff4444' : 'rgba(220,30,30,0.25)'}`,
                        color: selectedBloodType === t ? '#fff' : 'rgba(220,150,150,0.7)',
                        fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                      }}>{t}</button>
                    ))}
                  </div>

                  <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>URGENCY LEVEL</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {['CRITICAL', 'HIGH', 'MODERATE'].map(u => (
                      <button key={u} onClick={() => setUrgency(u)} style={{
                        flex: 1, padding: '8px', background: urgency === u ? 'rgba(255,68,68,0.2)' : 'rgba(0,0,0,0.3)',
                        border: `1px solid ${urgency === u ? '#ff4444' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 6, color: urgency === u ? '#ff6666' : 'rgba(160,200,255,0.5)',
                        cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
                      }}>{u}</button>
                    ))}
                  </div>

                  <button onClick={sendBloodRequest} disabled={requesting || !patientName} style={{
                    width: '100%', padding: '14px', background: 'rgba(220,30,30,0.2)',
                    border: '2px solid #ff4444', borderRadius: 10, color: '#ff4444',
                    fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    letterSpacing: '0.1em', animation: 'bloodPulse 1.5s ease infinite'
                  }}>
                    {requesting ? 'BROADCASTING...' : `🩸 BROADCAST ${selectedBloodType} EMERGENCY`}
                  </button>
                </div>

                {/* Active Requests */}
                <div>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: 'rgba(220,30,30,0.6)', marginBottom: 10, letterSpacing: '0.1em' }}>ACTIVE BLOOD REQUESTS IN NETWORK</div>
                  {activeRequests.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'rgba(160,200,255,0.3)', padding: 20, fontSize: 12 }}>No active blood requests</div>
                  ) : (
                    activeRequests.map((req, i) => (
                      <div key={req.id} style={{
                        background: 'rgba(5,15,40,0.8)', borderRadius: 8, padding: 12, marginBottom: 8,
                        borderLeft: `3px solid ${req.urgency === 'CRITICAL' ? '#ff4444' : req.urgency === 'HIGH' ? '#ffb800' : '#00c8ff'}`,
                        animation: `reqSlide 0.3s ${i * 0.05}s ease both`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff4444' }}>{req.bloodType}</span>
                          <span style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>
                            {new Date(req.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(220,230,255,0.7)', marginTop: 4 }}>{req.patientName}</div>
                        <div style={{ fontSize: 10, color: req.urgency === 'CRITICAL' ? '#ff4444' : '#ffb800', fontFamily: "'Orbitron'", marginTop: 2 }}>{req.urgency}</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* QR Health Card Tab */}
        {activeTab === 'qr' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 20, border: '1px solid rgba(0,200,255,0.2)' }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', marginBottom: 12 }}>GENERATE EMERGENCY HEALTH CARD</div>
              <p style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', lineHeight: 1.6, marginBottom: 16 }}>
                Creates a QR code with your vital health information for emergency responders to scan instantly.
              </p>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>YOUR NAME</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Your full name"
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 6 }}>YOUR BLOOD TYPE</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {BLOOD_TYPES.map(t => (
                    <button key={t} onClick={() => setSelectedBloodType(t)} style={{
                      padding: '6px 14px', borderRadius: 20,
                      background: selectedBloodType === t ? '#00c8ff' : 'rgba(0,200,255,0.08)',
                      border: `1px solid ${selectedBloodType === t ? '#00c8ff' : 'rgba(0,200,255,0.25)'}`,
                      color: selectedBloodType === t ? '#000' : 'rgba(0,200,255,0.7)',
                      fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <button onClick={generateQRCard} style={{
                width: '100%', padding: '14px', background: 'rgba(0,200,255,0.1)', border: '1px solid #00c8ff',
                borderRadius: 10, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>📱 GENERATE QR HEALTH CARD</button>
            </div>

            {showQR && qrDataUrl && (
              <div style={{ background: 'rgba(5,15,40,0.9)', borderRadius: 16, padding: 24, border: '2px solid rgba(0,200,255,0.4)', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00c8ff', marginBottom: 8 }}>🏥 RESCUELINK HEALTH CARD</div>
                <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', marginBottom: 16 }}>{patientName} • {selectedBloodType}</div>
                <img src={qrDataUrl} alt="Health QR Code" style={{ border: '2px solid rgba(0,200,255,0.3)', borderRadius: 12, maxWidth: '100%' }} />
                <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(0,200,255,0.5)' }}>
                  Scan to reveal emergency medical information.<br />Save to phone or print and carry in wallet.
                </div>
                <button onClick={() => {
                  const a = document.createElement('a');
                  a.href = qrDataUrl;
                  a.download = `health-card-${patientName || 'patient'}.png`;
                  a.click();
                }} style={{
                  marginTop: 12, padding: '10px 24px', background: 'rgba(0,200,255,0.15)',
                  border: '1px solid rgba(0,200,255,0.4)', borderRadius: 8, color: '#00c8ff',
                  cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
                }}>⬇️ DOWNLOAD</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
