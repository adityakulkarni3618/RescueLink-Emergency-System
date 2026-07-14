const express = require('express');
const router = express.Router();
const { User, Hospital, AuditLog, Incident } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');
const axios = require('axios');

const { validate, requestConsultBody } = require('../middleware/validate');

const DAILY_CO_API_KEY = process.env.DAILY_CO_API_KEY || 'mock-daily-key-108';

// Store pending consult requests in memory for real-time routing (or database if preferred)
const activeConsultRequests = {};

/**
 * @route POST /api/tele/request-consult
 * @desc File a remote specialist consultation request
 */
router.post('/request-consult', verifyToken(['doctor', 'paramedic', 'hospital_admin']), validate(requestConsultBody), async (req, res) => {
  const { incidentId, speciality, urgency, notes } = req.body;

  try {
    const whereClause = { id: incidentId };
    if (req.user.hospital_id) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const incident = await Incident.findOne({ where: whereClause });
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found or unauthorized' });
    }
  } catch (err) {
    console.error('[TELEMEDICINE] Error verifying incident ownership:', err.message);
    return res.status(500).json({ error: 'Failed to verify incident details' });
  }

  const requestId = `CON-${Date.now()}`;
  const consultRequest = {
    id: requestId,
    incidentId,
    speciality,
    urgency: urgency || 'HIGH',
    notes: notes || '',
    requestedBy: req.user.id,
    requestedFromHospital: req.user.hospital_id,
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  activeConsultRequests[requestId] = consultRequest;

  // Broadcast socket alert to all specialists online
  const io = req.app.get('socketio');
  if (io) {
    io.to(`speciality_${speciality.toLowerCase()}`).emit('consult-request', consultRequest);
    console.log(`[TELEMEDICINE] Broadcasted consult request: ${requestId} to speciality_${speciality.toLowerCase()}`);
  }

  return res.json({ message: 'Consultation request filed successfully', request: consultRequest });
});

/**
 * @route POST /api/tele/accept-consult/:requestId
 * @desc Accept a consultation request and create a Daily.co WebRTC room
 */
router.post('/accept-consult/:requestId', verifyToken(['doctor']), async (req, res) => {
  const { requestId } = req.params;
  const consult = activeConsultRequests[requestId];
  if (!consult) return res.status(404).json({ error: 'Consultation request not found or expired' });

  consult.status = 'accepted';
  consult.acceptedBy = req.user.id;

  let roomUrl = `https://api.daily.co/v1/rooms/consult-${requestId}`; // Fallback mock URL

  // If daily API is available, call it to create a room
  if (process.env.DAILY_CO_API_KEY && process.env.DAILY_CO_API_KEY !== 'your_daily_co_key') {
    try {
      const response = await axios.post(
        'https://api.daily.co/v1/rooms',
        {
          name: `consult-${requestId}`,
          privacy: 'public',
          properties: { enable_chat: true }
        },
        {
          headers: { Authorization: `Bearer ${DAILY_CO_API_KEY}` }
        }
      );
      roomUrl = response.data.url;
    } catch (err) {
      console.error('[DAILY.CO ERROR] Room creation failed, using fallback:', err.message);
    }
  }

  consult.roomUrl = roomUrl;

  // Log to AuditLog
  await AuditLog.create({
    user_id: req.user.id,
    action: 'TELE_CONSULT_STARTED',
    resource: 'ConsultRequest',
    resource_id: requestId,
    ip_address: req.ip || req.connection.remoteAddress,
    details: { incidentId: consult.incidentId, roomUrl }
  });

  // Emit socket event to requester that consult has been accepted
  const io = req.app.get('socketio');
  if (io) {
    io.emit('consult-accepted', { requestId, roomUrl, doctorName: req.user.name });
  }

  return res.json({ message: 'Consult accepted', consult });
});

/**
 * @route GET /api/tele/specialists
 * @desc Get available specialists across hospitals
 */
router.get('/specialists', verifyToken(['doctor', 'paramedic', 'hospital_admin']), async (req, res) => {
  const { speciality } = req.query;
  try {
    const queryOpts = {
      where: { role: 'doctor', is_active: true }
    };
    const doctors = await User.findAll(queryOpts);

    const specialists = doctors.map(doc => ({
      id: doc.id,
      name: doc.name,
      speciality: speciality || 'Cardiology', // Simulated/Mapped speciality field
      hospitalId: doc.hospital_id,
      isOnline: true
    }));

    return res.json(specialists);
  } catch (err) {
    console.error('[TELEMEDICINE ERROR] specialists query failed:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve online specialists' });
  }
});

module.exports = router;
