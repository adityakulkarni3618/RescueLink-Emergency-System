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

      // Route critical alerts to specific mission room if from an ambulance
      if (ambulances[socket.id]) {
        io.to(`mission_${socket.id}`).emit('critical-alert', { reasons, vitals: data, timestamp: Date.now() });
      } else {
        io.emit('critical-alert', { reasons, vitals: data, timestamp: Date.now() });
      }
    }

    if (ambulances[socket.id]) {
      // 1-TO-1 ROUTING: Only send vitals to the hospital/user in this specific mission room
      io.to(`mission_${socket.id}`).emit('vitals-update', latestVitals);
    } else {
      io.emit('vitals-update', latestVitals);
    }
  });

  socket.on('bulk-vitals-update', (data) => {
    const vitals = Array.isArray(data) ? data : (data.vitalsHistory || []);
    if (vitals.length > 0) {
      latestVitals = { ...vitals[vitals.length - 1], timestamp: Date.now() };
      if (ambulances[socket.id]) {
        io.to(`mission_${socket.id}`).emit('bulk-vitals-update', vitals);
        io.to(`mission_${socket.id}`).emit('vitals-update', latestVitals);
      } else {
        io.emit('bulk-vitals-update', vitals);
        io.emit('vitals-update', latestVitals);
      }
      console.log(`[DATA RECOVERY] Synced ${vitals.length} missed vital readings${data.reqId ? ` for ${data.reqId}` : ''}.`);
    }
  });

  socket.on('location-update', (data) => {
    latestLocation = { ...data, timestamp: Date.now() };

    if (ambulances[socket.id]) {
      ambulances[socket.id].location = data;
      io.emit('ambulances-update', ambulances); // Global map needs all ambulances
      io.to(`mission_${socket.id}`).emit('location-update', latestLocation); // Detailed view
    } else {
      io.emit('location-update', latestLocation);
    }
  });

  socket.on('patient-selected', (patientId) => {
    activePatientId = patientId;
    const patient = patients.find((p) => p.id === patientId);

    // SESSION CLEAR: Every new patient selection starts a fresh, clean chat context
    chatMessages = [];
    io.emit('chat-history', []);

    io.emit('patient-selected', patientId);
    if (patient) io.emit('patient-data', patient);
    console.log(`[PATIENT] New mission started: ${patientId}. Chat history cleared.`);
  });

  socket.on('incident-note', (note) => {
    // Attempt to route to specific mission room if sent from an ambulance
    if (ambulances[socket.id]) {
      io.to(`mission_${socket.id}`).emit('incident-note', { ...note, timestamp: Date.now() });
    } else {
      io.emit('incident-note', { ...note, timestamp: Date.now() });
    }
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

    // Instead of global chat, route it based on the mission.
    // If an ambulance sends it, emit to its mission room.
    if (ambulances[socket.id]) {
      io.to(`mission_${socket.id}`).emit('chat-message', fullMsg);
    }
    // If a hospital sends it, it needs to go to the specific mission it's part of.
    // We can broadcast to all rooms the hospital is in.
    else if (hospitals[socket.id]) {
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('mission_'));
      if (rooms.length > 0) {
        rooms.forEach(room => io.to(room).emit('chat-message', fullMsg));
      } else {
        io.emit('chat-message', fullMsg); // Fallback
      }
    } else {
      chatMessages = [...chatMessages.slice(-49), fullMsg]; // keep global fallback
      io.emit('chat-message', fullMsg);
    }
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  const routeToMission = (socket, event, data) => {
    if (ambulances[socket.id]) {
      socket.to(`mission_${socket.id}`).emit(event, data);
    } else {
      const rooms = Array.from(socket.rooms).filter(r => r.startsWith('mission_'));
      if (rooms.length > 0) {
        rooms.forEach(room => socket.to(room).emit(event, data));
      } else {
        socket.broadcast.emit(event, data);
      }
    }
  };

  socket.on('webrtc-offer', (data) => routeToMission(socket, 'webrtc-offer', data));
  socket.on('webrtc-answer', (data) => routeToMission(socket, 'webrtc-answer', data));
  socket.on('webrtc-ice-candidate', (data) => routeToMission(socket, 'webrtc-ice-candidate', data));
  socket.on('webrtc-end', () => routeToMission(socket, 'webrtc-end', null));

  // ── Multi-Entity Registration & Routing ────────────────────────────────────
  socket.on('register-ambulance', (data) => {
    ambulances[socket.id] = { ...data, socketId: socket.id, available: true };
    io.emit('ambulances-update', ambulances);
    console.log(`[REGISTER] Ambulance registered: ${socket.id}`);
  });

  socket.on('register-hospital', (data) => {
    hospitals[socket.id] = { ...data, socketId: socket.id };
    socket.join('global_hospitals'); // Join global broadcast room for SOS signals
    console.log(`[HOSPITAL] Registered: ${data.name} (${data.hospitalId})`);
    io.emit('hospitals-update', hospitals);
  });

  socket.on('hospital-location', (data) => {
    // Every hospital terminal MUST be in the global broadcast room to see Stage 1 SOS signals
    socket.join('global_hospitals');

    // If not registered yet, create a guest entry so we can route to it
    if (!hospitals[socket.id]) {
      hospitals[socket.id] = { name: 'Hospital Terminal (Guest)', location: data, socketId: socket.id, isGuest: true };
    } else {
      hospitals[socket.id].location = data;
    }
    io.emit('hospitals-update', hospitals);
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

  socket.on('ambulance-arrived', (data) => {
    const req = activeRequests[data.reqId];
    if (req) {
      req.arrivedAtUser = true;
      io.to(req.userSocket).emit('ambulance-arrived', data);
      io.to(`mission_${req.ambulanceSocket}`).emit('ambulance-arrived', data);
      console.log(`[DISPATCH] Ambulance arrived for request ${data.reqId}`);
    }
  });

  socket.on('ambulance-response', async (data) => {
    // data: { reqId, accepted }
    const req = activeRequests[data.reqId];
    if (!req) return;

    if (data.accepted) {
      req.status = 'ambulance_accepted';
      req.ambulanceSocket = socket.id;
      req.userSocket = data.userSocket || req.userSocket;

      // Stage 1: LOGISTICS ALERT (Geography + Unit Info) - Global Broadcast for Demo Reliability
      io.emit('incoming-hospital-request', {
        id: req.id,
        status: 'advance_notice',
        ambulanceName: ambulances[socket.id]?.name || 'Unit',
        ambulanceDetails: {
          vehicleNo: ambulances[socket.id]?.vehicleNo,
          type: ambulances[socket.id]?.type
        },
        userLocation: req.userLocation,
        patientDetails: req.patientDetails,
        message: `Ambulance ${ambulances[socket.id]?.name || 'Unit'} is responding to an emergency.`,
        distance: data.distanceToUser || req.distanceToUser || 5
      });

      // Add the User to this Ambulance's private mission room
      const userSocketObj = io.sockets.sockets.get(req.userSocket);
      if (userSocketObj) userSocketObj.join(`mission_${socket.id}`);

      // IMMEDIATELY notify the user BEFORE any async work
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
    // data: { reqId, hospitalSocketId, fieldReport, previousReports, broadcast }
    let req = activeRequests[data.reqId];

    // REDUNDANCY: If server memory lost the request, reconstruct it from incoming data
    if (!req) {
      console.warn(`[SERVER] Reconstructing missing request for ID: ${data.reqId}`);
      req = {
        id: data.reqId,
        ambulanceSocket: socket.id,
        patientDetails: data.fieldReport ? { name: 'Emergency Case', riskLevel: data.fieldReport.riskLevel } : { name: 'Unknown' }
      };
    }

    if (data.fieldReport) {
      req.fieldReport = data.fieldReport;
      req.status = 'admission_request'; // Elevate from advance_notice to admission_request
    }
    if (data.previousReports) req.previousReports = data.previousReports;
    if (data.ambulanceDetails) req.ambulanceDetails = data.ambulanceDetails;

    if (data.broadcast) {
      console.log(`[NETWORK] BROADCASTING admission request ${data.reqId} to all hospitals.`);
      io.emit('incoming-hospital-request', req);
    } else if (data.hospitalSocketId) {
      io.to(data.hospitalSocketId).emit('incoming-hospital-request', req);
    }
  });

  socket.on('hospital-response', async (data) => {
    // data: { reqId, accepted, status }
    const req = activeRequests[data.reqId];
    if (!req) return;

    // Support both boolean and string-based status payloads
    const isAccepted = data.accepted === true || data.status === 'hospital_accepted';

    req.status = isAccepted ? 'hospital_accepted' : 'hospital_rejected';
    if (isAccepted) {
      req.hospitalSocket = socket.id;
      // Save the specific resources the hospital confirmed as ready
      if (data.readyServices) req.readyServices = data.readyServices;
    }

    // SESSION CLEAR: Every time a hospital accepts a new mission, start with a fresh chat
    if (isAccepted) {
      chatMessages = [];
      io.emit('chat-history', []);
    }

    if (isAccepted && hospitals[socket.id] && ambulances[req.ambulanceSocket]) {
      // Hospital joins the private mission room for this specific ambulance
      socket.join(`mission_${req.ambulanceSocket}`);
      console.log(`[HANDSHAKE] Hospital ${hospitals[socket.id].name} joined mission_${req.ambulanceSocket}`);

      // Fetch exact road route from Ambulance to Hospital
      const route = await getOSRMRoute(ambulances[req.ambulanceSocket].location, hospitals[socket.id].location || hospitals[socket.id].pos);
      if (route) req.routePath = route;
    }

    io.to(req.userSocket).emit('hospital-request-response', req);
    io.to(req.ambulanceSocket).emit('hospital-request-response', req);
    io.to(socket.id).emit('hospital-request-response', req);

    // If it was a broadcasted request, notify all other hospitals to "withdraw" the alert
    if (isAccepted) {
      io.to('global_hospitals').emit('hospital-request-taken', { reqId: req.id, acceptedBy: socket.id });
    }
  });

  // ── Reroute Hospital (ambulance switches destination) ───────────────────
  socket.on('reroute-hospital', (data) => {
    // data: { reqId, newHospitalId, newHospitalName }
    console.log(`[REROUTE] Ambulance rerouting to ${data.newHospitalName}`);
    // Broadcast the reroute event so the old hospital knows to log out and the new one knows to log in
    io.emit('reroute-hospital', data);
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
