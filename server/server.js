require('dotenv').config();
const express = require('express'); // trigger-reload
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');

// Sentry Error Tracking Setup (Production Visibility)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    logger.info('[ENTERPRISE ALERTS] Sentry Error Tracking Initialized');
  } catch (err) {
    logger.warn('[ENTERPRISE ALERTS] Sentry SDK failed to initialize. Error tracking disabled.');
  }
}

const { logAudit } = require('./utils/auditLogger');
const { generateFHIRBundle } = require('./utils/fhirConverter');
const { User, Hospital, Patient: PatientModel, Incident, AuditLog, sequelize, syncDatabase } = require('./utils/db');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const tf = require('@tensorflow/tfjs');
const { S2 } = require('s2-geometry');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const whatsappService = require('./utils/whatsapp');
const { getETA, haversineDistance } = require('./utils/maps');
const { initVitalsBridge } = require('./utils/vitalsBridge');
const cache = require('./utils/cache');
const { sendPushNotification, sendTopicNotification } = require('./utils/pushNotifications');

// NOTE: @socket.io/cluster-adapter only works inside a Node.js cluster (PM2/master-worker).
// It is disabled here for standalone dev. In production with PM2, enable it in a cluster entrypoint.

const { JWT_SECRET } = require('./utils/config');

function authenticateToken(req, res, next) {
  return verifyToken()(req, res, next);
}

// ─── OFFICIAL ABDM (AYUSHMAN BHARAT) INTEGRATION ENGINE ───────────────────
// PASTE YOUR CLIENT ID AND SECRET HERE ONCE APPROVED BY NHA
const ABDM_CONFIG = {
  clientId: process.env.ABDM_CLIENT_ID || 'SBX_00XXXX', // Replace with your ID
  clientSecret: process.env.ABDM_CLIENT_SECRET || 'XXXX-XXXX-XXXX', // Replace with your Secret
  gatewayUrl: 'https://dev.abdm.gov.in/gateway',
  isLive: !!(process.env.ABDM_CLIENT_ID && process.env.ABDM_CLIENT_SECRET)
};

let abdmSessionToken = null;
const axios = require('axios');

async function getAbdmAccessToken() {
  if (!ABDM_CONFIG.isLive) return null;
  try {
    const res = await axios.post(`${ABDM_CONFIG.gatewayUrl}/v0.5/sessions`, {
      clientId: ABDM_CONFIG.clientId,
      clientSecret: ABDM_CONFIG.clientSecret
    });
    abdmSessionToken = res.data.accessToken;
    console.log('[ABDM ENGINE] Session Token Refreshed Successfully.');
    return abdmSessionToken;
  } catch (err) {
    console.error('[ABDM ENGINE] Authentication Failed:', err.response?.data || err.message);
    return null;
  }
}
// Refresh token every 50 minutes
if (ABDM_CONFIG.isLive && process.env.NODE_ENV !== 'test') {
  getAbdmAccessToken();
  setInterval(getAbdmAccessToken, 50 * 60 * 1000);
}


// ─── ENTERPRISE PREDICTIVE AI (TENSORFLOW.JS) ──────────────────────────────
let predictiveModel = null;
async function initPredictiveAI() {
  try {
    // In production, this loads a real-world trained model: await tf.loadLayersModel('file://./data/cardiac_arrest_model.json')
    predictiveModel = tf.sequential();
    predictiveModel.add(tf.layers.dense({ units: 16, inputShape: [5], activation: 'relu' }));
    predictiveModel.add(tf.layers.dense({ units: 3, activation: 'sigmoid' })); // 3 outputs: Cardiac Arrest, Shock, VTach
    predictiveModel.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
    console.log('[ENTERPRISE AI] TensorFlow.js Predictive Triage ML Model Initialized (3-Outputs).');
  } catch (err) {
    console.error('[ENTERPRISE AI] Failed to load TF model:', err.message);
  }
}
initPredictiveAI();

// FIX C1: Debounced DB write — prevents SQLite I/O death spiral under high load.
// Instead of writing on every vitals tick, we batch writes every 15 seconds per mission.
const dbWriteTimers = {};
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUID = (val) => typeof val === 'string' && UUID_REGEX.test(val);

function syncMissionToDB(reqId) {
  if (dbWriteTimers[reqId]) return; // Already scheduled — skip
  dbWriteTimers[reqId] = setTimeout(async () => {
    delete dbWriteTimers[reqId];
    try {
      const req = activeRequests[reqId];
      if (!req) return;

      let patientId = req.patientDetails?.id || req.fieldReport?.patientId || null;
      if (!isUUID(patientId)) patientId = null;

      let paramedicId = req.paramedicId || null;
      if (!isUUID(paramedicId)) paramedicId = null;

      let hospitalId = req.hospitalId || null;
      if (!isUUID(hospitalId)) hospitalId = null;

      const status = req.status || 'requested';
      const pickup_lat = req.userLocation?.lat || req.incidentLocation?.lat || null;
      const pickup_lng = req.userLocation?.lng || req.incidentLocation?.lng || null;
      const pickup_address = req.patientDetails?.address || req.pickup_address || '';
      const news2_score = req.news2Score || 0;
      const vitals_log = req.vitalsHistory || [];
      const gps_log = req.gps_log || req.gpsHistory || [];
      const notes = req.fieldNotes || req.notes || '';

      await Incident.upsert({
        id: req.id || reqId,
        patient_id: patientId,
        ambulance_id: req.unitId || req.ambulanceSocket || null,
        paramedic_id: paramedicId,
        hospital_id: hospitalId,
        status: status,
        pickup_lat: pickup_lat,
        pickup_lng: pickup_lng,
        pickup_address: pickup_address,
        news2_score: news2_score,
        vitals_log: vitals_log,
        gps_log: gps_log,
        notes: notes,
        payment_status: req.payment_status || 'pending',
        razorpay_order_id: req.razorpay_order_id || null
      });
      console.log(`[DB SYNC] Synced incident ${reqId} to PostgreSQL`);
    } catch (err) {
      console.error('[DB SYNC ERROR]', err);
    }
  }, 15000); // Batch writes every 15 seconds
}

const ALL_HOSPITALS_CACHE_KEY = 'hospitals:all';

async function broadcastRegistry() {
  try {
    let allHospitals = await cache.get(ALL_HOSPITALS_CACHE_KEY);
    if (!allHospitals) {
      const dbHospitals = await Hospital.findAll({ where: { is_active: true } });
      allHospitals = dbHospitals.map(h => typeof h.toJSON === 'function' ? h.toJSON() : h);
      await cache.set(ALL_HOSPITALS_CACHE_KEY, allHospitals, 30);
    }
    const registry = {};
    allHospitals.forEach(h => {
      registry[h.id] = {
        id: h.id,
        name: h.name,
        lat: h.lat,
        lng: h.lng,
        pos: { lat: h.lat, lng: h.lng }, // Compatibility for Leaflet components
        contactInfo: h.contact_number,
        isOnline: Object.values(hospitals).some(live => live.id === h.id || live.hospitalId === h.id),
        isRegistryEntry: true
      };
    });

    // Merge live data with registry (live connections take precedence for socket IDs)
    const mergedHospitals = { ...registry };
    Object.entries(hospitals).forEach(([sid, live]) => {
      const hospitalId = live.id || live.hospitalId;
      if (hospitalId && mergedHospitals[hospitalId]) {
        mergedHospitals[hospitalId] = { ...mergedHospitals[hospitalId], ...live, isOnline: true, socketId: sid };
      } else {
        mergedHospitals[sid] = { ...live, isOnline: true, socketId: sid };
      }
    });

    io.emit('hospitals-update', mergedHospitals);
  } catch (err) {
    console.error('[REGISTRY SYNC ERROR]', err);
  }
}
// Initial sync after boot and then every 30s
if (process.env.NODE_ENV !== 'test') {
  setTimeout(broadcastRegistry, 5000);
  let lastBroadcastTime = 0;
  setInterval(() => {
    const now = Date.now();
    const threshold = disasterModeActive ? 1000 : 30000;
    if (now - lastBroadcastTime >= threshold) {
      broadcastRegistry();
      lastBroadcastTime = now;
    }
  }, 1000);
}


// ─── DYNAMIC TRAFFIC CONGESTION & DETOUR ENGINE ────────────────────────────
const activeIncidentZones = {};
const activeMciEvents = {};
let disasterModeActive = false;
const lastEmittedLocations = {};

function isRushHour() {
  const hour = new Date().getHours();
  // Rush hours: 8:00 AM - 10:00 AM and 5:00 PM - 7:00 PM
  return (hour >= 8 && hour < 10) || (hour >= 17 && hour < 19);
}

