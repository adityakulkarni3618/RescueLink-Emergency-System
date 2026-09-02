const React = require('react');
const { useState, useEffect } = React;

module.exports = function DroneDispatchPanel({ userLocation, socket }) {
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPayload, setSelectedPayload] = useState('AED');
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchFleet = async () => {
    try {
      const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('token') || '';
      const res = await fetch('/api/drone/fleet', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setFleet(data);
    } catch (err) {
      console.warn('[DRONE FLEET FETCH WARN]', err);
    }
  };

  useEffect(() => {
    fetchFleet();
    const interval = setInterval(fetchFleet, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('drone-dispatched', (data) => {
      setActiveDispatch(data);
      setStatusMsg(`🚁 ${data.drone.drone_code} Dispatched! ETA: ${data.etaMinutes} min (${data.distanceKm} km)`);
      fetchFleet();
    });
    return () => socket.off('drone-dispatched');
  }, [socket]);

  const dispatchNearestDrone = async () => {
    const lat = userLocation?.lat || 18.5204;
    const lng = userLocation?.lng || 73.8567;

    setLoading(true);
    setStatusMsg('');
    try {
      const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('token') || '';
      const res = await fetch('/api/drone/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          target_lat: lat,
          target_lng: lng,
          payload_type: selectedPayload
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveDispatch(data);
        setStatusMsg(`🚀 SUCCESS: ${data.message} ETA: ${data.etaMinutes} minutes.`);
        fetchFleet();
      } else {
        setStatusMsg(`❌ Dispatch Failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMsg('❌ Drone dispatch request failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(8,20,42,0.95) 0%, rgba(2,8,20,0.98) 100%)',
      border: '1px solid rgba(0,200,255,0.3)',
      borderRadius: 16,
      padding: 24,
      boxShadow: '0 0 40px rgba(0,200,255,0.15)',
      fontFamily: "'Share Tech Mono', monospace",
      color: '#e0eaff'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#00c8ff', fontWeight: 900, letterSpacing: '0.08em' }}>
            🛰️ MEDICAL DRONE RAPID DISPATCH
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', marginTop: 4 }}>
            AUTONOMOUS DEFIBRILLATOR & BLOOD SUPPLY AIRWAY GRID
          </div>
        </div>
        <span style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid #00ff88', borderRadius: 4, fontFamily: "'Orbitron'" }}>
          ACTIVE AIRWAY REGISTRY
        </span>
      </div>

      {statusMsg && (
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12, fontWeight: 'bold',
          background: statusMsg.includes('SUCCESS') || statusMsg.includes('Dispatched') ? 'rgba(0,255,136,0.12)' : 'rgba(255,68,68,0.12)',
          border: `1px solid ${statusMsg.includes('SUCCESS') || statusMsg.includes('Dispatched') ? '#00ff88' : '#ff4444'}`,
          color: statusMsg.includes('SUCCESS') || statusMsg.includes('Dispatched') ? '#00ff88' : '#ff4444'
        }}>
          {statusMsg}
        </div>
      )}

      {/* Payload Selector & Quick Dispatch Button */}
      <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.7)', marginBottom: 10, fontFamily: "'Orbitron'" }}>
          SELECT EMERGENCY PAYLOAD
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { id: 'AED', label: '⚡ AED Defibrillator', desc: 'Cardiac Arrest' },
            { id: 'BLOOD_BAG', label: '🩸 O- Blood Bag', desc: 'Hemorrhage / Shock' },
            { id: 'EPI_PEN', label: '💉 EpiPen Auto-Inject', desc: 'Anaphylaxis' },
            { id: 'FIRST_AID', label: '🩹 Trauma Kit', desc: 'Severe Burns / Fracture' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPayload(p.id)}
              style={{
                padding: 12,
                background: selectedPayload === p.id ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedPayload === p.id ? '#00c8ff' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8,
                color: selectedPayload === p.id ? '#00c8ff' : '#aaaaaa',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 9, opacity: 0.7 }}>{p.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={dispatchNearestDrone}
          disabled={loading}
          style={{
            width: '100%', padding: '14px',
            background: 'linear-gradient(135deg, rgba(0,200,255,0.3), rgba(0,100,255,0.2))',
            border: '2px solid #00c8ff', borderRadius: 8,
            color: '#00c8ff', fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 13,
            cursor: 'pointer', letterSpacing: '0.05em'
          }}
        >
          {loading ? 'CALCULATING OPTIMAL AIRWAY ROUTE...' : `🛸 LAUNCH DRONE WITH ${selectedPayload}`}
        </button>
      </div>

      {/* Live Drone Fleet Status Grid */}
      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.7)', marginBottom: 10, fontFamily: "'Orbitron'" }}>
        FLEET AIRWAY MONITOR
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {fleet.map(d => (
          <div key={d.id} style={{
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${d.status === 'DISPATCHED' ? '#00ff88' : 'rgba(0,200,255,0.15)'}`,
            borderRadius: 10, padding: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold', color: '#00c8ff', fontSize: 12 }}>{d.drone_code}</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: d.status === 'DISPATCHED' ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.05)', color: d.status === 'DISPATCHED' ? '#00ff88' : '#888' }}>
                {d.status}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>Payload: <strong style={{ color: '#fff' }}>{d.payload_type}</strong></div>
            <div style={{ fontSize: 10, color: '#aaa' }}>Battery: <strong style={{ color: d.battery_pct > 30 ? '#00ff88' : '#ff4444' }}>{d.battery_pct}%</strong></div>
          </div>
        ))}
      </div>
    </div>
  );
};
