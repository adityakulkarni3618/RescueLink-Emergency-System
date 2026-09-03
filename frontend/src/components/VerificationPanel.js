import React, { useState, useEffect } from 'react';

export default function VerificationPanel({ token, socket }) {
  const [pendingAmbulances, setPendingAmbulances] = useState([]);
  const [pendingHospitals, setPendingHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  const fetchPendingUnits = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pending-verifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPendingAmbulances(data.pendingAmbulances || []);
        setPendingHospitals(data.pendingHospitals || []);
      }
    } catch (err) {
      console.error('[VERIFICATION UI] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUnits();

    if (socket) {
      socket.on('unit:verified', () => {
        fetchPendingUnits();
      });
    }

    return () => {
      if (socket) socket.off('unit:verified');
    };
  }, [token, socket]);

  const handleApprove = async (unitId, unitType) => {
    try {
      const res = await fetch('/api/admin/approve-unit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ unitId, unitType })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: data.message });
        fetchPendingUnits();
      } else {
        setActionMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Approval request failed' });
    }
  };

  const handleReject = async (unitId, unitType) => {
    try {
      const res = await fetch('/api/admin/reject-unit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ unitId, unitType, reason: 'Invalid or incomplete credentials' })
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'info', text: data.message });
        fetchPendingUnits();
      } else {
        setActionMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Rejection request failed' });
    }
  };

  return (
    <div style={{ padding: '20px', color: '#e0f7fc', background: '#050d1a', borderRadius: '12px', border: '1px solid rgba(0,200,255,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#00c8ff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🛡️</span> WAR ROOM REGISTRATION VERIFICATION QUEUE
        </h2>
        <button onClick={fetchPendingUnits} style={{ background: '#00c8ff22', border: '1px solid #00c8ff', color: '#00c8ff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}>
          🔄 Refresh Queue
        </button>
      </div>

      {actionMessage && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: actionMessage.type === 'success' ? '#00ff8822' : '#ff333322',
          border: `1px solid ${actionMessage.type === 'success' ? '#00ff88' : '#ff3333'}`,
          color: actionMessage.type === 'success' ? '#00ff88' : '#ff3333'
        }}>
          {actionMessage.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#00c8ff' }}>Loading verification queue...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Ambulances Column */}
          <div style={{ background: '#08162b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0,200,255,0.15)' }}>
            <h3 style={{ borderBottom: '1px solid rgba(0,200,255,0.2)', paddingBottom: '8px', color: '#ffb800', margin: '0 0 16px 0' }}>
              🚑 Pending Ambulances ({pendingAmbulances.length})
            </h3>
            {pendingAmbulances.length === 0 ? (
              <div style={{ color: '#7f8c8d', fontSize: '13px' }}>No pending ambulance registrations.</div>
            ) : (
              pendingAmbulances.map(amb => (
                <div key={amb.id} style={{ background: '#0c203b', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid rgba(255,184,0,0.3)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#ffffff' }}>{amb.vehicleNo} ({amb.type || 'BLS'})</div>
                  <div style={{ fontSize: '13px', color: '#a0c4d6', margin: '4px 0' }}>Driver: {amb.driverName} | Contact: {amb.contactInfo}</div>
                  <div style={{ fontSize: '12px', color: '#7f8c8d' }}>Station: {amb.station_name || 'Central'} | License: {amb.license_number || 'N/A'}</div>
                  <div style={{ fontSize: '12px', color: '#00c8ff', margin: '4px 0' }}>Coords: [{amb.latitude || 12.9716}, {amb.longitude || 77.5946}]</div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button onClick={() => handleApprove(amb.id, 'ambulance')} style={{ flex: 1, background: '#00ff8822', border: '1px solid #00ff88', color: '#00ff88', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✓ Approve Unit
                    </button>
                    <button onClick={() => handleReject(amb.id, 'ambulance')} style={{ flex: 1, background: '#ff333322', border: '1px solid #ff3333', color: '#ff3333', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Hospitals Column */}
          <div style={{ background: '#08162b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(0,200,255,0.15)' }}>
            <h3 style={{ borderBottom: '1px solid rgba(0,200,255,0.2)', paddingBottom: '8px', color: '#00ff88', margin: '0 0 16px 0' }}>
              🏥 Pending Hospitals ({pendingHospitals.length})
            </h3>
            {pendingHospitals.length === 0 ? (
              <div style={{ color: '#7f8c8d', fontSize: '13px' }}>No pending hospital registrations.</div>
            ) : (
              pendingHospitals.map(hosp => (
                <div key={hosp.id} style={{ background: '#0c203b', padding: '12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid rgba(0,255,136,0.3)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#ffffff' }}>{hosp.name}</div>
                  <div style={{ fontSize: '13px', color: '#a0c4d6', margin: '4px 0' }}>Contact: {hosp.contact_number} | License: {hosp.license_number || 'N/A'}</div>
                  <div style={{ fontSize: '12px', color: '#7f8c8d' }}>Address: {hosp.address || `${hosp.city || ''}, ${hosp.state || ''}`}</div>
                  <div style={{ fontSize: '12px', color: '#00c8ff', margin: '4px 0' }}>Coords: [{hosp.lat}, {hosp.lng}] | Beds: {hosp.total_beds} (ICU: {hosp.icu_beds})</div>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button onClick={() => handleApprove(hosp.id, 'hospital')} style={{ flex: 1, background: '#00ff8822', border: '1px solid #00ff88', color: '#00ff88', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✓ Approve Hospital
                    </button>
                    <button onClick={() => handleReject(hosp.id, 'hospital')} style={{ flex: 1, background: '#ff333322', border: '1px solid #ff3333', color: '#ff3333', padding: '8px', borderRadius: '4px', cursor: 'pointer' }}>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
