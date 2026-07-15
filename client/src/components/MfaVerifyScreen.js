import React, { useState } from 'react';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

export function MfaVerifyScreen({ mfaToken, onLoginSuccess, onCancel, ParticleCanvas }) {
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/verify-mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, totpCode })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      sessionStorage.setItem('rescuelink_token', data.token);
      sessionStorage.setItem('rescuelink_user', JSON.stringify(data.user));

      let viewRole = 'user';
      if (data.user.role === 'doctor' || data.user.role === 'hospital_admin') {
        viewRole = 'hospital';
      } else if (data.user.role === 'paramedic') {
        viewRole = 'ambulance';
      } else if (data.user.role === 'city_admin') {
        viewRole = 'admin';
      } else if (data.user.role === 'family') {
        viewRole = 'family';
      } else if (data.user.role === 'patient') {
        viewRole = 'user';
      }

      onLoginSuccess(viewRole, data.token);
    } catch (err) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #0a1e3a 0%, #050d1a 70%)',
      fontFamily: "'Rajdhani', sans-serif", padding: '20px',
      position: 'relative', overflow: 'hidden',
    }}>
      {ParticleCanvas && <ParticleCanvas />}
      <div className="scanline" />
      
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06,
        backgroundImage: 'linear-gradient(rgba(0,200,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        width: '100%', maxWidth: 400, padding: '40px 32px',
        background: 'rgba(10,22,48,0.85)',
        border: '1px solid rgba(0,200,255,0.3)',
        borderRadius: 12, backdropFilter: 'blur(10px)',
        zIndex: 1, boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 24,
          color: '#00c8ff', textAlign: 'center', marginBottom: 8,
          textShadow: '0 0 10px rgba(0,200,255,0.4)', letterSpacing: '0.1em'
        }}>RESCUELINK</h2>
        <p style={{
          textAlign: 'center', color: 'rgba(160,200,255,0.5)',
          fontSize: 11, letterSpacing: '0.2em', marginBottom: 24,
          fontFamily: "'Share Tech Mono'"
        }}>TWO-FACTOR VERIFICATION</p>

        {error && (
          <div style={{
            padding: 12, background: 'rgba(255,50,50,0.1)',
            border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6,
            color: '#ff8888', marginBottom: 20, fontSize: 13,
            textAlign: 'center', fontFamily: "'Share Tech Mono'"
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono'" }}>ENTER 2FA OTP / RECOVERY CODE</label>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="6-digit code or 8-char recovery code"
              required
              style={{
                padding: '12px', background: 'rgba(5,15,40,0.6)',
                border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none',
                textAlign: 'center', letterSpacing: '2px'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px', background: 'linear-gradient(135deg, #00ff8822, #00ff8844)',
              border: '1px solid #00ff88', borderRadius: 6,
              color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 13,
              fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer',
              marginTop: 10
            }}
          >
            {loading ? 'VERIFYING...' : 'VERIFY CODE →'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
              color: 'rgba(160,200,255,0.7)', fontFamily: "'Orbitron'", fontSize: 11,
              fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
            }}
          >
            ← BACK TO PASSWORD LOGIN
          </button>
        </form>
      </div>
    </div>
  );
}
