import React, { useEffect, useRef, useState } from 'react';
import DailyIframe from '@daily-co/daily-js';
import axios from 'axios';

/**
 * Premium WebRTC Telemedicine Component utilizing Daily.co SDK.
 * Supports User, Paramedic, Hospital, and Admin roles.
 */
const VideoCall = ({ socket, role, missionId: reqId }) => {
  const [inCall, setInCall] = useState(false);
  const [calling, setCalling] = useState(false);
  const [incomingUrl, setIncomingUrl] = useState(null);
  const [callerRole, setCallerRole] = useState('');
  
  // Peer state
  const [peers, setPeers] = useState({
    userSocket: null,
    ambulanceSocket: null,
    hospitalSocket: null,
    adminSockets: []
  });

  const containerRef = useRef(null);
  const callFrameRef = useRef(null);
  const targetSocketIdRef = useRef(null);

  // Poll for peer socket updates
  useEffect(() => {
    if (!socket || !reqId) return;

    const requestPeers = () => {
      socket.emit('get-mission-peers', { reqId });
    };

    requestPeers();
    const interval = setInterval(requestPeers, 4000);

    const handlePeersUpdate = (data) => {
      if (data.error) return;
      setPeers(data);
    };

    socket.on('mission-peers', handlePeersUpdate);

    return () => {
      clearInterval(interval);
      socket.off('mission-peers', handlePeersUpdate);
    };
  }, [socket, reqId]);

  // WebRTC socket signaling listners
  useEffect(() => {
    if (!socket || !reqId) return;

    const handleOffer = (data) => {
      if (data.reqId !== reqId) return;
      if (data.offer && data.offer.roomUrl) {
        console.log('[DAILY.CO] Incoming call offer with room URL:', data.offer.roomUrl);
        setIncomingUrl(data.offer.roomUrl);
        setCallerRole(data.fromRole || 'Emergency Peer');
        setCalling(true);
        targetSocketIdRef.current = data.fromSocketId;
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

  const startCall = async (targetSocketId, label) => {
    if (!targetSocketId) return;
    targetSocketIdRef.current = targetSocketId;
    setCalling(true);

    try {
      const token = sessionStorage.getItem('rescueLinkEnterpriseJWT') || sessionStorage.getItem('rescuelink_token') || '';
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await axios.post(`${SERVER_URL}/api/video/create-room`, { reqId }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { url } = res.data;
      if (!url) throw new Error("No room URL received from server");

      console.log('[DAILY.CO] Created room, joining:', url);
      joinDailyRoom(url);

      // Notify remote peer using backward-compatible signaling payload
      socket.emit('webrtc-offer', { 
        reqId, 
        offer: { roomUrl: url }, 
        targetSocketId: targetSocketId,
        fromRole: role.toUpperCase()
      });
    } catch (err) {
      console.error('[DAILY.CO] Start call failed:', err.message);
      setCalling(false);
      alert('Failed to start call: Please ensure the recipient is currently online.');
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

  // Render caller profile / buttons based on role
  const renderCallButtons = () => {
    if (inCall || calling || incomingUrl) return null;

    const buttonStyle = (active) => ({
      padding: '8px 12px',
      background: active ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${active ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 6,
      color: active ? '#00ff88' : 'rgba(255,255,255,0.3)',
      fontWeight: 'bold',
      fontSize: 10,
      cursor: active ? 'pointer' : 'not-allowed',
      fontFamily: "'Orbitron'",
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1
    });

    if (role === 'user') {
      return (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button 
            disabled={!peers.ambulanceSocket}
            onClick={() => startCall(peers.ambulanceSocket, 'PARAMEDIC')}
            style={buttonStyle(!!peers.ambulanceSocket)}
          >
            📞 CALL PARAMEDIC
          </button>
          <button 
            disabled={!peers.hospitalSocket}
            onClick={() => startCall(peers.hospitalSocket, 'DOCTOR')}
            style={buttonStyle(!!peers.hospitalSocket)}
          >
            📞 CALL DOCTOR
          </button>
        </div>
      );
    }

    if (role === 'paramedic') {
      return (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button 
            disabled={!peers.userSocket}
            onClick={() => startCall(peers.userSocket, 'PATIENT')}
            style={buttonStyle(!!peers.userSocket)}
          >
            📞 CALL PATIENT
          </button>
          <button 
            disabled={!peers.hospitalSocket}
            onClick={() => startCall(peers.hospitalSocket, 'DOCTOR')}
            style={buttonStyle(!!peers.hospitalSocket)}
          >
            📞 CALL DOCTOR
          </button>
        </div>
      );
    }

    if (role === 'hospital') {
      const hasAdmins = peers.adminSockets.length > 0;
      return (
        <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
          <button 
            disabled={!peers.userSocket}
            onClick={() => startCall(peers.userSocket, 'PATIENT')}
            style={buttonStyle(!!peers.userSocket)}
          >
            📞 CALL PATIENT
          </button>
          <button 
            disabled={!peers.ambulanceSocket}
            onClick={() => startCall(peers.ambulanceSocket, 'PARAMEDIC')}
            style={buttonStyle(!!peers.ambulanceSocket)}
          >
            📞 CALL PARAMEDIC
          </button>
          <button 
            disabled={!hasAdmins}
            onClick={() => startCall(peers.adminSockets[0], 'WAR ROOM')}
            style={buttonStyle(hasAdmins)}
          >
            📞 CALL WAR ROOM
          </button>
        </div>
      );
    }

    if (role === 'admin') {
      return (
        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          <button 
            disabled={!peers.hospitalSocket}
            onClick={() => startCall(peers.hospitalSocket, 'DOCTOR')}
            style={buttonStyle(!!peers.hospitalSocket)}
          >
            📞 CALL DOCTOR
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ 
      background: 'rgba(5,10,30,0.85)', padding: '14px', borderRadius: 10, 
      border: '1px solid rgba(0,200,255,0.18)', marginBottom: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
      width: '100%', boxSizing: 'border-box', overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', fontWeight: 700, letterSpacing: '0.05em' }}>
            🛰️ CLINICAL TELEMEDICINE
          </div>
          <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", display: 'flex', alignItems: 'center', gap: 6 }}>
            WebRTC Secure Room
            {inCall && <span style={{ color: '#00ff88', fontWeight: 'bold' }}>● ACTIVE CONNECTION</span>}
          </div>
        </div>
        
        {/* Connection Control Action Buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {incomingUrl && !inCall && (
            <button 
              onClick={acceptCall}
              style={{
                padding: '6px 12px', background: '#00ff88', border: 'none', borderRadius: 4,
                color: '#000', fontWeight: 'bold', fontSize: 10, cursor: 'pointer', fontFamily: "'Orbitron'"
              }}
            >
              ACCEPT
            </button>
          )}
          {(inCall || calling || incomingUrl) && (
            <button 
              onClick={endCall}
              style={{
                padding: '6px 12px', background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)',
                borderRadius: 4, color: '#ff4444', fontWeight: 'bold', fontSize: 10, cursor: 'pointer', fontFamily: "'Orbitron'"
              }}
            >
              {incomingUrl && !inCall ? 'DECLINE' : 'DISCONNECT'}
            </button>
          )}
        </div>
      </div>

      {/* Selector/Call Buttons */}
      {renderCallButtons()}

      {/* Daily Video Container */}
      <div 
        ref={containerRef}
        style={{ 
          position: 'relative', 
          width: '100%', 
          aspectRatio: '16/9', 
          background: '#010512', 
          borderRadius: 8, 
          overflow: 'hidden', 
          border: '1px solid rgba(0,200,255,0.1)',
          display: (inCall || calling) ? 'block' : 'none'
        }}
      >
        {calling && !inCall && (
          <div style={{ 
            position: 'absolute', inset: 0, background: 'rgba(2,6,18,0.85)', 
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center',
            color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 10,
            backdropFilter: 'blur(4px)', zIndex: 5
          }}>
            <div style={{ fontSize: 24, animation: 'pulse 1s infinite' }}>🔔</div>
            {incomingUrl ? `INCOMING CALL FROM ${callerRole}...` : 'RINGING REMOTE PEER...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
