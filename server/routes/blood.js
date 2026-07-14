const express = require('express');
const router = express.Router();
const eraktKoshService = require('../utils/eraktKosh');
const { verifyToken } = require('../middleware/auth');
const { AuditLog } = require('../utils/db');

// In-memory registry of active blood requests (simulating network status)
let activeBloodRequests = [
  {
    id: 'BREQ-9912',
    bloodType: 'O-',
    patientName: 'Aarav Sharma',
    urgency: 'CRITICAL',
    timestamp: Date.now() - 3600000, // 1h ago
    location: { lat: 12.9716, lng: 77.5946 }
  },
  {
    id: 'BREQ-9913',
    bloodType: 'AB-',
    patientName: 'Priya Patel',
    urgency: 'HIGH',
    timestamp: Date.now() - 1800000, // 30m ago
    location: { lat: 12.9616, lng: 77.5846 }
  }
];

/**
 * @route GET /api/blood/banks
 * @desc Get nearby blood banks from eRaktKosh search
 */
router.get('/banks', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    // Default to Bangalore center if not provided
    return res.json(await eraktKoshService.getBloodBanks(12.9716, 77.5946));
  }

  try {
    const banks = await eraktKoshService.getBloodBanks(lat, lng);
    return res.json(banks);
  } catch (err) {
    console.error('[BLOOD ROUTE] Error fetching blood banks:', err.message);
    return res.status(500).json({ error: 'Failed to search blood banks' });
  }
});

/**
 * @route GET /api/blood/requests
 * @desc Get all active emergency blood requests
 */
router.get('/requests', async (req, res) => {
  return res.json(activeBloodRequests);
});

/**
 * @route POST /api/blood/request
 * @desc Create and broadcast an emergency blood request
 */
router.post('/request', async (req, res) => {
  const { bloodType, location, patientName, urgency } = req.body;
  if (!bloodType || !patientName || !urgency) {
    return res.status(400).json({ error: 'Blood type, patient name, and urgency are required' });
  }

  try {
    const newRequest = {
      id: `BREQ-${Date.now().toString().slice(-4)}`,
      bloodType,
      patientName,
      urgency,
      timestamp: Date.now(),
      location: location || { lat: 12.9716, lng: 77.5946 }
    };

    activeBloodRequests.unshift(newRequest);

    // Broadcast socket event using the app's socket instance if accessible
    const io = req.app.get('socketio');
    if (io) {
      io.emit('blood-emergency-broadcast', newRequest);
      console.log(`[BLOOD ROUTE] Broadcasted blood emergency request for ${bloodType}`);
    }

    // Attempt to log audit log if authenticated
    try {
      if (req.user) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'BLOOD_EMERGENCY_REQUEST',
          resource: 'BloodRequest',
          resource_id: newRequest.id,
          ip_address: req.ip || req.connection.remoteAddress,
          details: { bloodType, patientName, urgency }
        });
      }
    } catch (e) {
      console.warn('[BLOOD AUDIT ERROR] Audit log creation failed:', e.message);
    }

    return res.status(201).json(newRequest);
  } catch (err) {
    console.error('[BLOOD ROUTE] Error creating blood request:', err.message);
    return res.status(500).json({ error: 'Failed to broadcast blood request' });
  }
});

module.exports = router;
