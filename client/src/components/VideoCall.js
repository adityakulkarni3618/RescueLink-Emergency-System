import React, { useEffect, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import axios from 'axios';

/**
 * Premium WebRTC Telemedicine Component utilizing Daily.co SDK.
 */
const VideoCall = ({ socket, isInitiatorRole, missionId: reqId, targetSocketId }) => {
  const [inCall, setInCall] = useState(false);
  const [calling, setCalling] = useState(false);
  const [incomingUrl, setIncomingUrl] = useState(null);
  
  const containerRef = useRef(null);
  const callFrameRef = useRef(null);
  const targetSocketIdRef = useRef(targetSocketId);

  useEffect(() => {
    targetSocketIdRef.current = targetSocketId;
  }, [targetSocketId]);

  useEffect(() => {
    if (!socket || !reqId) return;

    const handleOffer = (data) => {
      if (data.reqId !== reqId) return;
      if (data.offer && data.offer.roomUrl) {
        console.log('[DAILY.CO] Incoming call offer with room URL:', data.offer.roomUrl);
        setIncomingUrl(data.offer.roomUrl);
        setCalling(true);
        if (!targetSocketIdRef.current) {
          targetSocketIdRef.current = data.fromSocketId;
        }
      }
    };

    const handleHangup = (data) => {
      if (data.reqId === reqId) {
        console.log('[DAILY.CO] Hangup received');
        leaveCall();
      }
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-hangup', handleHangup);

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-hangup', handleHangup);
      if (callFrameRef.current) {
        callFrameRef.current.destroy();
      }
    };
  }, [socket, reqId]);

  const startCall = async () => {
    setCalling(true);
    try {
      const token = sessionStorage.getItem('rescueLinkEnterpriseJWT') || '';
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await axios.post(`${SERVER_URL}/api/video/create-room`, { reqId }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { url } = res.data;
      if (!url) throw new Error("No room URL received from server");

      console.log('[DAILY.CO] Created room, joining:', url);
      joinDailyRoom(url);

      // Notify remote peer using backward-compatible signaling payload
      socket.emit('webrtc-offer', { reqId, offer: { roomUrl: url }, targetSocketId: targetSocketIdRef.current });
    } catch (err) {
      console.error('[DAILY.CO] Start call failed:', err.message);
      setCalling(false);
      alert('Failed to start call: Both parties must be active in the same mission to connect.');
    }
  };

  const acceptCall = () => {
    if (!incomingUrl) return;
    joinDailyRoom(incomingUrl);
  };

  const joinDailyRoom = (url) => {
    if (callFrameRef.current) {
      callFrameRef.current.destroy();
    }

    const frame = DailyIframe.createFrame(containerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '8px'
      },
      showLeaveButton: false,
      showFullscreenButton: true
    });

    callFrameRef.current = frame;

    frame.on('joined-meeting', () => {
      setInCall(true);
      setCalling(false);
    });

    frame.on('left-meeting', () => {
      setInCall(false);
      setCalling(false);
      setIncomingUrl(null);
    });

    frame.join({ url });
  };

  const leaveCall = () => {
    if (callFrameRef.current) {
      callFrameRef.current.leave();
      callFrameRef.current.destroy();
      callFrameRef.current = null;
    }
    setInCall(false);
    setCalling(false);
    setIncomingUrl(null);
  };

  const endCall = () => {
    socket.emit('webrtc-hangup', { reqId, targetSocketId: targetSocketIdRef.current });
    leaveCall();
  };

  return (
    <div style={{ 
      background: '#050a1e', padding: '12px', borderRadius: 8, 
      border: '1px solid rgba(0,200,255,0.2)', marginBottom: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
      width: '100%', boxSizing: 'border-box', overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', fontWeight: 'bold' }}>
            {isInitiatorRole ? '🚑 PARAMEDIC TELEMEDICINE' : '🏥 RECEIVING PHYSICIAN PORTAL'}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", display: 'flex', alignItems: 'center', gap: 6 }}>
            Daily.co WebRTC Stream
            {inCall && <span style={{ color: '#00ff88' }}>● CONNECTED</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {incomingUrl && !inCall && (
            <button 
              onClick={acceptCall}
              style={{
                padding: '0 12px', height: '32px', background: '#00ff88',
                border: 'none', borderRadius: 4, color: '#000', fontWeight: 'bold',
                fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'",
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap'
              }}
            >
              ACCEPT CALL
            </button>
          )}
          {(inCall || calling || incomingUrl) && (
            <button 
              onClick={endCall}
              style={{
                padding: '0 12px', height: '32px', background: 'rgba(255,60,60,0.15)',
                border: '1px solid rgba(255,60,60,0.3)', borderRadius: 4, color: '#ff4444', 
                fontWeight: 'bold', fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'",
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap'
              }}
            >
              {incomingUrl && !inCall ? 'DECLINE' : 'END CALL'}
            </button>
          )}
          {!inCall && !calling && !incomingUrl && (
            <button 
              onClick={startCall}
              style={{
                padding: '0 12px', height: '32px', background: '#00ff88',
                border: 'none', borderRadius: 4, color: '#000', fontWeight: 'bold',
                fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'",
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap'
              }}
            >
              📞 CALL {isInitiatorRole ? 'DOCTOR' : 'AMBULANCE'}
            </button>
          )}
        </div>
      </div>

      <div 
        ref={containerRef}
        style={{ 
          position: 'relative', 
          width: '100%', 
          aspectRatio: '16/9', 
          background: '#000', 
          borderRadius: 6, 
          overflow: 'hidden', 
          border: '1px solid rgba(255,255,255,0.05)',
          display: (inCall || calling) ? 'block' : 'none'
        }}
      >
        {calling && !inCall && (
          <div style={{ 
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#00c8ff', fontFamily: "'Share Tech Mono'", fontSize: 12,
            backdropFilter: 'blur(4px)', zIndex: 5
          }}>
            ESTABLISHING CONNECTION...
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
