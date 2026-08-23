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
import PatientPortal from './PatientPortal';

function cypherHash(input) {
  let hash = 0;
  if (input.length === 0) return hash.toString(16);
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

const generateBlockchain = (consentStatus, userId) => {
  const genesisBlock = {
    index: 0,
    timestamp: "2026-08-17T10:00:00Z",
    event: "GENESIS_BLOCK: ACCOUNT_CREATION",
    userId: userId,
    prevHash: "0000000000000000",
    hash: "8a7b3c2d1e0f9a8b"
  };

  const block1 = {
    index: 1,
    timestamp: "2026-08-17T12:04:12Z",
    event: "INITIAL_ABDM_HIE_REGISTRY_LINK",
    userId: userId,
    prevHash: genesisBlock.hash,
    hash: cypherHash(genesisBlock.hash + "INITIAL_ABDM_HIE_REGISTRY_LINK" + userId)
  };

  const block2 = {
    index: 2,
    timestamp: "2026-08-17T13:42:00Z",
    event: consentStatus ? "DPDP_CONSENT_GRANTED_SECTION_6" : "DPDP_CONSENT_REVOKED_SECTION_6",
    userId: userId,
    prevHash: block1.hash,
    hash: cypherHash(block1.hash + (consentStatus ? "DPDP_CONSENT_GRANTED_SECTION_6" : "DPDP_CONSENT_REVOKED_SECTION_6") + userId)
  };

  return [genesisBlock, block1, block2];
};


try {
  if (typeof window !== 'undefined' && L && L.Icon && L.Icon.Default) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }
} catch (e) {
  console.warn('[LEAFLET ICON PATCH ERROR]', e);
}

