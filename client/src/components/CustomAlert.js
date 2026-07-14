import React from 'react';

export default function CustomAlert({ title, message, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,5,15,0.8)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#0a1526', border: '1px solid #00c8ff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 0 30px rgba(0,200,255,0.2)', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.9)', marginBottom: 24, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message}</div>
        <button onClick={onClose} style={{
          background: 'rgba(0,200,255,0.1)', color: '#00c8ff', border: '1px solid rgba(0,200,255,0.3)', padding: '10px 24px', borderRadius: 6,
          fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%'
        }}>ACKNOWLEDGE</button>
      </div>
    </div>
  );
}
