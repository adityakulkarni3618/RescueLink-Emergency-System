import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AmbulanceStreamer from './components/AmbulanceStreamer';
import HospitalDashboard from './components/HospitalDashboard';
import UserDashboard from './components/UserDashboard';
import WarRoom from './components/WarRoom';
import FamilyDashboard from './components/FamilyDashboard';
import CustomAlert from './components/CustomAlert';
import axios from 'axios';
import { MfaVerifyScreen } from './components/MfaVerifyScreen';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
const SOCKET_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com';

// Global fetch request interceptor for JWT auth
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = sessionStorage.getItem('rescuelink_token');
  if (token && url.toString().includes(SERVER_URL)) {
    options.headers = options.headers || {};
    if (!options.headers['Authorization'] && !options.headers['authorization']) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return originalFetch(url, options);
};

// Global axios request interceptor for JWT auth
axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('rescuelink_token');
  if (token && config.url && config.url.includes(SERVER_URL)) {
    config.headers = config.headers || {};
    if (!config.headers['Authorization'] && !config.headers['authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/* ─── Animated scanline background ─────────────────────────────────────── */
const styles = `
  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(30px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes holo-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes scan-pulse {
    0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.7); }
    70% { transform: scale(1.1); opacity: 0.8; box-shadow: 0 0 0 10px rgba(0, 255, 136, 0); }
    100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); }
  }
  .scan-pulse {
    display: inline-block;
    animation: scan-pulse 1.5s infinite;
  }
  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  .role-card {
    animation: fadeSlideUp 0.6s ease forwards;
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    transform-style: preserve-3d;
  }
  .role-card:nth-child(1) { animation-delay: 0.2s; }
  .role-card:nth-child(2) { animation-delay: 0.4s; }

  .role-card:hover .card-glow {
    opacity: 1 !important;
  }
  .role-card:hover {
    transform: perspective(1000px) rotateX(6deg) rotateY(-6deg) scale3d(1.05, 1.05, 1.05) translateY(-8px);
    border-color: rgba(0,200,255,0.6) !important;
    box-shadow: -15px 20px 35px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.05);
  }
  .scanline {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, rgba(0,200,255,0.4), transparent);
    animation: scanline 6s linear infinite;
    pointer-events: none;
    z-index: 9999;
  }
  .cursor-blink {
    animation: blink 1s step-end infinite;
  }

  /* Light Theme Overrides - Deep Coverage */
  [data-theme='light'] body { background: #f0f2f5 !important; color: #2d3748 !important; }
  [data-theme='light'] .scanline { background: linear-gradient(90deg, transparent, rgba(0,100,255,0.05), transparent); }
  
  [data-theme='light'] .app-root { transition: background-color 0.5s ease, color 0.5s ease; }

  /* Target all Dashboard containers and Panels */
  [data-theme='light'] div[style*="background"], 
  [data-theme='light'] div[style*="background-color"] { 
    background-color: #ffffff !important; 
    border-color: #e2e8f0 !important;
    color: #2d3748 !important;
    transition: all 0.5s ease;
  }

  /* Specific Override for semi-transparent Dark Blue panels */
  [data-theme='light'] div[style*="rgba(5, 20, 45"],
  [data-theme='light'] div[style*="rgba(10, 22, 48"],
  [data-theme='light'] div[style*="rgba(5, 15, 40"] { 
    background: #ffffff !important; 
    border-color: #cbd5e0 !important; 
    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  }

  /* Text & Typography Polish */
  [data-theme='light'] h1, [data-theme='light'] h2, [data-theme='light'] h3, 
  [data-theme='light'] div[style*="color: #e0eaff"],
  [data-theme='light'] div[style*="color: #fff"] { color: #1a202c !important; }

  [data-theme='light'] div[style*="color: rgba(160,200,255,0.4)"],
  [data-theme='light'] span[style*="color: rgba(160,200,255,0.4)"] { color: #718096 !important; }

  /* Buttons and Inputs */
  [data-theme='light'] input, [data-theme='light'] textarea { 
    background: #f7fafc !important; 
    color: #1a202c !important; 
    border: 1px solid #cbd5e0 !important; 
  }
  
  [data-theme='light'] button[style*="background: rgba(255,255,255,0.05)"] { 
    background: #edf2f7 !important; 
    color: #2d3748 !important; 
  }

  /* Keep brand accents (Green/Blue/Orange) but adjust for readability */
  [data-theme='light'] .theme-toggle:hover { transform: scale(1.1); }

  /* Global Premium Button Aesthetics */
  button {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  button:not(:disabled):hover {
    transform: scale(1.05);
    filter: brightness(1.2);
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  }
  button:not(:disabled):active {
    transform: scale(0.95);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed !important;
  }
  @media (max-width: 768px) {
    .global-buttons-container {
      top: 12px !important;
      right: 12px !important;
      gap: 6px !important;
    }
    .global-switch-btn, .global-security-btn, .global-logout-btn {
      padding: 6px 10px !important;
      font-size: 9px !important;
    }
  }
`;

// Three.js-style Particle Field using Canvas API
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      size: Math.random() * 9 + 3, opacity: Math.random() * 0.35 + 0.05,
      type: Math.random() > 0.6 ? 'cross' : Math.random() > 0.5 ? 'circle' : 'dot',
      color: Math.random() > 0.55 ? '#00c8ff' : Math.random() > 0.5 ? '#ff3333' : '#00ff88'
    }));
    const drawCross = (x, y, size, color, opacity) => {
      ctx.save(); ctx.globalAlpha = opacity; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, size * 0.18);
      ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke(); ctx.restore();
    };
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = canvas.width + 20; if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20; if (p.y > canvas.height + 20) p.y = -20;
        if (p.type === 'cross') drawCross(p.x, p.y, p.size, p.color, p.opacity);
        else if (p.type === 'circle') { ctx.save(); ctx.globalAlpha = p.opacity; ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
        else { ctx.save(); ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      });
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
}

