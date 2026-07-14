import React, { useState, useEffect, useRef } from 'react';

// CPR Audio Engine using Web Audio API
let audioCtx = null;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playBeep(frequency = 880, duration = 0.1, volume = 0.4) {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = frequency; osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

const CPR_STEPS = [
  { id: 1, icon: '🔍', title: 'CHECK RESPONSE', desc: 'Tap shoulders firmly and shout "Are you OK?"', detail: 'If no response, call for help immediately. Note the time.' },
  { id: 2, icon: '📞', title: 'CALL FOR HELP', desc: 'Dial 108 or send someone to call', detail: 'Put phone on speaker. Do NOT leave the patient alone.' },
  { id: 3, icon: '🫁', title: 'CHECK BREATHING', desc: 'Look, listen, feel for 10 seconds', detail: 'Tilt head back, lift chin. If not breathing normally, begin CPR.' },
  { id: 4, icon: '🤜', title: 'CHEST COMPRESSIONS', desc: 'Push hard and fast in the center of the chest', detail: 'Arms straight, elbows locked. Compress 5-6cm deep at 100-120/min.' },
  { id: 5, icon: '💨', title: 'RESCUE BREATHS', desc: 'Give 2 breaths after every 30 compressions', detail: 'Seal your mouth over theirs. Blow steadily for 1 second. Watch for chest rise.' },
  { id: 6, icon: '⚡', title: 'USE AED IF AVAILABLE', desc: 'Turn on AED and follow voice instructions', detail: 'Do not touch patient when AED is analyzing or delivering shock.' },
];

// Animated heart component
function HeartCompressionVisual({ isCompressing, compressionCount, bpm }) {
  const phase = isCompressing ? 'compress' : 'release';
  return (
    <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
      <style>{`
        @keyframes heartCompress {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 15px rgba(255,50,50,0.7)); }
          50% { transform: scale(0.82); filter: drop-shadow(0 0 30px rgba(255,50,50,1)); }
        }
        @keyframes heartRelease {
          0%, 100% { transform: scale(0.9); }
          50% { transform: scale(1.05); filter: drop-shadow(0 0 20px rgba(255,100,100,0.9)); }
        }
        @keyframes rippleOut {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes countBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
      `}</style>
      {/* Ripple rings */}
      {isCompressing && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: '15%',
          border: '2px solid rgba(255,50,50,0.4)',
          borderRadius: '50%',
          animation: `rippleOut 1s ${i * 0.33}s ease-out infinite`
        }} />
      ))}
      {/* Heart */}
      <div style={{
        fontSize: 100, textAlign: 'center', lineHeight: '160px',
        animation: `${phase === 'compress' ? 'heartCompress' : 'heartRelease'} ${60000 / bpm}ms ease-in-out infinite`
      }}>❤️</div>
      {/* Compression count */}
      <div style={{
        position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
        fontFamily: "'Orbitron'", fontSize: 28, fontWeight: 900, color: '#ff4444',
        textShadow: '0 0 15px rgba(255,50,50,0.8)',
        animation: 'countBounce 0.3s ease', key: compressionCount
      }}>
        {compressionCount}
      </div>
    </div>
  );
}

