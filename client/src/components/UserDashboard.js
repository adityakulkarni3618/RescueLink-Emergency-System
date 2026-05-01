import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
function MapCenterer({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function UserDashboard({ socket, connected }) {
  const [userLocation, setUserLocation] = useState(null);
  const [ambulances, setAmbulances] = useState({});
  const [hospitals, setHospitals] = useState({});
  const [requestStatus, setRequestStatus] = useState('idle');
  const [activeReqId, setActiveReqId] = useState(null);
  const [assignedAmbulanceId, setAssignedAmbulanceId] = useState(null);
  const [assignedHospitalId, setAssignedHospitalId] = useState(null);
  const [routePath, setRoutePath] = useState(null);
  const [simulatedAmbulances, setSimulatedAmbulances] = useState([]);

  // Helper distance function
  const calcDist = (pos1, pos2) => {
    if (!pos1 || !pos2) return Infinity;
    const R = 6371; // km
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(pos1.lat*Math.PI/180)*Math.cos(pos2.lat*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Get User Location
  useEffect(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by your browser');
      // Fallback location for demo
      setUserLocation({ lat: 18.5204, lng: 73.8567 }); // Pune
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.error('Error getting location', error);
        setUserLocation({ lat: 18.5204, lng: 73.8567 });
      },
      { enableHighAccuracy: true }
    );
  }, []);

  // Generate Simulated Ambulances
  useEffect(() => {
    if (userLocation && simulatedAmbulances.length === 0) {
      const fakes = [];
      for (let i = 0; i < 4; i++) {
        fakes.push({
          id: `sim-amb-${i}`,
          location: {
            lat: userLocation.lat + (Math.random() - 0.5) * 0.05,
            lng: userLocation.lng + (Math.random() - 0.5) * 0.05
          },
          available: true,
          isSimulated: true
        });
      }
      setSimulatedAmbulances(fakes);
    }
  }, [userLocation, simulatedAmbulances.length]);

  // Socket Events
  useEffect(() => {
    if (!socket) return;

    socket.on('ambulances-update', (data) => setAmbulances(data));
    socket.on('hospitals-update', (data) => setHospitals(data));

    socket.on('ambulance-request-response', (req) => {
      if (req.status === 'ambulance_accepted') {
        setRequestStatus('ambulance_accepted');
        setAssignedAmbulanceId(req.ambulanceSocket);
        setActiveReqId(req.id);
        if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      } else {
        setRequestStatus('idle');
        alert('Ambulance rejected the request. Please try another.');
      }
    });

    socket.on('hospital-request-response', (req) => {
      if (req.status === 'hospital_accepted') {
        setRequestStatus('hospital_accepted');
        setAssignedHospitalId(req.hospitalSocket);
        if (req.routePath) setRoutePath(req.routePath.map(pos => [pos.lat, pos.lng]));
      } else {
        setRequestStatus('ambulance_accepted');
        alert('Hospital rejected the request. Please try another.');
      }
    });

    return () => {
      socket.off('ambulances-update');
      socket.off('hospitals-update');
      socket.off('ambulance-request-response');
      socket.off('hospital-request-response');
    };
  }, [socket]);

  const requestAmbulance = (ambulanceSocketId) => {
    if (!socket) return alert('Connecting to server... Please wait.');
    if (!userLocation) return alert('Waiting for location...');
    setRequestStatus('pending_ambulance');
    socket.emit('request-ambulance', {
      ambulanceSocketId,
      userLocation,
      patientDetails: { name: 'Emergency Patient', riskLevel: 'CRITICAL', condition: 'Cardiac Arrest' }
    });
  };

  const requestHospital = (hospitalSocketId) => {
    setRequestStatus('pending_hospital');
    socket.emit('request-hospital', {
      reqId: activeReqId,
      hospitalSocketId
    });
  };

  const mapCenter = userLocation || { lat: 18.5204, lng: 73.8567 };

  // Combine and sort ambulances
  const allAmbs = [
    ...Object.entries(ambulances).map(([id, amb]) => ({ id, ...amb, isSimulated: false })),
    ...simulatedAmbulances
  ].filter(a => a.available)
   .map(a => ({ ...a, distance: calcDist(userLocation, a.location) }));

  allAmbs.sort((a, b) => a.distance - b.distance);
  const topAmbs = allAmbs.slice(0, 5);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Rajdhani', sans-serif", backgroundColor: '#050d1a', color: 'white' }}>
      
      {/* Sidebar Panel */}
      <div style={{ width: '350px', backgroundColor: '#0a1e3a', padding: '20px', borderRight: '1px solid #00c8ff40', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        <h2 style={{ color: '#00ff88', margin: 0, fontSize: '24px', letterSpacing: '2px' }}>EMERGENCY REQUEST</h2>
        <div style={{ fontSize: '14px', color: connected ? '#00ff88' : '#ff3c3c' }}>
          {connected ? '● SYSTEM CONNECTED' : '○ CONNECTING...'}
        </div>

        {requestStatus === 'idle' && (
          <div>
            <h3 style={{ color: '#00c8ff' }}>1. Select an Ambulance</h3>
            <p style={{ color: '#888', fontSize: '12px' }}>Pick a nearby ambulance to request dispatch.</p>
            {topAmbs.length === 0 && <p style={{ color: '#ffcc00' }}>Searching for online ambulances...</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {topAmbs.map((amb, idx) => (
                <div key={amb.id} style={{ background: 'rgba(0,200,255,0.05)', padding: '10px 15px', borderRadius: 6, border: '1px solid rgba(0,200,255,0.2)' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>🚑</span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: 14 }}>{amb.isSimulated ? `Unit ${idx + 1}` : 'Priority Unit'}</div>
                          <div style={{ fontSize: 11, color: '#00ff88' }}>{amb.distance.toFixed(2)} km away</div>
                        </div>
                      </div>
                      <button onClick={() => requestAmbulance(amb.id)} style={{ padding: '6px 12px', background: '#ff6b35', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", fontWeight: 'bold' }}>
                        Dispatch
                      </button>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {requestStatus === 'pending_ambulance' && (
          <div style={{ padding: '20px', border: '1px solid #ffcc00', backgroundColor: '#ffcc0022', borderRadius: '8px' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 10px 0' }}>Requesting Ambulance...</h3>
            <p style={{ fontSize: '14px', color: '#ccc' }}>Waiting for ambulance unit to accept the dispatch request.</p>
          </div>
        )}

        {requestStatus === 'ambulance_accepted' && (
          <div>
            <div style={{ padding: '15px', border: '1px solid #00ff88', backgroundColor: '#00ff8822', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ color: '#00ff88', margin: '0 0 5px 0' }}>Ambulance Dispatched</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>Ambulance is en route to your location. The paramedics are currently evaluating the best hospital for admission.</p>
            </div>
            <h3 style={{ color: '#00c8ff' }}>2. Awaiting Hospital Selection</h3>
            <p style={{ color: '#888', fontSize: '12px' }}>The paramedic unit is sending an admission request to the most suitable hospital...</p>
          </div>
        )}

        {requestStatus === 'pending_hospital' && (
          <div style={{ padding: '20px', border: '1px solid #ffcc00', backgroundColor: '#ffcc0022', borderRadius: '8px' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 10px 0' }}>Requesting Hospital...</h3>
            <p style={{ fontSize: '14px', color: '#ccc' }}>Waiting for hospital to accept the incoming emergency.</p>
          </div>
        )}

        {requestStatus === 'hospital_accepted' && (
          <div style={{ padding: '20px', border: '1px solid #00c8ff', backgroundColor: '#00c8ff22', borderRadius: '8px', flex: 1 }}>
            <h3 style={{ color: '#00c8ff', margin: '0 0 10px 0' }}>Emergency Routed Successfully</h3>
            <p style={{ fontSize: '14px', color: '#ccc' }}>Ambulance is tracking your location and navigating to the destination hospital.</p>
            <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#000', borderRadius: '4px', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', color: '#888' }}>REQ ID:</span> {activeReqId}
            </div>
          </div>
        )}
      </div>

      {/* Map View */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">Carto</a>'
          />
          <MapCenterer center={userLocation} />

          {/* User Marker */}
          {userLocation && (
            <Marker position={userLocation} icon={userIcon}>
              <Popup>Your Location</Popup>
            </Marker>
          )}

          {/* Ambulance Markers */}
          {topAmbs.map((amb) => {
            if (!amb.location) return null;
            // Hide other ambulances if one is already assigned
            if (assignedAmbulanceId && assignedAmbulanceId !== amb.id && !amb.isSimulated) return null;
            if (assignedAmbulanceId && amb.isSimulated) return null;

            return (
              <Marker key={amb.id} position={amb.location} icon={ambulanceIcon}>
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>Ambulance Unit</strong><br />
                    {amb.available ? '🟢 Available' : '🔴 En Route'}<br />
                    {requestStatus === 'idle' && amb.available && (
                      <button 
                        onClick={() => requestAmbulance(amb.id)}
                        style={{ marginTop: '10px', width: '100%', padding: '5px', backgroundColor: '#ff6b35', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Request Dispatch
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Hospital Markers */}
          {Object.entries(hospitals).map(([id, hosp]) => {
            if (!hosp.location) return null;
            // Hide other hospitals if one is assigned
            if (assignedHospitalId && assignedHospitalId !== id) return null;

            return (
              <Marker key={id} position={hosp.location} icon={hospitalIcon}>
                <Popup>
                  <div style={{ color: '#333' }}>
                    <strong>Hospital Command</strong><br />
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {routePath && (
            <Polyline positions={routePath} color="#00ff88" weight={5} opacity={0.7} dashArray="10, 10" />
          )}
        </MapContainer>
        
        {/* Overlay target reticle logic */}
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, pointerEvents: 'none' }}>
           <div style={{ background: 'rgba(0,0,0,0.7)', padding: '10px 15px', borderRadius: '8px', border: '1px solid #00c8ff40' }}>
             <span style={{ color: '#00ff88', fontWeight: 'bold' }}>LIVE</span> TRACKING
           </div>
        </div>
      </div>
    </div>
  );
}
