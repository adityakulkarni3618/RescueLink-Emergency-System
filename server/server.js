const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const patients = require('./data/patients.json');

// Helper to fetch road routes like Uber/Ola
async function getOSRMRoute(startLoc, endLoc) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc.lng},${startLoc.lat};${endLoc.lng},${endLoc.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
       return data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    }
  } catch (e) {
    console.error('OSRM fetch failed:', e);
  }
  return null;
}

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ─── Global legacy state (kept for backwards compat) ───────────────────────────
let latestVitals = null;
let latestLocation = null;
let activePatientId = null;
let hospitalResources = {
  otPrepared: false,
  ventilatorReady: false,
  cardiologistAssigned: false,
  bloodBankAlerted: false,
};
let chatMessages = [];
let connectedRoles = { user: 0, ambulance: 0, hospital: 0 };

// ─── Multi-entity routing state ────────────────────────────────────────────────
let ambulances = {}; // socketId -> { location, available, id, name }
let hospitals = {};  // socketId -> { location, resources, available, id, name }
let activeRequests = {}; // requestId -> { userSocket, ambulanceSocket, hospitalSocket, status, patientDetails }

// ─── REST API ──────────────────────────────────────────────────────────────────
app.get('/api/patients', (req, res) => {
  res.json(patients.map(({ id, name, bloodGroup, riskLevel }) => ({ id, name, bloodGroup, riskLevel })));
});

