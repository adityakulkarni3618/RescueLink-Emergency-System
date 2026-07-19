import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VideoCall from './VideoCall';
import { showAlert } from '../utils/alert';
import AIEmergencyCopilot from './AIEmergencyCopilot';
import CPRGuidance from './CPRGuidance';
import BloodEmergencyNetwork from './BloodEmergencyNetwork';
import AmbulanceMarketplace from './AmbulanceMarketplace';


// Fix leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom Icons
const userIcon = new L.DivIcon({
  html: `<div style="font-size: 24px;">🧍</div>`,
  className: 'custom-div-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const ambulanceIcon = new L.DivIcon({
  html: `<div style="font-size: 24px;">🚑</div>`,
  className: 'custom-div-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const hospitalIcon = new L.DivIcon({
  html: `<div style="font-size: 24px;">🏥</div>`,
  className: 'custom-div-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

// Helper component to center map on user
function SmartMapController({ userLoc, ambulanceLoc, manualCenter }) {
  const map = useMap();
  const lastBoundsRef = useRef(null);

  useEffect(() => {
    if (manualCenter) {
      map.setView(manualCenter, 13, { animate: true });
      return;
    }

    if (userLoc && ambulanceLoc) {
      const bounds = L.latLngBounds([
        [userLoc.lat, userLoc.lng],
        [ambulanceLoc.lat, ambulanceLoc.lng]
      ]);
      const boundsStr = bounds.toBBoxString();
      if (boundsStr !== lastBoundsRef.current) {
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
        lastBoundsRef.current = boundsStr;
      }
    } else if (userLoc) {
      map.panTo([userLoc.lat, userLoc.lng], { animate: true });
    }
  }, [userLoc, ambulanceLoc, manualCenter, map]);

  return null;
}

function MapCenterer({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      const pos = center.lat ? [center.lat, center.lng] : center;
      map.setView(pos, map.getZoom(), { animate: true });
    }
  }, [center, map]);
  return null;
}


let audioCtx = null;
function playAlertBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.08);
      osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.08);
    });
  } catch (e) { }
}

