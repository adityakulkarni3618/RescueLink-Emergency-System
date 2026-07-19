import React, { useState } from 'react';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

export default function InsurancePanel({ hospitalId }) {
  const [patientName, setPatientName] = useState('');
  const [condition, setCondition] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const requestPreApproval = async () => {
    if (!patientName || !condition) {
      setError('Patient name and condition are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('token');
      const res = await fetch(`${SERVER_URL}/api/insurance/pre-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ patientName, condition, estimatedCost: Number(estimatedCost), hospitalId })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Pre-approval request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'rgba(5,15,40,0.8)', borderRadius: 12, padding: 24, border: '1px solid rgba(0,200,255,0.2)' }}>
      <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', marginBottom: 16, letterSpacing: '0.1em' }}>
        🛡️ INSURANCE PRE-APPROVAL ENGINE
      </div>
      
      {!result ? (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>PATIENT NAME</label>
            <input value={patientName} onChange={e => setPatientName(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>EMERGENCY CONDITION</label>
            <input value={condition} onChange={e => setCondition(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', display: 'block', marginBottom: 4 }}>ESTIMATED COST (INR)</label>
            <input type="number" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} placeholder="e.g. 50000"
              style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6, color: '#e0eaff', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          
          {error && <div style={{ color: '#ff4444', fontSize: 12, marginBottom: 12 }}>⚠️ {error}</div>}
          
          <button onClick={requestPreApproval} disabled={loading} style={{
            width: '100%', padding: '12px', background: 'rgba(0,200,255,0.1)', border: '1px solid #00c8ff',
            borderRadius: 8, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>
            {loading ? 'PROCESSING...' : 'REQUEST AUTO-APPROVAL'}
          </button>
        </div>
      ) : (
        <div style={{ background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00ff88', marginBottom: 8, letterSpacing: '0.1em' }}>{result.status}</div>
          <div style={{ fontSize: 13, color: '#e0eaff', marginBottom: 4 }}>{result.patientName} • {result.condition}</div>
          <div style={{ fontSize: 18, color: '#00ff88', fontWeight: 700, fontFamily: "'Share Tech Mono'", marginBottom: 12 }}>
            Coverage: ₹{result.coverageAmount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', marginBottom: 20 }}>Ref: {result.referenceNo}</div>
          
          <button onClick={() => { setResult(null); setPatientName(''); setCondition(''); setEstimatedCost(''); }} style={{
            padding: '8px 24px', background: 'transparent', border: '1px solid rgba(0,255,136,0.4)',
            borderRadius: 6, color: '#00ff88', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
          }}>NEW REQUEST</button>
        </div>
      )}
    </div>
  );
}