export default function CPRGuidance({ onSOS, onClose }) {
  const [step, setStep] = useState(0); // 0 = intro, 1-6 = steps
  const [isRunning, setIsRunning] = useState(false);
  const [compressionCount, setCompressionCount] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bpm, setBpm] = useState(110); // Target 100-120
  const [isCompressing, setIsCompressing] = useState(false);
  const [phase, setPhase] = useState('compress'); // 'compress' | 'breath'
  const [breathCount, setBreathCount] = useState(0);
  const metronomeRef = useRef(null);
  const timerRef = useRef(null);
  const compressInCycleRef = useRef(0);

  // Metronome engine
  useEffect(() => {
    if (!isRunning || phase !== 'compress') { clearInterval(metronomeRef.current); return; }
    const interval = (60 / bpm) * 1000;
    metronomeRef.current = setInterval(() => {
      setIsCompressing(prev => {
        if (!prev) {
          // Downstroke
          playBeep(880, 0.08, 0.4);
          setCompressionCount(c => c + 1);
          compressInCycleRef.current++;
          if (compressInCycleRef.current >= 30) {
            compressInCycleRef.current = 0;
            setPhase('breath');
            setIsCompressing(false);
            playBeep(440, 0.2, 0.3);
            clearInterval(metronomeRef.current);
          }
        }
        return !prev;
      });
    }, interval / 2);
    return () => clearInterval(metronomeRef.current);
  }, [isRunning, bpm, phase]);

  // Elapsed timer
  useEffect(() => {
    if (!isRunning) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [isRunning]);

  const handleBreathDone = () => {
    setBreathCount(b => {
      const newCount = b + 1;
      if (newCount >= 2) {
        setPhase('compress');
        setCycleCount(c => c + 1);
        playBeep(1320, 0.1, 0.5);
        return 0;
      }
      playBeep(660, 0.15, 0.3);
      return newCount;
    });
  };

  const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const startCPR = () => {
    setIsRunning(true);
    setStep(4); // Jump to compression step
    setCompressionCount(0);
    setCycleCount(0);
    setElapsed(0);
    setPhase('compress');
    compressInCycleRef.current = 0;
    playBeep(1100, 0.2, 0.5);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'radial-gradient(ellipse at center, rgba(10,0,0,0.97), rgba(0,0,0,0.99))',
      fontFamily: "'Rajdhani', sans-serif", color: '#e0eaff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes cprFlash { 0%,100%{background:rgba(255,30,30,0.05)} 50%{background:rgba(255,30,30,0.15)} }
        @keyframes stepSlide { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        @keyframes breathAnim { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.2);opacity:1} }
        @keyframes emergencyBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* Emergency Header */}
      <div style={{
        background: 'rgba(255,20,20,0.15)', borderBottom: '2px solid rgba(255,50,50,0.4)',
        padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        animation: 'cprFlash 1.5s ease-in-out infinite'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 28, animation: 'emergencyBlink 0.8s step-end infinite' }}>🚨</div>
          <div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff4444', fontWeight: 900, letterSpacing: '0.15em' }}>
              CPR GUIDANCE — EMERGENCY MODE
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.6)', fontFamily: "'Share Tech Mono'" }}>
              Stay calm. You can save a life. Follow each step carefully.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {isRunning && (
            <div style={{ fontFamily: "'Share Tech Mono'", color: '#ffb800', fontSize: 18, fontWeight: 700 }}>
              ⏱ {formatTime(elapsed)}
            </div>
          )}
          {onSOS && (
            <button onClick={onSOS} style={{
              padding: '10px 20px', background: 'rgba(255,30,30,0.3)', border: '2px solid #ff3333',
              borderRadius: 8, color: '#ff4444', fontFamily: "'Orbitron'", fontSize: 12,
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em'
            }}>🆘 SOS</button>
          )}
          <button onClick={onClose} style={{
            padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
          }}>CLOSE</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

        {/* Intro / Step selector */}
        {step === 0 && (
          <div style={{ maxWidth: 700, margin: '0 auto', animation: 'stepSlide 0.4s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>💗</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 22, color: '#ff4444', marginBottom: 12 }}>
                CPR STEP-BY-STEP GUIDE
              </div>
              <div style={{ fontSize: 14, color: 'rgba(220,230,255,0.7)', lineHeight: 1.7, marginBottom: 24 }}>
                High-quality CPR doubles survival rates.<br />
                <strong style={{ color: '#ff6666' }}>Keep going until ambulance arrives.</strong>
              </div>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={startCPR} style={{
                  padding: '16px 32px', background: 'linear-gradient(135deg, rgba(255,30,30,0.4), rgba(255,80,80,0.2))',
                  border: '2px solid #ff4444', borderRadius: 12, color: '#ff4444',
                  fontFamily: "'Orbitron'", fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em'
                }}>
                  ▶️ START CPR METRONOME
                </button>
                <button onClick={() => setStep(1)} style={{
                  padding: '16px 32px', background: 'rgba(0,200,255,0.1)',
                  border: '1px solid rgba(0,200,255,0.4)', borderRadius: 12, color: '#00c8ff',
                  fontFamily: "'Orbitron'", fontSize: 14, cursor: 'pointer', letterSpacing: '0.08em'
                }}>
                  📖 LEARN THE STEPS
                </button>
              </div>
            </div>

            {/* CPR Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 12 }}>
              {[
                { label: 'COMPRESSION RATE', value: '100-120', unit: 'per minute', color: '#ff4444' },
                { label: 'COMPRESSION DEPTH', value: '5-6', unit: 'centimeters', color: '#ffb800' },
                { label: 'CYCLE RATIO', value: '30:2', unit: 'compressions:breaths', color: '#00c8ff' },
              ].map((c, i) => (
                <div key={i} style={{
                  background: `rgba(${c.color === '#ff4444' ? '255,68,68' : c.color === '#ffb800' ? '255,184,0' : '0,200,255'},0.08)`,
                  border: `1px solid ${c.color}44`, borderRadius: 12, padding: '16px', textAlign: 'center'
                }}>
                  <div style={{ fontSize: 10, color: `${c.color}99`, fontFamily: "'Orbitron'", letterSpacing: '0.1em', marginBottom: 8 }}>{c.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: c.color, fontFamily: "'Orbitron'" }}>{c.value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', marginTop: 4 }}>{c.unit}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step-by-step guide */}
        {step > 0 && step <= 6 && !isRunning && (
          <div style={{ maxWidth: 600, margin: '0 auto', animation: 'stepSlide 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              {CPR_STEPS.map((s, i) => (
                <div key={i} onClick={() => setStep(i + 1)} style={{
                  width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                  background: step === i + 1 ? '#ff4444' : step > i + 1 ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)',
                  border: `2px solid ${step === i + 1 ? '#ff4444' : step > i + 1 ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Orbitron'", fontSize: 12, fontWeight: 700,
                  color: step === i + 1 ? '#fff' : step > i + 1 ? '#00ff88' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.2s'
                }}>{step > i + 1 ? '✓' : i + 1}</div>
              ))}
            </div>
            {CPR_STEPS[step - 1] && (
              <div style={{
                background: 'rgba(5,10,30,0.9)', borderRadius: 20,
                border: '1px solid rgba(255,68,68,0.3)', padding: '40px',
                textAlign: 'center', boxShadow: '0 0 40px rgba(255,50,50,0.1)'
              }}>
                <div style={{ fontSize: 80, marginBottom: 20, animation: 'breathAnim 2s ease-in-out infinite' }}>
                  {CPR_STEPS[step - 1].icon}
                </div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#ff6666', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 16 }}>
                  STEP {step}: {CPR_STEPS[step - 1].title}
                </div>
                <div style={{ fontSize: 18, color: '#e0eaff', lineHeight: 1.6, marginBottom: 16 }}>
                  {CPR_STEPS[step - 1].desc}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', lineHeight: 1.7, background: 'rgba(0,200,255,0.05)', padding: '14px 20px', borderRadius: 10, border: '1px solid rgba(0,200,255,0.15)', marginBottom: 24 }}>
                  {CPR_STEPS[step - 1].detail}
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  {step > 1 && <button onClick={() => setStep(s => s - 1)} style={{
                    padding: '12px 24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                    color: 'rgba(160,200,255,0.7)', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11
                  }}>← PREV</button>}
                  {step < 6 ? (
                    <button onClick={() => setStep(s => s + 1)} style={{
                      padding: '12px 24px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444', borderRadius: 10,
                      color: '#ff6666', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700
                    }}>NEXT STEP →</button>
                  ) : (
                    <button onClick={startCPR} style={{
                      padding: '12px 24px', background: 'rgba(255,30,30,0.3)', border: '2px solid #ff4444', borderRadius: 10,
                      color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 13, fontWeight: 700
                    }}>▶ START CPR</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active CPR Mode */}
        {isRunning && (
          <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', animation: 'stepSlide 0.3s ease' }}>
            {/* Compression Phase */}
            {phase === 'compress' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#ff4444', letterSpacing: '0.2em', marginBottom: 8 }}>
                    CHEST COMPRESSIONS
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.6)' }}>
                    Push HARD & FAST • 100-120/min • 5-6cm deep • Let chest fully rise
                  </div>
                </div>

                <HeartCompressionVisual isCompressing={isCompressing} compressionCount={compressionCount} bpm={bpm} />

                <div style={{ marginTop: 40, marginBottom: 24 }}>
                  <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 48, color: '#ff4444', fontWeight: 900, lineHeight: 1 }}>
                    {30 - compressInCycleRef.current}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.5)', marginTop: 4 }}>compressions until breaths</div>
                </div>

                {/* BPM Control */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', marginBottom: 24 }}>
                  <button onClick={() => setBpm(b => Math.max(80, b - 5))} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff6666', cursor: 'pointer', fontSize: 18 }}>−</button>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'Share Tech Mono'", fontSize: 24, color: bpm >= 100 && bpm <= 120 ? '#00ff88' : '#ffb800', fontWeight: 700 }}>{bpm}</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)' }}>BPM</div>
                  </div>
                  <button onClick={() => setBpm(b => Math.min(140, b + 5))} style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff6666', cursor: 'pointer', fontSize: 18 }}>+</button>
                </div>
              </>
            )}

            {/* Breath Phase */}
            {phase === 'breath' && (
              <div style={{ animation: 'stepSlide 0.3s ease' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', letterSpacing: '0.1em', marginBottom: 20 }}>
                  GIVE RESCUE BREATHS
                </div>
                <div style={{ fontSize: 80, animation: 'breathAnim 2s ease-in-out infinite', marginBottom: 20 }}>💨</div>
                <div style={{ fontSize: 15, color: 'rgba(220,230,255,0.8)', lineHeight: 1.7, marginBottom: 24 }}>
                  Tilt head back • Lift chin<br />
                  Seal mouth • Blow for 1 second<br />
                  Watch for chest rise<br />
                  <strong style={{ color: '#00c8ff' }}>Give {2 - breathCount} more breath{2 - breathCount !== 1 ? 's' : ''}</strong>
                </div>
                <button onClick={handleBreathDone} style={{
                  padding: '20px 40px', background: 'rgba(0,200,255,0.15)', border: '2px solid #00c8ff',
                  borderRadius: 14, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 14,
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em', width: '100%'
                }}>
                  ✓ BREATH GIVEN ({breathCount + 1}/2)
                </button>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24 }}>
              {[
                { label: 'COMPRESSIONS', value: compressionCount, color: '#ff4444' },
                { label: 'CYCLES', value: cycleCount, color: '#ffb800' },
                { label: 'ELAPSED', value: formatTime(elapsed), color: '#00c8ff' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(5,10,30,0.8)', borderRadius: 10, padding: 12, border: `1px solid ${s.color}33` }}>
                  <div style={{ fontSize: 9, color: `${s.color}99`, fontFamily: "'Orbitron'", letterSpacing: '0.08em' }}>{s.label}</div>
                  <div style={{ fontSize: 20, color: s.color, fontWeight: 900, fontFamily: "'Share Tech Mono'", marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <button onClick={() => { setIsRunning(false); setStep(0); }} style={{
              width: '100%', marginTop: 16, padding: '12px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(160,200,255,0.4)',
              cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
            }}>⏹ STOP CPR</button>
          </div>
        )}
      </div>
    </div>
  );
}