function calcDist(pos1, pos2) {
  if (!pos1 || !pos2) return Infinity;
  const p1 = pos1.lat ? pos1 : { lat: pos1[0], lng: pos1[1] };
  const p2 = pos2.lat ? pos2 : { lat: pos2[0], lng: pos2[1] };
  const R = 6371; // km
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function UserDashboard({ socket, connected }) {
  const [userLocation, setUserLocation] = useState(null);
  const [ambulances, setAmbulances] = useState({});
  const [hospitals, setHospitals] = useState({});
  const [trafficIncidents, setTrafficIncidents] = useState({});
  const [requestStatus, setRequestStatus] = useState(localStorage.getItem('user_requestStatus') || 'idle');
  const [activeReqId, setActiveReqId] = useState(localStorage.getItem('user_activeReqId') || null);
  const [assignedAmbulanceId, setAssignedAmbulanceId] = useState(localStorage.getItem('user_assignedAmbulanceId') || null);
  const [userId] = useState(() => {
    const sessionUserStr = sessionStorage.getItem('rescuelink_user');
    if (sessionUserStr) {
      try {
        const u = JSON.parse(sessionUserStr);
        if (u.id) return u.id;
      } catch (e) {
        console.error('Failed to parse rescuelink_user', e);
      }
    }
    let id = localStorage.getItem('user_persistent_id');
    if (!id) {
      id = 'USR-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      localStorage.setItem('user_persistent_id', id);
    }
    return id;
  });
  const [liveAmbulanceLoc, setLiveAmbulanceLoc] = useState(null);
  const [isAmbulanceArrived, setIsAmbulanceArrived] = useState(false);
  const [patientData, setPatientData] = useState(() => {
    const sessionUserStr = sessionStorage.getItem('rescuelink_user');
    let name = '';
    let mobile = '';
    if (sessionUserStr) {
      try {
        const u = JSON.parse(sessionUserStr);
        name = u.name || '';
        mobile = u.mobile || '';
      } catch (e) {}
    }
    return { name, age: '', condition: '', bloodGroup: '', mobile };
  });
  const [locationHistory, setLocationHistory] = useState([]);
  const [routePath, setRoutePath] = useState(null);
  const [assignedHospitalId, setAssignedHospitalId] = useState(null);
  const [assignedHospitalInfo, setAssignedHospitalInfo] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [missions, setMissions] = useState({});
  const [currentReqId, setCurrentReqId] = useState(localStorage.getItem('user_currentReqId') || null);
  const [isScanning, setIsScanning] = useState(false);
  const [otpTransactionId, setOtpTransactionId] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [tempNationalId, setTempNationalId] = useState('');
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [sosMode, setSosMode] = useState(false);
  const etaTimerRef = React.useRef(null);

  const [locationMethod, setLocationMethod] = useState('detecting...');
  const [searchQuery, setSearchQuery] = useState('');
  const [manualCenter, setManualCenter] = useState(null);

  // ─── Enterprise Features State ──────────────────────────────────────────────
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [showCPRGuide, setShowCPRGuide] = useState(false);
  const [showBloodNetwork, setShowBloodNetwork] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [familyTrackingLink, setFamilyTrackingLink] = useState(null);
  const [showFamilyLinkModal, setShowFamilyLinkModal] = useState(false);
  const [accidentAlert, setAccidentAlert] = useState(null);
  const [accidentCountdown, setAccidentCountdown] = useState(30);
  const [greenCorridorActive, setGreenCorridorActive] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [voiceSosActive, setVoiceSosActive] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [wearableVitals, setWearableVitals] = useState({ heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 36.6 });
  const SERVER_URL_CONST = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;

  // ETA live countdown
  useEffect(() => {
    if (etaSeconds === null || isAmbulanceArrived) { if (etaTimerRef.current) clearInterval(etaTimerRef.current); return; }
    if (etaTimerRef.current) clearInterval(etaTimerRef.current);
    etaTimerRef.current = setInterval(() => setEtaSeconds(prev => prev > 1 ? prev - 1 : 0), 1000);
    return () => clearInterval(etaTimerRef.current);
  }, [etaSeconds, isAmbulanceArrived]);

  // Recalculate ETA whenever ambulance moves
  useEffect(() => {
    if (!liveAmbulanceLoc || !userLocation || isAmbulanceArrived) return;
    const distKm = calcDist(liveAmbulanceLoc, userLocation);
    const eta = Math.round((distKm / 50) * 3600); // 50 km/h avg
    setEtaSeconds(eta > 0 ? eta : 0);
  }, [liveAmbulanceLoc, userLocation, isAmbulanceArrived]);

  const handleManualSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const newLoc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setUserLocation(newLoc);
        setManualCenter([newLoc.lat, newLoc.lng]);
        setLocationMethod('manual');
        if (socket) socket.emit('location-update', newLoc);
      }
    } catch (e) { console.error('Search failed', e); }
  };

  useEffect(() => {
    const fetchIpLocation = async () => {
      const providers = [
        'https://ipapi.co/json/',
        'https://ip-api.com/json'
      ];

      for (const url of providers) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          const lat = data.latitude || data.lat;
          const lng = data.longitude || data.lon;
          if (lat && lng) {
            setLocationMethod('IP Geolocation');
            return { lat, lng };
          }
        } catch (err) { console.warn(`Provider ${url} failed`); }
      }
      setLocationMethod('System Default');
      return { lat: 12.9716, lng: 77.5946 }; // Bengaluru Fallback
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          setLocationMethod('Native GPS');
          setMapCenter([loc.lat, loc.lng]);
        },
        async (err) => {
          console.warn('User Location Denied/Error', err);
          const loc = await fetchIpLocation();
          setUserLocation(loc);
          setMapCenter([loc.lat, loc.lng]);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      // Manual Fallback: Place user in a neutral city center if GPS is missing/blocked
      console.warn('Geolocation not supported/blocked - Using Manual Fallback');
      fetchIpLocation().then(loc => {
        setUserLocation(loc);
        setMapCenter([loc.lat, loc.lng]);
      });
    }
  }, []);

  const simulateIdScan = async () => {
    setIsScanning(true);
    const nationalId = window.prompt(
      '📡 GLOBAL HIE SCANNER\n\nEnter patient\'s Universal Health ID, Aadhaar, or ABHA Number:',
      '303535904939'
    );
    if (!nationalId) { setIsScanning(false); return; }
    
    setTempNationalId(nationalId);
    
    try {
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await fetch('/api/hie/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nationalId })
      });
      const data = await res.json();
      
      if (data.status === "SUCCESS") {
        setOtpTransactionId(data.transactionId);
        setShowOtpModal(true);
      } else {
        throw new Error(data.error);
      }
    } catch (e) {
      showAlert(`⚠️ HIE Gateway Error: ${e.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const verifyHieOtp = async (otp) => {
    try {
      const SERVER_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin;
      const res = await fetch('/api/hie/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: otpTransactionId, otp, nationalId: tempNationalId })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      // Add a verified flag since it came from the secure gateway
      setPatientData(prev => {
        let extractedMobile = '';
        if (data.emergencyContact && data.emergencyContact.includes('–')) {
          extractedMobile = data.emergencyContact.split('–')[1].trim();
        }
        const verifiedData = { 
          ...data, 
          isVerified: true, 
          name: data.name || prev.name,
          mobile: extractedMobile || prev.mobile || ''
        };
        if (currentReqId && socket) {
          socket.emit('patient-data', { reqId: currentReqId, ...verifiedData });
        }
        return { ...prev, ...verifiedData };
      });
      setShowOtpModal(false);
      setOtpTransactionId(null);
    } catch (e) {
      showAlert(`❌ Invalid OTP: ${e.message}`);
    }
  };

  // HIGH-RELIABILITY: Sync current mission state to active display
  useEffect(() => {
    if (currentReqId && missions[currentReqId]) {
      const m = missions[currentReqId];
      if (m.ambulanceLocation) setLiveAmbulanceLoc(m.ambulanceLocation);
      if (m.ambulanceSocket) setAssignedAmbulanceId(m.ambulanceSocket);
      if (m.routePath && !routePath) setRoutePath(m.routePath.map(pos => [pos.lat, pos.lng]));
      if (m.status) setRequestStatus(m.status);
    }
  }, [currentReqId, missions]);

  // --- Wearable Vitals Sync Simulator ---
  useEffect(() => {
    if (!wearableConnected) return;
    const timer = setInterval(() => {
      setWearableVitals(prev => {
        // Add random biological variance
        const hrDiff = Math.floor(Math.random() * 5) - 2; // -2 to +2
        const spo2Diff = Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        
        const next = {
          heartRate: Math.max(60, Math.min(120, prev.heartRate + hrDiff)),
          spo2: Math.max(92, Math.min(100, prev.spo2 + spo2Diff)),
          systolic: Math.max(100, Math.min(140, prev.systolic + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
          diastolic: Math.max(60, Math.min(90, prev.diastolic + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
          temperature: Math.max(36.1, Math.min(37.5, parseFloat((prev.temperature + (Math.random() * 0.2 - 0.1)).toFixed(1)))),
          source: 'LIVE'
        };

        // If there's an active emergency mission, stream live smartwatch vitals to the paramedic & hospital
        if (currentReqId && socket && connected) {
          socket.emit('vitals-update', { ...next, reqId: currentReqId });
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [wearableConnected, currentReqId, socket, connected]);

  // --- Offline Mode Listeners ---
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Voice SOS Background Listener ---
  useEffect(() => {
    if (!voiceSosActive) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showAlert("⚠️ Voice SOS requires Chrome or Edge browser to function correctly.");
      setVoiceSosActive(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        console.log("[SPEECH RAW INDEX]", i, transcript);
        if (transcript.includes("help") || transcript.includes("emergency") || transcript.includes("accident") || transcript.includes("sos") || transcript.includes("save")) {
          playAlertBeep();
          showAlert("🎙️ Voice SOS Detected! Triggering Emergency Sequence...");
          setVoiceSosActive(false); // Stop listening
          recognition.stop();
          requestAmbulance(null, true); // Fire request
          break;
        }
      }
    };
    
    recognition.onerror = (e) => console.warn("Voice SOS Error", e);
    recognition.start();
    
    return () => recognition.stop();
  }, [voiceSosActive]);

  useEffect(() => {
    localStorage.setItem('user_requestStatus', requestStatus);
    localStorage.setItem('user_currentReqId', currentReqId || '');
    localStorage.setItem('user_assignedAmbulanceId', assignedAmbulanceId || '');
  }, [requestStatus, currentReqId, assignedAmbulanceId]);

  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('register-user', { userId, location: userLocation });

    const onRejoin = (data) => {
      console.log(`[PERSISTENCE] Rejoined mission ${data.id}`);
      setMissions(prev => ({ ...prev, [data.id]: { ...data, status: data.status === 'pending_ambulance' ? 'searching' : 'accepted' } }));
      if (!currentReqId) setCurrentReqId(data.id);
      setRequestStatus(data.status === 'pending_ambulance' ? 'searching' : 'accepted');
      if (data.ambulanceSocket) setAssignedAmbulanceId(data.ambulanceSocket);
      if (data.routePath) setRoutePath(data.routePath.map(pos => [pos.lat, pos.lng]));
    };

    socket.on('rejoin-mission', onRejoin);
    socket.on('active-missions-update', (data) => {
        console.log('[RECOVERY] Multiple missions found:', data);
        const newMissions = {};
        data.forEach(m => {
            newMissions[m.id] = { ...m, status: m.status === 'pending_ambulance' ? 'searching' : 'accepted' };
            if (m.id === currentReqId && m.ambulanceSocket) {
                setAssignedAmbulanceId(m.ambulanceSocket);
                localStorage.setItem('user_assignedAmbulanceId', m.ambulanceSocket);
            }
        });
        setMissions(prev => ({ ...prev, ...newMissions }));
        if (!currentReqId && data.length > 0) setCurrentReqId(data[0].id);
    });

    socket.on('ambulances-update', (data) => setAmbulances(data));
    socket.on('hospitals-update', (data) => setHospitals(data));
    socket.on('traffic-incidents-update', (data) => setTrafficIncidents(data || {}));

    socket.on('ambulance-request-response', (req) => {
      setMissions(prev => ({
        ...prev,
        [req.id]: { ...req, status: req.accepted ? 'accepted' : 'idle' }
      }));

      if (req.accepted) {
        if (req.id === currentReqId || !currentReqId) {
            setCurrentReqId(req.id);
            setRequestStatus('accepted');
            setAssignedAmbulanceId(req.ambulanceSocket);
            if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
        }
        playAlertBeep();
      } else {
        showAlert('Ambulance rejected the request. Please try another.');
      }
    });

    socket.on('location-update', (data) => {
      const targetReqId = data.reqId;
      if (targetReqId) {
          setMissions(prev => {
              const m = prev[targetReqId];
              if (!m) return prev;
              return {
                  ...prev,
                  [targetReqId]: { ...m, ambulanceLocation: { lat: data.lat, lng: data.lng } }
              };
          });
      }

      if (targetReqId === currentReqId || data.ambulanceSocket === assignedAmbulanceId) {
        setLiveAmbulanceLoc({ lat: data.lat, lng: data.lng });
        setLocationHistory(prev => [...prev.slice(-49), [data.lat, data.lng]]);
        if (data.arrivedAtUser) {
          setIsAmbulanceArrived(true);
          setRequestStatus('arriving');
        }
        if (data.destinationId) setAssignedHospitalId(data.destinationId);
      }
    });

    socket.on('ambulance-arrived', (data) => {
      setMissions(prev => ({
          ...prev,
          [data.reqId]: { ...prev[data.reqId], arrived: true }
      }));
      if (data.reqId === currentReqId) {
        setIsAmbulanceArrived(true);
        setRequestStatus('arriving');
      }
    });

    socket.on('request-acknowledged', (data) => {
      setMissions(prev => ({ ...prev, [data.id]: { ...data, status: 'searching' } }));
      setCurrentReqId(data.id);
      setRequestStatus('searching');
    });

    socket.on('mission-completed', (data) => {
      const compReqId = data?.reqId;
      console.log(`[MISSION] Completion received for ${compReqId}.`);
      
      if (data?.reason === 'ambulance_disconnected') {
        showAlert("⚠️ CRITICAL: Your assigned ambulance lost connection. Please request a new dispatch immediately.");
      }
      
      setMissions(prev => {
          const next = { ...prev };
          delete next[compReqId];
          return next;
      });

      if (compReqId === currentReqId || !compReqId) {
          setRequestStatus('idle');
          setCurrentReqId(null);
          setAssignedAmbulanceId(null);
          setIsAmbulanceArrived(false);
          setLiveAmbulanceLoc(null);
          setAssignedHospitalId(null);
          setAssignedHospitalInfo(null);
          setEtaSeconds(null);
          setSosMode(false);
          localStorage.removeItem('user_currentReqId');
      }
    });

    socket.on('hospital-request-response', (req) => {
      if (req.status === 'hospital_accepted' && req.assignedHospital) {
        setAssignedHospitalInfo(req.assignedHospital);
        if (req.assignedHospital?.id) setAssignedHospitalId(req.assignedHospital.id);
      }
    });

    return () => {
      socket.off('rejoin-mission');
      socket.off('active-missions-update');
      socket.off('ambulances-update');
      socket.off('hospitals-update');
      socket.off('traffic-incidents-update');
      socket.off('ambulance-request-response');
      socket.off('location-update');
      socket.off('ambulance-arrived');
      socket.off('request-acknowledged');
      socket.off('mission-completed');
      socket.off('hospital-request-response');
    };
  }, [socket, connected, userId, userLocation, currentReqId, assignedAmbulanceId, ambulances]);

  const requestAmbulance = (ambId, isSOS = false, userPhoneOverride = null) => {
    if (!socket || !userLocation) return;
    const condition = isSOS ? 'SOS EMERGENCY — IMMEDIATE DISPATCH REQUIRED' : (patientData.condition.trim() || 'Marketplace Requested Ambulance Dispatch');
    setRequestStatus('searching');
    if (isSOS) setSosMode(true);

    let userPhone = userPhoneOverride || patientData.mobile || '';
    if (!userPhone) {
      const sessionUserStr = sessionStorage.getItem('rescuelink_user');
      if (sessionUserStr) {
        try {
          const u = JSON.parse(sessionUserStr);
          userPhone = u.mobile || '';
        } catch (e) {}
      }
    }

    if (!userPhone) {
      showAlert("⚠️ A valid phone number is required in the Patient Information form to request dispatch.");
      setRequestStatus('idle');
      if (isSOS) setSosMode(false);
      return;
    }

    socket.emit('request-ambulance', {
      userId,
      userLocation,
      ambulanceId: ambId,
      patientDetails: isSOS ? { name: 'Unknown (SOS)', age: '', condition, bloodGroup: '' } : patientData,
      isEmergency: true,
      userPhone
    });
  };

  const requestSOSDispatch = () => {
    if (!socket || !userLocation) { showAlert('Location not ready. Please wait a moment.'); return; }
    
    let userPhone = patientData.mobile || '';
    if (!userPhone) {
      const sessionUserStr = sessionStorage.getItem('rescuelink_user');
      if (sessionUserStr) {
        try {
          const u = JSON.parse(sessionUserStr);
          userPhone = u.mobile || '';
        } catch (e) {}
      }
    }

    if (!userPhone) {
      showAlert("⚠️ A valid phone number is required in the Patient Information form to trigger SOS.");
      return;
    }

    if (!window.confirm('🚨 CONFIRM SOS DISPATCH\n\nThis will immediately alert the nearest ambulance.\nOnly use in a genuine emergency.')) return;
    requestAmbulance(null, true, userPhone);
  };

  const topAmbs = Object.entries(ambulances)
    .map(([id, a]) => {
      // If ambulance has no location, assume it's at the local city center for demo visibility
      const ambLoc = a.location || userLocation || { lat: 12.9716, lng: 77.5946 };
      return { id, ...a, distance: calcDist(userLocation, ambLoc) };
    })
    .filter(a => a.available)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10); // Increase visibility to 10 units

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#050a1e', color: '#e0eaff', fontFamily: "'Rajdhani', sans-serif" }}>
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50% { opacity: 0.6; filter: brightness(1.5); }
        }
        @keyframes sosGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,30,30,0.3), 0 0 40px rgba(255,30,30,0.1); }
          50% { box-shadow: 0 0 35px rgba(255,30,30,0.7), 0 0 60px rgba(255,30,30,0.3); }
        }
        @media (max-width: 1024px) {
          .main-content-layout {
            flex-direction: column !important;
            overflow-y: auto !important;
          }
          .sidebar-container {
            width: 100% !important;
            height: auto !important;
            max-height: 50vh !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(0,200,255,0.1) !important;
          }
          .map-view-container {
            flex: none !important;
            height: 50vh !important;
            width: 100% !important;
          }
          .header-container {
            padding: 12px 16px !important;
          }
          .desktop-header-spacer {
            display: none !important;
          }
        }
        /* Custom scrollbar for sidebar */
        .sidebar-container::-webkit-scrollbar {
          width: 6px;
        }
        .sidebar-container::-webkit-scrollbar-track {
          background: rgba(5, 10, 30, 0.3);
        }
        .sidebar-container::-webkit-scrollbar-thumb {
          background: rgba(0, 200, 255, 0.3);
          border-radius: 3px;
        }
        .sidebar-container::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 200, 255, 0.6);
        }
      `}</style>

      {/* Header */}
      <div className="header-container" style={{ background: 'rgba(5,15,40,0.95)', padding: '12px 24px', borderBottom: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24 }}>🚑</div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "'Orbitron'", letterSpacing: 2, color: '#00c8ff' }}>RESCUELINK USER</h1>
          </div>

          {/* 📡 LIVE NETWORK PULSE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(0,255,136,0.05)', borderRadius: 20, border: '1px solid rgba(0,255,136,0.2)' }}>
            <div style={{ 
              width: 8, height: 8, borderRadius: '50%', background: '#00ff88', 
              boxShadow: '0 0 10px #00ff88', animation: 'pulse-opacity 1.5s infinite' 
            }} />
            <span style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", letterSpacing: 1 }}>GATEWAY: ACTIVE</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: socket?.connected ? '#00ff88' : '#ff4444',
              boxShadow: socket?.connected ? '0 0 12px #00ff88' : '0 0 8px #ff4444',
              position: 'relative', zIndex: 2,
              animation: socket?.connected ? 'pulse-opacity 1s ease-in-out infinite' : 'none'
            }} />
            {socket?.connected && (
              <div style={{
                position: 'absolute', inset: -4, borderRadius: '50%',
                background: 'rgba(0,255,136,0.4)', animation: 'pulse-ring 2s ease-out infinite',
                zIndex: 1
              }} />
            )}
          </div>

          <div style={{ padding: '4px 12px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 20, fontSize: 12, border: '1px solid rgba(0,255,136,0.3)', fontFamily: "'Orbitron'" }}>
            STATUS: {requestStatus.toUpperCase()}
          </div>

          {/* Mission Switcher */}
          {Object.keys(missions).length > 1 && (
            <div style={{ display: 'flex', gap: 10, padding: '4px 12px', background: 'rgba(0,200,255,0.05)', borderRadius: 20, border: '1px solid rgba(0,200,255,0.1)' }}>
              {Object.keys(missions).map(id => (
                <button
                  key={id}
                  onClick={() => setCurrentReqId(id)}
                  style={{
                    padding: '2px 8px',
                    background: currentReqId === id ? '#00c8ff' : 'rgba(0,200,255,0.1)',
                    border: `1px solid ${currentReqId === id ? '#00c8ff' : 'rgba(0,200,255,0.3)'}`,
                    borderRadius: 4,
                    color: currentReqId === id ? '#000' : '#00c8ff',
                    fontSize: 9,
                    fontFamily: "'Orbitron'",
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {id.substring(0, 8)}...
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Right side is intentionally left blank to reserve space for global fixed actions bar */}
        <div style={{ width: 420 }} className="desktop-header-spacer" />
      </div>

      <div className="main-content-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="sidebar-container" style={{ width: 350, background: 'rgba(3,10,28,0.95)', borderRight: '1px solid rgba(0,200,255,0.1)', display: 'flex', flexDirection: 'column', padding: '24px 24px 80px', overflowY: 'auto' }}>
          
          {/* === SOS PANIC BUTTON === */}
          {requestStatus === 'idle' && (
            <button
              onClick={requestSOSDispatch}
              style={{
                width: '100%', padding: '18px', marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(255,30,30,0.25), rgba(220,0,0,0.15))',
                border: '2px solid #ff2222', borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                animation: 'sosGlow 1.5s ease-in-out infinite', boxShadow: '0 0 20px rgba(255,30,30,0.3)',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: 28 }}>🆘</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#ff4444', fontWeight: 900, letterSpacing: '0.1em' }}>SOS EMERGENCY</div>
                <div style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', marginTop: 2 }}>Instantly alerts nearest ambulance</div>
              </div>
            </button>
          )}

          {/* === ENTERPRISE FEATURE QUICK ACCESS === */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { icon: '🧠', label: 'AI COPILOT', sublabel: 'Analyze symptoms', color: '#00c8ff', action: () => setShowAICopilot(true) },
              { icon: '❤️', label: 'CPR GUIDE', sublabel: 'Life-saving mode', color: '#ff4444', action: () => setShowCPRGuide(true) },
              { icon: '🩸', label: 'BLOOD NET', sublabel: 'Find blood banks', color: '#ff4444', action: () => setShowBloodNetwork(true) },
              { icon: '🚑', label: 'MARKETPLACE', sublabel: 'Book ambulance', color: '#ffb800', action: () => setShowMarketplace(true) },
              { icon: '🎙️', label: 'VOICE SOS', sublabel: voiceSosActive ? 'Listening...' : 'Say "Help"', color: voiceSosActive ? '#00ff88' : '#8888ff', action: () => setVoiceSosActive(!voiceSosActive) },
              { icon: '⌚', label: 'WEARABLE', sublabel: wearableConnected ? 'Connected' : 'Pair Watch', color: wearableConnected ? '#00ff88' : '#aaaaaa', action: () => {
                if (wearableConnected) {
                  if (window.confirm('Simulate Fall Detection?')) {
                    playAlertBeep();
                    showAlert('⚠️ FALL DETECTED BY WEARABLE. Auto-Dispatching SOS...');
                    requestAmbulance(null, true);
                  }
                } else {
                  setWearableConnected(true);
                  showAlert('⌚ Smartwatch Paired. Fall detection active.');
                }
              } },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                padding: '10px 4px', background: `${btn.color}15`,
                border: `1px solid ${btn.color}40`, borderRadius: 8, cursor: 'pointer',
                textAlign: 'center', transition: 'all 0.2s',
                boxShadow: btn.label === 'VOICE SOS' && voiceSosActive ? `0 0 10px ${btn.color}40` : 'none'
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{btn.icon}</div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 8, color: btn.color, fontWeight: 700, letterSpacing: '0.05em' }}>{btn.label}</div>
                <div style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)', marginTop: 2 }}>{btn.sublabel}</div>
              </button>
            ))}
          </div>

          {/* Offline Mode Banner */}
          {isOffline && (
            <div style={{ background: 'rgba(255,184,0,0.1)', border: '2px solid #ffb800', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>📡</span>
                <div>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 12, color: '#ffb800', fontWeight: 700 }}>RURAL EMERGENCY MODE</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,184,0,0.8)' }}>No Internet Detected. Using SMS/USSD Fallback.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => window.open('sms:112?body=EMERGENCY%20SOS%20NEED%20AMBULANCE')} style={{ padding: '8px', background: 'rgba(255,184,0,0.2)', border: 'none', borderRadius: 6, color: '#ffb800', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>📩 SMS SOS (112)</button>
                <button onClick={() => window.open('tel:*99#')} style={{ padding: '8px', background: 'rgba(255,184,0,0.2)', border: 'none', borderRadius: 6, color: '#ffb800', fontWeight: 'bold', fontSize: 11, cursor: 'pointer' }}>📞 USSD *99#</button>
              </div>
            </div>
          )}

          {/* === FAMILY TRACKING LINK === */}
          {currentReqId && (
            <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#ffb800', marginBottom: 8, letterSpacing: '0.1em' }}>👨‍👩‍👧 FAMILY TRACKING</div>
              <div style={{ fontSize: 11, color: 'rgba(220,230,255,0.7)', marginBottom: 8, lineHeight: 1.5 }}>
                Share this link with family to let them track you live.
              </div>
              <button onClick={() => {
                const link = `${window.location.origin}/?role=family&reqId=${currentReqId}`;
                setFamilyTrackingLink(link);
                setShowFamilyLinkModal(true);
              }} style={{
                width: '100%', padding: '8px', background: 'rgba(255,184,0,0.1)',
                border: '1px solid rgba(255,184,0,0.4)', borderRadius: 6, color: '#ffb800',
                fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700, cursor: 'pointer'
              }}>📤 SHARE FAMILY LINK</button>
            </div>
          )}

          {/* Green Corridor Active Banner */}
          {greenCorridorActive && (
            <div style={{ background: 'rgba(0,255,136,0.1)', border: '2px solid #00ff88', borderRadius: 8, padding: 12, marginBottom: 12, animation: 'sosGlow 2s ease infinite' }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00ff88', marginBottom: 4 }}>🟢 GREEN CORRIDOR ACTIVE</div>
              <div style={{ fontSize: 11, color: 'rgba(0,255,136,0.7)' }}>Traffic signals cleared for your ambulance route</div>
            </div>
          )}

          {/* === ETA & TRACKING PANEL (when active) === */}
          {(currentReqId || requestStatus !== 'idle') && (
            <div style={{
              background: 'rgba(0,200,255,0.05)', border: '1px solid rgba(0,200,255,0.2)',
              borderRadius: 10, padding: 16, marginBottom: 15,
            }}>
              {sosMode && (
                <div style={{ background: 'rgba(255,30,30,0.15)', border: '1px solid #ff3333', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontFamily: "'Orbitron'", fontSize: 11, color: '#ff5555', textAlign: 'center', letterSpacing: '0.05em' }}>
                  🆘 SOS DISPATCH ACTIVE
                </div>
              )}
              <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'", marginBottom: 4, textAlign: 'center' }}>ACTIVE MISSION ID</div>
              <div style={{ fontSize: 14, color: '#00c8ff', fontWeight: 'bold', fontFamily: "'Orbitron'", letterSpacing: 1, textAlign: 'center', marginBottom: 12 }}>
                {currentReqId && currentReqId.length > 15 ? currentReqId.slice(0, 8) + '...' + currentReqId.slice(-4) : currentReqId}
              </div>

              {/* ETA Countdown */}
              {etaSeconds !== null && !isAmbulanceArrived && liveAmbulanceLoc && (
                <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 8, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,184,0,0.7)', fontFamily: "'Orbitron'", marginBottom: 4 }}>🚑 ESTIMATED ARRIVAL</div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Orbitron'", color: etaSeconds < 120 ? '#ff6b35' : '#ffb800' }}>
                    {Math.floor(etaSeconds / 60)}:{String(etaSeconds % 60).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,184,0,0.5)', marginTop: 2 }}>MIN : SEC</div>
                </div>
              )}
              {isAmbulanceArrived && (
                <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', borderRadius: 8, padding: '10px', marginBottom: 12, textAlign: 'center', fontFamily: "'Orbitron'", fontSize: 12, color: '#00ff88' }}>
                  ✅ AMBULANCE ARRIVED
                </div>
              )}

              {/* Wearable Live Stream Stats */}
              {wearableConnected && (
                <div style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold', letterSpacing: '0.05em' }}>⌚ WEARABLE LIVE VITALS</span>
                    <span style={{ fontSize: 8, color: '#00ff88', fontFamily: "'Share Tech Mono'", animation: 'pulse-opacity 1s infinite' }}>● STREAMING</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)' }}>HEART RATE</div>
                      <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron'", color: '#ff4444' }}>{wearableVitals.heartRate} <span style={{ fontSize: 8 }}>BPM</span></div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)' }}>SPO2</div>
                      <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron'", color: '#00c8ff' }}>{wearableVitals.spo2}%</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)' }}>BLOOD PRESSURE</div>
                      <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "'Orbitron'", color: '#ffb800', marginTop: 2 }}>{wearableVitals.systolic}/{wearableVitals.diastolic}</div>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.4)' }}>TEMP</div>
                      <div style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron'", color: '#00ff88' }}>{wearableVitals.temperature}°C</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Assigned Hospital Card */}
              {assignedHospitalInfo && (
                <div style={{ background: 'rgba(0,100,255,0.08)', border: '1px solid rgba(0,150,255,0.3)', borderRadius: 8, padding: '10px', marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", marginBottom: 4 }}>🏥 DESTINATION HOSPITAL</div>
                  <div style={{ fontSize: 13, color: '#7dcfff', fontWeight: 'bold' }}>{assignedHospitalInfo.name || 'Assigned Hospital'}</div>
                  {assignedHospitalInfo.contactInfo && <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.5)', marginTop: 4 }}>📞 {assignedHospitalInfo.contactInfo}</div>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <a href="tel:108" style={{
                  flex: 1, padding: '10px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)',
                  borderRadius: 6, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold',
                  textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                }}>📞 CALL 108</a>
                <button
                  onClick={() => {
                    if (window.confirm("Abort current request?")) {
                      if (currentReqId && socket) socket.emit('cancel-request', { reqId: currentReqId });
                      setRequestStatus('idle'); setCurrentReqId(null); setAssignedAmbulanceId(null);
                      setRoutePath(null); setLiveAmbulanceLoc(null); setAssignedHospitalInfo(null);
                      setEtaSeconds(null); setSosMode(false);
                      localStorage.removeItem('user_currentReqId');
                      setPatientData({ name: '', age: '', bloodGroup: 'O+', condition: '', isVerified: false });
                    }
                  }}
                  style={{ flex: 1, padding: '10px', background: 'rgba(255,100,50,0.1)', border: '1px solid rgba(255,107,53,0.4)', borderRadius: 6, color: '#ff6b35', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}
                >🚨 CANCEL</button>
              </div>
            </div>
          )}

          <div style={{ background: 'rgba(255,107,53,0.1)', padding: '16px', borderRadius: 8, border: '1px solid rgba(255,107,53,0.3)', marginBottom: 10 }}>
            <h3 style={{ color: '#ff6b35', fontSize: 13, marginTop: 0, fontFamily: "'Orbitron'" }}>PATIENT INFORMATION</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aiAnalysisResult && (
                <div style={{ background: 'rgba(0,200,255,0.15)', border: '1px solid #00c8ff', borderRadius: 8, padding: 12, marginBottom: 4 }}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#00c8ff', marginBottom: 6, fontWeight: 'bold', letterSpacing: '0.05em' }}>🧠 CO-PILOT ANALYSIS RESULT</div>
                  <div style={{ fontSize: 12, fontWeight: 'bold' }}>Condition: {aiAnalysisResult.detectedCondition || 'Unknown'}</div>
                  <div style={{ fontSize: 10, color: 'rgba(220,230,255,0.7)', marginTop: 4 }}>Triage Level: {aiAnalysisResult.triageLevel || 'Non-Urgent'}</div>
                  {requestStatus === 'idle' && (
                    <button
                      onClick={() => requestAmbulance(null, false)}
                      style={{
                        width: '100%', marginTop: 10, padding: '8px',
                        background: 'linear-gradient(135deg, #00c8ff, #0077ff)',
                        border: 'none', borderRadius: 6, color: '#fff',
                        fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700,
                        cursor: 'pointer', letterSpacing: '0.05em'
                      }}
                    >
                      🚑 REQUEST AMBULANCE NOW
                    </button>
                  )}
                </div>
              )}
              <button 
                onClick={simulateIdScan}
                disabled={isScanning}
                style={{
                  width: '100%', padding: '12px', background: isScanning ? 'rgba(0,200,255,0.1)' : 'rgba(0,200,255,0.2)',
                  border: '1px solid #00c8ff', borderRadius: 8, color: '#00c8ff',
                  fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.3s'
                }}
              >
                {isScanning ? '🛰️ ACCESSING HEALTH REGISTRY...' : '📡 SCAN UNIVERSAL HEALTH ID'}
              </button>

              <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '5px 0' }}>— OR ENTER MANUALLY —</div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>PATIENT NAME</div>
                  {patientData.isVerified && (
                    <div style={{ 
                      background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid #00ff88', 
                      borderRadius: 12, padding: '2px 6px', fontSize: 9, fontFamily: "'Orbitron'", 
                      display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 0 10px rgba(0,255,136,0.2)' 
                    }}>
                      <span style={{ fontSize: 10 }}>✅</span> ABDM VERIFIED
                    </div>
                  )}
                </div>

                <input 
                  type="text" 
                  value={patientData.name} 
                  onChange={e => setPatientData({...patientData, name: e.target.value})}
                  placeholder="Full Name"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: 8, color: '#fff', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>AGE</div>
                  <input 
                    type="number" 
                    value={patientData.age} 
                    onChange={e => setPatientData({...patientData, age: e.target.value})}
                    placeholder="Age"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: 8, color: '#fff', fontSize: 14 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>BLOOD GROUP</div>
                  <input 
                    type="text" 
                    value={patientData.bloodGroup} 
                    onChange={e => setPatientData({...patientData, bloodGroup: e.target.value})}
                    placeholder="O+, A-, etc."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: 8, color: '#fff', fontSize: 14 }}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>PHONE NUMBER (For dispatch updates & WhatsApp notifications)</div>
                <input 
                  type="tel" 
                  value={patientData.mobile} 
                  onChange={e => setPatientData({...patientData, mobile: e.target.value})}
                  placeholder="+91 or E.164 phone number"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: 8, color: '#fff', fontSize: 14 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>CRITICAL CONDITION (e.g. Heart Attack)</div>
                <textarea 
                  value={patientData.condition} 
                  onChange={e => setPatientData({...patientData, condition: e.target.value})}
                  placeholder="Describe the emergency..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: 8, color: '#fff', fontSize: 14, minHeight: 60, resize: 'none' }}
                />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ color: '#00c8ff', fontSize: 13, marginTop: 10, fontFamily: "'Orbitron'" }}>NEARBY DISPATCH UNITS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topAmbs.length === 0 && <div style={{ color: '#888', fontSize: 12 }}>Waiting for GPS...</div>}
              {topAmbs.map(amb => (
                <div key={amb.id} style={{ 
                  background: assignedAmbulanceId === amb.id ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.03)', 
                  border: `1px solid ${assignedAmbulanceId === amb.id ? '#00ff88' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 'bold' }}>{amb.driverName || amb.name}</div>
                    <div style={{ fontSize: 10, color: '#00c8ff', fontFamily: "'Orbitron'" }}>AVAILABLE</div>
                  </div>
                  {requestStatus === 'idle' && (
                    <button 
                      onClick={() => requestAmbulance(amb.id)}
                      style={{ background: '#ff6b35', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 11, cursor: 'pointer', fontFamily: "'Orbitron'" }}
                    >
                      REQUEST
                    </button>
                  )}
                  {assignedAmbulanceId === amb.id && (
                    <div style={{ color: '#00ff88', fontSize: 18 }}>🛡️</div>
                  )}
                </div>
              ))}
            </div>
          </div>

           {requestStatus !== 'idle' && assignedAmbulanceId && (
             <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", marginBottom: 8, textAlign: 'center' }}>🚑 PARAMEDIC CONNECTION LIVE</div>
                <VideoCall 
                  socket={socket} 
                  role="user" 
                  missionId={currentReqId} 
                />
             </div>
          )}
          {requestStatus === 'searching' && !assignedAmbulanceId && (
            <div style={{ 
              marginTop: 20, padding: 20, textAlign: 'center', background: 'rgba(255,184,0,0.05)', 
              border: '1px solid rgba(255,184,0,0.2)', borderRadius: 8, animation: 'pulse 2s infinite' 
            }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>📡</div>
              <div style={{ fontSize: 12, color: '#ffb800', fontFamily: "'Orbitron'" }}>SCANNING FOR UNITS...</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Video link will activate once unit accepts.</div>
            </div>
          )}
        </div>

        {/* Map View */}
        <div className="map-view-container" style={{ flex: 1, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 15, left: 15, right: 15, zIndex: 1000,
            display: 'flex', gap: 8
          }}>
            <input 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
              placeholder="Search your city/area..."
              style={{
                flex: 1, padding: '10px 15px', background: 'rgba(5,15,40,0.9)', 
                border: '1px solid rgba(0,255,136,0.4)', borderRadius: 8, 
                color: '#fff', fontSize: 13, outline: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
              }}
            />
            <button onClick={handleManualSearch} style={{
              padding: '10px 15px', background: 'rgba(0,255,136,0.2)', 
              border: '1px solid #00ff88', borderRadius: 8, color: '#00ff88',
              cursor: 'pointer', fontSize: 14
            }}>📍</button>
          </div>
          <div style={{
            position: 'absolute', bottom: 10, left: 10, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: 4,
            fontSize: 10, color: 'rgba(0,255,136,0.8)', fontFamily: "'Share Tech Mono'"
          }}>
            LOCATION: {locationMethod}
          </div>
          <MapContainer
            center={mapCenter || [12.9716, 77.5946]}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">Carto</a>'
            />
            
            <SmartMapController 
              userLoc={userLocation} 
              ambulanceLoc={liveAmbulanceLoc} 
              manualCenter={manualCenter} 
            />

            {/* Locate Me Button Overlay */}
            <div style={{ position: 'absolute', top: 60, right: 10, zIndex: 1000 }}>
              <button 
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(pos => {
                    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setUserLocation(loc);
                    setMapCenter([loc.lat, loc.lng]);
                  });
                }}
                style={{
                  background: 'rgba(0,200,255,0.2)', border: '1px solid #00c8ff',
                  borderRadius: 4, padding: '5px 10px', color: '#00c8ff', cursor: 'pointer',
                  fontFamily: "'Orbitron'", fontSize: 10
                }}
              >
                🛰️ LOCATE ME
              </button>
            </div>
            {/* User Location Marker */}
            {userLocation && (
              <Marker position={userLocation} icon={userIcon}>
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>📍 Your Location</strong><br />
                    Lat: {userLocation.lat.toFixed(4)}<br />
                    Lng: {userLocation.lng.toFixed(4)}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* FIX: map follows user GPS then ambulance movement in real-time */}
            <MapCenterer center={liveAmbulanceLoc || userLocation} />

            {/* All Registered & Live Hospitals */}
            {Object.values(hospitals).map(h => {
              const pos = h.pos || h.location || { lat: h.lat, lng: h.lng };
              const isOnline = h.isOnline || !!h.socketId;
              if (!pos.lat) return null;
              
              return (
                <Marker key={h.id} position={[pos.lat, pos.lng]} icon={hospitalIcon}>
                  <Popup>
                    <div style={{ color: '#333', minWidth: 150 }}>
                      <strong style={{ color: '#0052cc' }}>{h.name}</strong><br />
                      <span style={{ 
                        fontSize: 9, 
                        color: isOnline ? '#008855' : '#888',
                        fontWeight: 'bold'
                      }}>
                        {isOnline ? '● LIVE DASHBOARD ACTIVE' : '○ REGISTRY ENTRY (OFFLINE)'}
                      </span><br />
                      <div style={{ marginTop: 5, fontSize: 11, borderTop: '1px solid #eee', paddingTop: 5 }}>
                        Distance: {calcDist(userLocation, pos).toFixed(1)} km<br />
                        Contact: {h.contactInfo || 'Not Listed'}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Available Ambulance Markers - Only shown when idle */}
            {requestStatus === 'idle' && topAmbs.map((amb) => {
              if (!amb.location) return null;
              return (
                <Marker key={amb.id} position={amb.location} icon={ambulanceIcon}>
                  <Popup>
                    <div style={{ color: '#333' }}>
                      <strong>Ambulance Unit</strong><br />
                      🟢 Available<br />
                      <button 
                        onClick={() => requestAmbulance(amb.id)}
                        style={{ marginTop: '10px', width: '100%', padding: '5px', backgroundColor: '#ff6b35', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Request Dispatch
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Live Assigned Ambulance Marker */}
            {assignedAmbulanceId && liveAmbulanceLoc && requestStatus !== 'idle' && (
              <Marker position={liveAmbulanceLoc} icon={ambulanceIcon}>
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>🚑 YOUR ASSIGNED UNIT</strong><br />
                    {isAmbulanceArrived ? '🟢 Arrived' : '🔴 En Route'}<br />
                    📍 {liveAmbulanceLoc.lat.toFixed(4)}°N, {liveAmbulanceLoc.lng.toFixed(4)}°E
                  </div>
                </Popup>
              </Marker>
            )}

            {/* OTHER ACTIVE AMBULANCES (City Overview) */}
            {Object.entries(ambulances).map(([id, amb]) => {
              if (!amb.location || id === assignedAmbulanceId) return null;
              return (
                <Marker key={id} position={amb.location} icon={ambulanceIcon} opacity={0.4}>
                  <Popup>
                    <div style={{ color: '#333' }}>
                      <strong>Ambulance {amb.name}</strong><br />
                      {amb.available ? '🟢 Available' : '🔴 Busy'}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {locationHistory.length > 1 && (
              <Polyline positions={locationHistory} color="#00c8ff" weight={3} opacity={0.5} />
            )}

            {/* Hospital Markers */}
            {Object.entries(hospitals).map(([id, hosp]) => {
              if (!hosp.location) return null;
              if (isAmbulanceArrived && assignedHospitalId && assignedHospitalId !== id) return null;
              
              return (
                <Marker key={id} position={hosp.location} icon={hospitalIcon}>
                  <Popup>
                    <div style={{ color: '#333' }}>
                      <strong>🏥 {hosp.name}</strong><br />
                      {assignedHospitalId === id ? '🟢 Destination Hospital' : 'Available Hospital'}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {routePath && (
              <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
            )}

            {Object.values(trafficIncidents).map((incident) => (
              <React.Fragment key={incident.id}>
                <Circle
                  center={[incident.lat, incident.lng]}
                  radius={incident.radius || 300}
                  pathOptions={{
                    color: '#ff3333',
                    fillColor: '#ff3333',
                    fillOpacity: 0.15,
                    dashArray: '5, 10',
                    weight: 2
                  }}
                >
                  <Popup>
                    <div style={{ color: '#333', fontFamily: 'sans-serif' }}>
                      <strong style={{ color: '#ff3333' }}>⚠️ Traffic Incident / Blockage</strong>
                      <p style={{ margin: '5px 0 0 0', fontSize: '11px' }}>{incident.reason}</p>
                      <span style={{ fontSize: '9px', color: '#666' }}>Radius: {incident.radius}m</span>
                    </div>
                  </Popup>
                </Circle>
                <Circle
                  center={[incident.lat, incident.lng]}
                  radius={20}
                  pathOptions={{
                    color: '#ff1111',
                    fillColor: '#ff1111',
                    fillOpacity: 0.8,
                    weight: 1
                  }}
                />
              </React.Fragment>
            ))}
          </MapContainer>

          {/* 🔐 ABDM CONSENT GATEWAY (OTP MODAL) */}
          {showOtpModal && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,10,30,0.95)', zIndex: 99999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #0a1e3a 0%, #020814 100%)',
                border: '1px solid #00c8ff', borderRadius: 20, width: 400, padding: 40,
                textAlign: 'center', boxShadow: '0 0 50px rgba(0,200,255,0.2)'
              }}>
                <div style={{ fontSize: 48, marginBottom: 20 }}>🔐</div>
                <h2 style={{ fontFamily: "'Orbitron'", color: '#00c8ff', marginBottom: 10, fontSize: 18 }}>ABDM CONSENT REQUIRED</h2>
                <p style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', marginBottom: 30, lineHeight: 1.5 }}>
                  A secure consent request has been sent to the mobile number registered with ID: <strong>{tempNationalId}</strong>.<br/><br/>
                  Please enter the 6-digit verification code to release medical records.
                </p>
                
                <input 
                  type="text" 
                  maxLength="6"
                  placeholder="· · · · · ·"
                  onKeyUp={(e) => {
                    if (e.target.value.length === 6) verifyHieOtp(e.target.value);
                  }}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '2px solid rgba(0,200,255,0.3)',
                    borderRadius: 12, padding: '15px', color: '#fff', fontSize: 24, textAlign: 'center',
                    letterSpacing: 8, fontFamily: "'Orbitron'", outline: 'none', marginBottom: 20
                  }}
                />
                
                <div style={{ display: 'flex', gap: 10 }}>
                  <button 
                    onClick={() => setShowOtpModal(false)}
                    style={{ flex: 1, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, cursor: 'pointer' }}
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => verifyHieOtp(document.querySelector('input[placeholder="· · · · · ·"]').value)}
                    style={{ flex: 2, padding: 12, background: '#00c8ff', border: 'none', color: '#000', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'" }}
                  >
                    VERIFY & FETCH
                  </button>
                </div>
                
                <div style={{ marginTop: 25, fontSize: 10, color: 'rgba(160,200,255,0.3)', letterSpacing: 1 }}>
                  OFFICIAL NATIONAL HEALTH AUTHORITY GATEWAY v2.1
                </div>
              </div>
            </div>
          )}

          {requestStatus === 'searching' && (
            <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,107,53,0.9)', color: '#fff', padding: '10px 20px', borderRadius: 4, zIndex: 1000, fontFamily: "'Orbitron'", fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 12, height: 12, border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              SEARCHING FOR NEAREST DISPATCH...
            </div>
          )}

          {isAmbulanceArrived && (
            <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#00ff88', color: '#000', padding: '15px 30px', borderRadius: 12, zIndex: 1000, fontFamily: "'Orbitron'", fontSize: 16, fontWeight: 'bold', boxShadow: '0 0 30px rgba(0,255,136,0.5)' }}>
              🚑 AMBULANCE ARRIVED AT YOUR LOCATION
            </div>
          )}
        </div>
      </div>

      {/* ─── ENTERPRISE FEATURE MODALS ─────────────────────────────────────── */}

      {/* AI Emergency Copilot */}
      {showAICopilot && (
        <AIEmergencyCopilot
          onClose={() => setShowAICopilot(false)}
          onAnalysisComplete={(result, symptoms) => {
            setAiAnalysisResult(result);
            const condition = result.detectedCondition || symptoms || '';
            setPatientData(prev => ({ ...prev, condition }));
            setShowAICopilot(false);
          }}
        />
      )}

      {/* CPR Guidance Mode */}
      {showCPRGuide && (
        <CPRGuidance
          onClose={() => setShowCPRGuide(false)}
          onSOS={() => { setShowCPRGuide(false); requestSOSDispatch(); }}
        />
      )}

      {/* Blood Emergency Network */}
      {showBloodNetwork && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,5,20,0.95)', backdropFilter: 'blur(10px)' }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(220,30,30,0.3)', display: 'flex', justifyContent: 'flex-start' }}>
              <button onClick={() => setShowBloodNetwork(false)} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}>✕ CLOSE</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <BloodEmergencyNetwork socket={socket} userLocation={userLocation} patientDetails={patientData} />
            </div>
          </div>
        </div>
      )}

      {/* Ambulance Marketplace */}
      {showMarketplace && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,5,20,0.95)', backdropFilter: 'blur(10px)' }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'flex-start' }}>
              <button onClick={() => setShowMarketplace(false)} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}>✕ CLOSE</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AmbulanceMarketplace socket={socket} userLocation={userLocation}
                onBookAmbulance={(amb) => { setShowMarketplace(false); requestAmbulance(amb.id); }} />
            </div>
          </div>
        </div>
      )}

      {/* Family Tracking Link Modal */}
      {showFamilyLinkModal && familyTrackingLink && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,5,20,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#0a1526', border: '1px solid rgba(255,184,0,0.4)', borderRadius: 16, padding: 28, width: '90%', maxWidth: 460, boxShadow: '0 0 40px rgba(255,184,0,0.1)' }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ffb800', marginBottom: 8, textAlign: 'center' }}>👨‍👩‍👧 FAMILY TRACKING LINK</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.6)', marginBottom: 16, textAlign: 'center', lineHeight: 1.6 }}>
              Share this link with your family. They'll see your live location and mission status.
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,184,0,0.3)', borderRadius: 8, padding: '12px', marginBottom: 16, fontFamily: "'Share Tech Mono'", fontSize: 11, color: '#ffb800', wordBreak: 'break-all' }}>
              {familyTrackingLink}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { navigator.clipboard.writeText(familyTrackingLink); alert('Link copied!'); }} style={{
                flex: 1, padding: '10px', background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.4)',
                borderRadius: 8, color: '#ffb800', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700
              }}>📋 COPY LINK</button>
              <button onClick={() => {
                if (navigator.share) navigator.share({ title: 'Track my ambulance', url: familyTrackingLink });
                else alert('Share not supported in this browser');
              }} style={{
                flex: 1, padding: '10px', background: 'rgba(0,200,255,0.15)', border: '1px solid rgba(0,200,255,0.4)',
                borderRadius: 8, color: '#00c8ff', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700
              }}>📤 SHARE</button>
              <button onClick={() => setShowFamilyLinkModal(false)} style={{
                padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: 'rgba(160,200,255,0.5)', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10
              }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis Result Banner */}
      {aiAnalysisResult && !showAICopilot && (
        <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 9998, maxWidth: 340, background: 'rgba(5,15,40,0.97)', border: `1px solid ${aiAnalysisResult.triageColor === 'RED' ? '#ff4444' : aiAnalysisResult.triageColor === 'YELLOW' ? '#ffb800' : '#00ff88'}`, borderRadius: 12, padding: '16px', boxShadow: '0 0 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff' }}>🧠 AI ANALYSIS RESULT</div>
            <button onClick={() => setAiAnalysisResult(null)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e0eaff', marginBottom: 4 }}>{aiAnalysisResult.detectedCondition}</div>
          <div style={{ fontSize: 11, color: aiAnalysisResult.triageColor === 'RED' ? '#ff4444' : aiAnalysisResult.triageColor === 'YELLOW' ? '#ffb800' : '#00ff88', fontFamily: "'Orbitron'" }}>
            {aiAnalysisResult.severity} • {aiAnalysisResult.suggestedAmbulanceType}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.6)', marginTop: 6, lineHeight: 1.4 }}>
            Time critical: {aiAnalysisResult.estimatedTimeToDeterioration}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .custom-div-icon { background: none; border: none; }
      `}</style>
    </div>
  );
}
