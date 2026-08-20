import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AmbulanceStreamer from './components/AmbulanceStreamer';
import HospitalDashboard from './components/HospitalDashboard';
import UserDashboard from './components/UserDashboard';
import WarRoom from './components/WarRoom';
import FamilyDashboard from './components/FamilyDashboard';
import CustomAlert from './components/CustomAlert';
import axios from 'axios';
import PatientPortal from './components/PatientPortal';
import { MfaVerifyScreen } from './components/MfaVerifyScreen';

const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');

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

  /* Premium Dark Theme (Default) */
  body {
    background: radial-gradient(ellipse at 50% 30%, #020813 0%, #000205 100%) !important;
    color: #e0eaff !important;
  }

  /* Light Theme Overrides - MSME Blue & White Official Portal Style */
  [data-theme='light'] body { 
    background: #eef2f6 !important; 
    color: #212529 !important; 
  }
  [data-theme='light'] .scanline { 
    background: linear-gradient(90deg, transparent, rgba(15, 76, 129, 0.02), transparent); 
  }
  [data-theme='light'] .app-root { 
    background: #eef2f6 !important; 
  }

  /* Target all radial-gradient layouts and outer container backgrounds to clear them in light mode */
  [data-theme='light'] div[style*="radial-gradient" i] {
    background: #eef2f6 !important;
  }
  [data-theme='light'] div[style*="height: 100vh" i],
  [data-theme='light'] div[style*="height: '100vh'" i],
  [data-theme='light'] div[style*="min-height: 100vh" i] {
    background: #eef2f6 !important;
  }

  /* Clean MSME Header Bar styling in Light Mode */
  [data-theme='light'] div[style*="min-height: 70" i], 
  [data-theme='light'] div[style*="min-height: 60" i],
  [data-theme='light'] div[style*="min-height: 64" i],
  [data-theme='light'] div[style*="rgba(5, 20, 10" i],
  [data-theme='light'] div[style*="rgba(5,20,10" i] {
    background: #1b4f72 !important; /* MSME Top Bar color */
    border-bottom: 2px solid #154360 !important;
    color: #ffffff !important;
  }
  [data-theme='light'] div[style*="min-height: 70" i] *, 
  [data-theme='light'] div[style*="min-height: 60" i] *,
  [data-theme='light'] div[style*="rgba(5, 20, 10" i] *,
  [data-theme='light'] div[style*="rgba(5,20,10" i] * {
    color: #ffffff !important;
  }

  /* Pattern match and convert ALL inline dark containers/cards to clean MSME White Cards */
  [data-theme='light'] div[style*="rgba(5, 15, 40" i],
  [data-theme='light'] div[style*="rgba(5,15,40" i],
  [data-theme='light'] div[style*="rgba(5, 20, 45" i],
  [data-theme='light'] div[style*="rgba(5,20,45" i],
  [data-theme='light'] div[style*="rgba(10, 22, 48" i],
  [data-theme='light'] div[style*="rgba(10,22,48" i],
  [data-theme='light'] div[style*="rgba(5, 20, 10" i],
  [data-theme='light'] div[style*="rgba(5,20,10" i],
  [data-theme='light'] div[style*="rgba(3, 10, 28" i],
  [data-theme='light'] div[style*="rgba(3,10,28" i],
  [data-theme='light'] div[style*="rgba(3, 8, 22" i],
  [data-theme='light'] div[style*="rgba(3,8,22" i],
  [data-theme='light'] div[style*="rgba(0, 0, 0, 0." i],
  [data-theme='light'] div[style*="background: 'rgba(5,20,45,0.6)'" i],
  [data-theme='light'] div[style*="rgba(255, 255, 255, 0.03)" i],
  [data-theme='light'] div[style*="rgba(255,255,255,0.03)" i],
  [data-theme='light'] div[style*="rgba(255, 255, 255, 0.05)" i],
  [data-theme='light'] div[style*="rgba(255,255,255,0.05)" i],
  [data-theme='light'] div[style*="rgba(5, 10, 30" i],
  [data-theme='light'] div[style*="rgba(5,10,30" i],
  [data-theme='light'] div[style*="rgba(7, 22, 44" i],
  [data-theme='light'] div[style*="rgba(7,22,44" i],
  [data-theme='light'] div[style*="rgba(0, 5, 15" i],
  [data-theme='light'] div[style*="rgba(0,5,15" i],
  [data-theme='light'] div[style*="#050a1e" i],
  [data-theme='light'] div[style*="#020611" i],
  [data-theme='light'] div[style*="#010512" i],
  [data-theme='light'] div[style*="#0a1526" i] {
    background: #ffffff !important;
    border: 1px solid #cbd5e0 !important;
    color: #212529 !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04) !important;
    border-radius: 8px !important;
  }

  /* Structured Light Theme Classes (MSME White Card Style) */
  [data-theme='light'] .rl-card {
    background: #ffffff !important;
    border: 1px solid #cbd5e0 !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05) !important;
    color: #212529 !important;
    border-radius: 8px !important;
  }
  [data-theme='light'] .rl-input {
    background: #ffffff !important;
    border: 1px solid #a0aec0 !important;
    color: #212529 !important;
  }
  [data-theme='light'] .rl-btn-primary {
    background: linear-gradient(135deg, #1b4f72 0%, #154360 100%) !important;
    color: #ffffff !important;
    box-shadow: 0 4px 12px rgba(27, 79, 114, 0.2) !important;
    border: none !important;
  }
  [data-theme='light'] .rl-btn-secondary {
    background: #ffffff !important;
    color: #1b4f72 !important;
    border: 1px solid rgba(27, 79, 114, 0.5) !important;
  }
  [data-theme='light'] .rl-btn-secondary:hover {
    background: rgba(27, 79, 114, 0.08) !important;
  }

  /* Auto-convert generic inputs, textareas, and select menus in Light Mode */
  [data-theme='light'] input,
  [data-theme='light'] textarea,
  [data-theme='light'] select {
    background: #ffffff !important;
    border: 1px solid #cbd5e0 !important;
    color: #212529 !important;
  }

  /* Auto-convert inline styled action buttons in Light Mode to readable colors */
  [data-theme='light'] button {
    background: #ffffff !important;
    color: #1b4f72 !important;
    border: 1px solid #cbd5e0 !important;
  }
  [data-theme='light'] button[style*="rgba(0, 200, 255" i],
  [data-theme='light'] button[style*="rgba(0,200,255" i],
  [data-theme='light'] button[style*="rgba(0, 255, 136" i],
  [data-theme='light'] button[style*="rgba(0,255,136" i],
  [data-theme='light'] button[style*="rgba(255, 255, 255" i],
  [data-theme='light'] button[style*="rgba(255,255,255" i],
  [data-theme='light'] button[style*="#00c8ff" i],
  [data-theme='light'] button[style*="#00ff88" i],
  [data-theme='light'] button[style*="#0072ff" i] {
    background: linear-gradient(135deg, #1b4f72 0%, #154360 100%) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 10px rgba(27, 79, 114, 0.2) !important;
  }
  [data-theme='light'] button[style*="rgba(255, 68, 68" i],
  [data-theme='light'] button[style*="rgba(255,68,68" i],
  [data-theme='light'] button[style*="rgba(255, 60, 60" i],
  [data-theme='light'] button[style*="rgba(255,60,60" i],
  [data-theme='light'] button[style*="#ff4444" i],
  [data-theme='light'] button[style*="red" i] {
    background: #dc2626 !important;
    color: #ffffff !important;
    border: none !important;
  }

  /* Universal Text Color Overrides for MSME Light Mode */
  [data-theme='light'] h1, [data-theme='light'] h2, [data-theme='light'] h3, [data-theme='light'] h4, [data-theme='light'] h5, [data-theme='light'] h6 {
    color: #1b4f72 !important;
  }
  [data-theme='light'] label {
    color: #2c3e50 !important;
  }
  [data-theme='light'] div, [data-theme='light'] span, [data-theme='light'] p {
    color: inherit;
  }
  [data-theme='light'] [style*="orbitron" i] {
    color: #1b4f72 !important;
  }

  /* High contrast redirects for light-mode text readability */
  [data-theme='light'] [style*="color: #fff" i], 
  [data-theme='light'] [style*="color: rgb(255, 255, 255)" i],
  [data-theme='light'] [style*="color:#fff" i] {
    color: #212529 !important;
  }
  [data-theme='light'] [style*="color: #e0eaff" i],
  [data-theme='light'] [style*="color:#e0eaff" i] {
    color: #2c3e50 !important;
  }
  [data-theme='light'] [style*="rgba(160, 200, 255" i],
  [data-theme='light'] [style*="rgba(160,200,255" i],
  [data-theme='light'] [style*="rgb(160, 200, 255)" i] {
    color: #5d6d7e !important;
  }
  [data-theme='light'] [style*="color: rgb(0, 200, 255)" i],
  [data-theme='light'] [style*="color: #00c8ff" i],
  [data-theme='light'] [style*="color:#00c8ff" i],
  [data-theme='light'] [style*="color: #0072ff" i] {
    color: #0c4a6e !important; /* Deep Sky Blue/Teal */
  }
  [data-theme='light'] [style*="color: rgb(0, 255, 136)" i],
  [data-theme='light'] [style*="color: #00ff88" i],
  [data-theme='light'] [style*="color:#00ff88" i],
  [data-theme='light'] [style*="color: #88ff88" i] {
    color: #166534 !important; /* Deep Green */
  }
  [data-theme='light'] [style*="color: #ffb800" i] {
    color: #a16207 !important; /* Dark Amber */
  }
  [data-theme='light'] [style*="color: #ff4444" i],
  [data-theme='light'] [style*="color: #ff3333" i] {
    color: #991b1b !important; /* Dark Red */
  }

  [data-theme='light'] [style*="background: rgba(0,0,0,0.3)" i] {
    background: #f2f4f4 !important;
    border: 1px solid #cbd5e0 !important;
  }

  /* Pattern match and standardize ALL dark containers in Dark Mode */
  [data-theme='dark'] div[style*="rgba(5, 15, 40" i],
  [data-theme='dark'] div[style*="rgba(5, 20, 45" i],
  [data-theme='dark'] div[style*="rgba(10, 22, 48" i],
  [data-theme='dark'] div[style*="rgba(5, 20, 10" i],
  [data-theme='dark'] div[style*="rgba(3, 10, 28" i],
  [data-theme='dark'] div[style*="rgba(3, 8, 22" i] {
    background: rgba(4, 12, 28, 0.85) !important;
    border: 1px solid rgba(0, 200, 255, 0.25) !important;
    color: #e0eaff !important;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5) !important;
  }

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

  /* Premium Design System Components */
  .rl-card {
    background: rgba(4, 12, 28, 0.85) !important;
    border: 1px solid rgba(0, 200, 255, 0.2) !important;
    border-radius: 14px !important;
    box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6) !important;
    backdrop-filter: blur(12px) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }
  .rl-card:hover {
    border-color: rgba(0, 200, 255, 0.5) !important;
    box-shadow: 0 15px 40px rgba(0, 200, 255, 0.15) !important;
    transform: translateY(-4px) !important;
  }
  .rl-btn-primary {
    background: linear-gradient(135deg, #00c8ff 0%, #0072ff 100%) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 8px !important;
    font-family: 'Orbitron', sans-serif !important;
    font-weight: 700 !important;
    letter-spacing: 0.05em !important;
    padding: 12px 24px !important;
    cursor: pointer !important;
    box-shadow: 0 4px 15px rgba(0, 200, 255, 0.2) !important;
  }
  .rl-btn-primary:hover {
    box-shadow: 0 6px 20px rgba(0, 200, 255, 0.4) !important;
    transform: translateY(-2px) !important;
  }
  .rl-btn-secondary {
    background: rgba(0, 200, 255, 0.05) !important;
    color: #00c8ff !important;
    border: 1px solid rgba(0, 200, 255, 0.3) !important;
    border-radius: 8px !important;
    font-family: 'Orbitron', sans-serif !important;
    font-weight: 600 !important;
    padding: 12px 24px !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
  }
  .rl-btn-secondary:hover {
    background: rgba(0, 200, 255, 0.15) !important;
    border-color: #00c8ff !important;
  }
  .rl-input {
    background: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(0, 200, 255, 0.2) !important;
    border-radius: 8px !important;
    color: #ffffff !important;
    padding: 12px 16px !important;
    font-size: 14px !important;
    outline: none !important;
    transition: all 0.2s ease !important;
  }
   .rl-input:focus {
    border-color: #00c8ff !important;
    box-shadow: 0 0 12px rgba(0, 200, 255, 0.25) !important;
    background: rgba(0, 0, 0, 0.5) !important;
  }

  /* Hamburger dropdown stylesheet */
  .mobile-nav-trigger {
    display: none !important;
  }
  .mobile-nav-dropdown {
    display: none !important;
  }

  @media (max-width: 768px) {
    .desktop-nav-group {
      display: none !important;
    }
    .mobile-nav-trigger {
      display: flex !important;
      align-items: center;
      justify-content: center;
      background: rgba(0, 200, 255, 0.1) !important;
      border: 1px solid rgba(0, 200, 255, 0.3) !important;
      color: #00c8ff !important;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      font-family: 'Orbitron', sans-serif;
    }
    .mobile-nav-dropdown {
      position: absolute;
      top: 100%;
      right: 20px;
      background: rgba(10, 20, 45, 0.95);
      border: 1px solid rgba(0, 200, 255, 0.3);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 10000;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
      backdrop-filter: blur(10px);
    }
    .mobile-nav-dropdown button {
      width: 100%;
      justify-content: flex-start;
      padding: 10px 16px !important;
    }
  }

  /* Global action bar: compact icon-only on mobile */
  @media (max-width: 768px) {
    .global-buttons-container {
      top: 8px !important;
      right: 10px !important;
      gap: 6px !important;
    }
    .global-buttons-container .rl-btn-secondary,
    .global-buttons-container .rl-btn-primary {
      padding: 6px 10px !important;
      font-size: 14px !important;
      min-width: 0 !important;
    }
    /* Hide text labels, show only emoji icons */
    .global-btn-label { display: none !important; }
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

/* ─── Login & Registration Screen Component with 2FA ───────────────────── */
function LoginScreen({ defaultRole, onLoginSuccess, onMfaSetup, onMfaVerify, onClose, defaultIsRegister }) {
  const [isRegister, setIsRegister] = useState(defaultIsRegister || false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password flow states
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState('email');
  const [recoveryContact, setRecoveryContact] = useState('');
  const [sentOtp, setSentOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  // Paramedic signup fields
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [type, setType] = useState('BLS');

  // Hospital signup fields
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalContact, setHospitalContact] = useState('');
  const [lat, setLat] = useState('12.9716');
  const [lng, setLng] = useState('77.5946');
  const [totalBeds, setTotalBeds] = useState('50');
  const [icuBeds, setIcuBeds] = useState('10');
  const [ventilators, setVentilators] = useState('5');

  // Advanced Hospital Fields
  const [licenseNumber, setLicenseNumber] = useState('');
  const [departments, setDepartments] = useState([]);
  const [bayCapacity, setBayCapacity] = useState('5');
  const [adminEmail, setAdminEmail] = useState('');

  // Advanced Ambulance Fields
  const [hospitalId, setHospitalId] = useState('');
  const [equipmentChecklist, setEquipmentChecklist] = useState([]);
  const [crewMembers, setCrewMembers] = useState('');

  // Missing & New Patient Fields
  const [abhaAddress, setAbhaAddress] = useState('');
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

  // New Ambulance Fields
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [isSystemStandard, setIsSystemStandard] = useState(true);
  const [oxygenCapacityLiters, setOxygenCapacityLiters] = useState('0');

  // New Hospital Fields
  const [traumaTier, setTraumaTier] = useState('Tier 3');
  const [accreditationId, setAccreditationId] = useState('');

  // List of active hospitals for dropdown selection
  const [hospitalsList, setHospitalsList] = useState([]);

  useEffect(() => {
    if (isRegister) {
      fetch(`${SERVER_URL}/api/hospitals`)
        .then(res => res.json())
        .then(data => setHospitalsList(data))
        .catch(err => console.error('Failed to fetch hospitals list', err));
    }
  }, [isRegister]);

  // Registration 2FA Setup state
  const [regQrCode, setRegQrCode] = useState('');
  const [regTempSecret, setRegTempSecret] = useState('');
  const [regVerifyCode, setRegVerifyCode] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: recoveryMethod, contact: recoveryContact })
      });
      const data = await res.json();
      if (res.ok) {
        setSentOtp(true);
        setMessage(`${data.message} (DEMO Verification Code: ${data.mockOtp})`);
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      setError('Connection to auth server failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/reset-password-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: recoveryMethod, contact: recoveryContact, otp: otpCode, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Password updated successfully! Redirecting to login...');
        setTimeout(() => {
          setIsForgotPassword(false);
          setSentOtp(false);
          setRecoveryContact('');
          setOtpCode('');
          setNewPassword('');
          setError('');
          setMessage('');
        }, 2000);
      } else {
        setError(data.error || 'Password reset failed');
      }
    } catch (err) {
      setError('Connection to auth server failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const payload = email.includes('@')
        ? { email, password }
        : { id: email, password };
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

      // Role mismatch guard: prevent ambulance drivers from logging into hospital portal and vice versa
      if (defaultRole === 'hospital' && viewRole === 'ambulance') {
        setError('❌ Access Denied: This is a Hospital portal. Use the Ambulance Gateway to sign in as a paramedic.');
        setLoading(false);
        return;
      }
      if (defaultRole === 'ambulance' && viewRole === 'hospital') {
        setError('❌ Access Denied: This is the Ambulance portal. Use the Hospital Gateway to sign in as a medical coordinator.');
        setLoading(false);
        return;
      }

      onLoginSuccess(viewRole, data.token);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      let endpoint = '';
      let payload = {};

      if (defaultRole === 'ambulance') {
        endpoint = '/api/auth/register-ambulance';
        payload = { vehicleNo, driverName, contactInfo, type, password, hospitalId, equipmentChecklist, crewMembers, licenseNumber, licenseExpiry, isSystemStandard, oxygenCapacityLiters };
      } else if (defaultRole === 'user') {
        // Patient registration
        endpoint = '/api/auth/register-patient';
        payload = { name: driverName, email, password, mobile: contactInfo, abhaNumber: vehicleNo, abhaAddress, bloodGroup, allergies, chronicConditions, dob, gender, emergencyContactName, emergencyContactRelationship, emergencyContactPhone, insuranceProvider, policyNumber, groupNumber, consentToShareData };
      } else {
        endpoint = '/api/auth/register-hospital';
        payload = { name: hospitalName, contactInfo: hospitalContact, lat, lng, totalBeds, icuBeds, ventilators, password, licenseNumber, departments, bayCapacity, adminEmail, traumaTier, accreditationId };
      }

      const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      setRegQrCode(data.qrCode);
      setRegTempSecret(data.tempSecret);
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegMfaVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      // Step 2: verify and enable 2FA using registration secret
      let payload = {};
      if (defaultRole === 'ambulance') {
        payload = { id: vehicleNo, password };
      } else if (defaultRole === 'user') {
        payload = { email, password };
      } else {
        payload = { email: `${hospitalName.replace(/\s+/g, '').toLowerCase()}@rescuelink.com`, password };
      }
      const dummyTokenResponse = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const loginData = await dummyTokenResponse.json();
      const setupToken = loginData.setupToken;
      if (!setupToken) throw new Error('Failed to retrieve setup token');

      const resEnable = await fetch(`${SERVER_URL}/api/mfa/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${setupToken}`
        },
        body: JSON.stringify({ code: regVerifyCode, tempSecret: regTempSecret })
      });
      const enableData = await resEnable.json();
      if (!resEnable.ok) throw new Error(enableData.error || 'Failed to verify 2FA token');

      setMessage('2FA setup complete! You can now log in securely.');
      setRegQrCode('');
      setRegTempSecret('');
      setIsRegister(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerDirectPatientAccess = async () => {
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
  };

  const triggerGuestEmergencySOS = async () => {
    const promptedPhone = window.prompt("🚨 EMERGENCY SOS DISPATCH\n\nPlease enter your contact phone number to coordinate with the ambulance driver:", "");
    if (promptedPhone === null) return; // cancel
    const promptedName = window.prompt("Please enter your name (Optional):", "Guest SOS Patient");
    
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/guest-emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: promptedPhone, name: promptedName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Guest login failed');
      
      sessionStorage.setItem('rescuelink_token', data.token);
      sessionStorage.setItem('rescuelink_user', JSON.stringify(data.user));
      sessionStorage.setItem('guest_auto_sos', 'true'); // Flag to auto-trigger dispatch on dashboard load
      onLoginSuccess('user', data.token);
    } catch (err) {
      setError(err.message || 'Failed to establish guest session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(5,13,26,0.92)', backdropFilter: 'blur(8px)',
      fontFamily: "'Rajdhani', sans-serif", padding: 20
    }}>
      <div className="rl-card" style={{ width: '100%', maxWidth: 460, padding: 32, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'rgba(160,200,255,0.6)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, color: '#00c8ff', textAlign: 'center', marginBottom: 4, letterSpacing: '0.1em' }}>
          {defaultRole ? `${defaultRole.toUpperCase()} GATEWAY` : 'RESCUELINK GATEWAY'}
        </h2>
        <p style={{ textAlign: 'center', color: 'rgba(160,200,255,0.4)', fontSize: 10, letterSpacing: '0.15em', marginBottom: 20, fontFamily: "'Share Tech Mono'" }}>
          SECURE PROTOCOL ACCESS
        </p>

        {error && (
          <div style={{ padding: 10, background: 'rgba(255,50,50,0.1)', border: '1px solid rgba(255,50,50,0.4)', borderRadius: 6, color: '#ff8888', marginBottom: 16, fontSize: 12, textAlign: 'center', fontFamily: "'Share Tech Mono'" }}>{error}</div>
        )}
        {message && (
          <div style={{ padding: 10, background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)', borderRadius: 6, color: '#00ff88', marginBottom: 16, fontSize: 12, textAlign: 'center', fontFamily: "'Share Tech Mono'" }}>{message}</div>
        )}

        {regQrCode ? (
          <form onSubmit={handleRegMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <p style={{ color: 'rgba(160,200,255,0.8)', fontSize: 12, textAlign: 'center' }}>
              Scan this QR code with your authenticator app to enable mandatory 2FA security:
            </p>
            <img src={regQrCode} alt="2FA QR" style={{ border: '4px solid #fff', borderRadius: 8, width: 160, height: 160 }} />
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CONFIRMATION CODE</label>
              <input type="text" value={regVerifyCode} onChange={(e) => setRegVerifyCode(e.target.value)} required placeholder="e.g. 123456" className="rl-input" style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', letterSpacing: 2 }} />
            </div>
            <button type="submit" disabled={loading} className="rl-btn-primary" style={{ width: '100%' }}>
              {loading ? 'VERIFYING...' : 'COMPLETE SIGNUP →'}
            </button>
          </form>
        ) : isForgotPassword ? (
          <form onSubmit={sentOtp ? handleResetPassword : handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', marginBottom: 4, letterSpacing: '0.05em' }}>
              {sentOtp ? 'CONFIRM OTP & RESET PASSWORD' : 'PASSWORD RECOVERY'}
            </h3>
            <p style={{ color: 'rgba(160,200,255,0.6)', fontSize: 11, lineHeight: 1.4 }}>
              {sentOtp 
                ? 'Type the 6-digit verification code sent to your contact info along with your new secure access passcode.'
                : 'Select verification channel and enter your contact details to receive a temporary recovery OTP.'}
            </p>

            {!sentOtp ? (
              <>
                <div style={{ display: 'flex', gap: 16, background: 'rgba(0,200,255,0.03)', border: '1px solid rgba(0,200,255,0.1)', padding: '10px 14px', borderRadius: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#fff' }}>
                    <input type="radio" checked={recoveryMethod === 'email'} onChange={() => { setRecoveryMethod('email'); setRecoveryContact(''); }} style={{ accentColor: '#00c8ff' }} />
                    Email Address
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: '#fff' }}>
                    <input type="radio" checked={recoveryMethod === 'mobile'} onChange={() => { setRecoveryMethod('mobile'); setRecoveryContact(''); }} style={{ accentColor: '#00c8ff' }} />
                    Mobile Number
                  </label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>
                    {recoveryMethod === 'email' ? 'EMAIL ADDRESS' : 'MOBILE PHONE NUMBER'}
                  </label>
                  <input
                    type={recoveryMethod === 'email' ? 'email' : 'text'}
                    value={recoveryContact}
                    onChange={(e) => setRecoveryContact(e.target.value)}
                    required
                    placeholder={recoveryMethod === 'email' ? 'e.g. user@rescuelink.com' : 'e.g. +919988776655'}
                    className="rl-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <button type="submit" disabled={loading} className="rl-btn-primary" style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'SENDING OTP...' : 'SEND VERIFICATION CODE →'}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>6-DIGIT VERIFICATION CODE</label>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    required
                    placeholder="e.g. 123456"
                    className="rl-input"
                    style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', letterSpacing: 3, fontWeight: 'bold' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>NEW ACCESS PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="rl-input"
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(160,200,255,0.6)', cursor: 'pointer', fontSize: 14 }}
                    >
                      {showNewPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="rl-btn-primary" style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'SAVING...' : 'VERIFY & RESET PASSWORD →'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => { setIsForgotPassword(false); setSentOtp(false); setError(''); setMessage(''); }}
              style={{ background: 'none', border: 'none', color: 'rgba(160,200,255,0.5)', fontSize: 11, cursor: 'pointer', marginTop: 4, textDecoration: 'underline' }}
            >
              ← Back to Login
            </button>
          </form>
        ) : (
          <>
            {/* Login / Register Toggle Tabs */}
            {defaultRole && defaultRole !== 'admin' && defaultRole !== 'family' && (
              <div style={{ display: 'flex', background: 'rgba(0,200,255,0.05)', borderRadius: 6, padding: 3, marginBottom: 20, border: '1px solid rgba(0,200,255,0.1)' }}>
                <button type="button" onClick={() => setIsRegister(false)} style={{ flex: 1, padding: '8px 0', border: 'none', background: !isRegister ? 'rgba(0,200,255,0.15)' : 'none', color: !isRegister ? '#00c8ff' : 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer', borderRadius: 4 }}>LOGIN</button>
                <button type="button" onClick={() => setIsRegister(true)} style={{ flex: 1, padding: '8px 0', border: 'none', background: isRegister ? 'rgba(0,200,255,0.15)' : 'none', color: isRegister ? '#00c8ff' : 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer', borderRadius: 4 }}>REGISTER NEW</button>
              </div>
            )}

            {!isRegister ? (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>
                    {defaultRole === 'ambulance' ? 'VEHICLE ID / EMAIL' : 'EMAIL ADDRESS'}
                  </label>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={defaultRole === 'ambulance' ? 'e.g. MH-12-AB-1234' : 'user@gmail.com'} required className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder="••••••••" 
                      required 
                      className="rl-input" 
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(160,200,255,0.6)', cursor: 'pointer', fontSize: 14 }}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                    <span 
                      onClick={() => setIsForgotPassword(true)} 
                      style={{ fontSize: 10, color: '#00c8ff', cursor: 'pointer', fontFamily: "'Share Tech Mono'" }}
                    >
                      Forgot Password?
                    </span>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="rl-btn-primary" style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'AUTHENTICATING...' : 'ACCESS SYSTEM →'}
                </button>
                {defaultRole === 'user' && (
                  <>
                    <button type="button" onClick={triggerDirectPatientAccess} className="rl-btn-secondary" style={{ width: '100%', marginTop: 4 }}>
                      DIRECT PATIENT ACCESS 🧍
                    </button>
                    <button type="button" onClick={triggerGuestEmergencySOS} style={{ width: '100%', marginTop: 8, padding: '12px', background: 'linear-gradient(135deg, #ff3333, #aa0000)', border: '1px solid #ff4444', color: '#fff', borderRadius: 6, fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,0,0,0.3)', letterSpacing: '0.05em' }}>
                      🚨 GUEST EMERGENCY DISPATCH (NO LOGIN)
                    </button>
                  </>
                )}
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                 {defaultRole === 'ambulance' ? (
                   <>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>VEHICLE PLATE NUMBER</label>
                       <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} required placeholder="MH-12-QW-5678" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LEAD PARAMEDIC / DRIVER NAME</label>
                       <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} required placeholder="e.g. John Doe" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CONTACT PHONE NUMBER</label>
                       <input type="text" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} required placeholder="e.g. 9876543210" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>AMBULANCE TYPE</label>
                       <select value={type} onChange={(e) => setType(e.target.value)} className="rl-input" style={{ width: '100%', background: 'rgba(5,15,40,0.85)' }}>
                         <option value="BLS">BLS (Basic Life Support)</option>
                         <option value="ALS">ALS (Advanced Life Support)</option>
                       </select>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL AFFILIATION</label>
                       <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="rl-input" style={{ width: '100%', background: 'rgba(5,15,40,0.85)' }}>
                         <option value="">No Affiliation (Independent)</option>
                         {hospitalsList.map(h => (
                           <option key={h.id} value={h.id}>{h.name}</option>
                         ))}
                       </select>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ONBOARD EQUIPMENT</label>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                         {['Defibrillator', 'Ventilator', 'Oxygen Cylinder', 'ECG Monitor'].map(eq => {
                           const checked = equipmentChecklist.includes(eq);
                           return (
                             <label key={eq} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e0eaff', cursor: 'pointer' }}>
                               <input 
                                 type="checkbox" 
                                 checked={checked} 
                                 onChange={() => {
                                   if (checked) {
                                     setEquipmentChecklist(equipmentChecklist.filter(item => item !== eq));
                                   } else {
                                     setEquipmentChecklist([...equipmentChecklist, eq]);
                                   }
                                 }} 
                               />
                               {eq}
                             </label>
                           );
                         })}
                       </div>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CREW MEMBERS (COMMA SEPARATED)</label>
                        <input type="text" value={crewMembers} onChange={(e) => setCrewMembers(e.target.value)} placeholder="e.g. Paramedic John, Nurse Sarah" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LEAD LICENSE NUMBER</label>
                          <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="e.g. EMT-99211" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LICENSE EXPIRY</label>
                          <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>OXYGEN CAPACITY (LITERS)</label>
                        <input type="number" value={oxygenCapacityLiters} onChange={(e) => setOxygenCapacityLiters(e.target.value)} placeholder="e.g. 500" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#e0eaff', cursor: 'pointer', marginTop: 4 }}>
                        <input type="checkbox" checked={isSystemStandard} onChange={(e) => setIsSystemStandard(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#00c8ff' }} />
                        <span>This vehicle is certified under Standard EMS vehicle safety metrics.</span>
                      </label>
                   </>
                 ) : defaultRole === 'user' ? (
                   <>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>FULL NAME</label>
                       <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} required placeholder="e.g. Aditya Kulkarni" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>EMAIL ADDRESS</label>
                       <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="aditya@gmail.com" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>MOBILE PHONE NUMBER</label>
                       <input type="text" value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} required placeholder="e.g. 9876543210" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', gap: 10 }}>
                       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ABHA CARD NUMBER</label>
                         <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="12-3456-7890-12" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                       </div>
                       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ABHA ADDRESS ID</label>
                         <input type="text" value={abhaAddress} onChange={(e) => setAbhaAddress(e.target.value)} placeholder="aditya@abdm" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                       </div>
                     </div>
                     <div style={{ display: 'flex', gap: 10 }}>
                       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>BLOOD GROUP</label>
                         <input type="text" value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} placeholder="O+ve / B-ve" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                       </div>
                       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                         <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>DATE OF BIRTH</label>
                         <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                       </div>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>KNOWN DRUG & METABOLIC ALLERGIES</label>
                       <input type="text" value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. Penicillin, Peanuts" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>EXISTING CHRONIC MEDICAL CONDITIONS</label>
                       <input type="text" value={chronicConditions} onChange={(e) => setChronicConditions(e.target.value)} placeholder="e.g. Asthma, Diabetes" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                       <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>GENDER</label>
                       <select value={gender} onChange={(e) => setGender(e.target.value)} className="rl-input" style={{ width: '100%', background: 'rgba(5,15,40,0.85)' }}>
                         <option value="">Select Gender</option>
                         <option value="Male">Male</option>
                         <option value="Female">Female</option>
                         <option value="Other">Other</option>
                       </select>
                     </div>
                   </>

                      {/* Emergency Contact details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: '#ffb800', fontFamily: "'Share Tech Mono'" }}>EMERGENCY CONTACT NAME (NEXT OF KIN)</label>
                        <input type="text" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="e.g. Jane Doe" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>RELATIONSHIP</label>
                          <input type="text" value={emergencyContactRelationship} onChange={(e) => setEmergencyContactRelationship(e.target.value)} placeholder="e.g. Spouse" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>CONTACT PHONE</label>
                          <input type="text" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="e.g. 9876543210" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                      </div>

                      {/* Insurance Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Share Tech Mono'" }}>INSURANCE PROVIDER</label>
                        <input type="text" value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} placeholder="e.g. Star Health" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>POLICY NUMBER</label>
                          <input type="text" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="e.g. POL-12345" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>GROUP NUMBER</label>
                          <input type="text" value={groupNumber} onChange={(e) => setGroupNumber(e.target.value)} placeholder="e.g. GRP-6789" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#e0eaff', cursor: 'pointer', marginTop: 4 }}>
                        <input type="checkbox" checked={consentToShareData} onChange={(e) => setConsentToShareData(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#00ff88' }} />
                        <span>I consent to share emergency EMR parameters under ABDM/HIPAA.</span>
                      </label>
                   </>
                 ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>HOSPITAL FULL NAME</label>
                      <input type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} required placeholder="e.g. City General Hospital" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ADMINISTRATOR EMAIL</label>
                      <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="admin@yourhospital.com" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LICENSE / REGISTRATION NUMBER</label>
                      <input type="text" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required placeholder="e.g. REG-9910-HOSP" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>HOTLINE / PHONE NUMBER</label>
                      <input type="text" value={hospitalContact} onChange={(e) => setHospitalContact(e.target.value)} required placeholder="e.g. 022-2435-8910" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LATITUDE</label>
                        <input type="text" value={lat} onChange={(e) => setLat(e.target.value)} required placeholder="12.9716" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>LONGITUDE</label>
                        <input type="text" value={lng} onChange={(e) => setLng(e.target.value)} required placeholder="77.5946" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>TOTAL BEDS</label>
                        <input type="number" value={totalBeds} onChange={(e) => setTotalBeds(e.target.value)} required className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ICU BEDS</label>
                        <input type="number" value={icuBeds} onChange={(e) => setIcuBeds(e.target.value)} required className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>VENTILATORS</label>
                        <input type="number" value={ventilators} onChange={(e) => setVentilators(e.target.value)} required className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>AMBULANCE BAY CAPACITY</label>
                        <input type="number" value={bayCapacity} onChange={(e) => setBayCapacity(e.target.value)} required className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>SPECIALTY DEPARTMENTS</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        {['Trauma Care', 'Cardiology', 'Neurology', 'Pediatrics', 'ICU'].map(dept => {
                          const checked = departments.includes(dept);
                          return (
                            <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#e0eaff', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={() => {
                                  if (checked) {
                                    setDepartments(departments.filter(item => item !== dept));
                                  } else {
                                    setDepartments([...departments, dept]);
                                  }
                                }} 
                              />
                              {dept}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>TRAUMA CENTER TIER</label>
                        <select value={traumaTier} onChange={(e) => setTraumaTier(e.target.value)} className="rl-input" style={{ width: '100%', background: 'rgba(5,15,40,0.85)' }}>
                          <option value="Tier 1">Tier 1 (Comprehensive)</option>
                          <option value="Tier 2">Tier 2 (Major Trauma)</option>
                          <option value="Tier 3">Tier 3 (General ER)</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>NATIONAL ACCREDITATION ID</label>
                        <input type="text" value={accreditationId} onChange={(e) => setAccreditationId(e.target.value)} placeholder="e.g. NABH-9921" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', fontFamily: "'Share Tech Mono'" }}>ACCESS PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      placeholder="••••••••" 
                      required 
                      className="rl-input" 
                      style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px' }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(160,200,255,0.6)', cursor: 'pointer', fontSize: 13 }}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="rl-btn-primary" style={{ width: '100%', marginTop: 8 }}>
                  {loading ? 'REGISTERING...' : 'REGISTER & BUILD 2FA →'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Ambulance Hub Landing Homepage (Pre-Auth) ────────────────────────── */
function AmbulanceLandingHomepage({ onLogin, onRegister, onBack }) {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAmbulances = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/ambulances`);
        if (res.ok) {
          const list = await res.json();
          setAmbulances(list);
        }
      } catch (err) {
        console.warn('[AMB WIDGET FETCH ERROR]', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAmbulances();
    const interval = setInterval(fetchAmbulances, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 10%, #150903 0%, #050201 80%)',
      fontFamily: "'Rajdhani', sans-serif", color: '#fff', position: 'relative', overflowX: 'hidden'
    }}>
      <style>{styles}</style>
      <ParticleCanvas />
      <div className="scanline" />

      {/* Main Header */}
      <header style={{
        padding: '20px 40px', borderBottom: '1px solid rgba(255,107,53,0.25)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(25,10,5,0.75)', backdropFilter: 'blur(10px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>🚑</div>
          <div>
            <h1 style={{ fontFamily: "'Orbitron'", fontSize: 18, letterSpacing: '0.15em', color: '#ff6b35', margin: 0 }}>RESCUELINK</h1>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,180,160,0.5)', fontFamily: "'Share Tech Mono'" }}>PARAMEDIC FLEET HUB</span>
          </div>
        </div>
        <button onClick={onBack} className="rl-btn-secondary" style={{ padding: '8px 16px', fontSize: 11 }}>
          ← MAIN PORTAL
        </button>
      </header>

      {/* Hero / Action Panel */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', zIndex: 1 }}>
        <div className="rl-card" style={{ width: '100%', maxWidth: 540, padding: 32, textAlign: 'center', border: '1px solid rgba(255,107,53,0.3)', background: 'rgba(15,8,4,0.9)' }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📟</div>
          <h2 style={{ fontFamily: "'Orbitron'", color: '#ff6b35', fontSize: 22, letterSpacing: '0.1em', margin: '0 0 10px' }}>PARAMEDIC DISPATCH COMMAND</h2>
          <p style={{ color: 'rgba(255,200,180,0.7)', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
            Access driver log sheets, monitor active ambulance status, and configure mandatory 2FA. Drivers must register and obtain verification prior to receiving dispatches.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={onLogin} className="rl-btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #ff6b35 0%, #dd4b14 100%)', boxShadow: '0 4px 15px rgba(255,107,53,0.2)' }}>
              DRIVER SIGN IN →
            </button>
            <button onClick={onRegister} className="rl-btn-secondary" style={{ flex: 1, borderColor: '#ff6b35', color: '#ff6b35' }}>
              REGISTER NEW UNIT
            </button>
          </div>
        </div>

        {/* Live status view */}
        <div className="rl-card" style={{ width: '100%', maxWidth: 800, marginTop: 40, padding: 24, textAlign: 'left' }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff6b35', borderBottom: '1px solid rgba(255,107,53,0.2)', paddingBottom: 8, margin: '0 0 16px' }}>
            📡 LIVE AMBULANCE NETWORK REGISTRY
          </h3>
          {loading ? (
            <div style={{ color: 'rgba(255,200,180,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>Pinging fleet transponders...</div>
          ) : ambulances.length === 0 ? (
            <div style={{ color: 'rgba(255,200,180,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>No ambulance units online.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {ambulances.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,107,53,0.15)' }}>
                  <div>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', color: '#ff6b35' }}>{a.vehicleNo}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,200,180,0.6)', marginTop: 2 }}>{a.driverName} · {a.type}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                      fontSize: 8, fontFamily: "'Share Tech Mono'", fontWeight: 'bold', padding: '3px 8px', borderRadius: 4,
                      background: !!a.is_active ? 'rgba(0,255,136,0.1)' : 'rgba(180,120,50,0.15)',
                      color: !!a.is_active ? '#00ff88' : '#ffb800',
                      border: `1px solid ${!!a.is_active ? '#00ff88' : '#ffb800'}`
                    }}>
                      {!!a.is_active ? 'REGISTERED ✔' : 'OFF DUTY'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Hospital Unit Landing Homepage (Pre-Auth) ─────────────────────────── */
function HospitalLandingHomepage({ onLogin, onRegister, onBack }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/hospitals`);
        if (res.ok) {
          const list = await res.json();
          setHospitals(list);
        }
      } catch (err) {
        console.warn('[HOSP WIDGET FETCH ERROR]', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHospitals();
    const interval = setInterval(fetchHospitals, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 10%, #031526 0%, #01050a 80%)',
      fontFamily: "'Rajdhani', sans-serif", color: '#fff', position: 'relative', overflowX: 'hidden'
    }}>
      <style>{styles}</style>
      <ParticleCanvas />
      <div className="scanline" />

      {/* Main Header */}
      <header style={{
        padding: '20px 40px', borderBottom: '1px solid rgba(0,200,255,0.25)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(5,20,40,0.75)', backdropFilter: 'blur(10px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>🏥</div>
          <div>
            <h1 style={{ fontFamily: "'Orbitron'", fontSize: 18, letterSpacing: '0.15em', color: '#00c8ff', margin: 0 }}>RESCUELINK</h1>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>MEDICAL COMMAND GATEWAY</span>
          </div>
        </div>
        <button onClick={onBack} className="rl-btn-secondary" style={{ padding: '8px 16px', fontSize: 11 }}>
          ← MAIN PORTAL
        </button>
      </header>

      {/* Hero / Action Panel */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', zIndex: 1 }}>
        <div className="rl-card" style={{ width: '100%', maxWidth: 540, padding: 32, textAlign: 'center', border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(4,10,24,0.9)' }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>🏢</div>
          <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', fontSize: 22, letterSpacing: '0.1em', margin: '0 0 10px' }}>HOSPITAL EMERGENCY COMMAND</h2>
          <p style={{ color: 'rgba(160,200,255,0.7)', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
            Synchronize ER trauma bay capacity, assign incoming physicians, and lock resources for in-transit ICU ambulances. All medical portals require authorized coordinator credentials.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={onLogin} className="rl-btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #00c8ff 0%, #0072ff 100%)', boxShadow: '0 4px 15px rgba(0,200,255,0.2)' }}>
              COMMAND SIGN IN →
            </button>
            <button onClick={onRegister} className="rl-btn-secondary" style={{ flex: 1, borderColor: '#00c8ff', color: '#00c8ff' }}>
              REGISTER CLINIC
            </button>
          </div>
        </div>

        {/* Live status view */}
        <div className="rl-card" style={{ width: '100%', maxWidth: 800, marginTop: 40, padding: 24, textAlign: 'left' }}>
          <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', borderBottom: '1px solid rgba(0,200,255,0.2)', paddingBottom: 8, margin: '0 0 16px' }}>
            🏥 ACTIVE TRAUMA CENTERS & ICU BEDS
          </h3>
          {loading ? (
            <div style={{ color: 'rgba(160,200,255,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>Pinging trauma databases...</div>
          ) : hospitals.length === 0 ? (
            <div style={{ color: 'rgba(160,200,255,0.5)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>No clinics registered yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {hospitals.map(h => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(0,200,255,0.15)' }}>
                  <div>
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', color: '#00c8ff' }}>{h.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginTop: 2 }}>ICU Beds: {h.icu_beds} · Vents: {h.ventilators}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '3px 8px', borderRadius: 4, border: '1px solid #00ff88' }}>
                      ONLINE
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── RescueLink Landing Portal Homepage ──────────────────────────────── */
function LandingHomepage({ onSelectRole }) {
  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRegistry = async () => {
      try {
        const [resAmb, resHosp] = await Promise.all([
          fetch(`${SERVER_URL}/api/ambulances`),
          fetch(`${SERVER_URL}/api/hospitals`)
        ]);
        if (resAmb.ok) {
          const list = await resAmb.json();
          setAmbulances(list);
        }
        if (resHosp.ok) {
          const list = await resHosp.json();
          setHospitals(list);
        }
      } catch (err) {
        console.warn('[WIDGET FETCH ERROR]', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRegistry();
    const interval = setInterval(fetchRegistry, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 50% 10%, #081b33 0%, #030812 80%)',
      fontFamily: "'Rajdhani', sans-serif", color: '#fff', position: 'relative', overflowX: 'hidden'
    }}>
      <style>{styles}</style>
      <ParticleCanvas />
      <div className="scanline" />

      {/* Main Header */}
      <header style={{
        padding: '20px 40px', borderBottom: '1px solid rgba(0,200,255,0.15)',
        display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(5,15,35,0.7)', backdropFilter: 'blur(10px)', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid #ff3333', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyCenter: 'center', fontSize: 18, color: '#ff3333', fontWeight: 'bold'
          }}>🚨</div>
          <div>
            <h1 style={{ fontFamily: "'Orbitron'", fontSize: 18, letterSpacing: '0.15em', color: '#00c8ff', margin: 0 }}>RESCUELINK</h1>
            <span style={{ fontSize: 9, letterSpacing: '0.2em', color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>NATIONAL HEALTH NETWORK</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 15 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'" }}>CENTRAL SERVER</div>
            <div style={{ fontSize: 12, color: '#00ff88', fontWeight: 'bold', fontFamily: "'Share Tech Mono'" }}>ACTIVE // ONLINE</div>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div style={{ textShadow: '0 0 10px rgba(0,0,0,0.5)', padding: '50px 20px 30px', textAlign: 'center', zIndex: 1 }}>
        <h2 style={{ fontFamily: "'Orbitron'", fontSize: 'clamp(24px, 5vw, 36px)', color: '#fff', letterSpacing: '0.2em', margin: '0 0 12px' }}>
          SECURE DISPATCH & RESOURCE GATEWAY
        </h2>
        <p style={{ color: 'rgba(160,200,255,0.6)', maxWidth: 700, margin: '0 auto 40px', fontSize: 14, lineHeight: 1.6 }}>
          Real-time end-to-end medical response coordinator linking patients, paramedics, trauma centers, and government commanders under an encrypted national ledger.
        </p>

        {/* Gateways Grid */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1200, margin: '0 auto 40px' }}>
          {[
            { role: 'user', emoji: '🧍', title: 'EMERGENCY SOS', desc: 'Instant AI triage, location mapping, and telemetry request.', color: '#00ff88' },
            { role: 'ambulance', emoji: '🚑', title: 'PARAMEDIC HUB', desc: 'Driver active duty toggle, vitals streaming, and ER routing.', color: '#ff6b35' },
            { role: 'hospital', emoji: '🏥', title: 'HOSPITAL COMMAND', desc: 'ER bed tracking, doctor assignments, and locks verification.', color: '#00c8ff' },
            { role: 'admin', emoji: '🏛️', title: 'WAR ROOM COMMAND', desc: 'Disaster coordinator, spatial logs, and audit logs viewer.', color: '#cc00ff' },
            { role: 'family', emoji: '👨‍👩‍👧', title: 'FAMILY TRACKER', desc: 'Real-time telemetry, location, and status mapping for families.', color: '#ffb800' }
          ].map(g => (
            <div key={g.role} onClick={() => onSelectRole(g.role)} className="rl-card" style={{
              width: 210, padding: 24, cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', transition: 'all 0.3s', border: `1px solid rgba(0,200,255,0.2)`
            }} onMouseEnter={e => { e.currentTarget.style.borderColor = g.color; e.currentTarget.style.boxShadow = `0 0 15px ${g.color}33`; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{g.emoji}</div>
              <h3 style={{ fontFamily: "'Orbitron'", fontSize: 13, color: g.color, letterSpacing: '0.1em', margin: '0 0 8px' }}>{g.title}</h3>
              <p style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>{g.desc}</p>
            </div>
          ))}
        </div>

        {/* Live Registries split directories */}
        <div style={{ display: 'flex', gap: 30, maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap', textAlign: 'left' }}>
          {/* Paramedic Fleet status directory */}
          <div className="rl-card" style={{ flex: 1, minWidth: 340, padding: 24 }}>
            <h3 style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ff6b35', borderBottom: '1px solid rgba(255,107,53,0.3)', paddingBottom: 10, margin: '0 0 16px', letterSpacing: '0.1em' }}>
              📡 PARAMEDIC FLEET DIRECTORY
            </h3>
            {loading ? (
              <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>Pinging fleet logs...</div>
            ) : ambulances.length === 0 ? (
              <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>No ambulance units registered yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                {ambulances.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,200,255,0.03)', borderRadius: 6, border: '1px solid rgba(0,200,255,0.1)' }}>
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', color: '#00c8ff' }}>{a.vehicleNo}</div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>Driver: {a.driverName} • {a.type}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono'", color: a.is_active ? '#00ff88' : '#ff3333', background: a.is_active ? 'rgba(0,255,136,0.1)' : 'rgba(255,51,51,0.1)', padding: '3px 8px', borderRadius: 4, border: `1px solid ${a.is_active ? '#00ff88' : '#ff3333'}` }}>
                        {a.is_active ? 'ACTIVE / READY' : 'ON BREAK'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hospital Center capacity directory */}
          <div className="rl-card" style={{ flex: 1, minWidth: 340, padding: 24 }}>
            <h3 style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#00c8ff', borderBottom: '1px solid rgba(0,200,255,0.3)', paddingBottom: 10, margin: '0 0 16px', letterSpacing: '0.1em' }}>
              🏥 MEDICAL CENTER DIRECTORY
            </h3>
            {loading ? (
              <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>Pinging trauma databases...</div>
            ) : hospitals.length === 0 ? (
              <div style={{ color: 'rgba(160,200,255,0.4)', fontSize: 12, fontFamily: "'Share Tech Mono'" }}>No trauma centers registered yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                {hospitals.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,200,255,0.03)', borderRadius: 6, border: '1px solid rgba(0,200,255,0.1)' }}>
                    <div>
                      <div style={{ fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', color: '#00c8ff' }}>{h.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)' }}>ICU Beds: {h.icu_beds} • Ventilators: {h.ventilators}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono'", color: '#00ff88', background: 'rgba(0,255,136,0.1)', padding: '3px 8px', borderRadius: 4, border: '1px solid #00ff88' }}>
                        ONLINE
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
  const [emergencyBroadcast, setEmergencyBroadcast] = useState(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [loginTargetRole, setLoginTargetRole] = useState(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const [currentHash, setCurrentHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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

  // Cold start warm-up: Ping the Render backend directly on page load to initiate wake-up sequence
  useEffect(() => {
    const warmUpUrl = SOCKET_URL || 'https://rescuelink-emergency-system.onrender.com';
    fetch(`${warmUpUrl}/health`)
      .then(res => res.json())
      .then(data => console.log('[SERVER WARM-UP] Render server active:', data))
      .catch(err => console.warn('[SERVER WARM-UP] Warm-up ping initiated:', err.message));
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Dynamic bookmarkable URL Hash Routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      const parsedRole = hash.split('/')[0];
      if (['user', 'ambulance', 'hospital', 'admin', 'family'].includes(parsedRole)) {
        setRole(parsedRole);
        sessionStorage.setItem('rescueLinkRole', parsedRole);
      } else if (!hash) {
        setRole(null);
        sessionStorage.removeItem('rescueLinkRole');
      }
    };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  useEffect(() => {
    if (!role || !token) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token },
      query: { role },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);
    newSocket.on('connect', () => {
      console.log('[SOCKET] Connected successfully to server');
      setConnected(true);
    });
    newSocket.on('disconnect', (reason) => {
      console.warn('[SOCKET] Disconnected from server:', reason);
      setConnected(false);
    });
    newSocket.on('emergency-broadcast-alert', (data) => {
      console.log('[SOCKET] Emergency broadcast received:', data.message);
      setEmergencyBroadcast(data.message);
    });
    newSocket.on('connect_error', (err) => {
      console.error('[SOCKET ERROR] Connection failed:', err.message);
      if (err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('expired')) {
        console.warn('[SOCKET] Session expired or unauthorized. Clearing storage and redirecting to login...');
        sessionStorage.removeItem('rescuelink_token');
        sessionStorage.removeItem('rescuelink_user');
        sessionStorage.removeItem('rescueLinkRole');
        window.location.reload();
      }
    });

    return () => newSocket.disconnect();
  }, [role, token]);

  const handleLoginSuccess = (viewRole, userToken) => {
    setToken(userToken);
    setRole(viewRole);
    sessionStorage.setItem('rescueLinkRole', viewRole);
    setMfaVerifyToken(null);
    window.location.hash = viewRole;
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
    if (currentHash === '#ambulance' || loginTargetRole === 'ambulance') {
      return (
        <>
          <AmbulanceLandingHomepage
            onLogin={() => { setIsRegisterMode(false); setLoginTargetRole('ambulance'); }}
            onRegister={() => { setIsRegisterMode(true); setLoginTargetRole('ambulance'); }}
            onBack={() => { window.location.hash = ''; setRole(null); setLoginTargetRole(null); setIsRegisterMode(false); }}
          />
          {loginTargetRole === 'ambulance' && (
            <LoginScreen
              defaultRole="ambulance"
              onLoginSuccess={handleLoginSuccess}
              onMfaSetup={(setupToken) => setMfaSetupToken(setupToken)}
              onMfaVerify={(mfaToken) => setMfaVerifyToken(mfaToken)}
              onClose={() => { setLoginTargetRole(null); }}
              defaultIsRegister={isRegisterMode}
            />
          )}
        </>
      );
    }

    if (currentHash === '#hospital' || loginTargetRole === 'hospital') {
      return (
        <>
          <HospitalLandingHomepage
            onLogin={() => { setIsRegisterMode(false); setLoginTargetRole('hospital'); }}
            onRegister={() => { setIsRegisterMode(true); setLoginTargetRole('hospital'); }}
            onBack={() => { window.location.hash = ''; setRole(null); setLoginTargetRole(null); setIsRegisterMode(false); }}
          />
          {loginTargetRole === 'hospital' && (
            <LoginScreen
              defaultRole="hospital"
              onLoginSuccess={handleLoginSuccess}
              onMfaSetup={(setupToken) => setMfaSetupToken(setupToken)}
              onMfaVerify={(mfaToken) => setMfaVerifyToken(mfaToken)}
              onClose={() => { setLoginTargetRole(null); }}
              defaultIsRegister={isRegisterMode}
            />
          )}
        </>
      );
    }

    return (
      <>
        <LandingHomepage onSelectRole={(selRole) => {
          setLoginTargetRole(selRole);
          window.location.hash = selRole;
        }} />
        {loginTargetRole && (
          <LoginScreen
            defaultRole={loginTargetRole}
            onLoginSuccess={handleLoginSuccess}
            onMfaSetup={(setupToken) => setMfaSetupToken(setupToken)}
            onMfaVerify={(mfaToken) => setMfaVerifyToken(mfaToken)}
            onClose={() => { setLoginTargetRole(null); window.location.hash = ''; }}
            defaultIsRegister={isRegisterMode}
          />
        )}
      </>
    );
  }

  if (!role) {
    return <RoleSelector onSelect={(selRole) => {
      sessionStorage.setItem('rescueLinkRole', selRole);
      setRole(selRole);
      window.location.hash = selRole;
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
          className="rl-btn-secondary"
          onClick={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = '';
          }}
          style={{
            padding: '8px 16px',
            fontSize: 11
          }}
        >
          <span className="global-btn-label">SWITCH ROLE </span>🔄
        </button>

        {/* Security settings button */}
        <button
          className="rl-btn-secondary"
          onClick={() => setShowSecurityModal(true)}
          style={{
            padding: '8px 16px',
            fontSize: 11
          }}
        >
          <span className="global-btn-label">SECURITY </span>🛡️
        </button>

        {/* Logout button */}
        <button
          className="rl-btn-primary"
          onClick={handleLogout}
          style={{
            padding: '8px 16px',
            fontSize: 11,
            background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)',
            boxShadow: '0 4px 15px rgba(255, 68, 68, 0.2)'
          }}
        >
          <span className="global-btn-label">LOGOUT </span>⏻
        </button>
      </div>

      {/* Premium Theme Switcher - Bottom Left */}
      <button
        onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        style={{
          position: 'fixed', bottom: 25, left: 25, zIndex: 11000,
          width: 46, height: 46, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          background: theme === 'dark' ? 'rgba(0, 200, 255, 0.08)' : '#ffffff',
          border: `1px solid ${theme === 'dark' ? 'rgba(0, 200, 255, 0.4)' : '#1b4f72'}`,
          color: theme === 'dark' ? '#00c8ff' : '#1b4f72',
          boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 4px 12px rgba(0,0,0,0.1)',
          outline: 'none',
          padding: 0
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.background = theme === 'dark' ? 'rgba(0, 200, 255, 0.18)' : 'rgba(27, 79, 114, 0.08)';
          e.currentTarget.style.boxShadow = theme === 'dark' ? '0 0 20px rgba(0, 200, 255, 0.5)' : '0 0 15px rgba(27, 79, 114, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.background = theme === 'dark' ? 'rgba(0, 200, 255, 0.08)' : '#ffffff';
          e.currentTarget.style.boxShadow = theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.6)' : '0 4px 12px rgba(0,0,0,0.1)';
        }}
      >
        {theme === 'dark' ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        )}
      </button>

      {role === 'user' && (
        (() => {
          const userStr = sessionStorage.getItem('rescuelink_user');
          const parsedUser = userStr ? JSON.parse(userStr) : null;
          if (parsedUser && parsedUser.role === 'patient') {
            return <PatientPortal />;
          }
          return <UserDashboard socket={socket} connected={connected} />;
        })()
      )}
      {role === 'ambulance' && <AmbulanceStreamer socket={socket} connected={connected} />}
      {role === 'hospital' && <HospitalDashboard socket={socket} connected={connected} />}
      {role === 'admin' && <WarRoom socket={socket} connected={connected} />}
      {role === 'family' && <FamilyDashboard socket={socket} connected={connected} reqId={familyReqId} />}

      {emergencyBroadcast && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          background: 'linear-gradient(90deg, #ff1e1e 0%, #b30000 100%)',
          borderBottom: '2px solid #ff3333', color: '#fff', padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 4px 20px rgba(255,0,0,0.4)', fontFamily: "'Orbitron', sans-serif"
        }}>
          <span style={{ fontSize: 20, animation: 'pulse-opacity 1s infinite' }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', letterSpacing: '0.1em' }}>CRITICAL EMERGENCY BROADCAST FROM WAR ROOM</div>
            <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2 }}>{emergencyBroadcast}</div>
          </div>
          <button 
            onClick={() => setEmergencyBroadcast(null)}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, color: '#fff', fontSize: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold' }}
          >
            DISMISS
          </button>
        </div>
      )}

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