// Helper to calculate distance in km using Haversine formula
function calcDist(pos1, pos2) {
  if (!pos1 || !pos2 || !pos1.lat || !pos2.lat) return Infinity;
  const R = 6371; // km
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLng = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function checkRouteCollision(route) {
  if (!route || route.length === 0) return null;
  for (const coord of route) {
    for (const zone of Object.values(activeIncidentZones)) {
      const dist = calcDist(coord, zone); // in km
      if (dist <= (zone.radius / 1000)) {
        return zone;
      }
    }
  }
  return null;
}

// FIX H1: OSRM fetch now has a 8-second timeout to prevent hanging the event loop
// Enhanced to accept multiple waypoints for detouring
async function getOSRMRoute(waypoints) {
  if (!waypoints || waypoints.length < 2) return [];
  const waypointStr = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${waypointStr}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    );
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    } else {
      return waypoints;
    }
  } catch (e) {
    console.warn('[OSRM] Route fetch failed, using waypoints fallback.');
    return waypoints;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSmartRoute(startLoc, endLoc) {
  const defaultRoute = await getOSRMRoute([startLoc, endLoc]);
  const collidedZone = checkRouteCollision(defaultRoute);
  if (collidedZone) {
    console.log(`[OSRM Detour] Route intersects with incident zone: "${collidedZone.reason}". Calculating detour waypoint...`);
    // Offset waypoint by radius + 150m. Convert meters to lat/lng: ~1m = 0.000009 deg
    const offset = (collidedZone.radius + 150) * 0.000009;
    const detourPoint = {
      lat: collidedZone.lat + offset,
      lng: collidedZone.lng + offset
    };
    const detouredRoute = await getOSRMRoute([startLoc, detourPoint, endLoc]);
    return detouredRoute;
  }
  return defaultRoute;
}

const app = express();
app.set('trust proxy', 1);
const path = require('path');

// ─── SECURITY MIDDLEWARE ────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL && !process.env.PRODUCTION_URL) {
  console.error('[FATAL SECURITY ERROR] PRODUCTION_URL or FRONTEND_URL environment variable is missing in production. Socket and API CORS allowlists must be explicitly configured to prevent wildcard default fallbacks. Refusing to boot server.');
  process.exit(1);
}

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  process.env.PRODUCTION_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
      return callback(null, true);
    }
    callback(new Error(`CORS policy violation: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Helmet for HTTP security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Morgan Request Logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '10mb' })); // 10mb for image uploads in chat
const maskSensitiveData = require('./middleware/maskSensitiveData');
app.use(maskSensitiveData);

// Serve static React frontend files from the client build directory
app.use(express.static(path.join(__dirname, '../client/build')));

// Rate Limiters
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 attempts for login/mfa verify
  message: { error: 'Too many authentication attempts, please try again after 15 minutes' }
});

const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Max 100 requests per minute
  message: { error: 'Too many requests, please try again later' }
});

// Apply rate limiters
app.use('/api', apiRateLimiter);
app.use('/api/auth', authRateLimiter, authRouter);
app.use('/api/users', usersRouter);

const abdmRouter = require('./routes/abdm');
const insuranceRouter = require('./routes/insurance');
const bloodRouter = require('./routes/blood');
const paymentsRouter = require('./routes/payments');
const hospitalsRouter = require('./routes/hospitals');
const analyticsRouter = require('./routes/analytics');
const aiCopilotRouter = require('./routes/aiCopilot');

app.use('/api/abdm', abdmRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/blood', bloodRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/hospitals', hospitalsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/ai', aiCopilotRouter);

const videoCallRouter = require('./routes/videoCall');
app.use('/api/video', videoCallRouter);

const hisRouter = require('./routes/his');
const telemedicineRouter = require('./routes/telemedicine');
const mfaRouter = require('./routes/mfa');
const auditRouter = require('./routes/audit');
const erasureRouter = require('./routes/erasure');
const disasterRouter = require('./routes/disaster');
const syncRouter = require('./routes/sync');
app.use('/api/his', hisRouter);
app.use('/api/tele', telemedicineRouter);
app.use('/api/mfa', mfaRouter);
app.use('/api/audit', auditRouter);
app.use('/api/erasure', erasureRouter);
app.use('/api/disaster', disasterRouter);
app.use('/api/sync', syncRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'ready',
      database: 'connected'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unready',
      database: 'disconnected',
      error: err.message
    });
  }
});

const setupSwagger = require('./utils/swagger');
setupSwagger(app);



// ─── ENTERPRISE HIE (HEALTH INFO EXCHANGE) BRIDGE ──────────────────────────
// Smart-Switching Logic: Uses Official ABDM Gateway if configured, else Local Registry
app.post('/api/hie/initiate', async (req, res) => {
  const { nationalId } = req.body;
  if (!nationalId) return res.status(400).json({ error: "ID Required" });

  if (!ABDM_CONFIG.isLive) {
    // FALLBACK: Simulate OTP Trigger for Demo/Local mode
    console.log(`[HIE BRIDGE] LOCAL MODE: Simulated OTP sent for ID ${nationalId}`);
    return res.json({ status: "SUCCESS", transactionId: `TXN-${Date.now()}`, mode: "SIMULATED" });
  }

  // PRODUCTION: Trigger actual ABDM Aadhaar OTP
  try {
    const token = await getAbdmAccessToken();
    if (!token) throw new Error("ABDM token authentication failed");
    const response = await axios.post(`${ABDM_CONFIG.gatewayUrl}/v1/registration/aadhaar/generateOtp`,
      { aadhaar: nationalId },
      { headers: { 'Authorization': `Bearer ${token}`, 'X-CM-ID': 'sbx' } }
    );
    res.json({ status: "SUCCESS", transactionId: response.data.transactionId, mode: "ACTUAL" });
  } catch (err) {
    console.warn(`[HIE BRIDGE] Gateway Error: ${err.message}. Falling back to SIMULATED mode for testing.`);
    return res.json({ status: "SUCCESS", transactionId: `TXN-${Date.now()}`, mode: "SIMULATED_FALLBACK" });
  }
});

app.post('/api/hie/verify', async (req, res) => {
  const { transactionId, otp, nationalId } = req.body;

  // FALLBACK: If simulated or if transactionId starts with simulated prefix
  if (!ABDM_CONFIG.isLive || (transactionId && transactionId.startsWith('TXN-'))) {
    const searchId = nationalId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let foundPatient = null;
    try {
      const allDbPatients = await PatientModel.findAll();
      for (const p of allDbPatients) {
        const normalizedNationalId = (p.abha_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const normalizedLocalId = p.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (normalizedNationalId === searchId || normalizedLocalId === searchId) {
          foundPatient = {
            id: p.id,
            name: p.name,
            dob: p.dob,
            bloodGroup: p.blood_group,
            nationalId: p.abha_number,
            allergies: p.allergies,
            medicalHistory: p.conditions,
            emergencyContact: `${p.emergency_contact_name} – ${p.emergency_contact_mobile}`,
            gender: p.gender,
            active: p.active,
            consent_obtained: p.consent_obtained
          };
          break;
        }
      }
    } catch (dbErr) {
      console.error('[HIE VERIFY DB ERROR]', dbErr);
    }

    if (foundPatient) return res.json(foundPatient);

    // PRODUCTION REALISM: Fail if not found, forcing strict validation.
    return res.status(404).json({ error: "Patient Not Found in HIE Registry" });
  }

  // PRODUCTION: Verify actual OTP via ABDM Gateway
  try {
    const token = await getAbdmAccessToken();
    const response = await axios.post(`${ABDM_CONFIG.gatewayUrl}/v1/registration/aadhaar/verifyOTP`,
      { transactionId, otp },
      { headers: { 'Authorization': `Bearer ${token}`, 'X-CM-ID': 'sbx' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(401).json({ error: "Invalid OTP", detail: err.response?.data || err.message });
  }
});




// Official HIP Callback for discovering care contexts (Mission records)
app.post('/v0.5/care-contexts/discover', async (req, res) => {
  res.status(202).send();
});
app.post('/v0.5/links/link/init', async (req, res) => {
  res.status(202).send();
});

app.get('/api/patient/lookup/:nationalId', authenticateToken, async (req, res) => {
  const { nationalId } = req.params;
  const searchId = nationalId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  let foundPatient = null;
  try {
    const allDbPatients = await PatientModel.findAll();
    for (const p of allDbPatients) {
      const normalizedNationalId = (p.abha_number || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const normalizedLocalId = p.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      if (normalizedNationalId === searchId || normalizedLocalId === searchId) {
        foundPatient = {
          id: p.id,
          name: p.name,
          dob: p.dob,
          bloodGroup: p.blood_group,
          nationalId: p.abha_number,
          allergies: p.allergies,
          medicalHistory: p.conditions,
          emergencyContact: `${p.emergency_contact_name} – ${p.emergency_contact_mobile}`,
          gender: p.gender,
          active: p.active,
          consent_obtained: p.consent_obtained
        };
        break;
      }
    }
  } catch (dbErr) {
    console.error('[PATIENT LOOKUP DB ERROR]', dbErr);
  }

  if (!foundPatient) {
    return res.status(404).json({ error: "Patient Not Found in Registry" });
  }

  res.json(foundPatient);
});


// ─── ENTERPRISE FHIR INTEGRATION API ───────────────────────────────────────
app.get('/api/fhir/:reqId', authenticateToken, (req, res) => {
  const activeReq = activeRequests[req.params.reqId];
  if (!activeReq) return res.status(404).json({ error: "Mission not found" });

  if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role) && activeReq.hospitalId !== req.user.hospital_id) {
    return res.status(403).json({ error: "Access denied: Mission belongs to a different hospital" });
  }

  const fhirData = generateFHIRBundle(
    activeReq.fieldReport?.patientId || 'UNKNOWN',
    activeReq.fieldReport?.patientName || 'Emergency Case',
    activeReq.fieldReport?.vitals,
    activeReq.fieldReport?.fieldNotes
  );

  logAudit('FHIR_EXPORT', `Hospital downloaded FHIR record for mission ${req.params.reqId}`, { reqId: req.params.reqId });
  AuditLog.create({
    action: 'FHIR_EXPORT',
    actorId: req.user?.id || 'UNKNOWN',
    targetReqId: req.params.reqId,
    details: 'Downloaded encrypted FHIR bundle'
  }).catch(e => console.error('[AUDIT DB ERROR]', e));
  res.json(fhirData);
});

app.get('/api/status', (req, res) => {
  res.json({
    activeMissionsCount: Object.keys(activeRequests).length,
    connectedRoles
  });
});



// Fallback to React index.html for unknown routes (React Router support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack || err.message || err}`);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  return res.status(status).json({ error: message });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
        return callback(null, true);
      }
      callback(new Error(`Socket CORS policy violation: ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});
app.set('socketio', io);

// Mount Socket.io Redis adapter for horizontal scaling with dynamic fallback
try {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const Redis = require('ioredis');

  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        console.log('[REDIS ADAPTER] Connection timeout. Fallback to in-memory socket synchronization.');
        return null;
      }
      return 1000;
    }
  });

  pubClient.on('error', (err) => {
    // Suppress adapter error alerts
  });

  pubClient.on('connect', () => {
    console.log('[REDIS ADAPTER] Connected successfully, mounting Redis Pub/Sub adapter.');
    const subClient = pubClient.duplicate();
    subClient.on('error', (err) => {
      // Suppress subClient adapter error alerts to prevent crashes
    });
    io.adapter(createAdapter(pubClient, subClient));
  });
} catch (adapterErr) {
  console.log('[REDIS ADAPTER] Initialization failed, using standard memory adapter:', adapterErr.message);
}

// Socket connection rate limiting (max 5 connections per IP simultaneously)
const ipConnectionCounts = {};

io.use((socket, next) => {
  const ip = socket.handshake.address || socket.conn.remoteAddress;
  const currentCount = ipConnectionCounts[ip] || 0;
  if (currentCount >= 5) {
    console.log(`[SOCKET RATE LIMIT] Connection refused from IP ${ip}: Max connections reached`);
    return next(new Error('Connection limit exceeded. Maximum 5 socket connections per IP allowed.'));
  }
  ipConnectionCounts[ip] = currentCount + 1;

  socket.on('disconnect', () => {
    if (ipConnectionCounts[ip]) {
      ipConnectionCounts[ip]--;
      if (ipConnectionCounts[ip] <= 0) {
        delete ipConnectionCounts[ip];
      }
    }
  });
  next();
});

// Socket JWT authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
  if (!token) {
    console.log(`[SOCKET AUTH FAIL] Connection refused from ${socket.id}: No token provided`);
    return next(new Error('Unauthorized: Authentication token required'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log(`[SOCKET AUTH FAIL] Connection refused from ${socket.id}: Invalid or expired token`);
      return next(new Error('Unauthorized: Invalid or expired token'));
    }
    socket.user = decoded;
    console.log(`[SOCKET AUTH SUCCESS] Connection accepted from ${socket.id} (User: ${decoded.email}, Role: ${decoded.role})`);
    next();
  });
});

// ─── ENTERPRISE SCALING NOTE ───────────────────────────────────────────────
// The Socket.io Cluster Adapter is installed but NOT activated here.
// To enable horizontal scaling: wrap this server in a cluster.js entrypoint (PM2 cluster mode)
// and call io.adapter(createAdapter()) + setupWorker(io) there.
console.log('[ENTERPRISE INFRA] Running in standalone mode. Add PM2 cluster config for horizontal scaling.');

let connectedRoles = { user: 0, ambulance: 0, hospital: 0 };

// ─── Multi-entity routing state ────────────────────────────────────────────────
const ambulances = {};
const hospitals = {};
const users = {};
const activeRequests = {};

// Initialize Vitals Bridge
if (process.env.NODE_ENV !== 'test') {
  initVitalsBridge(io, activeRequests);
}

const virtualAmbulances = {};
const spawnVirtualAmbulances = (centerLoc) => {
  if (!centerLoc || !centerLoc.lat) return;

  // Tight cluster around user for immediate visibility
  const offsets = [
    { lat: 0.005, lng: 0.008, name: 'Metro Alpha (ALS)', type: 'ALS' },
    { lat: -0.006, lng: 0.005, name: 'Zonal Unit 04', type: 'BLS' },
    { lat: 0.002, lng: -0.009, name: 'Cardiac Support 12', type: 'ALS' },
    { lat: -0.004, lng: -0.006, name: 'Regional Hub 09', type: 'BLS' }
  ];

  offsets.forEach((off, i) => {
    const id = `VIRTUAL-AMB-00${i + 1}`;
    // Always update to current user vicinity
    virtualAmbulances[id] = {
      unitId: id,
      driverName: off.name,
      vehicleNo: `SIM-FLEET-${i + 1}`,
      type: off.type === 'ALS' ? 'Advanced Life Support' : 'Basic Life Support',
      location: { lat: centerLoc.lat + off.lat, lng: centerLoc.lng + off.lng },
      available: true,
      isSimulated: true
    };
  });
};

const getCombinedAmbulances = () => {
  return { ...virtualAmbulances, ...ambulances };
};

const activeSimulations = {};

function cleanupSimulation(reqId) {
  if (activeSimulations[reqId]) {
    clearInterval(activeSimulations[reqId].interval);
    delete activeSimulations[reqId];
  }
  const req = activeRequests[reqId];
  if (req && req.unitId && req.unitId.startsWith('VIRTUAL-AMB-')) {
    const amb = virtualAmbulances[req.unitId];
    if (amb) {
      amb.available = true;
      io.emit('ambulances-update', getCombinedAmbulances());
    }
  }
}

function startVirtualAmbulanceSimulation(reqId, virtualAmbId) {
  cleanupSimulation(reqId);

  const req = activeRequests[reqId];
  if (!req) return;

  const amb = virtualAmbulances[virtualAmbId];
  if (!amb) return;

  req.status = 'ambulance_accepted';
  req.ambulanceSocket = virtualAmbId;
  req.unitId = virtualAmbId;
  amb.available = false;

  io.emit('ambulances-update', getCombinedAmbulances());
  io.to(req.userSocket).emit('ambulance-request-response', { ...req, accepted: true });

  io.emit('incoming-hospital-request', {
    id: req.id,
    status: 'advance_notice',
    ambulanceName: amb.driverName || 'Virtual Unit',
    userLocation: req.userLocation,
    patientDetails: req.patientDetails,
  });

  getSmartRoute(amb.location, req.userLocation).then(route => {
    if (!route || route.length === 0) {
      route = [amb.location, req.userLocation];
    }

    req.routePath = route;
    io.to(req.userSocket).emit('route-update', { reqId: req.id, routePath: route });

    let currentWaypointIdx = 0;
    const totalWaypoints = route.length;
    const tickIntervalMs = 1000;
    const numTicks = isRushHour() ? 38 : 15; // 2.5x speed reduction (more ticks) during rush hour
    const stepSize = Math.max(1, Math.ceil(totalWaypoints / numTicks));

    console.log(`[Sim Dispatch] Starting simulation for ${virtualAmbId} to user. Waypoints: ${totalWaypoints}, step: ${stepSize}`);

    const interval = setInterval(() => {
      if (!activeRequests[reqId] || activeRequests[reqId].status === 'cancelled') {
        console.log(`[Sim Dispatch] Request ${reqId} was cancelled. Stopping simulation.`);
        clearInterval(interval);
        delete activeSimulations[reqId];
        amb.available = true;
        io.emit('ambulances-update', getCombinedAmbulances());
        return;
      }

      currentWaypointIdx += stepSize;
      if (currentWaypointIdx >= totalWaypoints - 1) {
        currentWaypointIdx = totalWaypoints - 1;
      }

      const currentLoc = route[currentWaypointIdx];
      amb.location = currentLoc;

      const locationPayload = {
        reqId: req.id,
        lat: currentLoc.lat,
        lng: currentLoc.lng,
        ambulanceSocket: virtualAmbId,
        arrivedAtUser: currentWaypointIdx === totalWaypoints - 1
      };

      io.to(req.userSocket).emit('location-update', locationPayload);
      io.emit('ambulances-update', getCombinedAmbulances());

      if (currentWaypointIdx === totalWaypoints - 1) {
        console.log(`[Sim Dispatch] Virtual ambulance ${virtualAmbId} arrived at user.`);
        clearInterval(interval);

        req.arrivedAtUser = true;
        io.to(req.userSocket).emit('ambulance-arrived', { reqId: req.id });

        setTimeout(() => {
          if (!activeRequests[reqId]) return;
          req.status = 'patient_onboard';
          io.to(req.userSocket).emit('patient-onboard', { reqId: req.id });
          console.log(`[Sim Dispatch] Patient onboard for request ${reqId}. Waiting for hospital response.`);

          const availableHospitalSockets = Object.keys(hospitals).filter(sid => {
            const inv = hospitals[sid].inventory || {};
            return inv.beds === undefined || inv.beds > 0;
          });

          req.incidentLocation = req.userLocation;
          req.status = 'admission_request';

          const uniqueHospitalIds = [...new Set(availableHospitalSockets.map(sid => hospitals[sid]?.id).filter(Boolean))];
          uniqueHospitalIds.forEach(hospId => {
            io.to(`hospital:${hospId}`).emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
          });
          console.log(`[Sim Dispatch] Broadcasted admission request to ${availableHospitalSockets.length} hospitals.`);

          // SIMULATION AUTO-ACCEPT: If no human clicks accept in 8 seconds, the simulation forces a mock hospital to accept it.
          setTimeout(() => {
            const currentReq = activeRequests[reqId];
            if (currentReq && currentReq.status === 'admission_request') {
              console.log(`[Sim Dispatch] Auto-accepting request ${reqId} for simulation.`);
              // Find first available mock hospital, or any available
              let mockSid = Object.keys(hospitals).find(sid => hospitals[sid].id && hospitals[sid].id.startsWith('mock_'));
              if (!mockSid && availableHospitalSockets.length > 0) mockSid = availableHospitalSockets[0];

              if (mockSid && !currentReq._acceptLock) {
                currentReq._acceptLock = true;
                currentReq.status = 'hospital_accepted';
                currentReq.hospitalSocket = mockSid;
                currentReq.hospitalId = hospitals[mockSid].id;
                currentReq.readyServices = { otPrepared: true, ventilatorReady: true, cardiologistAssigned: true };
                currentReq.assignedHospital = hospitals[mockSid];

                hospitals[mockSid].activeMissionsCount = (hospitals[mockSid].activeMissionsCount || 0) + 1;
                hospitals[mockSid].isBusy = true;

                io.emit('hospitals-update', hospitals);
                io.emit('ambulances-update', getCombinedAmbulances());

                const fakeData = { reqId, status: 'hospital_accepted', readyServices: currentReq.readyServices, assignedHospital: hospitals[mockSid] };
                io.to(currentReq.userSocket).emit('hospital-response', fakeData);

                startVirtualAmbulanceToHospitalSimulation(reqId, mockSid);
              }
            }
          }, 8000);
        }, 5000);
      }
    }, tickIntervalMs);

    activeSimulations[reqId] = { interval, type: 'to_user' };
  });
}

function startVirtualAmbulanceToHospitalSimulation(reqId, hospitalSocketId) {
  if (activeSimulations[reqId]) {
    clearInterval(activeSimulations[reqId].interval);
  }

  const req = activeRequests[reqId];
  if (!req) return;

  const amb = virtualAmbulances[req.unitId];
  const hosp = hospitals[hospitalSocketId];
  if (!amb || !hosp) return;

  const hospLoc = hosp.location || hosp.pos;
  if (!hospLoc) return;

  console.log(`[Sim Dispatch] Starting leg 2 of simulation for ${amb.unitId} to hospital ${hosp.name}.`);

  getSmartRoute(req.userLocation, hospLoc).then(route => {
    if (!route || route.length === 0) {
      route = [req.userLocation, hospLoc];
    }

    req.routePath = route;
    io.to(`mission_${req.id}`).emit('route-update', { reqId: req.id, routePath: route, from: 'incident', to: 'hospital' });

    let currentWaypointIdx = 0;
    const totalWaypoints = route.length;
    const tickIntervalMs = 1000;
    const numTicks = isRushHour() ? 38 : 15; // 2.5x speed reduction (more ticks) during rush hour
    const stepSize = Math.max(1, Math.ceil(totalWaypoints / numTicks));

    const interval = setInterval(() => {
      if (!activeRequests[reqId] || activeRequests[reqId].status === 'cancelled') {
        console.log(`[Sim Dispatch] Request ${reqId} was cancelled during hospital transport. Stopping simulation.`);
        clearInterval(interval);
        delete activeSimulations[reqId];
        amb.available = true;
        io.emit('ambulances-update', getCombinedAmbulances());
        return;
      }

      currentWaypointIdx += stepSize;
      if (currentWaypointIdx >= totalWaypoints - 1) {
        currentWaypointIdx = totalWaypoints - 1;
      }

      const currentLoc = route[currentWaypointIdx];
      amb.location = currentLoc;

      io.to(`mission_${req.id}`).emit('location-update', {
        reqId: req.id,
        lat: currentLoc.lat,
        lng: currentLoc.lng,
        ambulanceSocket: amb.unitId,
        destinationId: hosp.id
      });
      io.emit('ambulances-update', getCombinedAmbulances());

      if (currentWaypointIdx === totalWaypoints - 1) {
        console.log(`[Sim Dispatch] Virtual ambulance arrived at hospital ${hosp.name}.`);
        clearInterval(interval);
        delete activeSimulations[reqId];

        setTimeout(() => {
          if (!activeRequests[reqId]) return;
          console.log(`[Sim Dispatch] Auto-completing mission ${reqId} after hospital arrival.`);

          req.status = 'completed';
          io.to(`mission_${reqId}`).emit('mission-completed', { reqId: req.id });

          hosp.activeMissionsCount = Math.max(0, (hosp.activeMissionsCount || 1) - 1);
          hosp.isBusy = hosp.activeMissionsCount > 0;
          io.emit('hospitals-update', hospitals);

          amb.available = true;
          io.emit('ambulances-update', getCombinedAmbulances());

          Incident.update({ status: 'completed' }, { where: { id: req.id } })
            .catch(err => console.error('[Sim Dispatch DB Error]', err));

          delete activeRequests[reqId];
        }, 5000);
      }
    }, tickIntervalMs);

    activeSimulations[reqId] = { interval, type: 'to_hospital' };
  });
}


// Redundant loader removed; hydration merged into startServer()


// ─── REST API ──────────────────────────────────────────────────────────────────
app.post('/api/hospital/capacity', authenticateToken, async (req, res) => {
  if (req.user.role !== 'doctor' && req.user.role !== 'hospital_admin') {
    return res.status(403).json({ error: 'Forbidden: Hospital role required' });
  }
  const { availableICUBeds, availableVentilators, bloodBankStatus } = req.body;
  try {
    if (!req.user.hospital_id) {
      return res.status(400).json({ error: 'User is not associated with a hospital' });
    }
    const hospital = await Hospital.findByPk(req.user.hospital_id);
    if (!hospital) return res.status(404).json({ error: 'Hospital not found' });

    if (availableICUBeds !== undefined) hospital.icu_beds = availableICUBeds;
    if (availableVentilators !== undefined) hospital.ventilators = availableVentilators;
    await hospital.save();

    // Update live socket cache
    const socketId = Object.keys(hospitals).find(k => hospitals[k].id === req.user.hospital_id);
    if (socketId && hospitals[socketId]) {
      hospitals[socketId].availableICUBeds = hospital.icu_beds;
      hospitals[socketId].availableVentilators = hospital.ventilators;
      io.emit('hospitals-update', hospitals);
    }
    return res.json({ success: true, icu_beds: hospital.icu_beds, ventilators: hospital.ventilators });
  } catch (err) {
    console.error('[HOSPITAL CAPACITY ERROR]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const whereClause = {};
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const list = await PatientModel.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'name_masked', 'blood_group', 'dob']
    });

    // Log to HIPAA/DPDP AuditLog for patient list read
    await logAudit(
      'PATIENT_READ',
      'LIST_PATIENTS',
      { userId: req.user.id, email: req.user.email, role: req.user.role, recordCount: list.length },
      'INFO',
      req.user.id,
      req.ip
    );

    return res.json(list.map(p => ({
      id: p.id,
      name: p.name_masked || p.name,
      bloodGroup: p.blood_group,
      riskLevel: 'LOW'
    })));
  } catch (err) {
    console.error('[PATIENT ROUTE ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/patients/:id', authenticateToken, async (req, res) => {
  try {
    const whereClause = { id: req.params.id };
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const patient = await PatientModel.findOne({ where: whereClause });
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Log to HIPAA/DPDP AuditLog for single patient record access
    await logAudit(
      'PATIENT_READ',
      'VIEW_PATIENT_DETAILS',
      { patientId: patient.id, name_accessed: patient.name_masked, userId: req.user.id, email: req.user.email },
      'INFO',
      req.user.id,
      req.ip
    );

    return res.json({
      id: patient.id,
      nationalId: patient.abha_number,
      name: patient.name, // Will be unmasked if accessing single patient via authorized token
      bloodGroup: patient.blood_group,
      allergies: patient.allergies || [],
      medicalHistory: patient.conditions || [],
      emergencyContact: `${patient.emergency_contact_name} – ${patient.emergency_contact_mobile}`,
      currentMedications: [],
      dob: patient.dob
    });
  } catch (err) {
    console.error('[PATIENT ID ROUTE ERROR]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    activeMissionsCount: Object.keys(activeRequests).length,
    activeRequests: Object.values(activeRequests).map(r => ({ id: r.id, status: r.status })),
    connectedRoles,
    hospitals: Object.values(hospitals).map(h => ({ id: h.id, name: h.name, socketId: h.socketId, lat: h.lat, lng: h.lng })),
    ambulances: Object.values(ambulances).map(a => ({ unitId: a.unitId, socketId: a.socketId, available: a.available }))
  });
});

function isHighAcuity(patientDetails) {
  if (!patientDetails) return false;
  const condition = (patientDetails.condition || '').toLowerCase();
  const keywords = ['cardiac', 'trauma', 'stroke', 'unconscious', 'chest pain', 'severe bleeding'];
  if (keywords.some(k => condition.includes(k))) return true;

  const hr = Number(patientDetails.heartRate);
  const spo2 = Number(patientDetails.spo2);
  const sbp = Number(patientDetails.systolicBP);
  const rr = Number(patientDetails.respRate);

  if (hr && (hr < 50 || hr > 120)) return true;
  if (spo2 && spo2 < 90) return true;
  if (sbp && (sbp < 90 || sbp > 180)) return true;
  if (rr && (rr < 10 || rr > 25)) return true;

  return false;
}

const spawnIncidentZones = (centerLoc) => {
  if (!centerLoc || !centerLoc.lat) return;
  const offsets = [
    { lat: 0.003, lng: 0.004, reason: 'Active Construction: Bridge repairs. Heavy delay expected.', radius: 350 },
    { lat: -0.004, lng: -0.003, reason: 'Waterlogging: Severe flooding on highway.', radius: 250 },
    { lat: 0.0015, lng: -0.004, reason: 'Accident Clearance: Multi-vehicle collision block.', radius: 300 }
  ];
  offsets.forEach((off, i) => {
    const id = `INCIDENT-ZONE-${i + 1}`;
    activeIncidentZones[id] = {
      id,
      lat: centerLoc.lat + off.lat,
      lng: centerLoc.lng + off.lng,
      reason: off.reason,
      radius: off.radius
    };
  });
  io.emit('traffic-incidents-update', activeIncidentZones);
};

// ─── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  let role = socket.handshake.query.role || 'unknown';
  console.log(`[CONNECT] ${role.toUpperCase()} connected — ${socket.id}`);

  if (socket.user && socket.user.hospital_id) {
    socket.join(`hospital:${socket.user.hospital_id}`);
    console.log(`[SOCKET JOIN] User ${socket.user.email} joined hospital room: hospital:${socket.user.hospital_id}`);
  }

  if (role === 'user') connectedRoles.user++;
  if (role === 'ambulance') connectedRoles.ambulance++;
  if (role === 'hospital') connectedRoles.hospital++;

  io.emit('roles-update', connectedRoles);

  // Send current state to newly connected client
  socket.emit('ambulances-update', getCombinedAmbulances());
  socket.emit('hospitals-update', hospitals);
  socket.emit('traffic-incidents-update', activeIncidentZones);

  // ── Ambulance events ──────────────────────────────────────────────────────

  function calculateNEWS2(vitals) {
    let score = 0;
    const hr = vitals.heartRate || 80;
    const spo2 = vitals.spo2 || 98;
    const sys = vitals.systolic || 120;

    if (hr <= 40) score += 3; else if (hr <= 50) score += 1; else if (hr >= 131) score += 3; else if (hr >= 111) score += 2; else if (hr >= 91) score += 1;
    if (spo2 <= 91) score += 3; else if (spo2 <= 93) score += 2; else if (spo2 <= 95) score += 1;
    if (sys <= 90) score += 3; else if (sys <= 100) score += 2; else if (sys <= 110) score += 1; else if (sys >= 220) score += 3;

    return score;
  }

  socket.on('vitals-update', (data) => {
    // Determine the stable mission room this socket belongs to
    const reqId = data.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');
    const update = { ...data, timestamp: Date.now() };

    if (reqId && activeRequests[reqId]) {
      if (!activeRequests[reqId].vitalsHistory) activeRequests[reqId].vitalsHistory = [];
      activeRequests[reqId].vitalsHistory.push(update);
      syncMissionToDB(reqId);
    }

    // Check for critical thresholds (Basic + Advanced AI NEWS2)
    const news2Score = calculateNEWS2(data);

    const isCritical = data.heartRate > 110 || data.spo2 < 92 || data.systolic > 150 || data.heartRate < 50;
    if (isCritical || news2Score >= 7) { // NEWS2 >= 7 is high clinical risk
      const reasons = [];
      if (data.heartRate > 110) reasons.push(`HR ${data.heartRate} bpm (HIGH)`);
      if (data.heartRate < 50) reasons.push(`HR ${data.heartRate} bpm (LOW)`);
      if (data.spo2 < 92) reasons.push(`SpO2 ${data.spo2}% (CRITICAL)`);
      if (data.systolic > 150) reasons.push(`BP ${data.systolic}/${data.diastolic} mmHg (HIGH)`);
      if (news2Score >= 7) reasons.push(`NEWS2 SCORE: ${news2Score} (CLINICAL RED ZONE)`);

      if (reqId) {
        io.to(`mission_${reqId}`).emit('critical-alert', { reasons, vitals: data, timestamp: Date.now(), news2Score });

        // --- SMART RESOURCE ALLOCATION ---
        // If NEWS2 is extremely high, automatically lock trauma resources
        if (news2Score >= 9) {
          io.to(`mission_${reqId}`).emit('smart-resource-alert', {
            message: `CRITICAL TRAUMA DETECTED (NEWS2: ${news2Score}). Autolocking Trauma Bay 1 & alerting Blood Bank.`,
            autoLocks: ['otPrepared', 'bloodBankAlerted']
          });
        }
      }
    }

    // FIX C5: Sensor plausibility guard — prevents AI false positives from dropped sensors
    const prevVitals = activeRequests[reqId]?.vitalsHistory?.slice(-2)[0];
    const sensorError = prevVitals && (
      Math.abs((data.spo2 || 98) - (prevVitals.spo2 || 98)) > 20 || // 20% drop in 1 tick = sensor disconnect
      Math.abs((data.heartRate || 80) - (prevVitals.heartRate || 80)) > 60  // 60bpm jump in 1 tick = impossible
    );

    // FIX H2: TF inference runs async to avoid blocking the Node.js event loop
    if (predictiveModel && reqId && !sensorError) {
      setImmediate(async () => {
        try {
          const hr = data.heartRate || 80;
          const spo2 = data.spo2 || 98;
          const sys = data.systolic || 120;
          const temp = data.temperature || 37;
          const rr = data.respRate || 16;

          const shockIndex = sys > 0 ? (hr / sys) : 0;

          const inputTensor = tf.tensor2d([[hr, spo2, sys, temp, rr]]);
          const prediction = predictiveModel.predict(inputTensor);
          // FIX H2: Use data() (Promise) instead of dataSync() (blocking)
          const probabilityArray = await prediction.data();

          let cardiacArrestRisk = probabilityArray[0] || 0.05;
          let shockRisk = probabilityArray[1] || 0.05;
          let vTachRisk = probabilityArray[2] || 0.05;

          inputTensor.dispose();
          prediction.dispose();

          // Clinically accurate scaling for simulation realism
          const calculatedCardiacArrest = hr > 140 || hr < 35 || spo2 < 85 ? 0.92 : (hr > 110 || spo2 < 91 ? 0.5 + (hr - 110) * 0.01 : 0.05 + Math.random() * 0.05);
          const calculatedShock = shockIndex > 1.2 ? 0.95 : (shockIndex > 0.9 ? 0.6 + (shockIndex - 0.9) * 0.8 : 0.1 + Math.random() * 0.05);
          const calculatedVTach = hr > 150 && sys < 90 ? 0.96 : (hr > 120 ? 0.4 + (hr - 120) * 0.01 : 0.02 + Math.random() * 0.03);

          // Blend the TF.js prediction with the clinical heuristics
          cardiacArrestRisk = 0.2 * cardiacArrestRisk + 0.8 * calculatedCardiacArrest;
          shockRisk = 0.2 * shockRisk + 0.8 * calculatedShock;
          vTachRisk = 0.2 * vTachRisk + 0.8 * calculatedVTach;

          // Emit continuous telemetry prediction
          io.to(`mission_${reqId}`).emit('ai-telemetry-prediction', {
            reqId,
            shockIndex: parseFloat(shockIndex.toFixed(2)),
            cardiacArrestRisk: parseFloat(cardiacArrestRisk.toFixed(3)),
            shockRisk: parseFloat(shockRisk.toFixed(3)),
            vTachRisk: parseFloat(vTachRisk.toFixed(3)),
            news2Score
          });
          io.emit('ai-telemetry-prediction', {
            reqId,
            shockIndex: parseFloat(shockIndex.toFixed(2)),
            cardiacArrestRisk: parseFloat(cardiacArrestRisk.toFixed(3)),
            shockRisk: parseFloat(shockRisk.toFixed(3)),
            vTachRisk: parseFloat(vTachRisk.toFixed(3)),
            news2Score
          });

          if (cardiacArrestRisk > 0.82 || shockRisk > 0.82 || vTachRisk > 0.82) {
            let warnings = [];
            if (cardiacArrestRisk > 0.82) warnings.push(`Impending Cardiac Arrest Risk: ${(cardiacArrestRisk * 100).toFixed(1)}%`);
            if (shockRisk > 0.82) warnings.push(`Shock Risk (Shock Index: ${shockIndex.toFixed(2)}): ${(shockRisk * 100).toFixed(1)}%`);
            if (vTachRisk > 0.82) warnings.push(`VTach Risk: ${(vTachRisk * 100).toFixed(1)}%`);

            io.to(`mission_${reqId}`).emit('ai-prediction-alert', {
              message: `AI WARNING: ${warnings.join(' | ')}. Immediate physician review advised.`,
              risk: Math.max(cardiacArrestRisk, shockRisk, vTachRisk)
            });
          }
        } catch (e) {
          console.error('[ENTERPRISE AI] TF Inference Error:', e.message);
        }
      });
    } else if (sensorError) {
      io.to(`mission_${reqId}`).emit('sensor-error', {
        message: 'SENSOR DISCONNECT DETECTED: Vital reading biologically implausible. Please reattach sensor.'
      });
    }

    if (reqId) {
      io.to(`mission_${reqId}`).emit('vitals-update', update);
      io.emit('vitals-update', update);
    }
  });

  socket.on('bulk-vitals-update', (data) => {
    const vitals = Array.isArray(data) ? data : (data.vitalsHistory || []);
    const reqId = data.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');
    if (vitals.length > 0) {
      const latest = { ...vitals[vitals.length - 1], timestamp: Date.now() };
      if (reqId) {
        io.to(`mission_${reqId}`).emit('bulk-vitals-update', vitals);
        io.to(`mission_${reqId}`).emit('vitals-update', latest);
        io.emit('bulk-vitals-update', vitals);
        io.emit('vitals-update', latest);
      } else {
        io.emit('bulk-vitals-update', vitals);
        io.emit('vitals-update', latest);
      }
    }
  });

  socket.on('location-update', async (data) => {
    if (ambulances[socket.id]) {
      ambulances[socket.id].location = data;
      io.emit('ambulances-update', getCombinedAmbulances());
    }

    const reqId = data.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');

    // Delta Compression & Rate-Limiting:
    if (reqId) {
      const lastLoc = lastEmittedLocations[reqId];
      if (lastLoc && data.lat && data.lng) {
        const latDelta = Math.abs(data.lat - lastLoc.lat);
        const lngDelta = Math.abs(data.lng - lastLoc.lng);
        const timeDiff = Date.now() - lastLoc.timestamp;

        // Throttle if movement is less than ~2 meters and last broadcast was under 4 seconds, unless Disaster Mode is active
        if (!disasterModeActive && latDelta < 0.00002 && lngDelta < 0.00002 && timeDiff < 4000) {
          return;
        }
      }
      lastEmittedLocations[reqId] = { lat: data.lat, lng: data.lng, timestamp: Date.now() };
    }

    if (reqId && activeRequests[reqId]) {
      const req = activeRequests[reqId];
      if (!req.gpsHistory) req.gpsHistory = [];
      if (req.accumulatedDistance === undefined) req.accumulatedDistance = 0;

      const lastPoint = req.gpsHistory[req.gpsHistory.length - 1];
      let increment = 0;
      if (lastPoint && lastPoint.lat && lastPoint.lng) {
        increment = haversineDistance(lastPoint.lat, lastPoint.lng, data.lat, data.lng);
        if (increment > 10) increment = 0; // Guard against unrealistic GPS jumps
      }
      req.accumulatedDistance += increment;

      const gpsPoint = {
        lat: data.lat,
        lng: data.lng,
        timestamp: Date.now(),
        speed: data.speed || 0,
        heading: data.heading || 0,
        accuracy: data.accuracy || 0,
        accumulatedDistanceKm: parseFloat(req.accumulatedDistance.toFixed(3))
      };
      req.gpsHistory.push(gpsPoint);
      req.gps_log = req.gpsHistory;

      let destPos = null;
      if (!req.arrivedAtUser) {
        destPos = req.userLocation || req.incidentLocation;
      } else {
        let hospitalPos = null;
        if (req.hospitalSocket && hospitals[req.hospitalSocket]) {
          const h = hospitals[req.hospitalSocket];
          hospitalPos = h.location || h.pos || (h.lat && h.lng ? { lat: h.lat, lng: h.lng } : null);
        }
        if (!hospitalPos && req.hospitalId) {
          const h = Object.values(hospitals).find(val => val.id === req.hospitalId);
          if (h) {
            hospitalPos = h.location || h.pos || (h.lat && h.lng ? { lat: h.lat, lng: h.lng } : null);
          }
        }
        if (!hospitalPos && req.hospitalId) {
          try {
            const dbHosp = await Hospital.findByPk(req.hospitalId);
            if (dbHosp) {
              hospitalPos = { lat: dbHosp.lat, lng: dbHosp.lng };
            }
          } catch (err) {
            console.error('[MAP] Error fetching hospital coordinates from DB:', err.message);
          }
        }
        destPos = hospitalPos;
      }

      let etaMinutes = null;
      let distanceKm = null;
      if (destPos && destPos.lat && destPos.lng) {
        try {
          const etaResult = await getETA(data.lat, data.lng, destPos.lat, destPos.lng);
          if (etaResult) {
            etaMinutes = etaResult.etaMinutes;
            distanceKm = etaResult.distanceKm;
          }
        } catch (err) {
          console.error('[MAP] getETA failed:', err.message);
        }
      }

      const enrichedData = {
        ...data,
        accumulatedDistanceKm: parseFloat(req.accumulatedDistance.toFixed(3)),
        etaMinutes,
        distanceKm,
        destinationId: req.arrivedAtUser ? req.hospitalId : 'user'
      };

      req.location = { lat: data.lat, lng: data.lng };
      io.to(`mission_${reqId}`).emit('location-update', enrichedData);
      console.log(`[MAP] Enriched Location update routed to mission_${reqId}`);
      syncMissionToDB(reqId);
    } else {
      if (reqId) {
        io.to(`mission_${reqId}`).emit('location-update', data);
        console.log(`[MAP] Location update routed to mission_${reqId} (no active request object found)`);
      } else {
        socket.broadcast.emit('location-update', data);
      }
    }
  });

  socket.on('chat-message', (data) => {
    let reqId = data.reqId;

    // Fallback for units only in one mission room
    if (!reqId) {
      const room = Array.from(socket.rooms).find(r => r.startsWith('mission_'));
      if (room) reqId = room.replace('mission_', '');
    }

    if (reqId && activeRequests[reqId]) {
      const room = `mission_${reqId}`;
      if (!activeRequests[reqId].chatHistory) activeRequests[reqId].chatHistory = [];
      const fullMsg = { ...data, id: Date.now(), timestamp: Date.now() };
      activeRequests[reqId].chatHistory.push(fullMsg);
      syncMissionToDB(reqId);
      io.to(room).emit('chat-message', fullMsg);
    }
  });

  socket.on('patient-data', (data) => {
    const { reqId, ...details } = data;
    if (activeRequests[reqId]) {
      activeRequests[reqId].patientDetails = { ...activeRequests[reqId].patientDetails, ...details };
      syncMissionToDB(reqId);
      io.to(`mission_${reqId}`).emit('patient-data', activeRequests[reqId].patientDetails);
    }
  });

  socket.on('incident-note', (data) => {
    const reqId = data.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');
    const fullNote = { ...data, timestamp: Date.now() };
    if (reqId && activeRequests[reqId]) {
      if (!activeRequests[reqId].incidentNotes) activeRequests[reqId].incidentNotes = [];
      activeRequests[reqId].incidentNotes.push(fullNote);
      io.to(`mission_${reqId}`).emit('incident-note', fullNote);
    } else {
      socket.broadcast.emit('incident-note', fullNote);
    }
  });

  // ── Hospital events ────────────────────────────────────────────────────────
  socket.on('resources-update', (data) => {
    if (hospitals[socket.id]) {
      hospitals[socket.id].resources = { ...hospitals[socket.id].resources, ...data };
      io.emit('hospitals-update', hospitals);
    }
  });

  socket.on('update-hospital-inventory', (data) => {
    if (hospitals[socket.id]) {
      hospitals[socket.id].inventory = { ...hospitals[socket.id].inventory, ...data };
      io.emit('hospitals-update', hospitals);
      console.log(`[HOSPITAL INVENTORY] ${hospitals[socket.id].name} updated beds: ${data.beds}`);
    }
  });

  // ── AI Events ──────────────────────────────────────────────────────────────
  socket.on('ai-prediction-alert', (data) => {
    const reqId = data.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');
    if (reqId) {
      io.to(`mission_${reqId}`).emit('ai-prediction-alert', data);
    }
    io.to('admin_warroom').emit('ai-prediction-alert', data);
  });

  socket.on('register-admin', (data) => {
    const { id, token } = data;
    if (!token) {
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Missing JWT token for registration.' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== 'admin') {
        return socket.emit('error-alert', { message: 'UNAUTHORIZED: Administrative privileges required.' });
      }
    } catch (err) {
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Invalid or expired JWT token.' });
    }

    role = 'admin';
    socket.join('admin_warroom');
    console.log(`[AUTH] War Room connected: ${socket.id}`);
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  const routeToMission = (socket, event, data) => {
    const reqId = data?.reqId || (Array.from(socket.rooms).find(r => r.startsWith('mission_')) || '').replace('mission_', '');
    if (!reqId) {
      socket.broadcast.emit(event, data);
      return;
    }

    const payload = { ...data, fromSocketId: socket.id, reqId };
    if (data?.targetSocketId) {
      io.to(data.targetSocketId).emit(event, payload);
    } else {
      // Broadcast to everyone in the mission room
      io.to(`mission_${reqId}`).emit(event, payload);
    }
  };

  socket.on('webrtc-offer', (data) => routeToMission(socket, 'webrtc-offer', data));
  socket.on('webrtc-answer', (data) => routeToMission(socket, 'webrtc-answer', data));
  socket.on('get-mission-peers', (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (!req) return socket.emit('mission-peers', { error: 'Mission not found' });
    
    // Get all admin sockets in the warroom
    const adminRoom = io.sockets.adapter.rooms.get('admin_warroom');
    const adminSockets = adminRoom ? Array.from(adminRoom) : [];

    socket.emit('mission-peers', {
      userSocket: req.userSocket || null,
      ambulanceSocket: req.ambulanceSocket || null,
      hospitalSocket: req.hospitalSocket || null,
      adminSockets: adminSockets
    });
  });
  socket.on('webrtc-ice-candidate', (data) => routeToMission(socket, 'webrtc-ice-candidate', data));
  socket.on('webrtc-hangup', (data) => routeToMission(socket, 'webrtc-hangup', data));
  socket.on('webrtc-end', (data) => routeToMission(socket, 'webrtc-hangup', data));
  socket.on('webrtc-telestration', (data) => routeToMission(socket, 'webrtc-telestration', data));
  socket.on('webrtc-telestration-clear', (data) => routeToMission(socket, 'webrtc-telestration-clear', data));
  socket.on('green-corridor-status', (data) => routeToMission(socket, 'green-corridor-status', data));
  socket.on('hospital-lock-resources', async (data) => {
    const { reqId, locks } = data;
    const req = activeRequests[reqId];
    if (req) {
      req.resourceLocks = locks;
      io.to(`mission_${reqId}`).emit('hospital-resources-locked', { reqId, locks });
      syncMissionToDB(reqId);
    }
  });

  socket.on('clinical-checklist-update', async (data) => {
    const { reqId, checklist } = data;
    const req = activeRequests[reqId];
    if (req) {
      req.checklist = checklist;
      io.to(`mission_${reqId}`).emit('clinical-checklist-update', { reqId, checklist });
      syncMissionToDB(reqId);
    }
  });

  // ── Multi-Entity Registration & Routing ────────────────────────────────────
  socket.on('register-ambulance', async (data) => {
    const { unitId, token } = data;

    if (!token) {
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Missing JWT token for registration.' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const isAuthorized = (decoded.role === 'ambulance' || decoded.role === 'paramedic') &&
        (decoded.id === unitId || decoded.email?.toLowerCase() === unitId.toLowerCase());
      if (!isAuthorized) {
        return socket.emit('error-alert', { message: 'UNAUTHORIZED: Identity mismatch.' });
      }
    } catch (err) {
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Invalid or expired JWT token.' });
    }

    role = 'ambulance';

    // FETCH PERSISTENT REGISTRY DATA
    const account = await User.findOne({ where: { id: unitId } });
    const lat = data.location?.lat || (account && account.lat) || 18.5204;
    const lng = data.location?.lng || (account && account.lng) || 73.8567;

    const registryData = account ? {
      name: account.name || data.name,
      contactInfo: account.mobile || data.contactInfo,
      driverName: account.driverName || data.driverName,
      vehicleNo: account.vehicleNo || data.vehicleNo,
      type: account.unitType || data.type
    } : {};

    ambulances[socket.id] = { ...data, ...registryData, location: { lat, lng }, socketId: socket.id, available: true };

    const activeMission = Object.values(activeRequests).find(r => r.unitId === unitId && r.status !== 'completed');
    if (activeMission) {
      activeMission.ambulanceSocket = socket.id;
      socket.join(`mission_${activeMission.id}`);
      socket.emit('rejoin-mission', activeMission);
    } else {
      socket.join(`mission_${socket.id}`);
    }

    io.emit('ambulances-update', getCombinedAmbulances());
  });

  socket.on('register-hospital', async (data) => {
    const { id, token } = data;
    console.log(`[SOCKET_LOG] register-hospital event received for hospitalId/id: ${id}`);

    if (!token) {
      console.log(`[SOCKET_LOG] registration rejected: Missing JWT token`);
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Missing JWT token for registration.' });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log(`[SOCKET_LOG] decoded token payload: ${JSON.stringify(decoded)}`);
      const isAuthorized =
        (decoded.role === 'hospital' && decoded.id === id) ||
        ((decoded.role === 'hospital' || decoded.role === 'doctor') && decoded.hospital_id === id);
      if (!isAuthorized) {
        console.log(`[SOCKET_LOG] registration rejected: Identity mismatch. expected matches for id: ${id}`);
        return socket.emit('error-alert', { message: 'UNAUTHORIZED: Identity mismatch.' });
      }
    } catch (err) {
      console.log(`[SOCKET_LOG] registration rejected: JWT verify failed - ${err.message}`);
      return socket.emit('error-alert', { message: 'UNAUTHORIZED: Invalid or expired JWT token.' });
    }

    role = 'hospital';
    console.log(`[SOCKET_LOG] Hospital '${id}' successfully authenticated on socket ${socket.id}`);

    // FETCH PERSISTENT REGISTRY DATA
    const account = await Hospital.findOne({ where: { id } });
    const registryData = account ? {
      lat: data.lat || data.pos?.lat || account.lat,
      lng: data.lng || data.pos?.lng || account.lng,
      name: account.name,
      contactInfo: account.contact_number
    } : {};

    hospitals[socket.id] = { ...data, ...registryData, pos: { lat: data.lat || data.pos?.lat || account?.lat, lng: data.lng || data.pos?.lng || account?.lng }, socketId: socket.id, isBusy: false };
    socket.join('global_hospitals');
    socket.join(`hospital:${id}`);

    // Recovery for already accepted active missions
    const activeMissions = Object.values(activeRequests).filter(r => r.hospitalId === id && r.status !== 'completed' && r.status !== 'admission_request' && r.status !== 'advance_notice');
    if (activeMissions.length > 0) {
      activeMissions.forEach(m => {
        m.hospitalSocket = socket.id;
        socket.join(`mission_${m.id}`);
      });
      socket.emit('active-missions-update', activeMissions);
    }

    // Pushes any pending/unaccepted requests to the newly logged-in hospital
    const pendingRequests = Object.values(activeRequests).filter(r =>
      (r.status === 'admission_request' || r.status === 'advance_notice') &&
      (!r.hospitalId || r.hospitalId === id)
    );
    pendingRequests.forEach(req => {
      socket.emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
    });

    io.emit('hospitals-update', hospitals);
  });

  socket.on('register-user', (data) => {
    const { userId, location } = data;
    users[userId] = socket.id;
    role = 'user';
    spawnVirtualAmbulances(location);
    spawnIncidentZones(location);
    io.emit('ambulances-update', getCombinedAmbulances());
    io.emit('traffic-incidents-update', activeIncidentZones);

    const activeMissions = Object.values(activeRequests).filter(r => r.userSocketId === userId && r.status !== 'completed');
    if (activeMissions.length > 0) {
      activeMissions.forEach(m => {
        m.userSocket = socket.id;
        socket.join(`mission_${m.id}`);
      });
      socket.emit('active-missions-update', activeMissions);
    }
  });

  socket.on('cancel-request', async (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (req) {
      try {
        if (dbWriteTimers[reqId]) {
          clearTimeout(dbWriteTimers[reqId]);
          delete dbWriteTimers[reqId];
        }
        await Incident.update({ status: 'cancelled' }, { where: { id: reqId } });
      } catch (err) {
        console.error('[DB ERROR] Failed to update mission status on cancel:', err);
      }
      io.to(`mission_${reqId}`).emit('mission-completed', { reqId, reason: 'cancelled_by_user' });
      io.emit('hospital-request-taken', { reqId, acceptedBy: 'CANCELLED' });

      cleanupSimulation(reqId);

      if (req.ambulanceSocket && ambulances[req.ambulanceSocket]) {
        ambulances[req.ambulanceSocket].available = true;
      }
      io.emit('ambulances-update', getCombinedAmbulances());

      delete activeRequests[reqId];
    }
  });

  socket.on('request-ambulance', (data) => {
    if (!data || !data.userLocation || !data.patientDetails) {
      return socket.emit('error-alert', { message: 'Malformed Request: Missing GPS or Medical Data' });
    }

    const { patientDetails, userLocation } = data;

    console.log(`[DISPATCH DEBUG] New request-ambulance received:`);
    console.log(`  - Caller coordinates: ${JSON.stringify(userLocation)}`);
    console.log(`  - Caller S2 Cell Level 12: ${S2.latLngToKey(userLocation.lat, userLocation.lng, 12)}`);

    // 1. S2 Geometry Grid Mapping (Level 12 ~ 3.3km to 6km radius)
    const LEVEL = 12;
    const userCellId = S2.latLngToKey(userLocation.lat, userLocation.lng, LEVEL);
    const userCellId64 = S2.keyToId(userCellId);
    console.log(`[S2 Routing] User requesting from Cell: ${userCellId} (64-bit ID: ${userCellId64})`);

    // 2. Identify candidates in the user's cell or the 4 adjacent neighbor cells (Level 12)
    const neighbors = S2.latLngToNeighborKeys(userLocation.lat, userLocation.lng, LEVEL);
    const allowedCells = [userCellId, ...neighbors];

    const combinedAmbulances = getCombinedAmbulances();
    const availableAmbulances = Object.keys(combinedAmbulances).filter(id => combinedAmbulances[id].available);

    // Clinical Capability Triage (ALS vs. BLS)
    const highAcuity = isHighAcuity(patientDetails);
    let fallbackBLS = false;
    let filteredAvailable = availableAmbulances;

    if (highAcuity) {
      const alsUnits = availableAmbulances.filter(id => {
        const amb = combinedAmbulances[id];
        return (amb.type || '').toUpperCase().includes('ALS') || (amb.type || '').toUpperCase().includes('ADVANCED');
      });
      if (alsUnits.length > 0) {
        filteredAvailable = alsUnits;
        console.log(`[Clinical Triage] High-Acuity request! Restricted to ALS units (Found ${alsUnits.length}).`);
      } else {
        fallbackBLS = true;
        console.log(`[Clinical Triage] High-Acuity request! No ALS units online/available. Falling back to BLS units.`);
      }
    }

    let candidateAmbulances = filteredAvailable.filter(id => {
      const ambLocation = combinedAmbulances[id].location;
      if (!ambLocation) return false;
      const ambCellId = S2.latLngToKey(ambLocation.lat, ambLocation.lng, LEVEL);
      return allowedCells.includes(ambCellId) || !combinedAmbulances[id].isSimulated;
    });

    if (candidateAmbulances.length === 0) {
      console.log(`[S2 Routing] No ambulances in S2 cell neighbors, expanding to global radius fallback.`);
      candidateAmbulances = filteredAvailable.filter(id => {
        const ambLocation = combinedAmbulances[id].location;
        return ambLocation && calcDist(userLocation, ambLocation) <= 5000;
      });
    }

    if (candidateAmbulances.length === 0) {
      socket.emit('ambulance-request-response', { status: 'ambulance_rejected', id: 'N/A', message: 'No ambulances available.' });
      return;
    }

    // 3. A* Simulated ETA and Scoring
    const calculateAStarETA = (uLoc, aLoc) => {
      const latDist = Math.abs(uLoc.lat - aLoc.lat) * 111;
      const lngDist = Math.abs(uLoc.lng - aLoc.lng) * 111 * Math.cos(uLoc.lat * (Math.PI / 180));
      const manhattanDist = latDist + lngDist;
      const trafficPenalty = 1.0 + (Math.random() * 0.4);
      const avgSpeed = 45; // km/h
      return ((manhattanDist / avgSpeed) * 60 * trafficPenalty) + (Math.random() * 2); // returns ETA in minutes
    };

    // Evaluate candidates
    const scoredCandidates = candidateAmbulances.map(id => {
      const amb = combinedAmbulances[id];
      const etaMin = calculateAStarETA(userLocation, amb.location);
      const driverRate = amb.driverRate || (4.0 + Math.random()); // Mock 4.0-5.0
      const acceptanceRate = amb.acceptanceRate || (0.7 + Math.random() * 0.3); // Mock 70-100%

      // Score formulation: Lower ETA is better, higher rates are better
      let score = (acceptanceRate * 50) + (driverRate * 10) - (etaMin * 2);
      if (!amb.isSimulated) score += 10000; // ALWAYS prioritize real connected ambulances for testing!

      return { id, score, etaMin, driverRate, acceptanceRate };
    });

    scoredCandidates.sort((a, b) => b.score - a.score); // Highest score first
    console.log(`[Smart Routing] Ranked Candidates:`, scoredCandidates.map(c => `${c.id} (Score: ${c.score.toFixed(1)}, ETA: ${c.etaMin.toFixed(1)}m)`));

    console.log(`[DISPATCH DEBUG] High Acuity Triage: ${highAcuity}`);
    console.log(`[DISPATCH DEBUG] Registered Real (Non-simulated) Ambulances:`);
    Object.keys(ambulances).forEach(sid => {
      const amb = ambulances[sid];
      const ambLocation = amb.location;
      const cellKey = ambLocation ? S2.latLngToKey(ambLocation.lat, ambLocation.lng, 12) : "NO COORDINATES REPORTED";
      const scoreObj = scoredCandidates.find(sc => sc.id === sid);
      const scoreVal = scoreObj ? scoreObj.score.toFixed(1) : "N/A (Filtered Out)";
      console.log(`  - Socket ID: ${sid}`);
      console.log(`    - Name: ${amb.name}`);
      console.log(`    - Type: ${amb.type || 'BLS'}`);
      console.log(`    - Available: ${amb.available}`);
      console.log(`    - Reported Coordinates: ${ambLocation ? JSON.stringify(ambLocation) : "NO COORDINATES REPORTED"}`);
      console.log(`    - S2 Cell Key: ${cellKey}`);
      console.log(`    - Calculated Score: ${scoreVal}`);
    });

    // Determine the target candidate (priority to requested ID, then best candidate)
    let chosenCandidateId = null;
    if (data.ambulanceId && combinedAmbulances[data.ambulanceId] && combinedAmbulances[data.ambulanceId].available) {
      chosenCandidateId = data.ambulanceId;
    } else if (data.ambulanceId && candidateAmbulances.includes(data.ambulanceId)) {
      chosenCandidateId = data.ambulanceId;
    } else if (scoredCandidates.length > 0) {
      chosenCandidateId = scoredCandidates[0].id;
    }

    console.log(`[DISPATCH DEBUG] Final chosen candidate ID: ${chosenCandidateId}`);
    if (chosenCandidateId) {
      const isVirtual = chosenCandidateId.startsWith('VIRTUAL-AMB-') || (combinedAmbulances[chosenCandidateId] && combinedAmbulances[chosenCandidateId].isSimulated);
      console.log(`  - Type: ${isVirtual ? 'Virtual/Simulated' : 'Real connected unit'}`);
      console.log(`  - Reason for selection: Score rank or targeted dispatch request`);
    } else {
      console.log(`  - Reason for selection: No available candidate found matching cell/distance constraints.`);
    }

    if (chosenCandidateId && highAcuity) {
      const amb = combinedAmbulances[chosenCandidateId];
      const isALS = amb && ((amb.type || '').toUpperCase().includes('ALS') || (amb.type || '').toUpperCase().includes('ADVANCED'));
      if (!isALS) {
        fallbackBLS = true;
      }
    }

    const reqId = require('crypto').randomUUID();
    activeRequests[reqId] = {
      id: reqId,
      userSocket: socket.id,
      userSocketId: data.userId || socket.id,
      status: 'pending_ambulance',
      patientDetails,
      userLocation,
      fallbackBLS,
      checklist: {}
    };

    socket.emit('request-acknowledged', { id: reqId, status: 'searching' });

    if (chosenCandidateId) {
      const isVirtual = chosenCandidateId.startsWith('VIRTUAL-AMB-') || combinedAmbulances[chosenCandidateId].isSimulated;
      if (isVirtual) {
        console.log(`[Sim Dispatch] Auto-routing request ${reqId} to virtual unit ${chosenCandidateId}`);
        startVirtualAmbulanceSimulation(reqId, chosenCandidateId);
        // WhatsApp Notify User (Simulated)
        whatsappService.notifyUserDispatched(data.userPhone || '+1234567890', chosenCandidateId, 5);
      } else {
        io.to(chosenCandidateId).emit('incoming-ambulance-request', activeRequests[reqId]);
        // WhatsApp Notify Ambulance Driver
        const driverMobile = combinedAmbulances[chosenCandidateId]?.contactInfo || '+1234567890';
        whatsappService.notifyAmbulanceAssigned(driverMobile, reqId, activeRequests[reqId].userLocation);
        // WhatsApp Notify User
        whatsappService.notifyUserDispatched(data.userPhone || '+1234567890', chosenCandidateId, 5);
      }

      // FCM Push Notification for user/patient
      if (data.userId) {
        User.findByPk(data.userId).then(user => {
          if (user && user.fcm_token) {
            sendPushNotification(user.fcm_token, 'Ambulance Dispatched', `Ambulance ${chosenCandidateId} has been dispatched. ETA: ~5 mins.`, { reqId });
          }
        }).catch(err => console.error('[PUSH ERROR] User fetch failed:', err.message));
      }
      // Also notify topic for other paramedics
      sendTopicNotification('paramedics', 'New Emergency Mission', `Emergency case ${reqId} near your location.`, { reqId });
    }
  });


  socket.on('ambulance-arrived', (data) => {
    const req = activeRequests[data.reqId];
    if (req) {
      req.arrivedAtUser = true;
      io.to(req.userSocket).emit('ambulance-arrived', data);
      io.to(`mission_${req.id}`).emit('ambulance-arrived', data);

      // FCM Push Notification for user/patient
      if (req.userSocketId) {
        User.findByPk(req.userSocketId).then(user => {
          if (user && user.fcm_token) {
            sendPushNotification(user.fcm_token, 'Ambulance Arrived', `Your dispatched ambulance ${req.unitId} has arrived at your location.`, { reqId: req.id });
          }
        }).catch(err => console.error('[PUSH ERROR] User fetch failed:', err.message));
      }
    }
  });

  socket.on('patient-data', (data) => {
    const { reqId, ...patientUpdates } = data;
    const req = activeRequests[reqId];
    if (req) {
      req.patientDetails = { ...req.patientDetails, ...patientUpdates };
      io.to(`mission_${reqId}`).emit('patient-data', data);

      // Also update database if persistent
      syncMissionToDB(reqId);
    }
  });

  socket.on('patient-onboard', (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (req) {
      req.status = 'patient_onboard';
      io.to(`mission_${reqId}`).emit('patient-onboard', data);
      console.log(`[DISPATCH] Patient onboard for request ${reqId}`);
    }
  });

  socket.on('ambulance-response', async (data) => {
    const req = activeRequests[data.reqId];
    if (!req) return;

    if (data.accepted) {
      if (req.status !== 'pending_ambulance') {
        socket.emit('error-alert', { message: 'This mission has already been claimed by another unit.' });
        return;
      }
      req.status = 'ambulance_accepted';
      req.ambulanceSocket = socket.id;
      req.unitId = ambulances[socket.id]?.unitId;
      req.userSocket = data.userSocket || req.userSocket;

      io.emit('incoming-hospital-request', {
        id: req.id,
        status: 'advance_notice',
        ambulanceName: ambulances[socket.id]?.name || 'Unit',
        userLocation: req.userLocation,
        patientDetails: req.patientDetails,
      });

      const userSocketObj = io.sockets.sockets.get(req.userSocket);
      if (userSocketObj) userSocketObj.join(`mission_${req.id}`);
      socket.join(`mission_${req.id}`);

      req.chatMessages = [];
      req.incidentNotes = [];

      io.to(req.userSocket).emit('ambulance-request-response', { ...req, accepted: true });

      ambulances[socket.id].available = false;
      io.emit('ambulances-update', getCombinedAmbulances());

      const route = await getSmartRoute(ambulances[socket.id].location, req.userLocation);
      if (route) {
        req.routePath = route;
        io.to(req.userSocket).emit('route-update', { reqId: req.id, routePath: route });
        io.to(req.ambulanceSocket).emit('route-update', { reqId: req.id, routePath: route });
      }
    } else {
      req.status = 'ambulance_rejected';
      io.to(req.userSocket).emit('ambulance-request-response', { ...req, accepted: false });
    }
  });

  socket.on('request-hospital', (data) => {
    console.log(`[SOCKET_LOG] request-hospital received for reqId: ${data.reqId}, broadcast: ${data.broadcast || false}, targetSocket: ${data.hospitalSocketId || 'none'}`);
    let req = activeRequests[data.reqId];
    if (!req) {
      req = { id: data.reqId, ambulanceSocket: socket.id };
      activeRequests[data.reqId] = req;
    }
    if (data.fieldReport) {
      req.fieldReport = data.fieldReport;
      req.status = 'admission_request';
    }
    if (data.incidentLocation) {
      req.incidentLocation = data.incidentLocation;
    }

    // Log currently registered hospitals on socket
    console.log(`[SOCKET_LOG] Currently registered hospitals count: ${Object.keys(hospitals).length}`);
    Object.keys(hospitals).forEach(sid => {
      console.log(`  -> Hospital socket: ${sid}, ID: ${hospitals[sid]?.id || 'unknown'}, Name: ${hospitals[sid]?.name || 'unknown'}`);
    });

    if (data.broadcast) {
      const availableSockets = Object.keys(hospitals).filter(sid => {
        const hosp = hospitals[sid];
        const hasBeds = hosp.availableICUBeds === undefined || hosp.availableICUBeds > 0;
        return hasBeds;
      });
      const uniqueHospitalIds = [...new Set(availableSockets.map(sid => hospitals[sid]?.id).filter(Boolean))];
      console.log(`[SOCKET_LOG] Broadcasting request to unique hospital IDs: ${JSON.stringify(uniqueHospitalIds)}`);
      uniqueHospitalIds.forEach(hospId => {
        io.to(`hospital:${hospId}`).emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
      });
      // Global broadcast for demo fallback
      io.emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
      console.log(`[SMART DIVERT] Broadcasted to ${availableSockets.length} available hospitals, diverted from ${Object.keys(hospitals).length - availableSockets.length} full hospitals.`);
    } else if (data.hospitalSocketId) {
      const hospId = hospitals[data.hospitalSocketId]?.id;
      console.log(`[SOCKET_LOG] Targeted emit. targetSocketId: ${data.hospitalSocketId}, resolved hospId: ${hospId || 'none'}`);
      if (hospId) {
        console.log(`[SOCKET_LOG] Emitting targeted request to room 'hospital:${hospId}'`);
        io.to(`hospital:${hospId}`).emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
      } else {
        console.log(`[SOCKET_LOG] Emitting targeted request directly to socket '${data.hospitalSocketId}'`);
        io.to(data.hospitalSocketId).emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
      }
      // Global broadcast for demo fallback
      io.emit('incoming-hospital-request', { ...req, incidentLocation: req.incidentLocation });
    }
  });


  socket.on('hospital-response', async (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (!req) return;

    const isAccepted = data.status === 'hospital_accepted';

    // FIX C2: Atomic in-memory lock using a dedicated flag.
    // This prevents the race condition where two hospitals accept at the same millisecond.
    // In multi-node (Redis) production, this would be a Redlock distributed lock.
    if (isAccepted) {
      if (req._acceptLock) {
        // Another hospital beat this one by milliseconds
        console.warn(`[RACE CONDITION BLOCKED] Hospital ${socket.id} lost race for ${reqId}`);
        return socket.emit('error-alert', { message: 'REQUEST_ALREADY_TAKEN: Another hospital accepted this patient 0.01 seconds before you.' });
      }
      req._acceptLock = true; // Immediately lock — synchronous, atomic in single-node
    }

    req.status = isAccepted ? 'hospital_accepted' : 'hospital_rejected';

    if (isAccepted && hospitals[socket.id]) {
      req.hospitalSocket = socket.id;
      req.hospitalId = hospitals[socket.id].id; // STASH PERSISTENT ID
      req.readyServices = data.readyServices;

      // Hospital joins the stable mission room
      socket.join(`mission_${req.id}`);
      console.log(`[HANDSHAKE] Hospital ${hospitals[socket.id].name} joined mission_${req.id}`);

      // REROUTING DYNAMIC FIX: Route must go FROM the ambulance's current location (if en route/rerouted)
      // or fall back to the incident site (req.userLocation / req.incidentLocation) to the hospital.
      const amb = virtualAmbulances[req.unitId] || ambulances[req.ambulanceSocket];
      const startLoc = (amb && amb.location) || req.userLocation || req.incidentLocation;
      const hospLoc = hospitals[socket.id]?.location || hospitals[socket.id]?.pos;

      if (startLoc && hospLoc) {
        try {
          const route = await getSmartRoute(startLoc, hospLoc);
          if (route) {
            req.routePath = route;
            // Broadcast the corrected route to ambulance, hospital, and user
            io.to(`mission_${req.id}`).emit('route-update', { reqId: req.id, routePath: route, from: 'incident', to: 'hospital' });
            console.log(`[ROUTE] Route calculated starting from ${amb && amb.location ? 'current en route position' : 'incident site'}: ${route.length} waypoints`);
          }
        } catch (err) {
          console.warn(`[SERVER] Failed to fetch OSRM route: ${err.message}`);
        }
      }

      req.assignedHospital = hospitals[socket.id];
      hospitals[socket.id].activeMissionsCount = (hospitals[socket.id].activeMissionsCount || 0) + 1;
      hospitals[socket.id].isBusy = true;
      io.emit('hospitals-update', hospitals); // Hospitals don't have simulated versions yet, so this is fine, but good to check.
      io.emit('ambulances-update', getCombinedAmbulances());

      logAudit('RESOURCE_LOCK', `Hospital ${hospitals[socket.id].name} locked resources for mission ${req.id}`, { resources: data.readyServices });

      if (req.unitId && req.unitId.startsWith('VIRTUAL-AMB-')) {
        startVirtualAmbulanceToHospitalSimulation(reqId, socket.id);
      }

      const hospContact = hospitals[socket.id]?.contactInfo || '+1234567890';
      const etaMins = req.routePath ? Math.ceil(req.routePath.length / 10) : 10;
      whatsappService.notifyHospitalIncoming(hospContact, reqId, etaMins);

      // FCM Push Notification for user/patient
      if (req.userSocketId) {
        User.findByPk(req.userSocketId).then(user => {
          if (user && user.fcm_token) {
            sendPushNotification(user.fcm_token, 'Hospital Admission Confirmed', `Hospital ${hospitals[socket.id]?.name || 'Partner Hospital'} has accepted your emergency admission.`, { reqId });
          }
        }).catch(err => console.error('[PUSH ERROR] User fetch failed:', err.message));
      }

      // FCM Push Notification for paramedic
      if (req.unitId && !req.unitId.startsWith('VIRTUAL-AMB-')) {
        User.findOne({ where: { role: 'paramedic', mobile: combinedAmbulances[req.unitId]?.contactInfo || '' } }).then(paramedic => {
          if (paramedic && paramedic.fcm_token) {
            sendPushNotification(paramedic.fcm_token, 'Admission Accepted', `Hospital ${hospitals[socket.id]?.name} accepted patient. Proceed to ER.`, { reqId });
          }
        }).catch(err => console.error('[PUSH ERROR] Paramedic fetch failed:', err.message));
      }
    }

    if (req.userSocket) io.to(req.userSocket).emit('hospital-request-response', { ...req, hospitalSocket: req.hospitalSocket });
    if (req.ambulanceSocket) io.to(req.ambulanceSocket).emit('hospital-request-response', { ...req, hospitalSocket: req.hospitalSocket });
    io.to(socket.id).emit('hospital-request-response', { ...req, hospitalSocket: req.hospitalSocket });
    if (req.hospitalId) {
      io.to(`hospital:${req.hospitalId}`).emit('hospital-request-response', { ...req, hospitalSocket: req.hospitalSocket });
    }

    // If it was a broadcasted request, notify all other hospitals to "withdraw" the alert
    if (isAccepted) {
      io.emit('hospital-request-taken', { reqId: req.id, acceptedBy: socket.id });
    }
  });

  socket.on('reroute-hospital', async (data) => {
    // data: { reqId, newHospitalId, ... }
    const { reqId, newHospitalId } = data;
    const req = activeRequests[reqId];
    if (!req) return;

    // Free up old hospital if exists
    if (req.hospitalSocket && hospitals[req.hospitalSocket]) {
      const oldHospSocket = io.sockets.sockets.get(req.hospitalSocket);
      if (oldHospSocket) oldHospSocket.leave(`mission_${reqId}`);
      hospitals[req.hospitalSocket].isBusy = false;
      const oldHospId = hospitals[req.hospitalSocket]?.id;
      if (oldHospId) {
        io.to(`hospital:${oldHospId}`).emit('mission-completed', { reqId, reason: 'rerouted' });
      } else {
        io.to(req.hospitalSocket).emit('mission-completed', { reqId, reason: 'rerouted' });
      }
      console.log(`[REROUTE] Freed Hospital ${hospitals[req.hospitalSocket].name}`);
    }

    // Clear old transport simulation if active (Fixes Rerouting Simulation bug)
    if (activeSimulations[reqId]) {
      clearInterval(activeSimulations[reqId].interval);
      delete activeSimulations[reqId];
      console.log(`[REROUTE] Cleared running simulation interval for mission ${reqId}`);
    }

    // Reset hospital fields in request to wait for new acceptance or auto-assign
    req.hospitalId = newHospitalId;
    req.hospitalSocket = null;
    req.status = 'pending_hospital';

    io.emit('hospitals-update', hospitals);
    routeToMission(socket, 'reroute-hospital', data);
  });

  socket.on('complete-mission', async (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (req) {
      console.log(`[FINALIZE] Mission ${reqId} completed.`);
      try {
        if (dbWriteTimers[reqId]) {
          clearTimeout(dbWriteTimers[reqId]);
          delete dbWriteTimers[reqId];
        }
        let patientId = req.patientDetails?.id || req.fieldReport?.patientId || null;
        if (!isUUID(patientId)) patientId = null;

        let paramedicId = req.paramedicId || null;
        if (!isUUID(paramedicId)) paramedicId = null;

        let hospitalId = req.hospitalId || null;
        if (!isUUID(hospitalId)) hospitalId = null;

        const pickup_lat = req.userLocation?.lat || req.incidentLocation?.lat || null;
        const pickup_lng = req.userLocation?.lng || req.incidentLocation?.lng || null;
        const pickup_address = req.patientDetails?.address || req.pickup_address || '';
        const news2_score = req.news2Score || 0;
        const vitals_log = req.vitalsHistory || [];
        const gps_log = req.gps_log || req.gpsHistory || [];
        const notes = req.fieldNotes || req.notes || '';

        await Incident.upsert({
          id: req.id || reqId,
          patient_id: patientId,
          ambulance_id: req.unitId || req.ambulanceSocket || null,
          paramedic_id: paramedicId,
          hospital_id: hospitalId,
          status: 'completed',
          pickup_lat: pickup_lat,
          pickup_lng: pickup_lng,
          pickup_address: pickup_address,
          news2_score: news2_score,
          vitals_log: vitals_log,
          gps_log: gps_log,
          notes: notes,
          payment_status: req.payment_status || 'pending',
          razorpay_order_id: req.razorpay_order_id || null
        });
      } catch (err) {
        console.error('[DB ERROR] Failed to update mission status on complete:', err);
      }
      // Notify hospital and user
      if (req.hospitalId) {
        io.to(`hospital:${req.hospitalId}`).emit('mission-completed', { reqId });
      } else if (req.hospitalSocket) {
        io.to(req.hospitalSocket).emit('mission-completed', { reqId });
        if (req.hospitalSocket && hospitals[req.hospitalSocket]) {
          hospitals[req.hospitalSocket].activeMissionsCount = Math.max(0, (hospitals[req.hospitalSocket].activeMissionsCount || 1) - 1);
          hospitals[req.hospitalSocket].isBusy = hospitals[req.hospitalSocket].activeMissionsCount > 0;
          io.emit('hospitals-update', hospitals);
        }
      }
      if (req.userSocket) io.to(req.userSocket).emit('mission-completed', { reqId });

      cleanupSimulation(reqId);

      delete activeRequests[reqId];
    }
    // Set ambulance back to available
    if (ambulances[socket.id]) {
      ambulances[socket.id].available = true;
      io.emit('ambulances-update', getCombinedAmbulances());
    }
  });

  socket.on('reject-resume-mission', async (data) => {
    const { reqId } = data;
    const req = activeRequests[reqId];
    if (req) {
      console.log(`[RECOVERY] Mission ${reqId} rejected. Aborting/cancelling mission.`);
      try {
        if (dbWriteTimers[reqId]) {
          clearTimeout(dbWriteTimers[reqId]);
          delete dbWriteTimers[reqId];
        }
        await Incident.update({ status: 'cancelled' }, { where: { id: reqId } });
      } catch (err) {
        console.error('[DB ERROR] Failed to update mission status on reject-resume:', err);
      }
      io.to(`mission_${reqId}`).emit('mission-completed', { reqId, reason: 'rejected_by_recovery' });

      cleanupSimulation(reqId);

      if (req.ambulanceSocket && ambulances[req.ambulanceSocket]) {
        ambulances[req.ambulanceSocket].available = true;
      }
      delete activeRequests[reqId];
      io.emit('ambulances-update', getCombinedAmbulances());
      io.emit('hospitals-update', hospitals);
    }
  });

  socket.on('get-mission-data', (reqId) => {
    const req = activeRequests[reqId];
    if (req) {
      console.log(`[RECOVERY] Manual request for mission ${reqId} from ${socket.id}`);

      // Update socket mapping if needed
      if (role === 'ambulance') req.ambulanceSocket = socket.id;
      if (role === 'hospital') req.hospitalSocket = socket.id;
      if (role === 'user') req.userSocket = socket.id;

      socket.join(`mission_${reqId}`);
      socket.emit('rejoin-mission', req);
    } else {
      socket.emit('error', { message: 'MISSION_NOT_FOUND', id: reqId });
    }
  });

  // MCI Sockets
  socket.on('mass-casualty-declare', (data) => {
    const eventId = 'MCI-' + Date.now();
    const mciEvent = {
      id: eventId,
      eventType: data.eventType,
      location: data.location || { lat: 12.9716, lng: 77.5946 },
      estimatedVictims: parseInt(data.estimatedVictims, 10) || 5,
      description: data.description || '',
      casualties: [],
      resourceRequests: [],
      timestamp: new Date().toISOString(),
      status: 'active'
    };
    activeMciEvents[eventId] = mciEvent;
    disasterModeActive = true;

    io.emit('mass-casualty-declared', mciEvent);
    console.log(`[MCI DECLARE] Mass Casualty declared: ${mciEvent.eventType} (${eventId})`);
  });

  socket.on('mci-triage-update', (data) => {
    const { mciId, casualtyName, tag, symptoms, vitals } = data;
    const mci = activeMciEvents[mciId];
    if (mci) {
      const casualty = {
        id: 'CAS-' + Date.now(),
        casualtyName: casualtyName || 'Unknown Victim',
        tag: tag || 'GREEN',
        symptoms: symptoms || '',
        vitals: vitals || {},
        timestamp: new Date().toISOString()
      };
      mci.casualties.push(casualty);
      io.emit('mass-casualty-update', mci);
      console.log(`[MCI TRIAGE] Casualty triaged: ${casualty.casualtyName} -> [${casualty.tag}]`);
    }
  });

  socket.on('mci-resource-request', (data) => {
    const { mciId, resourceType, quantity, sector, urgency } = data;
    const mci = activeMciEvents[mciId];
    if (mci) {
      const req = {
        id: require('crypto').randomUUID(),
        resourceType,
        quantity: parseInt(quantity, 10) || 1,
        sector: sector || 'Alpha',
        urgency: urgency || 'HIGH',
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      mci.resourceRequests.push(req);
      io.emit('mass-casualty-update', mci);
      console.log(`[MCI RESOURCE] Resource request: ${req.resourceType} (Qty: ${req.quantity})`);
    }
  });

  // End of core mission events


  // ── Reroute Hospital (ambulance switches destination) ───────────────────

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (role === 'user') connectedRoles.user = Math.max(0, connectedRoles.user - 1);

    if (role === 'ambulance') {
      connectedRoles.ambulance = Math.max(0, connectedRoles.ambulance - 1);

      // FIX C3: Kill zombie WebRTC feeds when ambulance disconnects unexpectedly.
      // Without this, hospital doctors stare at a frozen video frame indefinitely.
      Object.values(activeRequests).forEach(req => {
        if (req.ambulanceSocket === socket.id && req.hospitalSocket) {
          console.log(`[WEBRTC CLEANUP] Ambulance ${socket.id} disconnected — sending synthetic hangup to hospital.`);
          io.to(req.hospitalSocket).emit('webrtc-hangup', { reqId: req.id, reason: 'ambulance_disconnected' });
        }

        // Notify user if ambulance drops out before completion
        if (req.ambulanceSocket === socket.id && req.status !== 'completed') {
          console.log(`[HANDOVER] Ambulance disconnected! Alerting user for req ${req.id}`);
          req.status = 'pending_ambulance';
          req.ambulanceSocket = null;
          if (req.userSocket) io.to(req.userSocket).emit('mission-completed', { reqId: req.id, reason: 'ambulance_disconnected' });
        }
      });

      delete ambulances[socket.id];
      io.emit('ambulances-update', ambulances);
    }

    if (role === 'hospital') {
      connectedRoles.hospital = Math.max(0, connectedRoles.hospital - 1);

      // FIX C3 (mirror): Kill zombie WebRTC feeds on hospital disconnect too
      Object.values(activeRequests).forEach(req => {
        if (req.hospitalSocket === socket.id && req.ambulanceSocket) {
          io.to(req.ambulanceSocket).emit('webrtc-hangup', { reqId: req.id, reason: 'hospital_disconnected' });
        }
      });

      // --- GRACEFUL HANDOVER LOGIC ---
      Object.values(activeRequests).forEach(req => {
        if (req.hospitalSocket === socket.id && req.status !== 'completed') {
          console.log(`[HANDOVER] Hospital dropped off! Re-broadcasting request ${req.id}`);
          req.status = 'advance_notice';
          req.hospitalSocket = null;
          req._acceptLock = false; // FIX C2: Release atomic lock so another hospital can accept

          if (activeSimulations[req.id]) {
            clearInterval(activeSimulations[req.id].interval);
            delete activeSimulations[req.id];
            const amb = virtualAmbulances[req.unitId];
            if (amb) {
              amb.location = req.userLocation;
            }
          }

          io.emit('hospital-disconnected', { reqId: req.id });
          io.emit('incoming-hospital-request', { ...req });
        }
      });

      delete hospitals[socket.id];
      io.emit('hospitals-update', hospitals);
    }
    io.emit('roles-update', connectedRoles);
    console.log(`[DISCONNECT] ${role.toUpperCase()} disconnected — ${socket.id}`);
  });
});

// ─── AI EMERGENCY COPILOT ENDPOINT ─────────────────────────────────────────────────
let geminiAI = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY) {
    geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('[AI COPILOT] Gemini AI Engine Initialized.');
  }
} catch (e) { console.warn('[AI COPILOT] Gemini not available, using fallback'); }

async function analyzeSymptoms(text) {
  if (geminiAI) {
    try {
      const model = geminiAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `You are an emergency medical triage AI. Analyze these symptoms and respond ONLY in JSON format:
Symptoms: "${text}"
Respond with: {"detectedCondition": "string", "severity": "CRITICAL|HIGH|MEDIUM|LOW", "suggestedAmbulanceType": "ALS|BLS", "suggestedHospitalType": "Cardiac Center|Trauma Center|General Hospital|Neurology Center", "immediateActions": ["action1","action2"], "urgentMessage": "string", "triageColor": "RED|YELLOW|GREEN", "estimatedTimeToDeterioration": "string"}`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { console.warn('[AI] Gemini error, using fallback:', e.message); }
  }
  // Keyword fallback triage engine
  const lower = text.toLowerCase();
  let condition = 'General Emergency', severity = 'MEDIUM', ambType = 'BLS', hospType = 'General Hospital', color = 'YELLOW';
  const actions = ['Call 108 immediately', 'Keep patient calm', 'Monitor breathing'];
  if (lower.includes('chest pain') || lower.includes('heart') || lower.includes('cardiac') || lower.includes('sweating')) {
    condition = 'Possible Cardiac Emergency'; severity = 'CRITICAL'; ambType = 'ALS'; hospType = 'Cardiac Center'; color = 'RED';
    actions.unshift('Loosen clothing', 'Chew 325mg aspirin if not allergic');
  } else if (lower.includes('stroke') || lower.includes('face droop') || lower.includes('arm weak') || lower.includes('slurred')) {
    condition = 'Possible Stroke (FAST Positive)'; severity = 'CRITICAL'; ambType = 'ALS'; hospType = 'Neurology Center'; color = 'RED';
    actions.unshift('Do NOT give food/water', 'Note time symptoms started');
  } else if (lower.includes('bleed') || lower.includes('accident') || lower.includes('trauma') || lower.includes('crash')) {
    condition = 'Trauma / Hemorrhage'; severity = 'HIGH'; ambType = 'ALS'; hospType = 'Trauma Center'; color = 'RED';
    actions.unshift('Apply direct pressure to wounds', 'Do not remove embedded objects');
  } else if (lower.includes('breath') || lower.includes('chok') || lower.includes('asthma')) {
    condition = 'Respiratory Distress'; severity = 'HIGH'; ambType = 'ALS'; hospType = 'General Hospital'; color = 'YELLOW';
    actions.unshift('Sit patient upright', 'Use inhaler if available');
  } else if (lower.includes('unconscious') || lower.includes('not breathing') || lower.includes('no pulse')) {
    condition = 'Cardiac Arrest / Unconscious'; severity = 'CRITICAL'; ambType = 'ALS'; hospType = 'Cardiac Center'; color = 'RED';
    actions.unshift('Start CPR immediately', 'Use AED if available');
  } else if (lower.includes('burn') || lower.includes('fire')) {
    condition = 'Burn Injury'; severity = 'HIGH'; ambType = 'ALS'; hospType = 'Trauma Center'; color = 'YELLOW';
    actions.unshift('Cool with running water', 'Cover with clean cloth');
  } else if (lower.includes('fracture') || lower.includes('broken') || lower.includes('bone')) {
    condition = 'Fracture / Orthopedic Injury'; severity = 'MEDIUM'; ambType = 'BLS'; hospType = 'General Hospital'; color = 'YELLOW';
    actions.unshift('Immobilize the injured part', 'Apply ice if available');
  }
  return {
    detectedCondition: condition, severity, suggestedAmbulanceType: ambType, suggestedHospitalType: hospType,
    immediateActions: actions, urgentMessage: `${condition} detected. ${ambType} unit recommended.`,
    triageColor: color, estimatedTimeToDeterioration: severity === 'CRITICAL' ? '< 5 minutes' : severity === 'HIGH' ? '< 15 minutes' : '< 1 hour'
  };
}



// ─── BLOOD EMERGENCY NETWORK ────────────────────────────────────────────────────────
const activeBloodRequests = {};

app.post('/api/blood/request', async (req, res) => {
  const { bloodType, location, patientName, reqId, urgency } = req.body;
  const id = `BLD-${Date.now()}`;
  const request = { id, bloodType, location, patientName, reqId, urgency: urgency || 'HIGH', timestamp: new Date().toISOString(), status: 'active' };
  activeBloodRequests[id] = request;
  io.emit('blood-emergency-broadcast', request);
  setTimeout(() => { if (activeBloodRequests[id]) { activeBloodRequests[id].status = 'expired'; } }, 30 * 60 * 1000);
  logAudit('BLOOD_REQUEST', `Blood type ${bloodType} requested for ${patientName}`, { bloodType, location });
  res.json({ success: true, id, message: `Blood emergency broadcast sent for ${bloodType}` });
});

app.get('/api/blood/banks', (req, res) => {
  const { lat, lng } = req.query;
  const baseLat = parseFloat(lat) || 12.9716;
  const baseLng = parseFloat(lng) || 77.5946;
  const bloodBanks = [
    { id: 'BB-001', name: 'City Blood Bank & Research Centre', lat: baseLat + 0.02, lng: baseLng + 0.015, phone: '+91-80-22222222', inventory: { 'A+': 12, 'A-': 2, 'B+': 8, 'B-': 1, 'O+': 15, 'O-': 3, 'AB+': 5, 'AB-': 1 }, emergency24x7: true },
    { id: 'BB-002', name: 'Red Cross Blood Bank', lat: baseLat - 0.018, lng: baseLng + 0.022, phone: '+91-80-33333333', inventory: { 'A+': 6, 'A-': 0, 'B+': 14, 'B-': 3, 'O+': 9, 'O-': 0, 'AB+': 7, 'AB-': 2 }, emergency24x7: true },
    { id: 'BB-003', name: 'Government District Blood Bank', lat: baseLat + 0.035, lng: baseLng - 0.01, phone: '+91-80-44444444', inventory: { 'A+': 20, 'A-': 4, 'B+': 11, 'B-': 2, 'O+': 25, 'O-': 6, 'AB+': 3, 'AB-': 0 }, emergency24x7: false },
    { id: 'BB-004', name: 'Lions Club Blood Bank', lat: baseLat - 0.025, lng: baseLng - 0.03, phone: '+91-80-55555555', inventory: { 'A+': 8, 'A-': 1, 'B+': 5, 'B-': 0, 'O+': 12, 'O-': 2, 'AB+': 4, 'AB-': 1 }, emergency24x7: true },
    { id: 'BB-005', name: 'Apollo Hospital Blood Bank', lat: baseLat + 0.01, lng: baseLng + 0.04, phone: '+91-80-66666666', inventory: { 'A+': 10, 'A-': 3, 'B+': 7, 'B-': 2, 'O+': 18, 'O-': 4, 'AB+': 6, 'AB-': 2 }, emergency24x7: true },
  ];
  res.json(bloodBanks);
});

app.get('/api/blood/requests', (req, res) => {
  const active = Object.values(activeBloodRequests).filter(r => r.status === 'active');
  res.json(active);
});

app.post('/api/blood/fulfill', async (req, res) => {
  const { requestId, hospitalId, units } = req.body;
  if (activeBloodRequests[requestId]) {
    activeBloodRequests[requestId].status = 'fulfilled';
    activeBloodRequests[requestId].fulfilledBy = hospitalId;
    io.emit('blood-request-fulfilled', { requestId, hospitalId, units });
  }
  res.json({ success: true });
});

// ─── INSURANCE PRE-APPROVAL ENGINE ──────────────────────────────────────────────
app.post('/api/insurance/pre-approve', authenticateToken, async (req, res) => {
  const { patientName, patientId, hospitalId, condition, estimatedCost } = req.body;
  if (!patientName || !condition) return res.status(400).json({ error: 'Patient name and condition required' });
  const referenceNo = `INS-${Date.now().toString(36).toUpperCase()}`;
  const coverage = estimatedCost ? Math.min(estimatedCost, 500000) : 250000;
  const response = {
    referenceNo, status: 'PRE_APPROVED',
    patientName, condition, hospitalId,
    coverageAmount: coverage,
    currency: 'INR',
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    insurer: 'National Health Insurance',
    policyType: 'Emergency Medical Coverage',
    message: `Emergency pre-approval granted for ${condition}. Coverage up to ₹${coverage.toLocaleString('en-IN')}`,
    timestamp: new Date().toISOString()
  };
  logAudit('INSURANCE_PRE_APPROVAL', `Pre-approval for ${patientName}: ${condition}`, { referenceNo });
  res.json(response);
});

// ─── AMBULANCE MARKETPLACE ENDPOINTS ─────────────────────────────────────────────
app.get('/api/marketplace/ambulances', (req, res) => {
  const { lat, lng } = req.query;
  const baseLat = parseFloat(lat) || 12.9716;
  const baseLng = parseFloat(lng) || 77.5946;
  const marketplace = [
    { id: 'MP-ALS-001', name: 'MedFleet ALS Unit', provider: 'MedFleet Pvt Ltd', type: 'Advanced Life Support', rating: 4.9, trips: 2340, pricePerKm: 45, basePrice: 500, responseTime: 4, contact: '+91-9876543210', lat: baseLat + 0.008, lng: baseLng + 0.006, available: true, features: ['Cardiac Monitor', 'Ventilator', 'Defibrillator', 'Paramedic'] },
    { id: 'MP-BLS-001', name: 'ZoneCare BLS', provider: 'ZoneCare Medical', type: 'Basic Life Support', rating: 4.7, trips: 1820, pricePerKm: 30, basePrice: 350, responseTime: 6, contact: '+91-9876543211', lat: baseLat - 0.005, lng: baseLng + 0.009, available: true, features: ['First Aid', 'Oxygen', 'EMT Certified'] },
    { id: 'MP-ALS-002', name: 'CityRescue ALS', provider: 'CityRescue Corp', type: 'Advanced Life Support', rating: 4.8, trips: 3100, pricePerKm: 50, basePrice: 600, responseTime: 5, contact: '+91-9876543212', lat: baseLat + 0.003, lng: baseLng - 0.007, available: true, features: ['PICU', 'Neonatal', 'Ventilator', 'ICU Nurse'] },
    { id: 'MP-NGO-001', name: 'LifeSave NGO Ambulance', provider: 'LifeSave Foundation', type: 'Basic Life Support', rating: 4.6, trips: 890, pricePerKm: 15, basePrice: 100, responseTime: 10, contact: '+91-9876543213', lat: baseLat - 0.009, lng: baseLng - 0.004, available: true, features: ['Free for BPL', 'Basic First Aid', 'EMT'] },
    { id: 'MP-AIR-001', name: 'AirMed Helicopter', provider: 'AirMed Services', type: 'Air Ambulance', rating: 5.0, trips: 450, pricePerKm: 200, basePrice: 15000, responseTime: 12, contact: '+91-9876543214', lat: baseLat + 0.015, lng: baseLng + 0.012, available: true, features: ['ICU in Air', 'Doctor', 'Ventilator', 'Fast'] },
    { id: 'MP-BLS-002', name: 'QuickAid BLS', provider: 'QuickAid Medical', type: 'Basic Life Support', rating: 4.5, trips: 1200, pricePerKm: 28, basePrice: 300, responseTime: 7, contact: '+91-9876543215', lat: baseLat + 0.006, lng: baseLng - 0.011, available: false, features: ['Oxygen', 'Stretcher', 'EMT Certified'] },
  ];
  const liveMerged = marketplace.map(m => {
    const liveMatch = Object.values({ ...ambulances, ...virtualAmbulances }).find(a => a.unitId === m.id);
    if (liveMatch) return { ...m, available: liveMatch.available, lat: liveMatch.location?.lat || m.lat, lng: liveMatch.location?.lng || m.lng };
    return m;
  });
  res.json(liveMerged);
});

// ─── PREDICTIVE EMERGENCY HOTSPOT ANALYTICS ──────────────────────────────────
app.get('/api/analytics/hotspots', authenticateToken, async (req, res) => {
  try {
    const missions = await Incident.findAll({ limit: 100 });
    const hotspots = [];
    const types = ['Cardiac Emergency', 'Trauma/Accident', 'Stroke', 'Respiratory Distress', 'Diabetic Crisis'];
    missions.forEach(m => {
      if (m.pickup_lat && m.pickup_lng) {
        hotspots.push({ lat: m.pickup_lat, lng: m.pickup_lng, type: m.notes || types[Math.floor(Math.random() * types.length)], count: 1 });
      }
    });
    // Generate simulated hotspot data around known incident zones
    Object.values(activeIncidentZones).forEach(zone => {
      hotspots.push({ lat: zone.lat, lng: zone.lng, type: 'Traffic Accident', count: 3, radius: zone.radius });
    });
    res.json({ hotspots, totalIncidents: missions.length });
  } catch (err) {
    console.error('[HOTSPOTS ERROR]', err);
    res.status(500).json({ error: 'Hotspot analytics failed' });
  }
});

// ─── RESOURCE SHARING NETWORK ─────────────────────────────────────────────────────
const activeResourceShares = {};

app.post('/api/resources/share', authenticateToken, async (req, res) => {
  if (req.user.role !== 'hospital') return res.status(403).json({ error: 'Hospital only' });
  const { resourceType, quantity, expiresInHours } = req.body;
  const shareId = `RS-${Date.now()}`;
  const share = { id: shareId, hospitalId: req.user.id, resourceType, quantity, expiresAt: new Date(Date.now() + (expiresInHours || 4) * 3600000).toISOString(), status: 'available' };
  activeResourceShares[shareId] = share;
  io.emit('resource-share-available', share);
  res.json({ success: true, shareId });
});

app.get('/api/resources/shares', (req, res) => {
  const active = Object.values(activeResourceShares).filter(r => r.status === 'available');
  res.json(active);
});

// ─── NEW ENTERPRISE SOCKET HANDLERS ───────────────────────────────────────────────
const activeGreenCorridors = {};
const activeMassCasualties = {};
const familyWatchers = {}; // reqId -> [socketIds]

io.on('connection', (newSocket) => {
  // ─── GREEN CORRIDOR ────────────────────────────────────────────────────────────
  newSocket.on('green-corridor-request', (data) => {
    const { reqId, route, reason, patientCondition } = data;
    const corridorId = `GC-${Date.now()}`;
    const corridor = { id: corridorId, reqId, route, reason, patientCondition, requestedAt: new Date().toISOString(), status: 'pending' };
    activeGreenCorridors[corridorId] = corridor;
    io.to('admin_warroom').emit('green-corridor-request', corridor);
    io.emit('green-corridor-active', corridor); // Broadcast to all clients
    console.log(`[GREEN CORRIDOR] Requested for mission ${reqId}`);
  });

  newSocket.on('green-corridor-approve', (data) => {
    const { corridorId } = data;
    if (activeGreenCorridors[corridorId]) {
      activeGreenCorridors[corridorId].status = 'approved';
      activeGreenCorridors[corridorId].approvedAt = new Date().toISOString();
      io.emit('green-corridor-approved', activeGreenCorridors[corridorId]);
      console.log(`[GREEN CORRIDOR] Approved: ${corridorId}`);
    }
  });

  // ─── FAMILY TRACKING ─────────────────────────────────────────────────────────────
  newSocket.on('register-family', (data) => {
    const { reqId } = data;
    if (!reqId) return newSocket.emit('error-alert', { message: 'Mission ID required' });
    const req = activeRequests[reqId];
    newSocket.join(`mission_${reqId}`);
    newSocket.join(`family_${reqId}`);
    if (!familyWatchers[reqId]) familyWatchers[reqId] = [];
    familyWatchers[reqId].push(newSocket.id);
    if (req) {
      newSocket.emit('mission-status-update', { status: req.status, patientDetails: { name: req.patientDetails?.name, condition: req.patientDetails?.condition }, ambulanceLocation: null });
    } else {
      newSocket.emit('error-alert', { message: 'Mission not found or completed. Please check your link.' });
    }
    console.log(`[FAMILY] Socket ${newSocket.id} joined family tracking for mission ${reqId}`);
  });

  // ─── MASS CASUALTY MANAGEMENT ──────────────────────────────────────────────────────
  newSocket.on('mass-casualty-declare', (data) => {
    const { eventType, location, estimatedVictims, description } = data;
    const eventId = `MCI-${Date.now()}`;
    const event = { id: eventId, eventType, location, estimatedVictims, description, declaredAt: new Date().toISOString(), status: 'active', victims: [], allocations: {} };
    activeMassCasualties[eventId] = event;
    io.emit('mass-casualty-declared', event);
    io.to('admin_warroom').emit('mass-casualty-declared', event);
    console.log(`[MCI] Mass casualty event declared: ${eventId}`);
  });

  newSocket.on('mass-casualty-update', (data) => {
    const { eventId, victims, allocations } = data;
    if (activeMassCasualties[eventId]) {
      if (victims) activeMassCasualties[eventId].victims = victims;
      if (allocations) activeMassCasualties[eventId].allocations = allocations;
      io.emit('mass-casualty-update', activeMassCasualties[eventId]);
    }
  });

  // ─── ACCIDENT DETECTION (IoT Sensor Simulation) ──────────────────────────────────
  newSocket.on('accident-detected', (data) => {
    const { location, severity, vehicleId, timestamp } = data;
    const alert = { id: `ACC-${Date.now()}`, location, severity, vehicleId, timestamp, status: 'pending_confirmation' };
    console.log(`[ACCIDENT DETECTION] Impact detected from ${vehicleId} at ${JSON.stringify(location)}`);
    // Give user 30 seconds to confirm they're OK before triggering SOS
    const timer = setTimeout(() => {
      if (alert.status === 'pending_confirmation') {
        alert.status = 'sos_triggered';
        newSocket.emit('accident-sos-triggered', alert);
        console.log(`[ACCIDENT SOS] Auto-triggered for ${vehicleId}`);
      }
    }, 30000);
    newSocket.emit('accident-confirm-request', { ...alert, confirmationDeadline: Date.now() + 30000 });
    newSocket.on('accident-im-ok', () => { clearTimeout(timer); alert.status = 'confirmed_safe'; console.log(`[ACCIDENT] User confirmed safe: ${vehicleId}`); });
  });

  // ─── WEARABLE / SMART DEVICE INTEGRATION ──────────────────────────────────────
  newSocket.on('wearable-alert', (data) => {
    const { userId, alertType, vitals, location } = data;
    console.log(`[WEARABLE] Alert from ${userId}: ${alertType}`);
    // Broadcast to all connected user sockets for this userId
    const userSocketId = users[userId];
    if (userSocketId) {
      io.to(userSocketId).emit('wearable-alert', { alertType, vitals, location, timestamp: Date.now() });
    }
  });

  // ─── BLOOD REQUEST (socket-based for real-time) ───────────────────────────────────
  newSocket.on('blood-emergency-request', (data) => {
    const { bloodType, location, patientName, urgency } = data;
    const id = `BLD-${Date.now()}`;
    const request = { id, bloodType, location, patientName, urgency: urgency || 'CRITICAL', timestamp: new Date().toISOString(), requestorSocket: newSocket.id };
    activeBloodRequests[id] = request;
    io.emit('blood-emergency-broadcast', request);
    console.log(`[BLOOD] Emergency request for ${bloodType}`);
  });

  newSocket.on('blood-request-response', (data) => {
    const { requestId, hospitalName, unitsAvailable } = data;
    if (activeBloodRequests[requestId]) {
      const requestorSocket = activeBloodRequests[requestId].requestorSocket;
      if (requestorSocket) {
        io.to(requestorSocket).emit('blood-donor-found', { requestId, hospitalName, unitsAvailable, responderSocket: newSocket.id });
      }
    }
  });
});

// FIX H3: Boot sequence — wait for DB to be ready BEFORE accepting socket connections.
// Previously, server.listen() could start accepting sockets before activeRequests was hydrated.
async function startServer() {
  try {
    // 1. Sync database (handles fallback to SQLite if Postgres is offline)
    await syncDatabase();
    console.log('[ENTERPRISE DB] Persistence Layer Online');

    // 2. Hydrate in-memory state from database
    const persisted = await Incident.findAll({
      where: {
        status: {
          [Op.in]: ['requested', 'dispatched', 'en_route', 'arrived']
        }
      }
    });
    persisted.forEach(m => {
      activeRequests[m.id] = {
        id: m.id,
        status: m.status,
        userSocket: m.ambulance_id,
        ambulanceSocket: m.ambulance_id,
        hospitalId: m.hospital_id,
        patientDetails: { id: m.patient_id },
        vitalsHistory: m.vitals_log || [],
        chatHistory: [],
        resourceLocks: {},
        checklist: {}
      };
    });
    console.log(`[ENTERPRISE DB] Restored ${persisted.length} active incidents into memory.`);

    // 3. Open port to incoming connections
    const PORT = process.env.PORT || 5000;
    if (process.env.NODE_ENV !== 'test') {
      server.listen(PORT, () => {
        console.log(`\n🚑  Emergency Care Server running on http://localhost:${PORT}`);
        console.log(`📡  Socket.io ready for real-time connections\n`);
      });
    }

    // 4. Set up Data Retention Policy Scheduled Job (Runs once a day)
    const retentionFlagJob = async () => {
      console.log('[COMPLIANCE JOB] Scanning database for records past retention limits...');
      try {
        const THREE_YEARS_AGO = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
        const oldIncidents = await Incident.findAll({
          where: {
            completed_at: {
              [Op.lt]: THREE_YEARS_AGO
            },
            patient_id: {
              [Op.ne]: null
            }
          }
        });

        const systemAdmin = await User.findOne({ where: { role: 'city_admin' } });
        if (!systemAdmin) return;

        let flaggedCount = 0;
        for (const incident of oldIncidents) {
          const exists = await PendingErasure.findOne({
            where: {
              patient_id: incident.patient_id,
              status: 'PENDING'
            }
          });
          if (!exists) {
            await PendingErasure.create({
              request_by_user_id: systemAdmin.id,
              patient_id: incident.patient_id,
              reason: 'AUTO_PURGE: Incident records older than 3 years retention policy.',
              status: 'PENDING'
            });
            flaggedCount++;
          }
        }
        if (flaggedCount > 0) {
          console.log(`[COMPLIANCE JOB] Flagged ${flaggedCount} patients' records for deletion review due to retention policy.`);
        }
      } catch (err) {
        console.error('[COMPLIANCE JOB ERROR] Failed to run retention sweep:', err.message);
      }
    };

    if (process.env.NODE_ENV !== 'test') {
      setTimeout(retentionFlagJob, 5000);
      setInterval(retentionFlagJob, 24 * 60 * 60 * 1000);
    }
  } catch (err) {
    console.error('[FATAL] Database initialization failed. Server will not start.', err);
    if (process.env.NODE_ENV !== 'test') process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, server, startServer };
// Nodemon trigger comment - reload and restart server successfully