/* ─── Role Selector Screen ──────────────────────────────────────────────── */
function RoleSelector({ onSelect }) {
  const [typed, setTyped] = useState('');
  const full = 'RESCUELINK EMERGENCY CARE SYSTEM v2.0';



  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      setTyped(full.slice(0, ++i));
      if (i >= full.length) clearInterval(t);
    }, 40);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 30%, #0a1e3a 0%, #050d1a 70%)',
      fontFamily: "'Rajdhani', sans-serif", padding: '20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{styles}</style>
      <ParticleCanvas />
      <div className="scanline" />

      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06,
        backgroundImage: 'linear-gradient(rgba(0,200,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Top corner accents */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
        <div key={corner} style={{
          position: 'absolute',
          top: corner.includes('top') ? 20 : 'auto',
          bottom: corner.includes('bottom') ? 20 : 'auto',
          left: corner.includes('left') ? 20 : 'auto',
          right: corner.includes('right') ? 20 : 'auto',
          width: 40, height: 40,
          borderTop: corner.includes('top') ? '2px solid rgba(0,200,255,0.4)' : 'none',
          borderBottom: corner.includes('bottom') ? '2px solid rgba(0,200,255,0.4)' : 'none',
          borderLeft: corner.includes('left') ? '2px solid rgba(0,200,255,0.4)' : 'none',
          borderRight: corner.includes('right') ? '2px solid rgba(0,200,255,0.4)' : 'none',
        }} />
      ))}

      {/* Cross/plus emblem */}
      <div style={{ position: 'relative', marginBottom: 32 }}>
        <div style={{
          width: 80, height: 80,
          border: '2px solid rgba(255,60,60,0.6)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(255,60,60,0.3), inset 0 0 20px rgba(255,60,60,0.1)',
        }}>
          <div style={{ position: 'relative', width: 36, height: 36 }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 8, background: 'rgba(255,60,60,0.9)', transform: 'translateY(-50%)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 8, background: 'rgba(255,60,60,0.9)', transform: 'translateX(-50%)', borderRadius: 2 }} />
          </div>
        </div>
        <div style={{
          position: 'absolute', inset: -8,
          border: '1px solid rgba(0,200,255,0.2)',
          borderRadius: '50%',
          animation: 'holo-rotate 8s linear infinite',
          borderTop: '1px solid rgba(0,200,255,0.6)',
        }} />
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <h1 style={{
          fontFamily: "'Orbitron', monospace", fontSize: 'clamp(18px, 4vw, 28px)',
          fontWeight: 900, letterSpacing: '0.15em',
          color: '#00c8ff',
          textShadow: '0 0 20px rgba(0,200,255,0.6)',
        }}>
          {typed}<span className="cursor-blink" style={{ color: '#00c8ff' }}>█</span>
        </h1>
        <p style={{ color: 'rgba(160,200,255,0.5)', fontSize: 13, letterSpacing: '0.3em', marginTop: 8, fontFamily: "'Share Tech Mono'" }}>
          NATIONAL HEALTH MISSION — EMERGENCY CONNECTIVITY
        </p>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 48, padding: '8px 24px',
        border: '1px solid rgba(0,200,255,0.15)', borderRadius: 4,
        background: 'rgba(0,200,255,0.03)',
      }}>
        {[['SYSTEM', 'ONLINE', '#00ff88'], ['NETWORK', 'ACTIVE', '#00c8ff'], ['ALERT', 'STANDBY', '#ffb800']].map(([label, val, color]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', letterSpacing: '0.2em', fontFamily: "'Share Tech Mono'" }}>{label}</div>
            <div style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "'Share Tech Mono'", animation: 'pulse-glow 2s ease infinite' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Role cards */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          {
            role: 'user',
            emoji: '🧍',
            title: 'USER / PATIENT',
            subtitle: 'Emergency Requester',
            desc: 'AI triage, CPR guidance, ambulance marketplace, blood network, and family tracking.',
            color: '#00ff88',
            glow: 'rgba(0,255,136,0.25)',
          },
          {
            role: 'ambulance',
            emoji: '🚑',
            title: 'AMBULANCE UNIT',
            subtitle: 'Paramedic / Field Operator',
            desc: 'Live vitals streaming, green corridor requests, accident detection, and hospital comms.',
            color: '#ff6b35',
            glow: 'rgba(255,107,53,0.25)',
          },
          {
            role: 'hospital',
            emoji: '🏥',
            title: 'HOSPITAL COMMAND',
            subtitle: 'Emergency Physician / Doctor',
            desc: 'Bed management, ER queue, blood bank, insurance pre-approval, and insurance claims.',
            color: '#00c8ff',
            glow: 'rgba(0,200,255,0.25)',
          },
          {
            role: 'admin',
            emoji: '🏛️',
            title: 'WAR ROOM',
            subtitle: 'City Administrator / Government',
            desc: 'Predictive hotspot heatmap, mass casualty management, disaster mode, resource sharing.',
            color: '#cc00ff',
            glow: 'rgba(204,0,255,0.25)',
          },
          {
            role: 'family',
            emoji: '👨‍👩‍👧',
            title: 'FAMILY TRACKER',
            subtitle: 'Patient\'s Family / Guardian',
            desc: 'Read-only real-time tracking of your loved one. View ambulance location, vitals, and hospital status.',
            color: '#ffb800',
            glow: 'rgba(255,184,0,0.25)',
          },
        ].map(({ role, emoji, title, subtitle, desc, color, glow }) => (
          <div
            key={role}
            className="role-card"
            onClick={() => onSelect(role)}
            style={{
              width: 280, padding: '32px 28px',
              background: 'rgba(10,22,48,0.8)',
              border: `1px solid ${color}40`,
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Glow */}
            <div className="card-glow" style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(circle at 50% 50%, ${glow}, transparent 70%)`,
              opacity: 0, transition: 'opacity 0.3s ease',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 48, marginBottom: 16, textAlign: 'center' }}>{emoji}</div>
              <div style={{
                fontFamily: "'Orbitron'", fontSize: 14, fontWeight: 700,
                color, letterSpacing: '0.1em', textAlign: 'center', marginBottom: 4,
              }}>{title}</div>
              <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', textAlign: 'center', letterSpacing: '0.1em', marginBottom: 16 }}>
                {subtitle}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(160,200,255,0.7)', lineHeight: 1.6, textAlign: 'center' }}>
                {desc}
              </div>

              <button style={{
                width: '100%', marginTop: 24, padding: '12px',
                background: `linear-gradient(135deg, ${color}22, ${color}44)`,
                border: `1px solid ${color}66`,
                borderRadius: 6, color, fontFamily: "'Orbitron'",
                fontSize: 12, fontWeight: 700, letterSpacing: '0.15em',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                ENTER SYSTEM →
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 40, color: 'rgba(0,255,136,0.5)', fontSize: 13, letterSpacing: '0.2em', fontFamily: "'Orbitron'", fontWeight: 'bold', textShadow: '0 0 10px rgba(0,255,136,0.3)' }}>
        AI-POWERED EMERGENCY DISPATCH — ZERO DELAY, ZERO COMPROMISE
      </p>

    </div>
  );
}

/* ─── MFA Setup Screen Component ────────────────────────────────────────── */
function MfaSetupScreen({ setupToken, onComplete, onCancel }) {
  const [qrCode, setQrCode] = useState('');
  const [tempSecret, setTempSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initSetup = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${SERVER_URL}/api/mfa/setup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${setupToken}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to initialize MFA setup');
        }
        setQrCode(data.qrCode);
        setTempSecret(data.tempSecret);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    initSetup();
  }, [setupToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/mfa/enable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${setupToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, tempSecret })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to enable MFA');
      }
      setBackupCodes(data.backupCodes || []);
    } catch (err) {
      setError(err.message);
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
      <style>{styles}</style>
      <ParticleCanvas />
      <div className="scanline" />
      
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06,
        backgroundImage: 'linear-gradient(rgba(0,200,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        width: '100%', maxWidth: 450, padding: '40px 32px',
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
        }}>MFA SETUP</p>

        {error && (
          <div style={{
            padding: 12, background: 'rgba(255,50,50,0.1)',
            border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6,
            color: '#ff8888', marginBottom: 20, fontSize: 13,
            textAlign: 'center', fontFamily: "'Share Tech Mono'"
          }}>{error}</div>
        )}

        {backupCodes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ padding: 12, background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 6, color: '#ffb800', fontSize: 13, textAlign: 'center' }}>
              ⚠️ WARNING: Save these recovery codes somewhere safe! They won't be shown again.
            </div>
            
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16,
              background: '#050f28', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6
            }}>
              {backupCodes.map((c, index) => (
                <div key={index} style={{ fontFamily: "'Share Tech Mono'", fontSize: 14, color: '#fff', textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                  {c}
                </div>
              ))}
            </div>

            <button
              onClick={onComplete}
              style={{
                width: '100%', padding: '14px', background: 'linear-gradient(135deg, #00c8ff22, #00c8ff44)',
                border: '1px solid #00c8ff', borderRadius: 6,
                color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 13,
                fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer'
              }}
            >
              CONTINUE TO LOGIN
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
            <p style={{ color: 'rgba(160,200,255,0.8)', fontSize: 14, textAlign: 'center', lineHeight: 1.5 }}>
              Scan this with Google Authenticator, Authy, or Microsoft Authenticator, then enter the 6-digit code below.
            </p>

            {qrCode ? (
              <img src={qrCode} alt="MFA QR Code" style={{ border: '4px solid #fff', borderRadius: 8, width: 180, height: 180 }} />
            ) : (
              <div style={{ width: 180, height: 180, background: '#050f28', border: '1px dashed #00c8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff' }}>Loading QR Code...</div>
            )}

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono'" }}>6-DIGIT CODE</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                required
                maxLength={6}
                style={{
                  padding: '12px', background: 'rgba(5,15,40,0.6)',
                  border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                  color: '#fff', fontSize: 16, fontFamily: 'inherit', outline: 'none',
                  textAlign: 'center', letterSpacing: '4px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                type="submit"
                disabled={loading || !qrCode}
                style={{
                  flex: 1, padding: '14px', background: 'linear-gradient(135deg, #00ff8822, #00ff8844)',
                  border: '1px solid #00ff88', borderRadius: 6,
                  color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 13,
                  fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer'
                }}
              >
                {loading ? 'ENABLING...' : 'ENABLE MFA'}
              </button>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: 1, padding: '14px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                  color: 'rgba(160,200,255,0.7)', fontFamily: "'Orbitron'", fontSize: 13,
                  fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}



/* ─── Login Screen Component ──────────────────────────────────────────────── */
function LoginScreen({ onLoginSuccess, onMfaSetup, onMfaVerify }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (response.status === 403 && data.requiresMfaSetup) {
        if (onMfaSetup) {
          onMfaSetup(data.setupToken);
        }
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.requiresMFA) {
        if (onMfaVerify) {
          onMfaVerify(data.mfaToken);
        }
        setLoading(false);
        return;
      }

      sessionStorage.setItem('rescuelink_token', data.token);
      sessionStorage.setItem('rescuelink_user', JSON.stringify(data.user));
      
      // Map database role to frontend view role
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
      setError(err.message || 'Invalid credentials');
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
      <style>{styles}</style>
      <ParticleCanvas />
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
        }}>SECURE MEDICAL GATEWAY</p>

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
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono'" }}>EMAIL ADDRESS</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. doctor@rescuelink.com"
              required
              style={{
                padding: '12px', background: 'rgba(5,15,40,0.6)',
                border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', letterSpacing: '0.1em', fontFamily: "'Share Tech Mono'" }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                padding: '12px', background: 'rgba(5,15,40,0.6)',
                border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                color: '#fff', fontSize: 14, fontFamily: 'inherit', outline: 'none'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px', background: 'linear-gradient(135deg, #00c8ff22, #00c8ff44)',
              border: '1px solid #00c8ff', borderRadius: 6,
              color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 13,
              fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer',
              marginTop: 10
            }}
          >
            {loading ? 'AUTHENTICATING...' : 'ACCESS SYSTEM →'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setEmail('patient@rescuelink.com');
              setPassword('password123');
              setError('');
              setLoading(true);
              try {
                const response = await fetch(`${SERVER_URL}/api/auth/login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'patient@rescuelink.com', password: 'password123' })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Login failed');
                sessionStorage.setItem('rescuelink_token', data.token);
                sessionStorage.setItem('rescuelink_user', JSON.stringify(data.user));
                onLoginSuccess('user', data.token);
              } catch (err) {
                setError(err.message || 'Invalid credentials');
              } finally {
                setLoading(false);
              }
            }}
            style={{
              padding: '12px', background: 'linear-gradient(135deg, #00ff8811, #00ff8822)',
              border: '1px solid #00ff88', borderRadius: 6,
              color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 12,
              fontWeight: 700, letterSpacing: '0.15em', cursor: 'pointer',
              marginTop: 8
            }}
          >
            EMERGENCY PATIENT ACCESS 🧍
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Security Modal Component ───────────────────────────────────────────── */
function SecurityModal({ isOpen, onClose, token }) {
  const [mfaActive, setMfaActive] = useState(false);
  const [backupCodesCount, setBackupCodesCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  // Setup flow
  const [setupMode, setSetupMode] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [tempSecret, setTempSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState([]);

  // Disable flow
  const [disableMode, setDisableMode] = useState(false);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetchMfaStatus();
  }, [isOpen]);

  const fetchMfaStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch user data');
      
      const isMfa = !!data.totp_secret;
      setMfaActive(isMfa);
      if (isMfa) {
        const resCodes = await fetch(`${SERVER_URL}/api/mfa/backup-codes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const codesData = await resCodes.json();
        setBackupCodesCount(codesData.remainingCount || 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupInit = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${SERVER_URL}/api/mfa/setup`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed setup');
      setQrCode(data.qrCode);
      setTempSecret(data.tempSecret);
      setSetupMode(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/mfa/enable`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: verifyCode, tempSecret })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');
      
      setNewBackupCodes(data.backupCodes || []);
      setMfaActive(true);
      setSetupMode(false);
      setMessage('Two-factor authentication enabled successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/api/mfa/disable`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password, code: totpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deactivation failed');
      
      setMfaActive(false);
      setDisableMode(false);
      setPassword('');
      setTotpCode('');
      setMessage('Two-factor authentication disabled.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setSetupMode(false);
    setDisableMode(false);
    setQrCode('');
    setTempSecret('');
    setVerifyCode('');
    setNewBackupCodes([]);
    setPassword('');
    setTotpCode('');
    setError('');
    setMessage('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 12000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,13,26,0.85)', backdropFilter: 'blur(8px)',
      fontFamily: "'Rajdhani', sans-serif"
    }}>
      <div style={{
        width: '100%', maxWidth: 500, padding: 32,
        background: 'rgba(10,22,48,0.95)',
        border: '1px solid rgba(0,200,255,0.4)',
        borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        position: 'relative'
      }}>
        <button
          onClick={resetState}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', color: 'rgba(160,200,255,0.6)',
            fontSize: 20, cursor: 'pointer', transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff3333'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(160,200,255,0.6)'}
        >
          ✕
        </button>

        <h3 style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 20,
          color: '#00c8ff', marginBottom: 6, letterSpacing: '0.1em'
        }}>SECURITY CENTER</h3>
        <p style={{
          color: 'rgba(160,200,255,0.5)', fontSize: 11,
          letterSpacing: '0.15em', marginBottom: 20, fontFamily: "'Share Tech Mono'"
        }}>IDENTITY AND ACCESS AUDITING</p>

        {error && (
          <div style={{
            padding: 12, background: 'rgba(255,50,50,0.1)',
            border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6,
            color: '#ff8888', marginBottom: 16, fontSize: 13,
            textAlign: 'center', fontFamily: "'Share Tech Mono'"
          }}>{error}</div>
        )}

        {message && (
          <div style={{
            padding: 12, background: 'rgba(0,255,136,0.1)',
            border: '1px solid rgba(0,255,136,0.4)', borderRadius: 6,
            color: '#00ff88', marginBottom: 16, fontSize: 13,
            textAlign: 'center', fontFamily: "'Share Tech Mono'"
          }}>{message}</div>
        )}

        {setupMode && (
          <form onSubmit={handleVerifyAndEnable} style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <p style={{ color: 'rgba(160,200,255,0.8)', fontSize: 13, textAlign: 'center' }}>
              Scan the QR code below with your authenticator app (Google Authenticator, Duo, etc.) to set up 2FA:
            </p>
            {qrCode ? (
              <img src={qrCode} alt="MFA QR Code" style={{ border: '4px solid #fff', borderRadius: 8, width: 180, height: 180 }} />
            ) : (
              <div style={{ width: 180, height: 180, background: '#050f28', border: '1px dashed #00c8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8ff' }}>Loading...</div>
            )}
            
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>VERIFICATION CODE</label>
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="6-digit authenticator code"
                required
                style={{
                  width: '100%', padding: 12, background: 'rgba(5,15,40,0.6)',
                  border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                  color: '#fff', fontSize: 14, outline: 'none', textAlign: 'center', letterSpacing: '2px', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1, padding: 12, background: 'linear-gradient(135deg, #00ff8822, #00ff8844)',
                  border: '1px solid #00ff88', borderRadius: 6, color: '#00ff88',
                  fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                VERIFY & ENABLE
              </button>
              <button
                type="button"
                onClick={() => setSetupMode(false)}
                style={{
                  flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(160,200,255,0.7)',
                  fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </form>
        )}

        {disableMode && (
          <form onSubmit={handleDisableMfa} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'rgba(160,200,255,0.8)', fontSize: 13 }}>
              Enter your password and current verification code to disable Two-Factor Authentication:
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                style={{
                  padding: 12, background: 'rgba(5,15,40,0.6)',
                  border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                  color: '#fff', fontSize: 14, outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>2FA VERIFICATION CODE</label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code"
                required
                style={{
                  padding: 12, background: 'rgba(5,15,40,0.6)',
                  border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6,
                  color: '#fff', fontSize: 14, outline: 'none', textAlign: 'center', letterSpacing: '2px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1, padding: 12, background: 'linear-gradient(135deg, #ff333322, #ff333344)',
                  border: '1px solid #ff3333', borderRadius: 6, color: '#ff8888',
                  fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                DISABLE MFA
              </button>
              <button
                type="button"
                onClick={() => setDisableMode(false)}
                style={{
                  flex: 1, padding: 12, background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(160,200,255,0.7)',
                  fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                CANCEL
              </button>
            </div>
          </form>
        )}

        {newBackupCodes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 12, background: 'rgba(255,184,0,0.1)', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 6, color: '#ffb800', fontSize: 12 }}>
              ⚠️ WARNING: Save these recovery codes now! You can use these codes to log in if you lose access to your authenticator app. They will not be shown again.
            </div>
            
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 16,
              background: '#050f28', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 6
            }}>
              {newBackupCodes.map((c, index) => (
                <div key={index} style={{ fontFamily: "'Share Tech Mono'", fontSize: 14, color: '#fff', textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                  {c}
                </div>
              ))}
            </div>

            <button
              onClick={() => setNewBackupCodes([])}
              style={{
                padding: 12, background: 'linear-gradient(135deg, #00c8ff22, #00c8ff44)',
                border: '1px solid #00c8ff', borderRadius: 6, color: '#00c8ff',
                fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              I HAVE SAVED THEM
            </button>
          </div>
        )}

        {!setupMode && !disableMode && newBackupCodes.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: 16,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(160,200,255,0.1)',
              borderRadius: 8
            }}>
              <div style={{ fontSize: 32 }}>{mfaActive ? '🛡️' : '🔓'}</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: mfaActive ? '#00ff88' : '#ffb800' }}>
                  {mfaActive ? 'TWO-FACTOR ACTIVE' : 'TWO-FACTOR DISABLED'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)' }}>
                  {mfaActive 
                    ? `Protected by Authenticator. Remaining backup codes: ${backupCodesCount}` 
                    : 'Access is vulnerable. Enable authenticator app security.'}
                </div>
              </div>
            </div>

            {mfaActive ? (
              <button
                onClick={() => setDisableMode(true)}
                style={{
                  padding: 14, background: 'rgba(255,50,50,0.1)',
                  border: '1px solid #ff3333', borderRadius: 6, color: '#ff8888',
                  fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
                }}
              >
                DISABLE TWO-FACTOR ACCESS
              </button>
            ) : (
              <button
                onClick={handleSetupInit}
                disabled={loading}
                style={{
                  padding: 14, background: 'linear-gradient(135deg, #00c8ff22, #00c8ff44)',
                  border: '1px solid #00c8ff', borderRadius: 6, color: '#00c8ff',
                  fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
                }}
              >
                ENABLE MFA PROTECTION →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main App ──────────────────────────────────────────────────────────── */
export default function App() {
  const [token, setToken] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      sessionStorage.setItem('rescuelink_token', urlToken);
      return urlToken;
    }
    return sessionStorage.getItem('rescuelink_token') || null;
  });

  const [role, setRole] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRole = urlParams.get('role');
    if (urlRole) {
      sessionStorage.setItem('rescueLinkRole', urlRole);
      return urlRole;
    }
    return sessionStorage.getItem('rescueLinkRole') || null;
  });

  const [familyReqId] = useState(() => new URLSearchParams(window.location.search).get('reqId'));
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [globalAlertData, setGlobalAlertData] = useState(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // MFA Setup and Verification States
  const [mfaSetupToken, setMfaSetupToken] = useState(null);
  const [mfaVerifyToken, setMfaVerifyToken] = useState(null);

  useEffect(() => {
    const handleCustomAlert = (e) => {
      setGlobalAlertData(e.detail);
    };
    window.addEventListener('show-custom-alert', handleCustomAlert);
    return () => window.removeEventListener('show-custom-alert', handleCustomAlert);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!role || !token) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);
    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    return () => newSocket.disconnect();
  }, [role, token]);

  const handleLoginSuccess = (viewRole, userToken) => {
    setToken(userToken);
    setRole(viewRole);
    sessionStorage.setItem('rescueLinkRole', viewRole);
    setMfaVerifyToken(null);
  };

  const handleLogout = async () => {
    const tokenVal = sessionStorage.getItem('rescuelink_token');
    try {
      await fetch(`${SERVER_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenVal}` }
      });
    } catch (err) {
      console.error('Logout failed:', err);
    }
    sessionStorage.removeItem('rescuelink_token');
    sessionStorage.removeItem('rescuelink_user');
    sessionStorage.removeItem('rescueLinkRole');
    setRole(null);
    setToken(null);
  };

  if (mfaSetupToken) {
    return (
      <MfaSetupScreen
        setupToken={mfaSetupToken}
        onComplete={() => setMfaSetupToken(null)}
        onCancel={() => setMfaSetupToken(null)}
      />
    );
  }

  if (mfaVerifyToken) {
    return (
      <MfaVerifyScreen
        mfaToken={mfaVerifyToken}
        onLoginSuccess={handleLoginSuccess}
        onCancel={() => setMfaVerifyToken(null)}
        ParticleCanvas={ParticleCanvas}
      />
    );
  }

  if (!token) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        onMfaSetup={(setupToken) => setMfaSetupToken(setupToken)}
        onMfaVerify={(mfaToken) => setMfaVerifyToken(mfaToken)}
      />
    );
  }

  if (!role) {
    return <RoleSelector onSelect={(selRole) => {
      sessionStorage.setItem('rescueLinkRole', selRole);
      setRole(selRole);
    }} />;
  }

  return (
    <div className="app-root">
      <style>{styles}</style>
      <div className="scanline" />

      {/* Global Actions Bar (Top Right) */}
      <div className="global-buttons-container" style={{ position: 'fixed', top: 14, right: 25, zIndex: 11000, display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* Switch role settings button */}
        <button
          className="global-switch-btn"
          onClick={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
          }}
          style={{
            padding: '8px 16px', background: 'rgba(0,255,136,0.1)',
            border: '1px solid #00ff88', borderRadius: 6,
            color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
          }}
        >
          SWITCH ROLE 🔄
        </button>

        {/* Security settings button */}
        <button
          className="global-security-btn"
          onClick={() => setShowSecurityModal(true)}
          style={{
            padding: '8px 16px', background: 'rgba(0,200,255,0.1)',
            border: '1px solid #00c8ff', borderRadius: 6,
            color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
          }}
        >
          SECURITY 🛡️
        </button>

        {/* Logout button */}
        <button
          className="global-logout-btn"
          onClick={handleLogout}
          style={{
            padding: '8px 16px', background: 'rgba(255,50,50,0.1)',
            border: '1px solid #ff3333', borderRadius: 6,
            color: '#ff8888', fontFamily: "'Orbitron'", fontSize: 11,
            fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer'
          }}
        >
          LOGOUT ⏻
        </button>
      </div>

      {/* Premium Theme Switcher - Bottom Left */}
      <div
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        style={{
          position: 'fixed', bottom: 25, left: 25, zIndex: 11000,
          width: 70, height: 34, borderRadius: 20,
          background: theme === 'dark' ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.9)',
          border: `1px solid ${theme === 'dark' ? '#00c8ff' : '#cbd5e0'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          padding: '0 4px', transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxShadow: theme === 'dark' ? '0 10px 20px rgba(0,0,0,0.5)' : '0 5px 15px rgba(0,0,0,0.1)'
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: theme === 'dark' ? '#00c8ff' : '#ffffff',
          boxShadow: theme === 'dark' ? '0 0 10px #00c8ff' : '0 2px 5px rgba(0,0,0,0.2)',
          transform: `translateX(${theme === 'dark' ? '36px' : '0px'})`,
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
        }}>
          {theme === 'dark' ? '🌙' : '☀️'}
        </div>
        <span style={{
          position: 'absolute',
          left: theme === 'dark' ? 10 : 'auto',
          right: theme === 'dark' ? 'auto' : 10,
          fontSize: 10, fontFamily: "'Orbitron'", fontWeight: 700,
          color: theme === 'dark' ? '#00c8ff' : '#718096',
          transition: 'all 0.4s ease', opacity: 0.8
        }}>
          {theme === 'dark' ? 'DARK' : 'LIGHT'}
        </span>
      </div>

      {role === 'user' && <UserDashboard socket={socket} connected={connected} />}
      {role === 'ambulance' && <AmbulanceStreamer socket={socket} connected={connected} />}
      {role === 'hospital' && <HospitalDashboard socket={socket} connected={connected} />}
      {role === 'admin' && <WarRoom socket={socket} connected={connected} />}
      {role === 'family' && <FamilyDashboard socket={socket} connected={connected} reqId={familyReqId} />}

      {globalAlertData && (
        <CustomAlert
          title={globalAlertData.title}
          message={globalAlertData.message}
          onClose={() => setGlobalAlertData(null)}
        />
      )}

      <SecurityModal isOpen={showSecurityModal} onClose={() => setShowSecurityModal(false)} token={token} />
    </div>
  );
}
