import React, { useEffect, useRef } from 'react';

export default function HeartbeatViz({ bpm = 80, isCritical = false, width = 120, height = 60 }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let x = 0;
    
    // Create EKG path
    const drawEkg = () => {
      ctx.fillStyle = 'rgba(0, 5, 20, 0.1)';
      ctx.fillRect(0, 0, width, height);
      
      const yMid = height / 2;
      ctx.beginPath();
      ctx.moveTo(x, yMid);
      
      // Speed depends on BPM
      const speed = (bpm / 60) * 2;
      x += speed;
      
      // EKG pattern: Flat -> P wave -> Flat -> QRS complex -> Flat -> T wave -> Flat
      const cycleLen = 100;
      const posInCycle = x % cycleLen;
      
      let y = yMid;
      if (posInCycle > 20 && posInCycle < 30) {
        // P wave
        y = yMid - Math.sin((posInCycle - 20) * Math.PI / 10) * 5;
      } else if (posInCycle > 40 && posInCycle < 45) {
        // Q wave
        y = yMid + 5;
      } else if (posInCycle >= 45 && posInCycle < 50) {
        // R wave (peak)
        y = yMid - 20;
      } else if (posInCycle >= 50 && posInCycle < 55) {
        // S wave
        y = yMid + 10;
      } else if (posInCycle > 65 && posInCycle < 80) {
        // T wave
        y = yMid - Math.sin((posInCycle - 65) * Math.PI / 15) * 8;
      }
      
      ctx.lineTo(x, y);
      ctx.strokeStyle = isCritical ? '#ff3333' : '#00ff88';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Draw glow
      ctx.save();
      ctx.strokeStyle = isCritical ? 'rgba(255, 51, 51, 0.4)' : 'rgba(0, 255, 136, 0.4)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
      
      if (x > width) {
        x = 0;
        ctx.clearRect(0, 0, width, height);
      }
      
      animId = requestAnimationFrame(drawEkg);
    };
    
    drawEkg();
    return () => cancelAnimationFrame(animId);
  }, [bpm, isCritical, width, height]);
  
  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', borderRadius: 4, border: `1px solid ${isCritical ? 'rgba(255,51,51,0.3)' : 'rgba(0,255,136,0.2)'}`, background: 'rgba(5,10,25,0.8)' }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block' }} />
      <div style={{ position: 'absolute', top: 4, right: 6, fontFamily: "'Share Tech Mono'", fontSize: 10, color: isCritical ? '#ff4444' : '#00ff88' }}>
        {bpm} BPM
      </div>
    </div>
  );
}
