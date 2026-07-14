import React, { useEffect, useRef, useState } from 'react';

const PhysiologicalWaveforms = ({ vitals, news2Score = 0, sensorError = false }) => {
  const ecgCanvasRef = useRef(null);
  const ppgCanvasRef = useRef(null);
  const respCanvasRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [audioError, setAudioError] = useState('');

  const audioCtxRef = useRef(null);
  const alarmIntervalRef = useRef(null);

  // Vitals defaults
  const hr = vitals?.heartRate !== undefined ? Number(vitals.heartRate) : 75;
  const spo2 = vitals?.spo2 !== undefined ? Number(vitals.spo2) : 98;
  const rr = vitals?.respRate !== undefined ? Number(vitals.respRate) : 16;
  const newsScore = news2Score || 0;

  // Determine rhythm type
  let rhythmType = 'sinus';
  if (sensorError || vitals?.sensorError) {
    rhythmType = 'disconnect';
  } else if (hr === 0) {
    rhythmType = 'asystole';
  } else if (hr >= 140) {
    rhythmType = 'vtach';
  }

  // Initialize Web Audio Context on first interaction
  const initAudio = () => {
    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContextClass();
        console.log('[Web Audio] Context initialized.');
      } catch (err) {
        console.error('[Web Audio] Failed to initialize AudioContext:', err);
        setAudioError('Audio API not supported');
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  // Play a single heart beat beep
  const playBeep = (frequency) => {
    if (isMuted || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') return;

    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
      // Fast exponential decay
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      console.warn('[Audio] Beep failed:', e);
    }
  };

  // Play repeating dual-tone alarm for critical NEWS2 >= 7
  useEffect(() => {
    initAudio();

    if (newsScore >= 7 && !isMuted) {
      if (!alarmIntervalRef.current) {
        let toggle = false;
        const playAlarmTone = () => {
          if (!audioCtxRef.current || isMuted) return;
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') return;

          try {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            // Alternating frequency (880Hz and 660Hz)
            osc.frequency.setValueAtTime(toggle ? 880 : 660, ctx.currentTime);
            osc.type = 'sawtooth'; // piercing medical alarm sound

            gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.22);
            toggle = !toggle;
          } catch (e) {
            console.warn('[Audio] Alarm tone failed:', e);
          }
        };

        // Trigger alarm beep every 350ms
        alarmIntervalRef.current = setInterval(playAlarmTone, 350);
      }
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [newsScore, isMuted]);

  // Waveform rendering loop
  useEffect(() => {
    const ecgCanvas = ecgCanvasRef.current;
    const ppgCanvas = ppgCanvasRef.current;
    const respCanvas = respCanvasRef.current;
    if (!ecgCanvas || !ppgCanvas || !respCanvas) return;

    const ecgCtx = ecgCanvas.getContext('2d');
    const ppgCtx = ppgCanvas.getContext('2d');
    const respCtx = respCanvas.getContext('2d');

    // Handle high-DPI scaling
    const scaleCanvas = (canvas, ctx) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      return { w: rect.width, h: rect.height };
    };

    const ecgDim = scaleCanvas(ecgCanvas, ecgCtx);
    const ppgDim = scaleCanvas(ppgCanvas, ppgCtx);
    const respDim = scaleCanvas(respCanvas, respCtx);

    // Fill initial dark backgrounds
    ecgCtx.fillStyle = '#02040b';
    ecgCtx.fillRect(0, 0, ecgDim.w, ecgDim.h);
    ppgCtx.fillStyle = '#02040b';
    ppgCtx.fillRect(0, 0, ppgDim.w, ppgDim.h);
    respCtx.fillStyle = '#02040b';
    respCtx.fillRect(0, 0, respDim.w, respDim.h);

    let animationFrameId;
    let sweepX = 0;
    const sweepSpeed = 2.0; // pixels per frame
    const eraseWidth = 35;  // width of erase bar

    // Phases (0.0 to 1.0)
    let ecgPhase = 0;
    let ppgPhase = 0;
    let respPhase = 0;

    let lastBeepTime = 0;

    const render = () => {
      // 1. Update phases based on current vital rates
      // Period in seconds = 60 / rate
      // Rate per frame (60fps) = rate / (60 * 60)
      const ecgStep = (rhythmType === 'asystole' || rhythmType === 'disconnect') ? 75 / 3600 : hr / 3600;
      const ppgStep = (rhythmType === 'asystole' || rhythmType === 'disconnect') ? 75 / 3600 : hr / 3600;
      const respStep = (rhythmType === 'asystole' || rhythmType === 'disconnect') ? 16 / 3600 : rr / 3600;

      const prevEcgPhase = ecgPhase;
      ecgPhase = (ecgPhase + ecgStep) % 1.0;
      ppgPhase = (ppgPhase + ppgStep) % 1.0;
      respPhase = (respPhase + respStep) % 1.0;

      // 2. Play Audio Beep synchronous with the ECG R-peak (phase crosses 0.25)
      if (rhythmType !== 'asystole' && rhythmType !== 'disconnect') {
        if (prevEcgPhase < 0.25 && ecgPhase >= 0.25) {
          const now = Date.now();
          const debounceLimit = hr > 140 ? 100 : 250;
          if (now - lastBeepTime > debounceLimit) {
            const beepFreq = 400 + (hr - 40) * 5;
            playBeep(beepFreq);
            lastBeepTime = now;
          }
        }
      }

      // 3. Compute current vertical values (scaled to center heights)
      // --- ECG Math Model (PQRST Complex / Rhythms) ---
      let ecgVal = 0;
      if (rhythmType === 'disconnect') {
        ecgVal = (Math.random() - 0.5) * 1.6; // Noisy artifacts
      } else if (rhythmType === 'asystole') {
        ecgVal = (Math.random() - 0.5) * 0.03; // Flatline with tiny sensor jitter
      } else if (rhythmType === 'vtach') {
        // Ventricular Tachycardia: wide complexes
        ecgVal = 0.7 * Math.sin(ecgPhase * 2.0 * Math.PI) + 0.3 * Math.sin(ecgPhase * 4.0 * Math.PI - Math.PI / 2);
      } else {
        // Standard Sinus Sinusoidal PQRST
        if (ecgPhase >= 0.1 && ecgPhase < 0.18) { // P Wave
          ecgVal = 0.15 * Math.sin(((ecgPhase - 0.1) / 0.08) * Math.PI);
        } else if (ecgPhase >= 0.22 && ecgPhase < 0.24) { // Q Wave
          ecgVal = -0.15 * Math.sin(((ecgPhase - 0.22) / 0.02) * Math.PI);
        } else if (ecgPhase >= 0.24 && ecgPhase < 0.27) { // R Wave
          ecgVal = 1.35 * Math.sin(((ecgPhase - 0.24) / 0.03) * Math.PI);
        } else if (ecgPhase >= 0.27 && ecgPhase < 0.29) { // S Wave
          ecgVal = -0.35 * Math.sin(((ecgPhase - 0.27) / 0.02) * Math.PI);
        } else if (ecgPhase >= 0.35 && ecgPhase < 0.45) { // T Wave
          ecgVal = 0.3 * Math.sin(((ecgPhase - 0.35) / 0.1) * Math.PI);
        }
      }

      // --- PPG / SpO2 Math Model (Dicrotic Notch) ---
      let ppgVal = 0;
      const amplitudeFactor = (spo2 / 100);
      if (rhythmType === 'disconnect') {
        ppgVal = (Math.random() - 0.5) * 0.08;
      } else if (rhythmType === 'asystole') {
        ppgVal = (Math.random() - 0.5) * 0.01;
      } else {
        if (ppgPhase < 0.25) { // Systolic rise
          ppgVal = amplitudeFactor * Math.sin((ppgPhase / 0.25) * (Math.PI / 2));
        } else if (ppgPhase >= 0.25 && ppgPhase < 0.35) { // Dicrotic notch drop
          const decay = Math.cos(((ppgPhase - 0.25) / 0.1) * (Math.PI / 4));
          const bounce = 0.08 * Math.sin(((ppgPhase - 0.25) / 0.1) * Math.PI);
          ppgVal = amplitudeFactor * (0.8 * decay + bounce);
        } else { // Diastolic decay
          ppgVal = amplitudeFactor * 0.7 * Math.exp(-3.0 * (ppgPhase - 0.35));
        }
      }

      // --- RESP Math Model (Sinusoidal Breathing) ---
      let respVal = 0;
      if (rhythmType === 'disconnect') {
        respVal = (Math.random() - 0.5) * 0.05;
      } else if (rhythmType === 'asystole') {
        respVal = (Math.random() - 0.5) * 0.01;
      } else {
        respVal = 0.6 * Math.sin(respPhase * 2.0 * Math.PI);
      }

      // 4. Draw waves with CRT Sweep-Erase Effect
      const drawSweepPoint = (ctx, dim, val, color, scaleY = 0.35) => {
        // Clear a narrow strip just ahead of the sweep coordinate
        ctx.fillStyle = '#02040b';
        ctx.fillRect(sweepX, 0, eraseWidth, dim.h);

        // Render sweep line indicator overlay
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(sweepX + eraseWidth - 2, 0, 2, dim.h);

        // Convert value to canvas Y coordinate
        const centerY = dim.h / 2;
        const targetY = centerY - val * (dim.h * scaleY);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 4;
        ctx.shadowColor = color;

        // If sweepX is at start, skip line connection to prevent diagonal wrap line
        if (sweepX <= sweepSpeed) {
          ctx.beginPath();
          ctx.moveTo(sweepX, targetY);
          ctx.lineTo(sweepX, targetY);
          ctx.stroke();
        } else {
          // Read previous Y value implicitly from the canvas or approximate it
          // For smoothness, draw a line segment from (sweepX - sweepSpeed) to sweepX
          // We can estimate the previous point using a ref or by simply drawing a tiny line
          ctx.beginPath();
          ctx.moveTo(sweepX - sweepSpeed, ctx.lastY || targetY);
          ctx.lineTo(sweepX, targetY);
          ctx.stroke();
        }
        ctx.shadowBlur = 0; // reset
        ctx.lastY = targetY;
      };

      drawSweepPoint(ecgCtx, ecgDim, ecgVal, '#00ff66', 0.35);    // ECG - Vivid green
      drawSweepPoint(ppgCtx, ppgDim, ppgVal, '#00e5ff', 0.35);    // SpO2 - Neon Cyan
      drawSweepPoint(respCtx, respDim, respVal, '#ffaa00', 0.28);  // RESP - Amber Orange

      // 5. Update sweep position
      sweepX = (sweepX + sweepSpeed) % ecgDim.w;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [hr, spo2, rr]);

  return (
    <div style={{
      background: 'rgba(5, 10, 30, 0.6)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 200, 255, 0.15)',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: newsScore >= 7 ? '#ff0055' : '#00ff88', boxShadow: `0 0 10px ${newsScore >= 7 ? '#ff0055' : '#00ff88'}` }}></div>
          <span style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#e0e5ff', letterSpacing: '0.05em' }}>
            🔴 LIVE PHYSIOLOGICAL TELEMETRY
          </span>
        </div>
        <button
          onClick={() => {
            initAudio();
            setIsMuted(!isMuted);
          }}
          style={{
            background: isMuted ? 'rgba(255, 68, 68, 0.2)' : 'rgba(0, 200, 255, 0.1)',
            border: `1px solid ${isMuted ? 'rgba(255, 68, 68, 0.4)' : 'rgba(0, 200, 255, 0.3)'}`,
            borderRadius: 6,
            color: isMuted ? '#ff5555' : '#00c8ff',
            padding: '4px 10px',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: "'Orbitron'",
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}
        >
          {isMuted ? '🔇 MUTED' : '🔊 AUDIBLE'}
        </button>
      </div>

      {audioError && (
        <div style={{ fontSize: 9, color: '#ff4444', fontFamily: "'Share Tech Mono'" }}>
          {audioError}
        </div>
      )}

      {/* ECG Row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, position: 'relative', height: 75, background: '#02040b', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <canvas ref={ecgCanvasRef} style={{ width: '100%', height: '100%' }} />
          <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 9, fontFamily: "'Share Tech Mono'", color: '#00ff66', letterSpacing: '0.05em' }}>
            ECG (II)
          </span>
        </div>
        <div style={{ width: 75, background: '#02040b', borderRadius: 6, border: '1px solid rgba(0, 255, 102, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(0, 255, 102, 0.6)' }}>HR</span>
          <span style={{ fontSize: 24, fontFamily: "'Orbitron'", color: '#00ff66', fontWeight: 'bold', lineHeight: 1 }}>{hr}</span>
          <span style={{ fontSize: 8, fontFamily: "'Share Tech Mono'", color: 'rgba(0, 255, 102, 0.4)' }}>bpm</span>
        </div>
      </div>

      {/* PPG/SpO2 Row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, position: 'relative', height: 75, background: '#02040b', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <canvas ref={ppgCanvasRef} style={{ width: '100%', height: '100%' }} />
          <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 9, fontFamily: "'Share Tech Mono'", color: '#00e5ff', letterSpacing: '0.05em' }}>
            PLETH / SpO2
          </span>
        </div>
        <div style={{ width: 75, background: '#02040b', borderRadius: 6, border: '1px solid rgba(0, 229, 255, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(0, 229, 255, 0.6)' }}>SpO2</span>
          <span style={{ fontSize: 24, fontFamily: "'Orbitron'", color: '#00e5ff', fontWeight: 'bold', lineHeight: 1 }}>{spo2}</span>
          <span style={{ fontSize: 8, fontFamily: "'Share Tech Mono'", color: 'rgba(0, 229, 255, 0.4)' }}>%</span>
        </div>
      </div>

      {/* RESP Row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1, position: 'relative', height: 75, background: '#02040b', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
          <canvas ref={respCanvasRef} style={{ width: '100%', height: '100%' }} />
          <span style={{ position: 'absolute', top: 6, left: 8, fontSize: 9, fontFamily: "'Share Tech Mono'", color: '#ffaa00', letterSpacing: '0.05em' }}>
            RESP
          </span>
        </div>
        <div style={{ width: 75, background: '#02040b', borderRadius: 6, border: '1px solid rgba(255, 170, 0, 0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: "'Share Tech Mono'", color: 'rgba(255, 170, 0, 0.6)' }}>RR</span>
          <span style={{ fontSize: 24, fontFamily: "'Orbitron'", color: '#ffaa00', fontWeight: 'bold', lineHeight: 1 }}>{rr}</span>
          <span style={{ fontSize: 8, fontFamily: "'Share Tech Mono'", color: 'rgba(255, 170, 0, 0.4)' }}>rpm</span>
        </div>
      </div>
    </div>
  );
};

export default PhysiologicalWaveforms;
