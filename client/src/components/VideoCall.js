import React, { useState, useEffect, useRef } from 'react';

export default function VideoCall({ socket, isInitiatorRole }) {
  const [inCall, setInCall] = useState(false);
  const [calling, setCalling] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Configuration for WebRTC
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('webrtc-offer', async (offer) => {
      console.log('Received offer');
      if (!peerConnectionRef.current) {
        await startCall(false);
      }
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('webrtc-answer', answer);
      } catch (err) {
        console.error('Error handling offer', err);
      }
    });

    socket.on('webrtc-answer', async (answer) => {
      console.log('Received answer');
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error handling answer', err);
        }
      }
    });

    socket.on('webrtc-ice-candidate', async (candidate) => {
      console.log('Received ICE candidate');
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate', err);
        }
      }
    });

    socket.on('webrtc-end', () => {
      console.log('Call ended by remote');
      cleanupCall();
    });

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('webrtc-end');
      cleanupCall();
    };
  }, [socket]);

  const startCall = async (isCaller = true) => {
    setCalling(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      peerConnectionRef.current = new RTCPeerConnection(rtcConfig);

      // Add local stream tracks to connection
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      // Handle incoming remote stream
      peerConnectionRef.current.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setInCall(true);
          setCalling(false);
        }
      };

      // Handle ICE candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc-ice-candidate', event.candidate);
        }
      };

      if (isCaller) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('webrtc-offer', offer);
      }
      
      setInCall(true);

    } catch (err) {
      console.error('Failed to get local stream', err);
      alert('Could not access camera/microphone. Please allow permissions.');
      cleanupCall();
    }
  };

  const endCall = () => {
    socket.emit('webrtc-end');
    cleanupCall();
  };

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setInCall(false);
    setCalling(false);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(0,200,255,0.08)',
      background: 'rgba(5,15,40,0.5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.4)', fontFamily: "'Share Tech Mono'", letterSpacing: '0.1em' }}>
          LIVE VIDEO FEED
        </div>
        {!inCall ? (
          <button onClick={() => startCall(true)} disabled={calling} style={{
            padding: '6px 12px', background: 'rgba(0,255,100,0.15)',
            border: '1px solid rgba(0,255,100,0.4)', borderRadius: 4,
            color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, cursor: calling ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}>
            {calling ? 'CONNECTING...' : '🎥 START CALL'}
          </button>
        ) : (
          <button onClick={endCall} style={{
            padding: '6px 12px', background: 'rgba(255,80,80,0.15)',
            border: '1px solid rgba(255,80,80,0.4)', borderRadius: 4,
            color: '#ff8888', fontFamily: "'Orbitron'", fontSize: 10, cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            ⏹ END CALL
          </button>
        )}
      </div>

      {/* Video Container */}
      {(inCall || calling) && (
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          background: '#000',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid rgba(0,200,255,0.2)'
        }}>
          {/* Remote Video (Full Size) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Local Video (PiP) */}
          <div style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: '30%',
            aspectRatio: '16/9',
            background: '#111',
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid rgba(0,255,100,0.3)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted // Mute local video to prevent echo
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          
          {calling && !inCall && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)', color: '#00c8ff',
              fontFamily: "'Share Tech Mono'", fontSize: 12
            }}>
              WAITING FOR CONNECTION...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
