import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AmbulanceStreamer from './components/AmbulanceStreamer';
import HospitalDashboard from './components/HospitalDashboard';
import UserDashboard from './components/UserDashboard';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

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
  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  .role-card {
    animation: fadeSlideUp 0.6s ease forwards;
    opacity: 0;
  }
  .role-card:nth-child(1) { animation-delay: 0.2s; }
  .role-card:nth-child(2) { animation-delay: 0.4s; }

  .role-card:hover .card-glow {
    opacity: 1 !important;
  }
  .role-card:hover {
    transform: translateY(-6px) scale(1.02);
    border-color: rgba(0,200,255,0.6) !important;
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
`;

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
      <div className="scanline" />

      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06,
        backgroundImage: 'linear-gradient(rgba(0,200,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Top corner accents */}
      {['top-left','top-right','bottom-left','bottom-right'].map((corner) => (
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
            <div style={{ position:'absolute', top:'50%', left:0, right:0, height:8, background:'rgba(255,60,60,0.9)', transform:'translateY(-50%)', borderRadius:2 }} />
            <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:8, background:'rgba(255,60,60,0.9)', transform:'translateX(-50%)', borderRadius:2 }} />
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
            desc: 'Find nearby ambulances, request emergency dispatch, and route to ready hospitals.',
            color: '#00ff88',
            glow: 'rgba(0,255,136,0.25)',
          },
          {
            role: 'ambulance',
            emoji: '🚑',
            title: 'AMBULANCE UNIT',
            subtitle: 'Paramedic / Field Operator',
            desc: 'Stream live patient vitals, GPS location, and communicate with hospital in real-time.',
            color: '#ff6b35',
            glow: 'rgba(255,107,53,0.25)',
          },
          {
            role: 'hospital',
            emoji: '🏥',
            title: 'HOSPITAL COMMAND',
            subtitle: 'Emergency Physician / Doctor',
            desc: 'Monitor incoming patients, view live vitals, track ambulance, and prepare resources.',
            color: '#00c8ff',
            glow: 'rgba(0,200,255,0.25)',
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

      <p style={{ marginTop: 40, color: 'rgba(160,200,255,0.25)', fontSize: 11, letterSpacing: '0.2em', fontFamily: "'Share Tech Mono'" }}>
        OPEN IN THREE WINDOWS FOR LIVE DEMO · USER + AMBULANCE + HOSPITAL
      </p>
    </div>
  );
}

/* ─── Main App ──────────────────────────────────────────────────────────── */
export default function App() {
  const [role, setRole] = useState(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!role) return;

    const socket = io(SERVER_URL, {
      query: { role },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => socket.disconnect();
  }, [role]);

  if (!role) return <RoleSelector onSelect={setRole} />;

  return (
    <>
      <style>{styles}</style>
      <div className="scanline" />
      {role === 'user' && <UserDashboard socket={socketRef.current} connected={connected} />}
      {role === 'ambulance' && <AmbulanceStreamer socket={socketRef.current} connected={connected} />}
      {role === 'hospital' && <HospitalDashboard socket={socketRef.current} connected={connected} />}
    </>
  );
}