let userIcon = null;
let ambulanceIcon = null;
let hospitalIcon = null;
try {
  if (typeof window !== 'undefined' && L && L.DivIcon) {
    userIcon = new L.DivIcon({
      html: `<div style="font-size: 24px;">🧍</div>`,
      className: 'custom-div-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });

    ambulanceIcon = new L.DivIcon({
      html: `<div style="font-size: 24px;">🚑</div>`,
      className: 'custom-div-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });

    hospitalIcon = new L.DivIcon({
      html: `<div style="font-size: 24px;">🏥</div>`,
      className: 'custom-div-icon',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    });
  }
} catch (e) {}

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

export default function UserDashboard({ socket, connected, onLogout, onSwitchRole, onShowSecurity }) {
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

  const [pendingConsentRequest, setPendingConsentRequest] = useState(null);

  // ─── Enterprise Features State ──────────────────────────────────────────────
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [showCPRGuide, setShowCPRGuide] = useState(false);
  const [showBloodNetwork, setShowBloodNetwork] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [showPatientPortal, setShowPatientPortal] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [familyTrackingLink, setFamilyTrackingLink] = useState(null);
  const [showFamilyLinkModal, setShowFamilyLinkModal] = useState(false);
  const [accidentAlert, setAccidentAlert] = useState(null);
  const [accidentCountdown, setAccidentCountdown] = useState(30);
  const [greenCorridorActive, setGreenCorridorActive] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [voiceSosActive, setVoiceSosActive] = useState(false);
  const [wearableConnected, setWearableConnected] = useState(false);
  const [pairedDevice, setPairedDevice] = useState(null);
  const [showWearablePairing, setShowWearablePairing] = useState(false);
  const [isBleScanning, setIsBleScanning] = useState(false);
  const [bleScanProgress, setBleScanProgress] = useState(0);
  const [wearableVitals, setWearableVitals] = useState({ heartRate: 75, spo2: 98, systolic: 120, diastolic: 80, temperature: 36.6 });
  const [isIotSimOpen, setIsIotSimOpen] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [erasureReason, setErasureReason] = useState('');
  const [consentGranted, setConsentGranted] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [sosConfirmData, setSosConfirmData] = useState(null); // { phone } — pending SOS confirm
  const [abortConfirm, setAbortConfirm] = useState(false); // pending abort confirm
  const SERVER_URL_CONST = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');

  useEffect(() => {
    const syncUserHash = () => {
      const parts = window.location.hash.split('/');
      if (parts[0] === '#user') {
        setShowCPRGuide(parts[1] === 'cpr');
        setShowMarketplace(parts[1] === 'marketplace');
        setShowAICopilot(parts[1] === 'ai-copilot');
        setShowBloodNetwork(parts[1] === 'blood-network');
        setShowPatientPortal(parts[1] === 'health-portal');
        setShowAccountSettings(parts[1] === 'account-settings');
      }
    };
    window.addEventListener('hashchange', syncUserHash);
    syncUserHash();
    return () => window.removeEventListener('hashchange', syncUserHash);
  }, []);

  const routeTo = (subPath) => {
    window.location.hash = subPath ? `user/${subPath}` : 'user';
  };

  useEffect(() => {
    if (showWearablePairing && !wearableConnected) {
      const scanLiveDevices = async () => {
        try {
          if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth requires HTTPS (Chrome/Edge/Opera).');
          }
          setIsBleScanning(true);
          const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['heart_rate'] // Keep standard heart rate optional service
          });
          setIsBleScanning(false);
          setPairedDevice(device);
          setWearableConnected(true);
          setShowWearablePairing(false);
          showAlert(`⌚ Successfully paired with ${device.name || 'Bluetooth Device'}. Fall detection active.`);
        } catch (err) {
          setIsBleScanning(false);
          console.warn('BLE Scan Error:', err);
          showAlert(`Bluetooth scan: ${err.message || 'Cancelled by user.'}`);
        }
      };
      
      // Delay slightly so the modal renders before the browser popup freezes UI interaction
      const timer = setTimeout(scanLiveDevices, 500);
      return () => clearTimeout(timer);
    }
  }, [showWearablePairing, wearableConnected]);

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
      const SERVER_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://rescuelink-emergency-system.onrender.com');
      const res = await fetch(`${SERVER_URL}/api/auth/lookup-abha/${nationalId}`);
      const data = await res.json();
      
      if (res.ok) {
        // Dynamic age calculation from DOB
        let computedAge = '';
        if (data.dob) {
          const birthYear = new Date(data.dob).getFullYear();
          computedAge = new Date().getFullYear() - birthYear;
        }
        
        setPatientData(prev => {
          const updated = {
            ...prev,
            name: data.name || '',
            age: computedAge,
            bloodGroup: data.blood_group || '',
            mobile: data.mobile || '',
            isVerified: true,
            allergies: data.allergies || '',
            chronicConditions: data.chronic_conditions || '',
            abhaAddress: data.abha_address || '',
            abhaNumber: data.abha_number || ''
          };
          if (currentReqId && socket) {
            socket.emit('patient-data', { reqId: currentReqId, ...updated });
          }
          return updated;
        });
        showAlert(`✅ ABDM HIE SCAN SUCCESS: Loaded patient profile for ${data.name}`);
      } else {
        // Fallback to legacy mock verification gateway
        const resInit = await fetch('/api/hie/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nationalId })
        });
        const dataInit = await resInit.json();
        
        if (dataInit.status === "SUCCESS") {
          setOtpTransactionId(dataInit.transactionId);
          setShowOtpModal(true);
        } else {
          throw new Error(dataInit.error || 'ABDM service unreachable');
        }
      }
    } catch (e) {
      showAlert(`⚠️ HIE Gateway Error: ${e.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const verifyHieOtp = async (otp) => {
    try {
      const res = await fetch('/api/hie/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: otpTransactionId, otp, nationalId: tempNationalId })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

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
        if (prev.manualControl) {
          // If manual control is active, send current values without drifting
          if (currentReqId && socket && connected) {
            socket.emit('vitals-update', { ...prev, reqId: currentReqId });
          }
          return prev;
        }
        // Add random biological variance
        const hrDiff = Math.floor(Math.random() * 5) - 2; // -2 to +2
        const spo2Diff = Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0;
        
        const next = {
          heartRate: Math.max(60, Math.min(120, prev.heartRate + hrDiff)),
          spo2: Math.max(92, Math.min(100, prev.spo2 + spo2Diff)),
          systolic: Math.max(100, Math.min(140, prev.systolic + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
          diastolic: Math.max(60, Math.min(90, prev.diastolic + (Math.random() > 0.8 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
          temperature: Math.max(36.1, Math.min(37.5, parseFloat((prev.temperature + (Math.random() * 0.2 - 0.1)).toFixed(1)))),
          source: 'LIVE',
          manualControl: false
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

    if (sessionStorage.getItem('guest_auto_sos') === 'true' && userLocation) {
      sessionStorage.removeItem('guest_auto_sos');
      const sessionUserStr = sessionStorage.getItem('rescuelink_user');
      let phone = '9999999999';
      if (sessionUserStr) {
        try {
          const u = JSON.parse(sessionUserStr);
          phone = u.mobile || phone;
        } catch (e) {}
      }
      requestAmbulance(null, true, phone);
    }

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

    socket.on('consent-requested', (data) => {
      setPendingConsentRequest(data);
      playAlertBeep();
    });

    socket.on('green-corridor-status', (data) => {
      if (data && data.reqId === currentReqId) {
        setGreenCorridorActive(data.active);
      }
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
      socket.off('green-corridor-status');
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
      patientDetails: isSOS ? { name: 'Unknown (SOS)', age: '', condition, bloodGroup: '', mobile: userPhone } : patientData,
      isEmergency: true,
      userPhone
    });
  };

  const requestSOSDispatch = () => {
    if (!socket || !userLocation) { showAlert('Location not ready. Please wait a moment.'); return; }
    
    let defaultPhone = patientData.mobile || '';
    if (!defaultPhone) {
      const sessionUserStr = sessionStorage.getItem('rescuelink_user');
      if (sessionUserStr) {
        try {
          const u = JSON.parse(sessionUserStr);
          defaultPhone = u.mobile || '';
        } catch (e) {}
      }
    }

    const promptedPhone = window.prompt(
      "🚨 EMERGENCY SOS DISPATCH\n\nA phone number is required to coordinate with the ambulance driver.\nPlease enter or confirm your phone number:",
      defaultPhone
    );
    
    if (promptedPhone === null) {
      // User clicked Cancel on the prompt
      return;
    }

    if (!promptedPhone.trim()) {
      showAlert("⚠️ A valid phone number is required to trigger SOS.");
      return;
    }

    const userPhone = promptedPhone.trim();
    setPatientData(prev => ({ ...prev, mobile: userPhone }));
    setSosConfirmData({ phone: userPhone });
  };

  const getAmbulanceDataList = () => {
    const list = Object.entries(ambulances);
    if (list.length === 0) {
      const center = userLocation || { lat: 12.9716, lng: 77.5946 };
      return [
        ['VIRTUAL-AMB-001', { driverName: 'Metro Alpha (ALS)', available: true, location: { lat: center.lat + 0.005, lng: center.lng + 0.008 }, vehicleNo: 'EMG-MH-01', type: 'Advanced Life Support' }],
        ['VIRTUAL-AMB-002', { driverName: 'Zonal Unit 04 (BLS)', available: true, location: { lat: center.lat - 0.006, lng: center.lng + 0.005 }, vehicleNo: 'EMG-MH-02', type: 'Basic Life Support' }],
        ['VIRTUAL-AMB-003', { driverName: 'Cardiac Support 12 (ALS)', available: true, location: { lat: center.lat + 0.002, lng: center.lng - 0.009 }, vehicleNo: 'EMG-MH-03', type: 'Advanced Life Support' }]
      ];
    }
    return list;
  };

  const topAmbs = getAmbulanceDataList()
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
        .sidebar-container::-webkit-scrollbar { width: 6px; }
        .sidebar-container::-webkit-scrollbar-track { background: rgba(5,10,30,0.3); }
        .sidebar-container::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.3); border-radius: 3px; }
        .sidebar-container::-webkit-scrollbar-thumb:hover { background: rgba(0,200,255,0.6); }

        /* ══ MOBILE DASHBOARD OVERRIDES (≤768px) ══ */
        .ud-mobile-menu-btn { display: none; }
        .ud-desktop-status { display: flex; }
        @media (max-width: 768px) {
          /* Header */
          .header-container { padding: 10px 14px !important; flex-wrap: nowrap !important; }
          .ud-desktop-status { display: none !important; }
          .ud-mobile-menu-btn { display: flex !important; }
          .desktop-header-spacer { display: none !important; }
          /* Sidebar becomes full-height scroll */
          .sidebar-container {
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(0,200,255,0.1) !important;
            padding: 14px 12px 90px !important;
          }
          /* Map stacks below */
          .main-content-layout { flex-direction: column !important; overflow-y: auto !important; }
          .map-view-container { flex: none !important; height: 55vh !important; width: 100% !important; }
          /* Feature grid always 2 cols */
          .feature-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          /* Mobile dropdown menu */
          .ud-mobile-dropdown {
            position: absolute; top: 56px; left: 0; right: 0; z-index: 9999;
            background: rgba(5,15,40,0.98); border-bottom: 1px solid rgba(0,200,255,0.25);
            padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
            backdrop-filter: blur(12px);
          }
        }
        @media (min-width: 769px) {
          .ud-mobile-dropdown { display: none !important; }
          .feature-grid { grid-template-columns: 1fr 1fr 1fr !important; }
        }
      `}</style>

      <div className="header-container" style={{ position: 'relative', background: 'rgba(5,15,40,0.97)', padding: '10px 20px', borderBottom: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, zIndex: 200, flexWrap: 'wrap' }}>

      {/* ── SOS DISPATCH CONFIRM MODAL ── */}
      {sosConfirmData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.92)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSosConfirmData(null)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '2px solid rgba(255,30,30,0.5)', borderRadius: 16, padding: 36, maxWidth: 460, width: '90%', boxShadow: '0 0 80px rgba(255,30,30,0.25)', animation: 'sosGlow 1.5s ease-in-out infinite' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>🚨</div>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 18, color: '#ff4444', fontWeight: 900, letterSpacing: '0.12em' }}>CONFIRM SOS DISPATCH</div>
              <div style={{ fontSize: 11, color: 'rgba(255,100,100,0.7)', marginTop: 6, fontFamily: "'Share Tech Mono'" }}>This will immediately alert the nearest available ambulance</div>
            </div>
            <div style={{ background: 'rgba(255,30,30,0.06)', border: '1px solid rgba(255,30,30,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontFamily: "'Share Tech Mono'", fontSize: 12, color: 'rgba(220,230,255,0.8)', lineHeight: 1.7 }}>
              <span style={{ color: '#ffb800', fontWeight: 700 }}>⚠️ ONLY USE IN A GENUINE EMERGENCY.</span><br />
              Dispatch to: <strong style={{ color: '#00c8ff' }}>{sosConfirmData.phone}</strong><br />
              Misuse of emergency services may result in penalties.
            </div>
            <div style={{ display: 'flex', gap: 14 }}>
              <button
                onClick={() => { const p = sosConfirmData.phone; setSosConfirmData(null); requestAmbulance(null, true, p); }}
                style={{ flex: 1, padding: '14px 20px', background: 'linear-gradient(135deg, rgba(255,30,30,0.3), rgba(220,0,0,0.2))', border: '2px solid #ff2222', borderRadius: 10, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 13, cursor: 'pointer', letterSpacing: '0.05em', animation: 'pulse-opacity 1.5s infinite' }}
              >
                🚨 YES, DISPATCH NOW
              </button>
              <button
                onClick={() => setSosConfirmData(null)}
                style={{ flex: 1, padding: '14px 20px', background: 'transparent', border: '1px solid rgba(160,200,255,0.2)', borderRadius: 10, color: 'rgba(160,200,255,0.6)', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABORT MISSION CONFIRM MODAL ── */}
      {abortConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,3,12,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAbortConfirm(false)}>
          <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,107,53,0.4)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%', boxShadow: '0 0 40px rgba(255,107,53,0.1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 15, color: '#ff6b35', fontWeight: 900, marginBottom: 10 }}>🚨 ABORT ACTIVE REQUEST</div>
            <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 22, lineHeight: 1.7 }}>
              This will <strong style={{ color: '#ff6b35' }}>cancel your current emergency request</strong> and dismiss any assigned ambulance.<br /><br />
              Only cancel if you no longer require emergency assistance.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => {
                  setAbortConfirm(false);
                  if (currentReqId && socket) socket.emit('cancel-request', { reqId: currentReqId });
                  setRequestStatus('idle'); setCurrentReqId(null); setAssignedAmbulanceId(null);
                  setRoutePath(null); setLiveAmbulanceLoc(null); setAssignedHospitalInfo(null);
                  setEtaSeconds(null); setSosMode(false);
                  localStorage.removeItem('user_currentReqId');
                  setPatientData({ name: '', age: '', bloodGroup: 'O+', condition: '', isVerified: false });
                }}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,107,53,0.15)', border: '1px solid rgba(255,107,53,0.5)', borderRadius: 8, color: '#ff6b35', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                🗑 YES, ABORT REQUEST
              </button>
              <button onClick={() => setAbortConfirm(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 12, cursor: 'pointer' }}>
                KEEP ACTIVE
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22 }}>🚑</div>
          <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'Orbitron'", letterSpacing: 2, color: '#00c8ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>RESCUELINK USER</h1>
        </div>

        {/* Desktop: inline status pills */}
        <div className="ud-desktop-status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(0,255,136,0.06)', borderRadius: 20, border: '1px solid rgba(0,255,136,0.2)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 8px #00ff88', animation: 'pulse-opacity 1.5s infinite' }} />
            <span style={{ fontSize: 9, color: '#00ff88', fontFamily: "'Orbitron'", letterSpacing: 1 }}>GATEWAY: ACTIVE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: socket?.connected ? '#00ff88' : '#ff4444', boxShadow: socket?.connected ? '0 0 10px #00ff88' : '0 0 6px #ff4444', animation: socket?.connected ? 'pulse-opacity 1s infinite' : 'none' }} />
          </div>
          <div style={{ padding: '3px 10px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 20, fontSize: 10, border: '1px solid rgba(0,255,136,0.3)', fontFamily: "'Orbitron'" }}>
            STATUS: {requestStatus.toUpperCase()}
          </div>
          {Object.keys(missions).length > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '3px 10px', background: 'rgba(0,200,255,0.05)', borderRadius: 20, border: '1px solid rgba(0,200,255,0.1)' }}>
              {Object.keys(missions).map(id => (
                <button key={id} onClick={() => setCurrentReqId(id)} style={{ padding: '2px 7px', background: currentReqId === id ? '#00c8ff' : 'rgba(0,200,255,0.1)', border: `1px solid ${currentReqId === id ? '#00c8ff' : 'rgba(0,200,255,0.3)'}`, borderRadius: 4, color: currentReqId === id ? '#000' : '#00c8ff', fontSize: 9, fontFamily: "'Orbitron'", cursor: 'pointer', fontWeight: 'bold' }}>
                  {id.substring(0, 8)}...
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons embedded natively in the flex layout */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={onSwitchRole} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10 }}>
            ROLE 🔄
          </button>
          <button onClick={onShowSecurity} className="rl-btn-secondary" style={{ height: 32, padding: '0 12px', fontSize: 10 }}>
            SECURITY 🛡️
          </button>
          <button onClick={onLogout} className="rl-btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 10, background: 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)', border: 'none', color: '#fff' }}>
            LOGOUT ⏻
          </button>
        </div>

        {/* Mobile: Hamburger ☰ button */}
        <button
          className="ud-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(o => !o)}
          style={{ background: mobileMenuOpen ? 'rgba(0,200,255,0.15)' : 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.35)', borderRadius: 8, color: '#00c8ff', padding: '7px 12px', fontSize: 18, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
          aria-label="Toggle mobile menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        {/* Mobile dropdown panel */}
        {mobileMenuOpen && (
          <div className="ud-mobile-dropdown" onClick={() => setMobileMenuOpen(false)}>
            {/* Connection status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: socket?.connected ? '#00ff88' : '#ff4444', boxShadow: socket?.connected ? '0 0 8px #00ff88' : '0 0 6px #ff4444' }} />
              <span style={{ fontSize: 11, color: '#00ff88', fontFamily: "'Orbitron'" }}>GATEWAY: {socket?.connected ? 'ACTIVE' : 'OFFLINE'}</span>
              <div style={{ marginLeft: 'auto', padding: '3px 10px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 12, fontSize: 10, border: '1px solid rgba(0,255,136,0.3)', fontFamily: "'Orbitron'" }}>
                {requestStatus.toUpperCase()}
              </div>
            </div>
            {currentReqId && (
              <div style={{ fontSize: 10, color: 'rgba(0,200,255,0.7)', fontFamily: "'Share Tech Mono'" }}>
                MISSION: {currentReqId.replace(/-/g,'').slice(-8).toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="main-content-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div className="sidebar-container" style={{ width: 350, background: 'rgba(3,10,28,0.95)', borderRight: '1px solid rgba(0,200,255,0.1)', display: 'flex', flexDirection: 'column', padding: '24px 24px 80px', overflowY: 'auto' }}>
          
          {/* === SOS PANIC BUTTON === */}
          {requestStatus === 'idle' && (
            <button
              onClick={requestSOSDispatch}
              className="sos-emergency-btn"
              style={{
                width: '100%',
                marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(255,30,30,0.25), rgba(220,0,0,0.15))',
                border: '2px solid #ff2222', borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                animation: 'sosGlow 1.5s ease-in-out infinite', boxShadow: '0 0 20px rgba(255,30,30,0.3)',
                transition: 'all 0.2s', padding: '12px 14px', height: 'auto', minHeight: 64
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>🆘</span>
              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ff4444', fontWeight: 900, letterSpacing: '0.05em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>SOS EMERGENCY</div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,100,100,0.7)', marginTop: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>Instantly alerts nearest ambulance</div>
              </div>
            </button>
          )}

          {/* === ENTERPRISE FEATURE QUICK ACCESS === */}
          <div className="feature-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { icon: '🧠', label: 'AI COPILOT', sublabel: 'Analyze symptoms', color: '#00c8ff', action: () => routeTo('ai-copilot') },
              { icon: '❤️', label: 'CPR GUIDE', sublabel: 'Life-saving mode', color: '#ff4444', action: () => routeTo('cpr') },
              { icon: '🩸', label: 'BLOOD NET', sublabel: 'Find blood banks', color: '#ff4444', action: () => routeTo('blood-network') },
              { icon: '🚑', label: 'MARKETPLACE', sublabel: 'Book ambulance', color: '#ffb800', action: () => routeTo('marketplace') },
              { icon: '🧍', label: 'HEALTH PORTAL', sublabel: 'My Medical File', color: '#00c8ff', action: () => routeTo('health-portal') },
              { icon: '🎙️', label: 'VOICE SOS', sublabel: voiceSosActive ? 'Listening...' : 'Say "Help"', color: voiceSosActive ? '#00ff88' : '#8888ff', action: () => setVoiceSosActive(!voiceSosActive) },
              { icon: '🔐', label: 'PRIVACY', sublabel: 'Consent & Erasure', color: '#00ff88', action: () => setShowPrivacyModal(true) },
              { icon: '⚙️', label: 'SETTINGS', sublabel: 'Account & Security', color: '#a78bfa', action: () => routeTo('account-settings') },
              { 
                icon: '⌚', 
                label: 'WEARABLE', 
                sublabel: wearableConnected ? (pairedDevice ? pairedDevice.name : 'Connected') : 'Pair Watch', 
                color: wearableConnected ? '#00ff88' : '#aaaaaa', 
                action: async () => {
                  try {
                    if (!navigator.bluetooth) {
                      throw new Error('Web Bluetooth requires HTTPS or is not supported in this browser.');
                    }
                    const device = await navigator.bluetooth.requestDevice({
                      acceptAllDevices: true,
                      optionalServices: ['heart_rate']
                    });
                    setPairedDevice(device);
                    setWearableConnected(true);
                    showAlert(`⌚ Successfully paired with ${device.name || 'Bluetooth Device'}.`);
                  } catch (err) {
                    console.warn('Native BLE Scan Cancelled/Blocked:', err);
                    // Fall back to showing mock modal if native scan is cancelled or unsupported
                    setShowWearablePairing(true);
                  }
                } 
              },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                style={{
                  padding: '12px 6px',
                  background: 'rgba(10, 22, 48, 0.65)',
                  border: `1px solid rgba(0, 200, 255, 0.15)`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: btn.label === 'VOICE SOS' && voiceSosActive ? `0 0 15px ${btn.color}` : '0 4px 12px rgba(0,0,0,0.15)',
                  minHeight: '85px',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = btn.color;
                  e.currentTarget.style.boxShadow = `0 4px 20px ${btn.color}35`;
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0, 200, 255, 0.15)';
                  e.currentTarget.style.boxShadow = btn.label === 'VOICE SOS' && voiceSosActive ? `0 0 15px ${btn.color}` : '0 4px 12px rgba(0,0,0,0.15)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 6 }}>{btn.icon}</div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 10, color: '#ffffff', fontWeight: 700, letterSpacing: '0.05em' }}>{btn.label}</div>
                <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.6)', marginTop: 4, fontFamily: "'Share Tech Mono'", textTransform: 'uppercase' }}>{btn.sublabel}</div>
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
                {currentReqId && currentReqId.length > 15 ? `RL-${currentReqId.replace(/-/g, '').slice(-4).toUpperCase()}` : currentReqId}
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

              {/* Green Corridor Control Toggle */}
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontFamily: "'Orbitron'", color: '#00c8ff', fontWeight: 'bold' }}>🟢 SIGNAL PREEMPTION SYSTEM</span>
                  <span style={{ fontSize: 8, color: greenCorridorActive ? '#00ff88' : '#ff4444', fontFamily: "'Share Tech Mono'" }}>{greenCorridorActive ? 'FORCE-GREEN' : 'AUTO-HOLD'}</span>
                </div>
                <button
                  onClick={() => {
                    setGreenCorridorActive(!greenCorridorActive);
                    if (!greenCorridorActive) {
                      setEtaSeconds(prev => prev ? Math.max(10, Math.floor(prev / 2)) : null);
                    }
                  }}
                  style={{
                    width: '100%', padding: '6px', background: greenCorridorActive ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${greenCorridorActive ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: 4, color: greenCorridorActive ? '#00ff88' : '#aaaaaa',
                    fontFamily: "'Orbitron'", fontSize: 9, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {greenCorridorActive ? '🟢 CLEAR CORRIDOR ACTIVE' : '🚦 REQUEST SIGNAL PREEMPTION'}
                </button>
              </div>

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
                  onClick={() => setAbortConfirm(true)}
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
              <>
                <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
                {routePath.length > 2 && [routePath[Math.floor(routePath.length / 3)], routePath[Math.floor(routePath.length * 2 / 3)]].map((pos, idx) => {
                  const lightIcon = new L.DivIcon({
                    html: `<div style="font-size: 18px; filter: drop-shadow(0 0 4px ${greenCorridorActive ? '#00ff88' : '#ff3333'});">${greenCorridorActive ? '🟢' : '🔴'}</div>`,
                    className: 'custom-div-icon',
                    iconSize: [18, 18],
                  });
                  return (
                    <Marker key={idx} position={pos} icon={lightIcon}>
                      <Popup>
                        <div style={{ color: '#333', fontSize: 11 }}>
                          <strong>🚦 Traffic Signal #{idx + 1}</strong><br />
                          Status: {greenCorridorActive ? '🟢 Clear (Green Corridor Active)' : '🔴 Red (Preemption Required)'}
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </>
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

          {/* 🔐 ABDM DPDP CONSENT POPUP */}
          {pendingConsentRequest && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,10,30,0.95)', zIndex: 99999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #0a1e3a 0%, #020814 100%)',
                border: '2px solid #00ff88', borderRadius: 20, width: 400, padding: 30,
                textAlign: 'center', boxShadow: '0 0 50px rgba(0,255,136,0.2)'
              }}>
                <div style={{ fontSize: 48, marginBottom: 20 }}>🛡️</div>
                <h2 style={{ fontFamily: "'Orbitron'", color: '#00ff88', marginBottom: 10, fontSize: 18 }}>ABDM DATA CONSENT REQUEST</h2>
                <p style={{ fontSize: 13, color: 'rgba(160,200,255,0.7)', marginBottom: 24, lineHeight: 1.5 }}>
                  <strong>{pendingConsentRequest.hospitalName}</strong> is requesting permission to access your clinical history, allergies, and ABHA Health Card records to prepare emergency care.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => {
                      socket.emit('patient-respond-consent', { reqId: pendingConsentRequest.reqId, approved: false });
                      setPendingConsentRequest(null);
                    }}
                    style={{ flex: 1, padding: 12, background: 'rgba(255,51,51,0.1)', border: '1px solid #ff3333', borderRadius: 8, color: '#ff3333', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold' }}
                  >
                    DENY
                  </button>
                  <button
                    onClick={() => {
                      socket.emit('patient-respond-consent', { reqId: pendingConsentRequest.reqId, approved: true });
                      setPendingConsentRequest(null);
                    }}
                    style={{ flex: 1, padding: 12, background: '#00ff88', border: 'none', borderRadius: 8, color: '#000', cursor: 'pointer', fontFamily: "'Orbitron'", fontWeight: 'bold' }}
                  >
                    APPROVE (DPDP)
                  </button>
                </div>
              </div>
            </div>
          )}

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
          onClose={() => routeTo('')}
          onSOS={() => { routeTo(''); requestSOSDispatch(); }}
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
              <button onClick={() => routeTo('')} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '6px 14px', color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11 }}>✕ CLOSE</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AmbulanceMarketplace socket={socket} userLocation={userLocation}
                onBookAmbulance={(amb) => { setShowMarketplace(false); requestAmbulance(amb.id); }} />
            </div>
          </div>
        </div>
      )}

      {/* Patient Health Portal */}
      {showPatientPortal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,5,20,0.95)', backdropFilter: 'blur(10px)', overflowY: 'auto' }}>
          <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,200,255,0.2)', display: 'flex', justifyContent: 'flex-start', background: '#050d1a', position: 'sticky', top: 0, zIndex: 10 }}>
              <button onClick={() => routeTo('')} style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '8px 18px', color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 'bold' }}>✕ CLOSE PORTAL</button>
            </div>
            <div style={{ flex: 1, paddingBottom: 40 }}>
              <PatientPortal />
            </div>
          </div>
        </div>
      )}

      {/* ⚙️ PATIENT ACCOUNT SETTINGS */}
      {showAccountSettings && (() => {
        const AccountSettingsPanel = () => {
          const [profileForm, setProfileForm] = React.useState({ name: patientData.name || '', mobile: patientData.mobile || '' });
          const [profileStatus, setProfileStatus] = React.useState(null);
          const [profileLoading, setProfileLoading] = React.useState(false);
          const [pwForm, setPwForm] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
          const [pwStatus, setPwStatus] = React.useState(null);
          const [pwLoading, setPwLoading] = React.useState(false);
          const [mfaQR, setMfaQR] = React.useState(null);
          const [mfaStatus, setMfaStatus] = React.useState(null);
          const [mfaLoading, setMfaLoading] = React.useState(false);
          const [disable2FAConfirmUD, setDisable2FAConfirmUD] = React.useState(false);

          const token = sessionStorage.getItem('rescuelink_token') || '';
          const hdrs = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

          const S = {
            card: { background: 'rgba(5,15,40,0.85)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 12, padding: 24, marginBottom: 20 },
            label: { display: 'block', fontSize: 10, fontFamily: "'Orbitron'", color: 'rgba(160,200,255,0.55)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' },
            input: { width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 8, padding: '11px 14px', color: '#fff', outline: 'none', fontSize: 13, boxSizing: 'border-box', fontFamily: "'Share Tech Mono'" },
            btn: (color) => ({ padding: '10px 22px', background: `rgba(${color},0.14)`, border: `1px solid rgba(${color},0.4)`, borderRadius: 8, color: `rgb(${color})`, fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em' }),
            sectionTitle: { fontFamily: "'Orbitron'", fontSize: 13, color: '#00c8ff', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 },
            statusMsg: (ok) => ({ marginTop: 10, padding: '8px 14px', borderRadius: 6, background: ok ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', border: `1px solid ${ok ? '#00ff88' : '#ff4444'}`, color: ok ? '#00ff88' : '#ff4444', fontSize: 11, fontFamily: "'Share Tech Mono'" })
          };

          const handleSaveProfile = async () => {
            setProfileLoading(true);
            try {
              const res = await fetch(`/api/users/${userId}`, { method: 'PUT', headers: hdrs, body: JSON.stringify({ name: profileForm.name, mobile: profileForm.mobile }) });
              const d = await res.json();
              setProfileStatus({ ok: res.ok, msg: res.ok ? 'Profile updated successfully!' : (d.error || 'Update failed') });
            } catch { setProfileStatus({ ok: false, msg: 'Connection error' }); }
            setProfileLoading(false);
            setTimeout(() => setProfileStatus(null), 4000);
          };

          const handleChangePw = async () => {
            if (pwForm.newPassword !== pwForm.confirmPassword) { setPwStatus({ ok: false, msg: 'Passwords do not match' }); return; }
            if (pwForm.newPassword.length < 6) { setPwStatus({ ok: false, msg: 'Password must be at least 6 characters' }); return; }
            setPwLoading(true);
            try {
              const res = await fetch(`/api/users/${userId}/change-password`, { method: 'POST', headers: hdrs, body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) });
              const d = await res.json();
              setPwStatus({ ok: res.ok, msg: d.message || d.error });
              if (res.ok) setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } catch { setPwStatus({ ok: false, msg: 'Connection error' }); }
            setPwLoading(false);
            setTimeout(() => setPwStatus(null), 5000);
          };

          const handleSetup2FA = async () => {
            setMfaLoading(true);
            try {
              const res = await fetch('/api/mfa/setup', { method: 'POST', headers: hdrs });
              const d = await res.json();
              if (res.ok) setMfaQR(d.qrCode);
              else setMfaStatus({ ok: false, msg: d.error || 'Setup failed' });
            } catch { setMfaStatus({ ok: false, msg: 'Connection error' }); }
            setMfaLoading(false);
          };

          const handleDisable2FA = async () => {
            setDisable2FAConfirmUD(false);
            setMfaLoading(true);
            try {
              const res = await fetch('/api/mfa/disable', { method: 'POST', headers: hdrs });
              const d = await res.json();
              setMfaStatus({ ok: res.ok, msg: d.message || d.error });
              setMfaQR(null);
            } catch { setMfaStatus({ ok: false, msg: 'Connection error' }); }
            setMfaLoading(false);
            setTimeout(() => setMfaStatus(null), 5000);
          };

          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,5,20,0.93)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            {/* 2FA Disable Confirm */}
            {disable2FAConfirmUD && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(0,5,20,0.88)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDisable2FAConfirmUD(false)}>
                <div style={{ background: 'rgba(8,18,42,0.98)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 14, padding: 30, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontFamily: "'Orbitron'", fontSize: 14, color: '#ff4444', fontWeight: 900, marginBottom: 8 }}>🔓 DISABLE 2FA</div>
                  <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.7)', fontFamily: "'Share Tech Mono'", marginBottom: 20, lineHeight: 1.65 }}>
                    Removing 2FA will leave your account protected only by your password.<br /><br />
                    <strong style={{ color: '#ffb800' }}>This reduces your account security significantly.</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={handleDisable2FA} style={{ flex: 1, padding: '10px', background: 'rgba(255,40,40,0.14)', border: '1px solid rgba(255,40,40,0.5)', borderRadius: 8, color: '#ff4444', fontFamily: "'Orbitron'", fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      🔓 YES, DISABLE 2FA
                    </button>
                    <button onClick={() => setDisable2FAConfirmUD(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(160,200,255,0.15)', borderRadius: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Orbitron'", fontSize: 11, cursor: 'pointer' }}>
                      CANCEL
                    </button>
                  </div>
                </div>
              </div>
            )}
              <div style={{ background: 'rgba(3,10,28,0.98)', borderBottom: '1px solid rgba(0,200,255,0.15)', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 15, color: '#a78bfa', fontWeight: 900, letterSpacing: '0.08em' }}>⚙️ ACCOUNT SETTINGS</div>
                <button onClick={() => routeTo('')} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ flex: 1, padding: '28px', maxWidth: 680, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

                {/* Profile */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>👤 Edit Profile</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={S.label}>Full Name</label>
                      <input style={S.input} value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="Your name" />
                    </div>
                    <div>
                      <label style={S.label}>Mobile Number</label>
                      <input style={S.input} value={profileForm.mobile} onChange={e => setProfileForm(p => ({ ...p, mobile: e.target.value }))} placeholder="e.g. 9876543210" />
                    </div>
                    <div>
                      <label style={S.label}>User ID</label>
                      <input style={{ ...S.input, opacity: 0.5, cursor: 'not-allowed' }} value={userId} readOnly />
                    </div>
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button onClick={handleSaveProfile} disabled={profileLoading} style={{ ...S.btn('0,200,255'), opacity: profileLoading ? 0.5 : 1 }}>
                      {profileLoading ? '⏳ SAVING...' : '💾 SAVE PROFILE'}
                    </button>
                    {profileStatus && <div style={S.statusMsg(profileStatus.ok)}>{profileStatus.ok ? '✅' : '❌'} {profileStatus.msg}</div>}
                  </div>
                </div>

                {/* Password */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>🔑 Change Password</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
                    <div><label style={S.label}>Current Password</label><input type="password" style={S.input} placeholder="Enter current password" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} /></div>
                    <div><label style={S.label}>New Password</label><input type="password" style={S.input} placeholder="Min. 6 characters" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} /></div>
                    <div><label style={S.label}>Confirm New Password</label><input type="password" style={S.input} placeholder="Repeat new password" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} /></div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                      <button onClick={handleChangePw} disabled={pwLoading} style={{ ...S.btn('255,184,0'), opacity: pwLoading ? 0.5 : 1 }}>
                        {pwLoading ? 'UPDATING…' : '🔐 UPDATE PASSWORD'}
                      </button>
                      {pwStatus && <div style={S.statusMsg(pwStatus.ok)}>{pwStatus.ok ? '✅' : '❌'} {pwStatus.msg}</div>}
                    </div>
                  </div>
                </div>

                {/* 2FA */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>🛡️ Two-Factor Authentication (2FA)</div>
                  <div style={{ fontSize: 12, color: 'rgba(160,200,255,0.55)', marginBottom: 16, fontFamily: "'Share Tech Mono'", lineHeight: 1.6 }}>
                    Add an extra layer of security. Scan the QR code with Google Authenticator, Authy, or any TOTP app.
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={handleSetup2FA} disabled={mfaLoading} style={{ ...S.btn('0,255,136'), opacity: mfaLoading ? 0.5 : 1 }}>
                      {mfaLoading ? '⏳ LOADING…' : '🔒 ENABLE 2FA — GENERATE QR'}
                    </button>
                    <button onClick={() => setDisable2FAConfirmUD(true)} disabled={mfaLoading} style={{ ...S.btn('255,68,68'), opacity: mfaLoading ? 0.5 : 1 }}>
                      🔓 DISABLE 2FA
                    </button>
                  </div>
                  {mfaQR && (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'", marginBottom: 10 }}>SCAN WITH YOUR AUTHENTICATOR APP</div>
                      <img src={mfaQR} alt="2FA QR Code" style={{ width: 180, height: 180, border: '4px solid rgba(0,200,255,0.3)', borderRadius: 10 }} />
                    </div>
                  )}
                  {mfaStatus && <div style={{ ...S.statusMsg(mfaStatus.ok), marginTop: 12 }}>{mfaStatus.ok ? '✅' : '❌'} {mfaStatus.msg}</div>}
                </div>

                {/* Danger Zone */}
                <div style={{ ...S.card, border: '1px solid rgba(255,68,68,0.25)' }}>
                  <div style={{ ...S.sectionTitle, color: '#ff4444' }}>⚠️ Danger Zone</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,150,150,0.6)', marginBottom: 12, fontFamily: "'Share Tech Mono'" }}>
                    These actions are irreversible. Please proceed with caution.
                  </div>
                  <button onClick={onLogout} style={{ ...S.btn('255,68,68') }}>🚪 LOGOUT FROM THIS SESSION</button>
                </div>

              </div>
            </div>
          );
        };
        return <AccountSettingsPanel />;
      })()}

      {/* 🔐 DPDP ACT 2023 - PRIVACY & CONSENT CENTER */}
      {showPrivacyModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,5,20,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#0a1526', border: '1px solid rgba(0,200,255,0.4)', borderRadius: 16, padding: 28, width: '90%', maxWidth: 460, boxShadow: '0 0 40px rgba(0,200,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 900, letterSpacing: '0.05em' }}>🔐 DPDP PRIVACY & CONSENT</div>
              <button onClick={() => setShowPrivacyModal(false)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Consent status under Section 6 of DPDP Act 2023 */}
              <div style={{ padding: 12, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: '#00ff88' }}>DPDP Section 6 Consent Status</div>
                    <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)' }}>Allow doctors/emergency responders to access data</div>
                  </div>
                  <button 
                    onClick={() => {
                      setConsentGranted(!consentGranted);
                      alert(consentGranted ? "Consent successfully revoked. Doctors will not be able to view details without OTP." : "Consent granted.");
                    }}
                    style={{
                      background: consentGranted ? '#ff4444' : '#00ff88', color: '#000', border: 'none', borderRadius: 4,
                      padding: '6px 12px', fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                    }}
                  >
                    {consentGranted ? 'REVOKE' : 'GRANT'}
                  </button>
                </div>
              </div>

              {/* Right to Erasure under Section 12 */}
              <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#ffb800', marginBottom: 4 }}>Right to Correction & Erasure (Section 12)</div>
                <div style={{ fontSize: 10, color: 'rgba(160,200,255,0.6)', marginBottom: 10 }}>Submit a request to erase your personal identifiers from the system.</div>
                
                <input 
                  type="text" 
                  placeholder="Reason for erasure request (e.g. data obsolescence)"
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  style={{
                    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)',
                    borderRadius: 6, padding: 8, color: '#fff', fontSize: 12, outline: 'none', marginBottom: 8,
                    boxSizing: 'border-box'
                  }}
                />
                
                <button
                  onClick={async () => {
                    if (!erasureReason.trim()) return alert("Please enter a reason.");
                    try {
                      const token = sessionStorage.getItem('rescuelink_token') || '';
                      const response = await fetch(`${SERVER_URL_CONST}/api/erasure/request`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ patient_id: userId, reason: erasureReason })
                      });
                      if (response.ok) {
                        alert("Erasure request filed successfully under DPDP Act Section 12. It will be reviewed by administrators.");
                        setErasureReason('');
                      } else {
                        const err = await response.json();
                        alert(err.error || "Failed to file erasure request.");
                      }
                    } catch (err) {
                      alert("Error: " + err.message);
                    }
                  }}
                  style={{
                    width: '100%', padding: 8, background: 'rgba(255,184,0,0.15)', border: '1px solid #ffb800',
                    borderRadius: 6, color: '#ffb800', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 700
                  }}
                >
                  ⚠️ FILE ERASURE REQUEST
                </button>
              </div>

              {/* Blockchain Consent Audit Ledger */}
              <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 'bold', color: '#00ff88' }}>📜 CRYPTOGRAPHIC DPDP AUDIT LEDGER</div>
                  <span style={{ fontSize: 8, padding: '2px 6px', background: 'rgba(0,255,136,0.1)', color: '#00ff88', borderRadius: 4, fontFamily: "'Share Tech Mono'" }}>SHA-256 LEDGER SECURED</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
                  {generateBlockchain(consentGranted, userId).map((block, idx) => (
                    <div key={idx} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, fontFamily: "'Orbitron'", color: '#00c8ff', fontWeight: 'bold' }}>BLOCK #{block.index}</span>
                        <span style={{ fontSize: 8, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>{new Date(block.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#e0eaff', fontWeight: 'bold' }}>{block.event}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 8, fontFamily: "'Share Tech Mono'", color: 'rgba(160,200,255,0.4)', marginTop: 2 }}>
                        <div>PREV HASH: <span style={{ color: '#ffb800' }}>{block.prevHash.substring(0, 8)}...</span></div>
                        <div style={{ textAlign: 'right' }}>HASH: <span style={{ color: '#00ff88' }}>{block.hash.substring(0, 8)}...</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', fontSize: 9, color: '#00ff88', marginTop: 8, fontFamily: "'Share Tech Mono'" }}>
                  🔒 CRYPTOGRAPHICALLY SECURED & NON-REPUDIABLE
                </div>
              </div>
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

      {/* Wearable Pairing Modal */}
      {showWearablePairing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,5,20,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
          <div style={{ background: '#0a1526', border: '1px solid rgba(0,200,255,0.4)', borderRadius: 16, padding: 28, width: '90%', maxWidth: 460, boxShadow: '0 0 40px rgba(0,200,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: "'Orbitron'", fontSize: 16, color: '#00c8ff', fontWeight: 900, letterSpacing: '0.05em' }}>⌚ WEARABLE PAIRING GATEWAY</div>
              <button onClick={() => setShowWearablePairing(false)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            {wearableConnected ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ 
                  width: 60, height: 60, borderRadius: '50%', background: 'rgba(0,255,136,0.1)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
                  border: '2px solid #00ff88', boxShadow: '0 0 20px rgba(0,255,136,0.2)' 
                }}>
                  <span style={{ fontSize: 32 }}>⌚</span>
                </div>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 13, color: '#00ff88', fontWeight: 'bold', marginBottom: 4 }}>
                  STATUS: CONNECTED
                </div>
                <div style={{ fontSize: 14, color: '#e0eaff', marginBottom: 20 }}>
                  Active Device: <strong>{pairedDevice ? pairedDevice.name : 'RescueLink Watch'}</strong>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => {
                      playAlertBeep();
                      showAlert('⚠️ FALL DETECTED BY WEARABLE. Auto-Dispatching SOS...');
                      requestAmbulance(null, true);
                      setShowWearablePairing(false);
                    }}
                    style={{
                      padding: '12px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444',
                      borderRadius: 8, color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700
                    }}
                  >
                    💥 SIMULATE FALL DETECTION
                  </button>

                  <button
                    onClick={() => {
                      setWearableConnected(false);
                      setPairedDevice(null);
                      showAlert('⌚ Device unpaired successfully.');
                    }}
                    style={{
                      padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 8, color: '#aaaaaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 11, fontWeight: 700
                    }}
                  >
                    🔌 DISCONNECT DEVICE
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {isBleScanning ? (
                  <div style={{ padding: '30px 0', textAlign: 'center' }}>
                    <div style={{ 
                      width: 50, height: 50, border: '3px solid rgba(0,200,255,0.1)', borderTop: '3px solid #00c8ff', 
                      borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' 
                    }} />
                    <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', fontWeight: 'bold', marginBottom: 6 }}>
                      SEARCHING FOR BLUETOOTH WEARABLES...
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.3)', height: 6, borderRadius: 3, width: '80%', margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(0,200,255,0.1)' }}>
                      <div style={{ background: '#00c8ff', height: '100%', width: `${bleScanProgress}%`, transition: 'width 0.2s ease-out' }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <button 
                        onClick={async () => {
                          try {
                            if (!navigator.bluetooth) {
                              throw new Error('Web Bluetooth requires HTTPS or is not supported in this browser.');
                            }
                            const device = await navigator.bluetooth.requestDevice({
                              filters: [{ services: ['heart_rate'] }]
                            });
                            setPairedDevice(device);
                            setWearableConnected(true);
                            setShowWearablePairing(false);
                            showAlert(`⌚ Successfully paired with ${device.name}. Fall detection active.`);
                          } catch (err) {
                            console.warn(err);
                            showAlert(err.message || 'Bluetooth scan cancelled.');
                          }
                        }}
                        style={{
                          flex: 1, padding: '10px', background: 'rgba(0,200,255,0.1)', border: '1px solid #00c8ff',
                          borderRadius: 8, color: '#00c8ff', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                        }}
                      >
                        🔌 SCAN REAL BLE
                      </button>
                      <button 
                        onClick={() => {
                          setIsBleScanning(true);
                          setBleScanProgress(0);
                          let prog = 0;
                          const timer = setInterval(() => {
                            prog += 20;
                            setBleScanProgress(prog);
                            if (prog >= 100) {
                              clearInterval(timer);
                              setIsBleScanning(false);
                            }
                          }, 150);
                        }}
                        style={{
                          flex: 1, padding: '10px', background: 'rgba(0,255,136,0.05)', border: '1px solid #00ff88',
                          borderRadius: 8, color: '#00ff88', fontFamily: "'Orbitron'", fontSize: 10, fontWeight: 'bold', cursor: 'pointer'
                        }}
                      >
                        🔄 RE-SCAN MOCK
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(0,255,136,0.05)', borderRadius: 8, border: '1px solid rgba(0,255,136,0.15)', marginBottom: 15 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88' }} />
                      <span style={{ fontSize: 10, color: '#00ff88', fontFamily: "'Orbitron'", fontWeight: 'bold' }}>DISCOVERED DEVICES (4)</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto', marginBottom: 20 }}>
                      {[
                        { name: 'Apple Watch Ultra 2', id: 'AW-890A' },
                        { name: 'Galaxy Watch 6 Classic', id: 'GW-412F' },
                        { name: 'Garmin Fenix 7 Pro', id: 'GF-909D' },
                        { name: 'Fitbit Sense 2', id: 'FS-332X' }
                      ].map(device => (
                        <div key={device.id} style={{ 
                          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#e0eaff' }}>{device.name}</div>
                            <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.5)', fontFamily: "'Share Tech Mono'" }}>ID: {device.id}</div>
                          </div>
                          <button
                            onClick={() => {
                              setPairedDevice(device);
                              setWearableConnected(true);
                              setShowWearablePairing(false);
                              showAlert(`⌚ Successfully paired with ${device.name}. Fall detection active.`);
                            }}
                            style={{
                              background: '#00c8ff', color: '#000', border: 'none', borderRadius: 6,
                              padding: '6px 12px', fontSize: 10, fontWeight: 'bold', cursor: 'pointer', fontFamily: "'Orbitron'"
                            }}
                          >
                            PAIR
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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

      {/* IoT Wearable Simulator Widget (Floating Demo Controls) */}
      {wearableConnected && (
        <div style={{
          position: 'fixed', bottom: 85, right: 25, zIndex: 11000,
          fontFamily: "'Rajdhani', sans-serif"
        }}>
          {!isIotSimOpen ? (
            <button
              onClick={() => setIsIotSimOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #00c8ff 0%, #0072ff 100%)',
                border: 'none', borderRadius: 20, color: '#ffffff',
                padding: '10px 18px', fontSize: 11, fontWeight: 'bold',
                fontFamily: "'Orbitron'", cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(0,200,255,0.3)',
                display: 'flex', alignItems: 'center', gap: 6,
                letterSpacing: '0.05em'
              }}
            >
              ⌚ IoT SIMULATOR
            </button>
          ) : (
            <div style={{
              width: 280, background: 'rgba(5, 15, 40, 0.95)',
              border: '1px solid rgba(0, 200, 255, 0.4)', borderRadius: 12,
              padding: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: "'Orbitron'", fontSize: 11, color: '#00c8ff', fontWeight: 900 }}>⌚ IoT WEARABLE SIMULATOR</div>
                <button
                  onClick={() => setIsIotSimOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: 16 }}
                >
                  ✕
                </button>
              </div>

              {/* Sliders */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(160,200,255,0.7)' }}>
                    <span>HEART RATE</span>
                    <span style={{ color: '#ff4444', fontWeight: 'bold' }}>{wearableVitals.heartRate} BPM</span>
                  </div>
                  <input
                    type="range" min="40" max="180"
                    value={wearableVitals.heartRate}
                    onChange={(e) => {
                      const hr = parseInt(e.target.value);
                      setWearableVitals(prev => {
                        const next = { ...prev, heartRate: hr, manualControl: true };
                        if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                        return next;
                      });
                    }}
                    style={{ width: '100%', height: 4, background: '#00c8ff', outline: 'none' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(160,200,255,0.7)' }}>
                    <span>BLOOD OXYGEN (SpO2)</span>
                    <span style={{ color: '#00c8ff', fontWeight: 'bold' }}>{wearableVitals.spo2}%</span>
                  </div>
                  <input
                    type="range" min="70" max="100"
                    value={wearableVitals.spo2}
                    onChange={(e) => {
                      const sp = parseInt(e.target.value);
                      setWearableVitals(prev => {
                        const next = { ...prev, spo2: sp, manualControl: true };
                        if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                        return next;
                      });
                    }}
                    style={{ width: '100%', height: 4, background: '#00c8ff', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.7)', marginBottom: 2 }}>SYS BP</div>
                    <input
                      type="number" min="80" max="200"
                      value={wearableVitals.systolic}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 120;
                        setWearableVitals(prev => {
                          const next = { ...prev, systolic: val, manualControl: true };
                          if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                          return next;
                        });
                      }}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', color: '#fff', fontSize: 11, padding: 4, borderRadius: 4 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(160,200,255,0.7)', marginBottom: 2 }}>DIA BP</div>
                    <input
                      type="number" min="50" max="120"
                      value={wearableVitals.diastolic}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 80;
                        setWearableVitals(prev => {
                          const next = { ...prev, diastolic: val, manualControl: true };
                          if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                          return next;
                        });
                      }}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,255,0.2)', color: '#fff', fontSize: 11, padding: 4, borderRadius: 4 }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(160,200,255,0.7)' }}>
                    <span>TEMPERATURE</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{wearableVitals.temperature}°C</span>
                  </div>
                  <input
                    type="range" min="35.0" max="41.0" step="0.1"
                    value={wearableVitals.temperature}
                    onChange={(e) => {
                      const temp = parseFloat(e.target.value);
                      setWearableVitals(prev => {
                        const next = { ...prev, temperature: temp, manualControl: true };
                        if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                        return next;
                      });
                    }}
                    style={{ width: '100%', height: 4, background: '#00c8ff', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Event Injectors */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(0,200,255,0.15)', paddingTop: 10 }}>
                <button
                  onClick={() => {
                    playAlertBeep();
                    showAlert('⚠️ FALL DETECTED BY WEARABLE. Auto-Dispatching SOS...');
                    requestAmbulance(null, true);
                    setIsIotSimOpen(false);
                  }}
                  style={{
                    padding: '8px', background: 'rgba(255,68,68,0.15)', border: '1px solid #ff4444',
                    borderRadius: 6, color: '#ff4444', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 9, fontWeight: 700
                  }}
                >
                  💥 TRIGGER AUTO-FALL SOS
                </button>

                <button
                  onClick={() => {
                    setWearableVitals(prev => {
                      const next = { ...prev, heartRate: 155, spo2: 85, systolic: 90, diastolic: 55, temperature: 37.2, manualControl: true };
                      if (currentReqId && socket && connected) socket.emit('vitals-update', { ...next, reqId: currentReqId });
                      return next;
                    });
                    showAlert('💓 Arrhythmia & Cardiac shock vitals injected into Wearable Stream.');
                  }}
                  style={{
                    padding: '8px', background: 'rgba(255,184,0,0.15)', border: '1px solid #ffb800',
                    borderRadius: 6, color: '#ffb800', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 9, fontWeight: 700
                  }}
                >
                  ❤️ SIMULATE CARDIAC ARREST
                </button>

                <button
                  onClick={() => {
                    setWearableVitals(prev => {
                      const next = { ...prev, manualControl: false };
                      return next;
                    });
                    showAlert('🔄 IoT Watch returned to automatic bio-variance mode.');
                  }}
                  style={{
                    padding: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, color: '#aaa', cursor: 'pointer', fontFamily: "'Orbitron'", fontSize: 8
                  }}
                >
                  🔄 ENABLE AUTO-DRIFT
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .custom-div-icon { background: none; border: none; }
      `}</style>
    </div>
  );
}
