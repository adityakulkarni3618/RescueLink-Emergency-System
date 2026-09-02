import React, { useState, useEffect } from 'react';

export default function QrPassportModal({ patientData, onClose }) {
  const [passportData, setPassportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const generatePassport = async () => {
      try {
        const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('token') || '';
        const res = await fetch('/api/passport/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ patientId: patientData?.id })
        });
        const data = await res.json();
        if (res.ok) {
          setPassportData(data);
        } else {
          setError(data.error || 'Failed to generate passport');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    generatePassport();
  }, [patientData?.id]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0, 5, 20, 0.92)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #091830 0%, #020914 100%)',
        border: '2px solid #00c8ff', borderRadius: 20, padding: 32,
        width: '90%', maxWidth: 440, boxShadow: '0 0 50px rgba(0,200,255,0.25)',
        textAlign: 'center', position: 'relative'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16, background: 'none',
          border: 'none', color: '#ff4444', fontSize: 22, cursor: 'pointer'
        }}>✕</button>

        <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 900, letterSpacing: '0.08em', marginBottom: 4 }}>
          📲 EMERGENCY QR HEALTH PASSPORT
        </div>
        <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'", marginBottom: 20 }}>
          OFFLINE LOCKSCREEN EMERGENCY ACCESS PASSPORT (ABDM COMPLIANT)
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 12 }}>
            ⚡ GENERATING ENCRYPTED QR BADGE...
          </div>
        ) : error ? (
          <div style={{ color: '#ff4444', fontSize: 12, padding: 20 }}>❌ {error}</div>
        ) : (
          <div>
            <div style={{
              background: '#050d1a', border: '2px solid rgba(0,200,255,0.4)',
              borderRadius: 16, padding: 16, display: 'inline-block', marginBottom: 20,
              boxShadow: '0 0 30px rgba(0,200,255,0.2)'
            }}>
              <img src={passportData.qrDataUrl} alt="Emergency QR Code" style={{ width: 190, height: 190, borderRadius: 8, display: 'block' }} />
            </div>

            <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 12, padding: 16, fontSize: 11, fontFamily: "'Share Tech Mono'", marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(160,200,255,0.6)' }}>PATIENT NAME:</span>
                <strong style={{ color: '#fff' }}>{passportData.passport.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(160,200,255,0.6)' }}>ABHA ID:</span>
                <strong style={{ color: '#00c8ff' }}>{passportData.passport.abha}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(160,200,255,0.6)' }}>BLOOD GROUP:</span>
                <strong style={{ color: '#ff4444', fontSize: 14 }}>{passportData.passport.blood}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'rgba(160,200,255,0.6)' }}>ALLERGIES:</span>
                <strong style={{ color: '#ffb800' }}>{Array.isArray(passportData.passport.allergies) ? passportData.passport.allergies.join(', ') : passportData.passport.allergies}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(160,200,255,0.6)' }}>EMERGENCY CONTACT:</span>
                <strong style={{ color: '#00ff88' }}>{passportData.passport.emergencyContact}</strong>
              </div>
            </div>

            <button
              onClick={() => {
                const a = document.createElement('a');
                a.href = passportData.qrDataUrl;
                a.download = `RescueLink_Emergency_Passport_${passportData.passport.name.replace(/\s+/g, '_')}.png`;
                a.click();
              }}
              style={{
                width: '100%', padding: '14px',
                background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff',
                borderRadius: 10, color: '#00c8ff', fontFamily: "'Orbitron'",
                fontWeight: 700, fontSize: 12, cursor: 'pointer'
              }}
            >
              📥 DOWNLOAD LOCKSCREEN EMERGENCY BADGE
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
