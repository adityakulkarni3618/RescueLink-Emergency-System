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
import CorridorPanel from './components/CorridorPanel';
import SimulationDashboard from './components/SimulationDashboard';

const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system-4d85.onrender.com');
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system-4d85.onrender.com');

// Global fetch request interceptor for JWT auth
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('rescuelink_token');
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
  const token = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('rescuelink_token');
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
  /* --- Universal responsive reset --- */
  *, *::before, *::after {
    box-sizing: border-box;
  }
  html, body {
    max-width: 100%;
    overflow-x: hidden;
  }
  .app-root {
    max-width: 100vw;
    overflow-x: hidden;
  }
  img, svg, canvas {
    max-width: 100%;
  }

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
  @keyframes logo-ring-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes logo-ring-spin-rev {
    from { transform: rotate(0deg); }
    to   { transform: rotate(-360deg); }
  }
  @keyframes logo-pulse-glow {
    0%, 100% { filter: drop-shadow(0 0 4px rgba(220,50,50,0.6)); }
    50%       { filter: drop-shadow(0 0 12px rgba(255,80,80,1)); }
  }
  .rescue-logo-wrap {
    position: relative;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .rescue-logo-wrap svg.logo-main {
    animation: logo-pulse-glow 2.5s ease-in-out infinite;
  }
  .rescue-ring-outer {
    position: absolute;
    top: 0; left: 0;
    width: 52px; height: 52px;
    animation: logo-ring-spin 7s linear infinite;
  }
  .rescue-ring-inner {
    position: absolute;
    top: 4px; left: 4px;
    width: 44px; height: 44px;
    animation: logo-ring-spin-rev 4.5s linear infinite;
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

  /* --- Theme Variables --- */
  body[data-theme='dark-sky-breeze'] {
    --theme-accent: #00c8ff;
    --theme-accent-rgb: 0, 200, 255;
    --theme-accent-glow: rgba(0, 200, 255, 0.4);
    --theme-accent-hover: #33d6ff;
    --theme-bg: radial-gradient(ellipse at 50% 30%, #020813 0%, #000205 100%);
    --theme-card-bg: rgba(4, 12, 28, 0.85);
    --theme-text-primary: #e0eaff;
    --theme-text-secondary: rgba(160, 200, 255, 0.6);
    --theme-border: rgba(0, 200, 255, 0.25);
    --theme-border-hover: rgba(0, 200, 255, 0.55);
    --theme-success: #00ff88;
    --theme-warning: #ffb800;
    --theme-danger: #ff4444;
  }

  body[data-theme='light-sky-breeze'] {
    --theme-accent: #0284c7;
    --theme-accent-rgb: 2, 132, 199;
    --theme-accent-glow: rgba(2, 132, 199, 0.25);
    --theme-accent-hover: #0369a1;
    --theme-bg: #f0f9ff;
    --theme-card-bg: #ffffff;
    --theme-text-primary: #0f172a;
    --theme-text-secondary: #475569;
    --theme-border: #bae6fd;
    --theme-border-hover: #7dd3fc;
    --theme-success: #16a34a;
    --theme-warning: #ea580c;
    --theme-danger: #dc2626;
  }

  /* --- Global Reset & Overrides --- */
  body, .app-root, p, span, div, label, input, textarea, select {
    font-weight: 600 !important;
  }
  h1, h2, h3, h4, h5, h6, strong, b, button {
    font-weight: 800 !important;
  }
  body, .app-root {
    background: var(--theme-bg) !important;
    color: var(--theme-text-primary) !important;
    transition: background 0.3s ease, color 0.3s ease;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Target all radial-gradient layouts and outer container backgrounds */
  div[style*="radial-gradient" i] {
    background: var(--theme-bg) !important;
  }
  div[style*="height: 100vh" i],
  div[style*="height: '100vh'" i],
  div[style*="min-height: 100vh" i] {
    background: var(--theme-bg) !important;
  }

  /* Target headers / top bars in light mode nicely */
  [data-theme^='light'] div[style*="min-height: 70" i], 
  [data-theme^='light'] div[style*="min-height: 60" i],
  [data-theme^='light'] div[style*="min-height: 64" i],
  [data-theme^='light'] div[style*="rgba(5, 20, 10" i],
  [data-theme^='light'] div[style*="rgba(5,20,10" i],
  [data-theme^='light'] header,
  [data-theme^='light'] header[style*="rgba(5,15,35" i] {
    background: #1b4f72 !important;
    border-bottom: 2px solid #154360 !important;
    color: #ffffff !important;
  }

  /* Remove blurry text-shadows in light mode to make text clean and readable */
  [data-theme^='light'] div,
  [data-theme^='light'] h1,
  [data-theme^='light'] h2,
  [data-theme^='light'] h3,
  [data-theme^='light'] h4,
  [data-theme^='light'] h5,
  [data-theme^='light'] h6,
  [data-theme^='light'] p,
  [data-theme^='light'] span,
  [data-theme^='light'] label {
    text-shadow: none !important;
  }
  [data-theme^='light'] div[style*="min-height: 70" i] *, 
  [data-theme^='light'] div[style*="min-height: 60" i] *,
  [data-theme^='light'] div[style*="rgba(5, 20, 10" i] *,
  [data-theme^='light'] div[style*="rgba(5,20,10" i] *,
  [data-theme^='light'] header *,
  [data-theme^='light'] header[style*="rgba(5,15,35" i] * {
    color: #ffffff !important;
  }

  /* Card Background & Border Overrides */
  *[style*="rgba(5, 15, 40" i],
  *[style*="rgba(5,15,40" i],
  *[style*="rgba(5, 20, 45" i],
  *[style*="rgba(5,20,45" i],
  *[style*="rgba(10, 22, 48" i],
  *[style*="rgba(10,22,48" i],
  *[style*="rgba(3, 10, 28" i],
  *[style*="rgba(3,10,28" i],
  *[style*="rgba(3, 8, 22" i],
  *[style*="rgba(3,8,22" i],
  *[style*="#050a1e" i],
  *[style*="#020611" i],
  *[style*="#010512" i],
  *[style*="#0a1526" i],
  *[style*="rgba(10, 20, 45" i],
  *[style*="rgba(10,20,45" i],
  *[style*="#0a1e3a" i],
  *[style*="#050d1a" i],
  .rl-card {
    background: var(--theme-card-bg) !important;
    border: 1px solid var(--theme-border) !important;
    color: var(--theme-text-primary) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15) !important;
    border-radius: 12px !important;
    backdrop-filter: blur(12px) !important;
    transition: all 0.3s ease !important;
  }

  .rl-card:hover {
    border-color: var(--theme-accent) !important;
    box-shadow: 0 10px 30px var(--theme-accent-glow) !important;
  }

  /* Inputs, Textareas, Selects */
  input, textarea, select, .rl-input {
    background: var(--theme-card-bg) !important;
    border: 1.5px solid var(--theme-border) !important;
    color: var(--theme-text-primary) !important;
    border-radius: 6px !important;
    padding: 10px 14px !important;
    font-size: 14px !important;
    outline: none !important;
    box-sizing: border-box !important;
    transition: all 0.2s ease !important;
  }
  input:focus, textarea:focus, select:focus, .rl-input:focus {
    border-color: var(--theme-accent) !important;
    box-shadow: 0 0 0 3px var(--theme-accent-glow) !important;
  }

  /* Heading Elements */
  h1, h2, h3, h4, h5, h6 {
    color: var(--theme-text-primary) !important;
    font-family: 'Orbitron', 'Rajdhani', sans-serif !important;
  }

  /* Generic Accent Text Redirection */
  [style*="0, 200, 255" i],
  [style*="0,200,255" i],
  [style*="color: #00c8ff" i],
  [style*="color:#00c8ff" i],
  [style*="color: #0072ff" i] {
    color: var(--theme-accent) !important;
  }

  /* Generic White Text Redirection */
  [style*="255, 255, 255" i],
  [style*="255,255,255" i],
  [style*="224, 234, 255" i],
  [style*="224,234,255" i],
  [style*="color: #fff" i],
  [style*="color:#fff" i],
  [style*="color: #ffffff" i],
  [style*="color:#ffffff" i],
  [style*="color: white" i] {
    color: var(--theme-text-primary) !important;
  }

  /* Generic Muted Text Redirection */
  [style*="160, 200, 255" i],
  [style*="160,200,255" i] {
    color: var(--theme-text-secondary) !important;
  }

  /* Status Colors */
  [style*="0, 255, 136" i],
  [style*="0,255,136" i],
  [style*="color: #00ff88" i],
  [style*="color:#00ff88" i] {
    color: var(--theme-success) !important;
  }
  [style*="255, 184, 0" i],
  [style*="255,184,0" i],
  [style*="color: #ffb800" i],
  [style*="color:#ffb800" i] {
    color: var(--theme-warning) !important;
  }
  [style*="255, 68, 68" i],
  [style*="255,68,68" i],
  [style*="255, 51, 51" i],
  [style*="255,51,51" i],
  [style*="255, 30, 30" i],
  [style*="255,30,30" i],
  [style*="color: #ff4444" i],
  [style*="color:#ff4444" i],
  [style*="color: #ff3333" i],
  [style*="color:#ff3333" i] {
    color: var(--theme-danger) !important;
  }

  /* --- Premium & Official Buttons --- */
  button, .rl-btn-primary, .rl-btn-secondary {
    font-family: 'Orbitron', 'Rajdhani', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    border-radius: 6px !important;
    padding: 10px 20px !important;
    font-size: 11px !important;
    cursor: pointer !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    box-sizing: border-box !important;
    min-height: 38px !important;
    vertical-align: middle !important;
  }

  /* SOS Button override — must grow to fit content */
  button.sos-emergency-btn {
    height: auto !important;
    min-height: 70px !important;
    padding: 18px 20px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    text-transform: none !important;
    background: linear-gradient(135deg, rgba(255,30,30,0.25), rgba(220,0,0,0.15)) !important;
    border: 2px solid #ff2222 !important;
    box-shadow: 0 0 20px rgba(255,30,30,0.3) !important;
  }

  /* Primary Button (Gradient background using active Accent theme color) */
  .rl-btn-primary,
  button[style*="linear-gradient" i],
  button[style*="#00c8ff" i],
  button[style*="#00ff88" i],
  button[style*="#0072ff" i],
  button[style*="rgba(0, 200, 255" i] {
    background: linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-hover) 100%) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 12px var(--theme-accent-glow) !important;
  }
  .rl-btn-primary:hover,
  button[style*="linear-gradient" i]:hover,
  button[style*="#00c8ff" i]:hover,
  button[style*="#00ff88" i]:hover,
  button[style*="#0072ff" i]:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.02) !important;
    box-shadow: 0 6px 18px var(--theme-accent-glow) !important;
    filter: brightness(1.1) !important;
  }

  /* Secondary Button (Bordered theme accent) */
  .rl-btn-secondary,
  button:not([style*="linear-gradient" i]):not([style*="red" i]):not([style*="#ff4444" i]):not([style*="#ff3333" i]):not([style*="#dc2626" i]):not([style*="rgba(255, 68, 68" i]) {
    background: var(--theme-card-bg) !important;
    color: var(--theme-accent) !important;
    border: 1.5px solid var(--theme-accent) !important;
    box-shadow: none !important;
  }
  .rl-btn-secondary:hover,
  button:not([style*="linear-gradient" i]):not([style*="red" i]):not([style*="#ff4444" i]):not([style*="#ff3333" i]):not([style*="#dc2626" i]):not([style*="rgba(255, 68, 68" i]):hover:not(:disabled) {
    background: var(--theme-accent) !important;
    color: #ffffff !important;
    transform: translateY(-1px) scale(1.02) !important;
    box-shadow: 0 4px 12px var(--theme-accent-glow) !important;
  }

  /* Danger Buttons */
  button[style*="red" i],
  button[style*="#ff4444" i],
  button[style*="#ff3333" i],
  button[style*="#dc2626" i],
  button[style*="rgba(255, 68, 68" i] {
    background: linear-gradient(135deg, var(--theme-danger) 0%, #bd2130 100%) !important;
    color: #ffffff !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2) !important;
  }
  button[style*="red" i]:hover,
  button[style*="#ff4444" i]:hover,
  button[style*="#ff3333" i]:hover:not(:disabled),
  button[style*="#dc2626" i]:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.02) !important;
    box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4) !important;
    filter: brightness(1.1) !important;
  }

  button:active {
    transform: translateY(1px) scale(0.98) !important;
  }
  button:disabled {
    opacity: 0.55 !important;
    cursor: not-allowed !important;
    transform: none !important;
    box-shadow: none !important;
  }

  /* --- Global Action Bar UI Alignments & Fit --- */
  .global-buttons-container {
    position: fixed;
    top: 14px;
    right: 25px;
    z-index: 11000;
    display: flex;
    gap: 12px;
    align-items: center;
    background: var(--theme-card-bg);
    padding: 6px 14px;
    border-radius: 30px;
    border: 1px solid var(--theme-border);
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }

  @media (max-width: 768px) {
    .global-buttons-container {
      top: 10px !important;
      right: 10px !important;
      padding: 4px 8px !important;
      gap: 6px !important;
      flex-wrap: wrap !important;
      max-width: calc(100vw - 20px) !important;
      justify-content: flex-end !important;
    }
    .global-buttons-container button {
      padding: 6px 10px !important;
      font-size: 10px !important;
      height: 30px !important;
    }
    .global-btn-label { display: none !important; }
  }

  @media (max-width: 380px) {
    .global-buttons-container {
      gap: 4px !important;
      padding: 3px 6px !important;
    }
    .global-buttons-container button {
      padding: 5px 8px !important;
      font-size: 9px !important;
      height: 26px !important;
    }
  }

  /* When the emergency broadcast banner is showing, it wraps to 2 lines on
     narrow screens and grows taller — push the action bar down further so
     it never sits underneath the banner. */
  @media (max-width: 640px) {
    .global-buttons-container.gb-banner-active {
      top: 96px !important;
    }
  }
  @media (max-width: 380px) {
    .global-buttons-container.gb-banner-active {
      top: 110px !important;
    }
  }

  /* --- Page headers (Landing / Ambulance / Hospital portals) --- */
  .rl-page-header {
    flex-wrap: wrap;
    row-gap: 10px;
  }
  @media (max-width: 640px) {
    .rl-page-header {
      padding: 14px 16px !important;
    }
    .rl-page-header-right {
      text-align: left !important;
      width: 100%;
      display: flex !important;
      justify-content: flex-start !important;
    }
  }

  /* --- Two-button action rows collapse to stacked on narrow screens --- */
  .rl-two-btn-row {
    flex-wrap: wrap;
  }
  @media (max-width: 480px) {
    .rl-two-btn-row {
      flex-direction: column !important;
    }
    .rl-two-btn-row > button {
      width: 100% !important;
    }
  }

  /* --- Emergency broadcast banner: keep readable and non-overlapping on mobile --- */
  @media (max-width: 640px) {
    .rl-emergency-banner {
      flex-wrap: wrap !important;
      padding: 10px 14px !important;
    }
    .rl-emergency-banner button {
      margin-left: auto;
    }
  }

  /* --- Theme switcher: keep clear of screen edges on small phones --- */
  @media (max-width: 480px) {
    .theme-switcher-container {
      bottom: 14px !important;
      left: 14px !important;
    }
  }

  /* --- Role select & gateway cards: never overflow the viewport --- */
  @media (max-width: 480px) {
    .role-card {
      width: 100% !important;
      max-width: 320px !important;
    }
    .rl-gateway-card {
      width: 100% !important;
      max-width: 320px !important;
    }
    .rl-directory-panel {
      min-width: 0 !important;
      width: 100% !important;
    }
  }

  button.theme-switcher-btn,
  .theme-switcher-btn {
    background: var(--theme-card-bg) !important;
    border: 1.5px solid var(--theme-border) !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    width: 38px !important;
    height: 38px !important;
    min-height: 38px !important;
    padding: 0 !important;
    border-radius: 50% !important;
    color: var(--theme-accent) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transform: none !important;
    box-sizing: border-box !important;
    transition: all 0.2s ease !important;
  }
  .theme-switcher-btn:hover {
    border-color: var(--theme-accent) !important;
    box-shadow: 0 4px 16px var(--theme-accent-glow) !important;
    transform: scale(1.05) !important;
  }
  [data-theme^='light'] .theme-switcher-btn:hover {
    background: rgba(0, 0, 0, 0.05) !important;
  }

  /* Specific overrides for sidebar inputs and buttons to prevent overflow */
  .sidebar button {
    padding: 0 8px !important;
    height: 28px !important;
    min-height: 28px !important;
    border-radius: 4px !important;
    width: auto !important;
    text-transform: none !important;
    letter-spacing: normal !important;
  }

  .sidebar input {
    height: 28px !important;
    box-sizing: border-box !important;
    font-size: 10px !important;
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
  const [isRegister, setIsRegister] = useState(() => {
    const saved = localStorage.getItem(`draft_${defaultRole}_isRegister`);
    return saved !== null ? saved === 'true' : (defaultIsRegister || false);
  });
  const [isSignupSuccess, setIsSignupSuccess] = useState(false);
  
  useEffect(() => {
    localStorage.setItem(`draft_${defaultRole}_isRegister`, isRegister);
  }, [isRegister, defaultRole]);

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
  const [patientCity, setPatientCity] = useState('');

  // New Ambulance Fields
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [isSystemStandard, setIsSystemStandard] = useState(true);
  const [oxygenCapacityLiters, setOxygenCapacityLiters] = useState('0');

  // New Hospital Fields
  const [traumaTier, setTraumaTier] = useState('Tier 3');
  const [accreditationId, setAccreditationId] = useState('');

  // List of active hospitals for dropdown selection
  const [hospitalsList, setHospitalsList] = useState([]);

  // Load draft values on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem(`draft_${defaultRole}_registration`);
      if (draft) {
        const d = JSON.parse(draft);
        if (d.email) setEmail(d.email);
        if (d.password) setPassword(d.password);
        if (d.driverName) setDriverName(d.driverName);
        if (d.vehicleNo) setVehicleNo(d.vehicleNo);
        if (d.contactInfo) setContactInfo(d.contactInfo);
        if (d.type) setType(d.type);
        if (d.hospitalName) setHospitalName(d.hospitalName);
        if (d.hospitalContact) setHospitalContact(d.hospitalContact);
        if (d.lat) setLat(d.lat);
        if (d.lng) setLng(d.lng);
        if (d.totalBeds) setTotalBeds(d.totalBeds);
        if (d.icuBeds) setIcuBeds(d.icuBeds);
        if (d.ventilators) setVentilators(d.ventilators);
        if (d.licenseNumber) setLicenseNumber(d.licenseNumber);
        if (d.departments) setDepartments(d.departments);
        if (d.bayCapacity) setBayCapacity(d.bayCapacity);
        if (d.adminEmail) setAdminEmail(d.adminEmail);
        if (d.hospitalId) setHospitalId(d.hospitalId);
        if (d.equipmentChecklist) setEquipmentChecklist(d.equipmentChecklist);
        if (d.crewMembers) setCrewMembers(d.crewMembers);
        if (d.abhaAddress) setAbhaAddress(d.abhaAddress);
        if (d.bloodGroup) setBloodGroup(d.bloodGroup);
        if (d.allergies) setAllergies(d.allergies);
        if (d.chronicConditions) setChronicConditions(d.chronicConditions);
        if (d.dob) setDob(d.dob);
        if (d.gender) setGender(d.gender);
        if (d.emergencyContactName) setEmergencyContactName(d.emergencyContactName);
        if (d.emergencyContactRelationship) setEmergencyContactRelationship(d.emergencyContactRelationship);
        if (d.emergencyContactPhone) setEmergencyContactPhone(d.emergencyContactPhone);
        if (d.insuranceProvider) setInsuranceProvider(d.insuranceProvider);
        if (d.policyNumber) setPolicyNumber(d.policyNumber);
        if (d.groupNumber) setGroupNumber(d.groupNumber);
        if (d.consentToShareData) setConsentToShareData(d.consentToShareData);
        if (d.licenseExpiry) setLicenseExpiry(d.licenseExpiry);
        if (d.isSystemStandard !== undefined) setIsSystemStandard(d.isSystemStandard);
        if (d.oxygenCapacityLiters) setOxygenCapacityLiters(d.oxygenCapacityLiters);
        if (d.traumaTier) setTraumaTier(d.traumaTier);
        if (d.accreditationId) setAccreditationId(d.accreditationId);
      }
    } catch (e) {
      console.warn('Failed to parse draft registration values', e);
    }
  }, [defaultRole]);

  // Persist draft values on change
  useEffect(() => {
    const data = {
      email, password, driverName, vehicleNo, contactInfo, type, hospitalName, hospitalContact, lat, lng,
      totalBeds, icuBeds, ventilators, licenseNumber, departments, bayCapacity, adminEmail,
      hospitalId, equipmentChecklist, crewMembers, abhaAddress, bloodGroup, allergies,
      chronicConditions, dob, gender, emergencyContactName, emergencyContactRelationship,
      emergencyContactPhone, insuranceProvider, policyNumber, groupNumber, consentToShareData,
      licenseExpiry, isSystemStandard, oxygenCapacityLiters, traumaTier, accreditationId
    };
    localStorage.setItem(`draft_${defaultRole}_registration`, JSON.stringify(data));
  }, [
    email, password, driverName, vehicleNo, contactInfo, type, hospitalName, hospitalContact, lat, lng,
    totalBeds, icuBeds, ventilators, licenseNumber, departments, bayCapacity, adminEmail,
    hospitalId, equipmentChecklist, crewMembers, abhaAddress, bloodGroup, allergies,
    chronicConditions, dob, gender, emergencyContactName, emergencyContactRelationship,
    emergencyContactPhone, insuranceProvider, policyNumber, groupNumber, consentToShareData,
    licenseExpiry, isSystemStandard, oxygenCapacityLiters, traumaTier, accreditationId,
    defaultRole
  ]);

  // Clean draft function
  const clearDraft = () => {
    localStorage.removeItem(`draft_${defaultRole}_registration`);
    localStorage.removeItem(`draft_${defaultRole}_regQrCode`);
    localStorage.removeItem(`draft_${defaultRole}_regTempSecret`);
    localStorage.removeItem(`draft_${defaultRole}_isRegister`);
    setEmail('');
    setPassword('');
    setDriverName('');
    setVehicleNo('');
    setContactInfo('');
    setHospitalName('');
    setHospitalContact('');
  };

  useEffect(() => {
    fetch(`${SERVER_URL}/api/hospitals`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setHospitalsList(data);
        } else {
          setHospitalsList([
            { id: 'hosp-1', name: 'Apollo Trauma & Emergency Center' },
            { id: 'hosp-2', name: 'City General Hospital' },
            { id: 'hosp-3', name: 'Max Super Speciality Hospital' },
            { id: 'hosp-4', name: 'Fortis Acute Care Unit' }
          ]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch hospitals list', err);
        setHospitalsList([
          { id: 'hosp-1', name: 'Apollo Trauma & Emergency Center' },
          { id: 'hosp-2', name: 'City General Hospital' },
          { id: 'hosp-3', name: 'Max Super Speciality Hospital' },
          { id: 'hosp-4', name: 'Fortis Acute Care Unit' }
        ]);
      });
  }, []);

  const [regQrCode, setRegQrCode] = useState(() => localStorage.getItem(`draft_${defaultRole}_regQrCode`) || '');
  const [regTempSecret, setRegTempSecret] = useState(() => localStorage.getItem(`draft_${defaultRole}_regTempSecret`) || '');
  const [regVerifyCode, setRegVerifyCode] = useState('');

  useEffect(() => {
    if (regQrCode) localStorage.setItem(`draft_${defaultRole}_regQrCode`, regQrCode);
    else localStorage.removeItem(`draft_${defaultRole}_regQrCode`);
  }, [regQrCode, defaultRole]);

  useEffect(() => {
    if (regTempSecret) localStorage.setItem(`draft_${defaultRole}_regTempSecret`, regTempSecret);
    else localStorage.removeItem(`draft_${defaultRole}_regTempSecret`);
  }, [regTempSecret, defaultRole]);

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
        ? { email, password, bypassMFA: true }
        : { id: email, password, bypassMFA: true };
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
      localStorage.setItem('rescuelink_token', data.token);
      localStorage.setItem('rescuelink_user', JSON.stringify(data.user));

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

      onLoginSuccess(viewRole, data.token, data.user);
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
        payload = { name: driverName, email, password, mobile: contactInfo, city: patientCity, abhaNumber: vehicleNo, abhaAddress, bloodGroup, allergies, chronicConditions, dob, gender, emergencyContactName, emergencyContactRelationship, emergencyContactPhone, insuranceProvider, policyNumber, groupNumber, consentToShareData };
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
        const finalEmail = (adminEmail && adminEmail.trim().includes('@'))
          ? adminEmail.trim().toLowerCase()
          : `${hospitalName.replace(/\s+/g, '').toLowerCase()}@rescuelink.com`;
        payload = { email: finalEmail, password };
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
      clearDraft();
      setRegQrCode('');
      setRegTempSecret('');
      setRegVerifyCode('');
      setIsSignupSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerGuestEmergencySOS = async () => {
    const promptedPhone = window.prompt("🚨 EMERGENCY SOS DISPATCH\n\nPlease enter your contact phone number to coordinate with the ambulance driver:", "");
    if (promptedPhone === null) return; // User cancelled prompt

    const cleanPhone = promptedPhone ? promptedPhone.trim() : '';
    const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
    if (!cleanPhone || digitsOnly.length < 10) {
      alert("❌ A valid contact phone number (at least 10 digits) is required for guest emergency dispatch.");
      return;
    }

    const promptedName = window.prompt("Please enter your name (Optional):", "Guest SOS Patient");

    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/guest-emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, name: promptedName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Guest login failed');

      sessionStorage.setItem('rescuelink_token', data.token);
      sessionStorage.setItem('rescuelink_user', JSON.stringify(data.user));
      sessionStorage.setItem('guest_auto_sos', 'true'); // Flag to auto-trigger dispatch on dashboard load
      localStorage.setItem('rescuelink_token', data.token);
      localStorage.setItem('rescuelink_user', JSON.stringify(data.user));
      localStorage.setItem('guest_auto_sos', 'true');
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
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      background: 'rgba(5,13,26,0.92)', backdropFilter: 'blur(8px)',
      fontFamily: "'Rajdhani', sans-serif", padding: '40px 10px',
      overflowY: 'auto'
    }}>
      <div className="rl-card rl-modal-card" style={{ width: '100%', maxWidth: 480, padding: '28px 24px 32px 24px', position: 'relative', margin: 'auto' }}>
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

        {isSignupSuccess ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <h3 style={{ fontFamily: "'Orbitron'", color: '#00ff88', fontSize: 16, margin: '8px 0', fontWeight: 'bold' }}>REGISTRATION SUCCESSFUL</h3>
            <p style={{ color: 'rgba(160,200,255,0.8)', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Your two-factor authentication has been successfully configured.
            </p>
            <button
              onClick={() => {
                setIsSignupSuccess(false);
                setIsRegister(false);
                setMessage('');
                setError('');
              }}
              className="rl-btn-primary"
              style={{ width: '100%' }}
            >
              GO TO LOGIN
            </button>
          </div>
        ) : regQrCode ? (
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
                  <button type="button" onClick={triggerGuestEmergencySOS} style={{ width: '100%', marginTop: 8, padding: '12px', background: 'linear-gradient(135deg, #ff3333, #aa0000)', border: '1px solid #ff4444', color: '#fff', borderRadius: 6, fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,0,0,0.3)', letterSpacing: '0.05em' }}>
                    🚨 GUEST EMERGENCY DISPATCH (NO LOGIN)
                  </button>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: '#00c8ff', fontFamily: "'Share Tech Mono'" }}>CITY / RESIDENTIAL LOCATION (FOR EMERGENCY MAP PIN)</label>
                      <input type="text" value={patientCity} onChange={(e) => setPatientCity(e.target.value)} placeholder="e.g. Mumbai, Bengaluru, Pune" className="rl-input" style={{ width: '100%', boxSizing: 'border-box' }} />
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
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchAmbulances();
    }, 60000);
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
      <header className="rl-page-header" style={{
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
        <button onClick={onBack} className="rl-btn-secondary rl-page-header-right" style={{ padding: '8px 16px', fontSize: 11 }}>
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
          <div className="rl-two-btn-row" style={{ display: 'flex', gap: 16 }}>
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
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchHospitals();
    }, 60000);
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
      <header className="rl-page-header" style={{
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
        <button onClick={onBack} className="rl-btn-secondary rl-page-header-right" style={{ padding: '8px 16px', fontSize: 11 }}>
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
          <div className="rl-two-btn-row" style={{ display: 'flex', gap: 16 }}>
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
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchRegistry();
    }, 60000);
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

      {/* Centered cross emblem */}
      <div style={{ position: 'relative', width: 96, height: 96, margin: '40px auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
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
          position: 'absolute', inset: 0,
          border: '1px solid rgba(0,200,255,0.2)',
          borderRadius: '50%',
          animation: 'holo-rotate 8s linear infinite',
          borderTop: '1px solid rgba(0,200,255,0.6)',
        }} />
      </div>

      {/* Hero section */}
      <div style={{ textShadow: '0 0 10px rgba(0,0,0,0.5)', padding: '10px 20px 30px', textAlign: 'center', zIndex: 1 }}>
        <h1 style={{
          fontFamily: "'Orbitron', monospace", fontSize: 'clamp(18px, 4vw, 28px)',
          fontWeight: 900, letterSpacing: '0.15em',
          color: '#00c8ff',
          textShadow: '0 0 20px rgba(0,200,255,0.6)',
          margin: '0 0 12px'
        }}>
          RESCUELINK EMERGENCY CARE SYSTEM
        </h1>
        <p style={{ color: 'rgba(160,200,255,0.5)', fontSize: 13, letterSpacing: '0.3em', marginTop: 8, fontFamily: "'Share Tech Mono'", textTransform: 'uppercase', marginBottom: 20 }}>
          NATIONAL HEALTH MISSION — EMERGENCY CONNECTIVITY
        </p>

        {/* Status bar */}
        <div style={{
          display: 'flex', gap: 24, margin: '0 auto 40px', padding: '8px 24px',
          border: '1px solid rgba(0,200,255,0.15)', borderRadius: 4,
          background: 'rgba(0,200,255,0.03)', width: 'fit-content', justifyContent: 'center'
        }}>
          {[
            ['SYSTEM', 'ONLINE', '#00ff88'],
            ['NETWORK', 'ACTIVE', '#00c8ff'],
            ['ALERT', 'STANDBY', '#ffb800']
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', letterSpacing: '0.2em', fontFamily: "'Share Tech Mono'" }}>{label}</div>
              <div style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "'Share Tech Mono'", animation: 'pulse-glow 2s ease infinite' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Gateways Grid */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1200, margin: '0 auto 40px' }}>
          {[
            { role: 'user', emoji: '🧍', title: 'EMERGENCY SOS', desc: 'Instant AI triage, location mapping, and telemetry request.', color: '#00ff88' },
            { role: 'ambulance', emoji: '🚑', title: 'PARAMEDIC HUB', desc: 'Driver active duty toggle, vitals streaming, and ER routing.', color: '#ff6b35' },
            { role: 'hospital', emoji: '🏥', title: 'HOSPITAL COMMAND', desc: 'ER bed tracking, doctor assignments, and locks verification.', color: '#00c8ff' },
            { role: 'admin', emoji: '🏛️', title: 'WAR ROOM COMMAND', desc: 'Disaster coordinator, spatial logs, and audit logs viewer.', color: '#cc00ff' },
            { role: 'family', emoji: '👨‍👩‍👧', title: 'FAMILY TRACKER', desc: 'Real-time telemetry, location, and status mapping for families.', color: '#ffb800' }
          ].map(g => (
            <div key={g.role} onClick={() => onSelectRole(g.role)} className="rl-card rl-gateway-card" style={{
              width: 210, maxWidth: '100%', padding: 24, cursor: 'pointer', display: 'flex', flexDirection: 'column',
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
          <div className="rl-card rl-directory-panel" style={{ flex: 1, minWidth: 340, padding: 24 }}>
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
          <div className="rl-card rl-directory-panel" style={{ flex: 1, minWidth: 340, padding: 24 }}>
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
      fontFamily: "'Rajdhani', sans-serif",
      padding: '16px', boxSizing: 'border-box', overflowY: 'auto'
    }}>
      <div style={{
        width: '100%', maxWidth: 500, padding: 32,
        background: 'rgba(10,22,48,0.95)',
        border: '1px solid rgba(0,200,255,0.4)',
        borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        position: 'relative', maxHeight: '90vh', overflowY: 'auto',
        margin: 'auto'
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
      localStorage.setItem('rescuelink_token', urlToken);
      return urlToken;
    }
    const savedToken = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('rescuelink_token');
    const savedUser = sessionStorage.getItem('rescuelink_user') || localStorage.getItem('rescuelink_user');
    if (savedToken && savedUser) {
      if (!sessionStorage.getItem('rescuelink_token')) {
        sessionStorage.setItem('rescuelink_token', savedToken);
      }
      if (!sessionStorage.getItem('rescuelink_user')) {
        sessionStorage.setItem('rescuelink_user', savedUser);
      }
      return savedToken;
    }
    sessionStorage.removeItem('rescuelink_token');
    sessionStorage.removeItem('rescuelink_user');
    localStorage.removeItem('rescuelink_token');
    localStorage.removeItem('rescuelink_user');
    return null;
  });

  const [role, setRole] = useState(() => {
    const hash = window.location.hash.replace('#', '').split('/')[0];
    if (['user', 'ambulance', 'hospital', 'admin', 'family', 'corridor'].includes(hash)) {
      return hash;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const urlRole = urlParams.get('role');
    if (urlRole) {
      sessionStorage.setItem('rescueLinkRole', urlRole);
      localStorage.setItem('rescueLinkRole', urlRole);
      return urlRole;
    }
    const savedUserStr = sessionStorage.getItem('rescuelink_user') || localStorage.getItem('rescuelink_user');
    if (savedUserStr) {
      try {
        const u = JSON.parse(savedUserStr);
        let derivedRole = 'user';
        if (u.role === 'doctor' || u.role === 'hospital_admin') derivedRole = 'hospital';
        else if (u.role === 'paramedic') derivedRole = 'ambulance';
        else if (u.role === 'city_admin') derivedRole = 'admin';
        else if (u.role === 'family') derivedRole = 'family';
        else if (u.role === 'patient') derivedRole = 'user';
        sessionStorage.setItem('rescueLinkRole', derivedRole);
        localStorage.setItem('rescueLinkRole', derivedRole);
        return derivedRole;
      } catch (e) {}
    }
    return sessionStorage.getItem('rescueLinkRole') || localStorage.getItem('rescueLinkRole') || null;
  });

  const [familyReqId] = useState(() => new URLSearchParams(window.location.search).get('reqId'));
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('rescue_theme');
    if (stored === 'light-sky-breeze' || stored === 'dark-sky-breeze') return stored;
    // Migrate any old/removed theme ids to the two supported themes
    if (stored && stored.startsWith('light')) return 'light-sky-breeze';
    if (stored && stored.startsWith('dark')) return 'dark-sky-breeze';
    return 'dark-sky-breeze';
  });
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
    localStorage.setItem('rescue_theme', theme);
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Dynamic bookmarkable URL Hash Routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      const parsedRole = hash.split('/')[0];
      if (['user', 'ambulance', 'hospital', 'admin', 'family', 'corridor'].includes(parsedRole)) {
        setRole(parsedRole);
        sessionStorage.setItem('rescueLinkRole', parsedRole);
      } else if (!hash) {
        const savedRole = sessionStorage.getItem('rescueLinkRole') || localStorage.getItem('rescueLinkRole');
        const savedToken = sessionStorage.getItem('rescuelink_token') || localStorage.getItem('rescuelink_token');
        if (savedRole && savedToken) {
          window.location.hash = savedRole;
          setRole(savedRole);
        } else {
          setRole(null);
          sessionStorage.removeItem('rescueLinkRole');
        }
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
        localStorage.removeItem('rescuelink_token');
        localStorage.removeItem('rescuelink_user');
        localStorage.removeItem('rescueLinkRole');
        window.location.reload();
      }
    });

    return () => newSocket.disconnect();
  }, [role, token]);

  const handleLoginSuccess = (viewRole, userToken, user) => {
    setToken(userToken);
    setRole(viewRole);
    sessionStorage.setItem('rescueLinkRole', viewRole);
    localStorage.setItem('rescueLinkRole', viewRole);
    localStorage.setItem('rescuelink_token', userToken);
    if (user) {
      sessionStorage.setItem('rescuelink_user', JSON.stringify(user));
      localStorage.setItem('rescuelink_user', JSON.stringify(user));
    }
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
    localStorage.removeItem('rescuelink_token');
    localStorage.removeItem('rescuelink_user');
    localStorage.removeItem('rescueLinkRole');
    setRole(null);
    setToken(null);
  };

  const ThemeSwitcher = () => (
    <div
      className="theme-switcher-container"
      style={{
        position: 'fixed', bottom: 25, right: 25, zIndex: 11000,
        display: 'flex', alignItems: 'center',
        background: 'transparent',
        border: 'none',
        padding: 0,
        boxShadow: 'none',
        backdropFilter: 'none',
        transition: 'all 0.3s ease',
        height: '38px',
        boxSizing: 'border-box'
      }}
    >
      {/* Sun/Moon Toggle */}
      <button
        className="theme-switcher-btn"
        onClick={() => {
          setTheme(theme === 'dark-sky-breeze' ? 'light-sky-breeze' : 'dark-sky-breeze');
        }}
        title={`Switch to ${theme.startsWith('dark') ? 'Light' : 'Dark'} Mode`}
      >
        {theme.startsWith('dark') ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        )}
      </button>
    </div>
  );

  if (mfaSetupToken) {
    return (
      <div className="app-root">
        <style>{styles}</style>
        <MfaSetupScreen
          setupToken={mfaSetupToken}
          onComplete={() => setMfaSetupToken(null)}
          onCancel={() => setMfaSetupToken(null)}
        />
        <ThemeSwitcher />
      </div>
    );
  }

  if (mfaVerifyToken) {
    return (
      <div className="app-root">
        <style>{styles}</style>
        <MfaVerifyScreen
          mfaToken={mfaVerifyToken}
          onLoginSuccess={handleLoginSuccess}
          onCancel={() => setMfaVerifyToken(null)}
          ParticleCanvas={ParticleCanvas}
        />
        <ThemeSwitcher />
      </div>
    );
  }

  if (!token || !role) {
    if (currentHash === '#select-role') {
      return (
        <div className="app-root">
          <style>{styles}</style>
          <RoleSelector onSelect={(selRole) => {
            sessionStorage.setItem('rescueLinkRole', selRole);
            setRole(selRole);
            window.location.hash = selRole;
          }} />
          <ThemeSwitcher />
        </div>
      );
    }

    if (currentHash === '#ambulance' || loginTargetRole === 'ambulance') {
      return (
        <div className="app-root">
          <style>{styles}</style>
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
          <ThemeSwitcher />
        </div>
      );
    }

    if (currentHash === '#hospital' || loginTargetRole === 'hospital') {
      return (
        <div className="app-root">
          <style>{styles}</style>
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
          <ThemeSwitcher />
        </div>
      );
    }

    return (
      <div className="app-root">
        <style>{styles}</style>
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
        <ThemeSwitcher />
      </div>
    );
  }

  return (
    <div className="app-root">
      <style>{styles}</style>
      <div className="scanline" />

      <ThemeSwitcher />
      <SimulationDashboard />

      {role === 'user' && (
        <UserDashboard 
          socket={socket} 
          connected={connected} 
          onLogout={handleLogout}
          onSwitchRole={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = 'select-role';
          }}
          onShowSecurity={() => setShowSecurityModal(true)}
        />
      )}
      {role === 'ambulance' && (
        <AmbulanceStreamer 
          socket={socket} 
          connected={connected} 
          onLogout={handleLogout}
          onSwitchRole={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = 'select-role';
          }}
          onShowSecurity={() => setShowSecurityModal(true)}
        />
      )}
      {role === 'hospital' && (
        <HospitalDashboard 
          socket={socket} 
          connected={connected} 
          onLogout={handleLogout}
          onSwitchRole={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = 'select-role';
          }}
          onShowSecurity={() => setShowSecurityModal(true)}
        />
      )}
      {role === 'admin' && (
        <WarRoom 
          socket={socket} 
          connected={connected} 
          onLogout={handleLogout}
          onSwitchRole={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = 'select-role';
          }}
          onShowSecurity={() => setShowSecurityModal(true)}
        />
      )}
      {role === 'family' && (
        <FamilyDashboard 
          socket={socket} 
          connected={connected} 
          reqId={familyReqId} 
          onLogout={handleLogout}
          onSwitchRole={() => {
            sessionStorage.removeItem('rescueLinkRole');
            setRole(null);
            window.location.hash = 'select-role';
          }}
          onShowSecurity={() => setShowSecurityModal(true)}
        />
      )}
      {role === 'corridor' && (
        <CorridorPanel 
          socket={socket} 
          connected={connected} 
          mode="warroom"
          onBack={handleLogout}
        />
      )}

      {emergencyBroadcast && (
        <div className="rl-emergency-banner" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
          background: 'linear-gradient(90deg, #ff1e1e 0%, #b30000 100%)',
          borderBottom: '2px solid #ff3333', color: '#fff', padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 4px 20px rgba(255,0,0,0.4)', fontFamily: "'Orbitron', sans-serif"
        }}>
          <span style={{ fontSize: 20, animation: 'pulse-opacity 1s infinite', flexShrink: 0 }}>🚨</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', letterSpacing: '0.1em' }}>CRITICAL EMERGENCY BROADCAST FROM WAR ROOM</div>
            <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2, wordBreak: 'break-word' }}>{emergencyBroadcast}</div>
          </div>
          <button
            onClick={() => setEmergencyBroadcast(null)}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, color: '#fff', fontSize: 10, padding: '6px 12px', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold', flexShrink: 0 }}
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