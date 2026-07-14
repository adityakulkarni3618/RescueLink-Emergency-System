import React, { useState, useRef, useEffect } from 'react';

const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

const SEVERITY_COLORS = {
  CRITICAL: { bg: 'rgba(255,30,30,0.15)', border: '#ff3333', text: '#ff5555', badge: '#ff2222' },
  HIGH: { bg: 'rgba(255,107,53,0.15)', border: '#ff6b35', text: '#ff8855', badge: '#ff6b35' },
  MEDIUM: { bg: 'rgba(255,184,0,0.12)', border: '#ffb800', text: '#ffcc44', badge: '#ffb800' },
  LOW: { bg: 'rgba(0,255,136,0.1)', border: '#00ff88', text: '#00ff88', badge: '#00ff88' },
};

const TRIAGE_COLORS = { RED: '#ff3333', YELLOW: '#ffb800', GREEN: '#00ff88' };

// Brain pulse animation (CSS-only 3D neural network)
function BrainAnimation() {
  return (
    <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 20px' }}>
      <style>{`
        @keyframes brainPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(0,200,255,0.6)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 25px rgba(0,200,255,1)); }
        }
        @keyframes neuronFire {
          0% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0.2; transform: scale(0.8); }
        }
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ fontSize: 50, textAlign: 'center', animation: 'brainPulse 1.5s ease-in-out infinite' }}>🧠</div>
      <div style={{
        position: 'absolute', inset: -10, border: '2px dashed rgba(0,200,255,0.4)',
        borderRadius: '50%', animation: 'orbitRing 3s linear infinite'
      }} />
      <div style={{
        position: 'absolute', inset: -20, border: '1px dashed rgba(0,200,255,0.2)',
        borderRadius: '50%', animation: 'orbitRing 5s linear infinite reverse'
      }} />
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <div key={i} style={{
          position: 'absolute', width: 6, height: 6, borderRadius: '50%',
          background: '#00c8ff', top: '50%', left: '50%',
          transform: `rotate(${deg}deg) translateX(35px)`,
          animation: `neuronFire 1.5s ${i * 0.25}s ease-in-out infinite`
        }} />
      ))}
    </div>
  );
}

export default function AIEmergencyCopilot({ onAnalysisComplete, onClose }) {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const QUICK_PROMPTS = [
    "My father has severe chest pain and is sweating",
    "Person unconscious, not breathing",
    "Major car accident, person bleeding heavily",
    "Severe difficulty breathing, choking",
    "Sudden face drooping and arm weakness",
    "Child burned by hot water",
  ];

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Voice input not supported in this browser.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInputText(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
  };

  const analyze = async (text = inputText) => {
    if (!text.trim()) return;
    setIsAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/ai/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: text })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch(err) {
      setError('AI analysis failed. Please describe the emergency manually.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const confirmAndApply = () => {
    if (result && onAnalysisComplete) {
      onAnalysisComplete(result, inputText);
    }
    if (onClose) onClose();
  };

  const colors = result ? (SEVERITY_COLORS[result.severity] || SEVERITY_COLORS.MEDIUM) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,5,20,0.92)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(12px)', fontFamily: "'Rajdhani', sans-serif"
    }}>
      <style>{`
        @keyframes slideInUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
        @keyframes resultReveal { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        @keyframes typingDot { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
      `}</style>
      <div style={{
        width: '95%', maxWidth: 680, maxHeight: '92vh', overflowY: 'auto',
        background: 'linear-gradient(135deg, rgba(5,15,40,0.98), rgba(10,25,60,0.98))',
        borderRadius: 20, border: '1px solid rgba(0,200,255,0.3)',
        boxShadow: '0 0 80px rgba(0,200,255,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
        animation: 'slideInUp 0.4s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px', borderBottom: '1px solid rgba(0,200,255,0.15)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(0,200,255,0.03)'
        }}>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.1em' }}>
              🧠 AI EMERGENCY COPILOT
            </div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.5)', marginTop: 4, fontFamily: "'Share Tech Mono'" }}>
              Powered by AI Triage Engine • Real-time symptom analysis
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: 8, padding: '8px 12px', color: '#ff4444', cursor: 'pointer', fontSize: 18
          }}>×</button>
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Input Section */}
          {!result && (
            <>
              <BrainAnimation />
              <div style={{ fontSize: 14, color: 'rgba(160,200,255,0.8)', textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
                Describe the emergency in plain language.<br />
                <span style={{ color: '#00c8ff' }}>The AI will analyze symptoms and recommend immediate action.</span>
              </div>

              {/* Quick Prompts */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Orbitron'", marginBottom: 8, letterSpacing: '0.1em' }}>QUICK SCENARIOS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {QUICK_PROMPTS.map((p, i) => (
                    <button key={i} onClick={() => { setInputText(p); analyze(p); }}
                      style={{
                        padding: '6px 12px', background: 'rgba(0,200,255,0.08)',
                        border: '1px solid rgba(0,200,255,0.2)', borderRadius: 20,
                        color: 'rgba(160,200,255,0.8)', fontSize: 11, cursor: 'pointer',
                        transition: 'all 0.2s', fontFamily: "'Rajdhani'"
                      }}>
                      {p.slice(0, 35)}...
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ position: 'relative', marginBottom: 16 }}>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Example: My grandfather is having chest pain and sweating, breathing is difficult..."
                  rows={4}
                  style={{
                    width: '100%', background: 'rgba(0,200,255,0.05)',
                    border: '1px solid rgba(0,200,255,0.3)', borderRadius: 12,
                    padding: '14px 50px 14px 16px', color: '#e0eaff', fontSize: 14,
                    resize: 'none', outline: 'none', boxSizing: 'border-box',
                    fontFamily: "'Rajdhani'", lineHeight: 1.5
                  }}
                />
                <button onClick={startListening} style={{
                  position: 'absolute', right: 12, top: 12, background: isListening ? 'rgba(255,68,68,0.2)' : 'rgba(0,200,255,0.1)',
                  border: `1px solid ${isListening ? '#ff4444' : 'rgba(0,200,255,0.3)'}`, borderRadius: 8,
                  padding: '8px', color: isListening ? '#ff4444' : '#00c8ff', cursor: 'pointer', fontSize: 18,
                  animation: isListening ? 'pulse 1s infinite' : 'none'
                }}>
                  {isListening ? '🛑' : '🎤'}
                </button>
              </div>

              {error && (
                <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#ff6666', fontSize: 12, marginBottom: 12 }}>
                  ⚠️ {error}
                </div>
              )}

              <button onClick={() => analyze()} disabled={!inputText.trim() || isAnalyzing}
                style={{
                  width: '100%', padding: '16px', borderRadius: 12, cursor: 'pointer',
                  background: isAnalyzing ? 'rgba(0,200,255,0.1)' : 'linear-gradient(135deg, rgba(0,200,255,0.25), rgba(0,100,255,0.2))',
                  border: `2px solid ${isAnalyzing ? 'rgba(0,200,255,0.3)' : '#00c8ff'}`,
                  color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.1em', transition: 'all 0.3s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
                }}>
                {isAnalyzing ? (
                  <>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#00c8ff', animation: `typingDot 1.2s ${i*0.4}s ease-in-out infinite` }} />)}
                    </div>
                    ANALYZING SYMPTOMS...
                  </>
                ) : '🔍 ANALYZE WITH AI'}
              </button>
            </>
          )}

          {/* Result Section */}
          {result && colors && (
            <div style={{ animation: 'resultReveal 0.4s ease' }}>
              {/* Triage Badge */}
              <div style={{
                background: colors.bg, border: `2px solid ${colors.border}`,
                borderRadius: 16, padding: '20px', marginBottom: 20, textAlign: 'center',
                boxShadow: `0 0 30px ${colors.border}33`
              }}>
                <div style={{
                  display: 'inline-block', padding: '6px 20px', background: colors.badge,
                  borderRadius: 20, color: '#000', fontFamily: "'Orbitron'", fontSize: 11,
                  fontWeight: 900, letterSpacing: '0.15em', marginBottom: 12
                }}>
                  {result.severity} SEVERITY — {result.triageColor} TRIAGE
                </div>
                <div style={{ fontSize: 22, color: colors.text, fontWeight: 700, marginBottom: 8 }}>
                  {result.detectedCondition}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.8)', lineHeight: 1.5 }}>
                  {result.urgentMessage}
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,107,53,0.7)', fontFamily: "'Orbitron'", marginBottom: 6 }}>AMBULANCE TYPE</div>
                  <div style={{ fontSize: 16, color: '#ff6b35', fontWeight: 700 }}>
                    🚑 {result.suggestedAmbulanceType === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,107,53,0.5)', marginTop: 4 }}>{result.suggestedAmbulanceType} Required</div>
                </div>
                <div style={{ background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: 'rgba(0,200,255,0.7)', fontFamily: "'Orbitron'", marginBottom: 6 }}>HOSPITAL TYPE</div>
                  <div style={{ fontSize: 16, color: '#00c8ff', fontWeight: 700 }}>
                    🏥 {result.suggestedHospitalType}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(0,200,255,0.5)', marginTop: 4 }}>Specialist facility recommended</div>
                </div>
              </div>

              {/* Time to Deterioration */}
              <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,184,0,0.7)', fontFamily: "'Orbitron'", marginBottom: 6 }}>⏱ CRITICAL TIME WINDOW</div>
                <div style={{ fontSize: 18, color: '#ffb800', fontWeight: 700 }}>{result.estimatedTimeToDeterioration}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,184,0,0.5)', marginTop: 2 }}>Estimated time to significant deterioration if untreated</div>
              </div>

              {/* Immediate Actions */}
              <div style={{ background: 'rgba(5,15,40,0.8)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#00c8ff', fontFamily: "'Orbitron'", marginBottom: 12, letterSpacing: '0.1em' }}>⚡ IMMEDIATE ACTIONS (Do Now)</div>
                {(result.immediateActions || []).map((action, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8,
                    padding: '8px 12px', background: 'rgba(0,200,255,0.04)',
                    borderRadius: 6, borderLeft: '3px solid rgba(0,200,255,0.4)'
                  }}>
                    <div style={{ color: '#00c8ff', fontWeight: 700, fontSize: 14, minWidth: 20, fontFamily: "'Share Tech Mono'" }}>{i + 1}.</div>
                    <div style={{ fontSize: 13, color: 'rgba(220,230,255,0.9)', lineHeight: 1.4 }}>{action}</div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => { setResult(null); setInputText(''); }}
                  style={{
                    flex: 1, padding: 14, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                    color: 'rgba(160,200,255,0.7)', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
                  }}>
                  ← RE-ANALYZE
                </button>
                <button onClick={confirmAndApply}
                  style={{
                    flex: 2, padding: 14, cursor: 'pointer', borderRadius: 10,
                    background: `linear-gradient(135deg, ${colors.border}44, ${colors.border}22)`,
                    border: `2px solid ${colors.border}`,
                    color: colors.text, fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700, letterSpacing: '0.1em'
                  }}>
                  ✅ CONFIRM & REQUEST DISPATCH
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