app.get('/api/patients/:id', (req, res) => {
  const patient = patients.find((p) => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(patient);
});

app.get('/api/status', (req, res) => {
  res.json({
    vitals: latestVitals,
    location: latestLocation,
    activePatientId,
    hospitalResources,
    connectedRoles,
  });
});

// ─── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const role = socket.handshake.query.role || 'unknown';
  console.log(`[CONNECT] ${role.toUpperCase()} connected — ${socket.id}`);

  if (role === 'user') connectedRoles.user++;
  if (role === 'ambulance') connectedRoles.ambulance++;
  if (role === 'hospital') connectedRoles.hospital++;

  io.emit('roles-update', connectedRoles);

  // Send current state to newly connected client
  if (latestVitals) socket.emit('vitals-update', latestVitals);
  if (latestLocation) socket.emit('location-update', latestLocation);
  if (activePatientId) socket.emit('patient-selected', activePatientId);
  socket.emit('resources-update', hospitalResources);
  socket.emit('chat-history', chatMessages);
  socket.emit('ambulances-update', ambulances);
  socket.emit('hospitals-update', hospitals);

  // ── Ambulance events ──────────────────────────────────────────────────────
  socket.on('vitals-update', (data) => {
    latestVitals = { ...data, timestamp: Date.now() };

    // Check for critical thresholds
    const isCritical = data.heartRate > 110 || data.spo2 < 92 || data.systolic > 150 || data.heartRate < 50;
    if (isCritical) {
      const reasons = [];
      if (data.heartRate > 110) reasons.push(`HR ${data.heartRate} bpm (HIGH)`);
      if (data.heartRate < 50) reasons.push(`HR ${data.heartRate} bpm (LOW)`);
      if (data.spo2 < 92) reasons.push(`SpO2 ${data.spo2}% (CRITICAL)`);
      if (data.systolic > 150) reasons.push(`BP ${data.systolic}/${data.diastolic} mmHg (HIGH)`);
      io.emit('critical-alert', { reasons, vitals: data, timestamp: Date.now() });
    }

    io.emit('vitals-update', latestVitals);
  });

  socket.on('bulk-vitals-update', (bulkData) => {
    if (bulkData && bulkData.length > 0) {
      latestVitals = { ...bulkData[bulkData.length - 1], timestamp: Date.now() };
      io.emit('bulk-vitals-update', bulkData);
      console.log(`[DATA RECOVERY] Synced ${bulkData.length} missed vital readings.`);
    }
  });

  socket.on('location-update', (data) => {
    latestLocation = { ...data, timestamp: Date.now() };
    io.emit('location-update', latestLocation);

    // Also update specific ambulance location if registered
    if (ambulances[socket.id]) {
      ambulances[socket.id].location = data;
      io.emit('ambulances-update', ambulances);
    }
  });

  socket.on('patient-selected', (patientId) => {
    activePatientId = patientId;
    const patient = patients.find((p) => p.id === patientId);
    io.emit('patient-selected', patientId);
    if (patient) io.emit('patient-data', patient);
    console.log(`[PATIENT] Active patient set to: ${patientId}`);
  });

  socket.on('incident-note', (note) => {
    io.emit('incident-note', { ...note, timestamp: Date.now() });
  });

  // ── Hospital events ────────────────────────────────────────────────────────
  socket.on('resources-update', (data) => {
    hospitalResources = { ...hospitalResources, ...data };
    io.emit('resources-update', hospitalResources);
    
    // Update specific hospital resources if registered
    if (hospitals[socket.id]) {
      hospitals[socket.id].resources = hospitalResources;
      io.emit('hospitals-update', hospitals);
    }
    
    console.log('[RESOURCES]', hospitalResources);
  });

  // ── AI Events ──────────────────────────────────────────────────────────────
  socket.on('ai-prediction-alert', (data) => {
    io.emit('ai-prediction-alert', data);
    console.log(`[AI ALERT] ${data.message}`);
  });

  // ── Shared chat ────────────────────────────────────────────────────────────
  socket.on('chat-message', (msg) => {
    const fullMsg = { ...msg, id: Date.now(), timestamp: Date.now() };
    chatMessages = [...chatMessages.slice(-49), fullMsg]; // keep last 50
    io.emit('chat-message', fullMsg);
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on('webrtc-offer', (data) => socket.broadcast.emit('webrtc-offer', data));
  socket.on('webrtc-answer', (data) => socket.broadcast.emit('webrtc-answer', data));
  socket.on('webrtc-ice-candidate', (data) => socket.broadcast.emit('webrtc-ice-candidate', data));
  socket.on('webrtc-end', () => socket.broadcast.emit('webrtc-end'));

  // ── Multi-Entity Registration & Routing ────────────────────────────────────
  socket.on('register-ambulance', (data) => {
    ambulances[socket.id] = { ...data, socketId: socket.id, available: true };
    io.emit('ambulances-update', ambulances);
    console.log(`[REGISTER] Ambulance registered: ${socket.id}`);
  });

  socket.on('register-hospital', (data) => {
    hospitals[socket.id] = { ...data, socketId: socket.id, available: true };
    io.emit('hospitals-update', hospitals);
    console.log(`[REGISTER] Hospital registered: ${socket.id}`);
  });

  socket.on('request-ambulance', (data) => {
    // data: { ambulanceSocketId, patientDetails, userLocation }
    const { ambulanceSocketId, patientDetails, userLocation } = data;
    
    // Broadcast to all available real ambulances to ensure the active tab receives it
    const availableAmbulances = Object.keys(ambulances).filter(id => ambulances[id].available);

    if (availableAmbulances.length === 0) {
      socket.emit('ambulance-request-response', { status: 'ambulance_rejected', id: 'N/A' });
      return;
    }

    const reqId = `REQ-${Date.now()}`;
    activeRequests[reqId] = { id: reqId, userSocket: socket.id, status: 'pending_ambulance', patientDetails, userLocation };
    
    // Notify all available ambulances
    availableAmbulances.forEach(socketId => {
      io.to(socketId).emit('incoming-ambulance-request', activeRequests[reqId]);
    });
    console.log(`[DISPATCH] Sent request ${reqId} to ${availableAmbulances.length} ambulances.`);
  });

  socket.on('ambulance-response', async (data) => {
    // data: { reqId, accepted }
    const req = activeRequests[data.reqId];
    if (!req) return;
    
    if (data.accepted) {
        req.status = 'ambulance_accepted';
        req.ambulanceSocket = socket.id;
        
        // IMMEDIATELY notify the user BEFORE any async work
        // This prevents the race condition where request-hospital overwrites the status
        io.to(req.userSocket).emit('ambulance-request-response', { ...req });
        
        if (ambulances[socket.id]) {
            ambulances[socket.id].available = false;
            io.emit('ambulances-update', ambulances);
            
            // Fetch road route in background, send as separate event when ready
            const route = await getOSRMRoute(ambulances[socket.id].location, req.userLocation);
            if (route) {
              req.routePath = route;
              io.to(req.userSocket).emit('route-update', { reqId: req.id, routePath: route });
              io.to(req.ambulanceSocket).emit('route-update', { reqId: req.id, routePath: route });
            }
        }
    } else {
        req.status = 'ambulance_rejected';
        io.to(req.userSocket).emit('ambulance-request-response', { ...req });
    }
  });

  socket.on('request-hospital', (data) => {
    // data: { reqId, hospitalSocketId, fieldReport, previousReports }
    const req = activeRequests[data.reqId];
    if (!req) return;
    req.hospitalSocket = data.hospitalSocketId;
    req.status = 'pending_hospital';
    if (data.fieldReport) req.fieldReport = data.fieldReport;
    if (data.previousReports) req.previousReports = data.previousReports;
    io.to(data.hospitalSocketId).emit('incoming-hospital-request', req);
  });

  socket.on('hospital-response', async (data) => {
    // data: { reqId, accepted }
    const req = activeRequests[data.reqId];
    if (!req) return;
    req.status = data.accepted ? 'hospital_accepted' : 'hospital_rejected';
    
    if (data.accepted && hospitals[socket.id] && ambulances[req.ambulanceSocket]) {
       // Fetch exact road route from Ambulance to Hospital
       const route = await getOSRMRoute(ambulances[req.ambulanceSocket].location, hospitals[socket.id].location || hospitals[socket.id].pos);
       if (route) req.routePath = route;
    }
    
    io.to(req.userSocket).emit('hospital-request-response', req);
    io.to(req.ambulanceSocket).emit('hospital-request-response', req);
    io.to(socket.id).emit('hospital-request-response', req); // Send back to hospital too
  });

  // ── Reroute Hospital (ambulance switches destination) ───────────────────
  socket.on('reroute-hospital', (data) => {
    // data: { reqId, previousReports, newHospitalId }
    console.log(`[REROUTE] Ambulance rerouting. Previous reports: ${data.previousReports?.length || 0}`);
    // Forward previous reports to all hospital sockets so the new one picks them up
    io.emit('reroute-reports', { previousReports: data.previousReports, newHospitalId: data.newHospitalId });
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (role === 'user') connectedRoles.user = Math.max(0, connectedRoles.user - 1);
    if (role === 'ambulance') {
      connectedRoles.ambulance = Math.max(0, connectedRoles.ambulance - 1);
      delete ambulances[socket.id];
      io.emit('ambulances-update', ambulances);
    }
    if (role === 'hospital') {
      connectedRoles.hospital = Math.max(0, connectedRoles.hospital - 1);
      delete hospitals[socket.id];
      io.emit('hospitals-update', hospitals);
    }
    io.emit('roles-update', connectedRoles);
    console.log(`[DISCONNECT] ${role.toUpperCase()} disconnected — ${socket.id}`);
  });
});

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚑  Emergency Care Server running on http://localhost:${PORT}`);
  console.log(`📡  Socket.io ready for real-time connections\n`);
});
