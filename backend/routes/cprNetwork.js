const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { GoodSamaritan } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

/**
 * Haversine formula to compute distance in km between two lat/lng pairs
 */
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @route POST /api/cpr-network/register
 * @desc Register or update a BLS/CPR certified Good Samaritan volunteer
 */
router.post('/register', verifyToken(), async (req, res) => {
  const { name, phone, cpr_license_number, certification_agency, latitude, longitude } = req.body;
  if (!name || !phone || !cpr_license_number) {
    return res.status(400).json({ error: 'Name, phone number, and CPR license number are required.' });
  }

  try {
    let volunteer = await GoodSamaritan.findOne({ where: { phone } });
    if (volunteer) {
      await volunteer.update({
        name,
        cpr_license_number,
        certification_agency: certification_agency || volunteer.certification_agency,
        user_id: req.user ? req.user.id : volunteer.user_id,
        latitude: latitude || volunteer.latitude,
        longitude: longitude || volunteer.longitude,
        is_active: true,
        last_ping: new Date()
      });
    } else {
      volunteer = await GoodSamaritan.create({
        name,
        phone,
        cpr_license_number,
        certification_agency: certification_agency || 'American Heart Association / Red Cross',
        user_id: req.user ? req.user.id : null,
        latitude: latitude || 19.0760,
        longitude: longitude || 72.8777,
        is_active: true
      });
    }

    await logAudit(
      'CPR_NETWORK',
      'REGISTER_VOLUNTEER',
      { volunteerId: volunteer.id, name: volunteer.name },
      'INFO',
      req.user ? req.user.id : null,
      req.ip || req.connection.remoteAddress
    );

    return res.json({ message: 'CPR Volunteer registered successfully', volunteer });
  } catch (err) {
    console.error('[CPR NETWORK ERROR] Registration failed:', err.message);
    return res.status(500).json({ error: 'Failed to register CPR volunteer' });
  }
});

/**
 * @route POST /api/cpr-network/ping
 * @desc Update live GPS coordinates & active status for a volunteer
 */
router.post('/ping', verifyToken(), async (req, res) => {
  const { phone, latitude, longitude, is_active } = req.body;
  try {
    const volunteer = await GoodSamaritan.findOne({
      where: req.user ? { user_id: req.user.id } : { phone }
    });

    if (!volunteer) {
      return res.status(404).json({ error: 'Registered volunteer profile not found' });
    }

    await volunteer.update({
      latitude: latitude !== undefined ? latitude : volunteer.latitude,
      longitude: longitude !== undefined ? longitude : volunteer.longitude,
      is_active: is_active !== undefined ? is_active : volunteer.is_active,
      last_ping: new Date()
    });

    return res.json({ message: 'Status updated', volunteer });
  } catch (err) {
    console.error('[CPR NETWORK ERROR] Ping update failed:', err.message);
    return res.status(500).json({ error: 'Failed to update volunteer position' });
  }
});

/**
 * @route GET /api/cpr-network/nearby
 * @desc Get active CPR volunteers within radius (km) of specified lat/lng
 */
router.get('/nearby', verifyToken(), async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = parseFloat(req.query.radius) || 5.0;

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Valid lat and lng query parameters required' });
  }

  try {
    const volunteers = await GoodSamaritan.findAll({ where: { is_active: true } });
    const nearby = volunteers
      .map(v => {
        const vLat = v.latitude || 19.0760;
        const vLng = v.longitude || 72.8777;
        const dist = getDistanceKm(lat, lng, vLat, vLng);
        return {
          id: v.id,
          name: v.name,
          phone: v.phone,
          certification_agency: v.certification_agency,
          distanceKm: parseFloat(dist.toFixed(2)),
          latitude: vLat,
          longitude: vLng,
          last_ping: v.last_ping
        };
      })
      .filter(v => v.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.json({ count: nearby.length, radiusKm, volunteers: nearby });
  } catch (err) {
    console.error('[CPR NETWORK ERROR] Nearby query failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch nearby CPR volunteers' });
  }
});

/**
 * @route POST /api/cpr-network/alert
 * @desc Dispatch urgent CPR broadcast alert to nearby volunteers for an SOS location
 */
router.post('/alert', verifyToken(), async (req, res) => {
  const { incidentId, latitude, longitude, victimCondition, address } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Emergency location (latitude, longitude) is required' });
  }

  try {
    const volunteers = await GoodSamaritan.findAll({ where: { is_active: true } });
    const alertedVolunteers = volunteers.filter(v => {
      const vLat = v.latitude || 19.0760;
      const vLng = v.longitude || 72.8777;
      return getDistanceKm(latitude, longitude, vLat, vLng) <= 3.0; // 3 km radius for urgent bystander CPR
    });

    // Increment alerts responded counter
    for (const vol of alertedVolunteers) {
      await vol.increment('alerts_responded');
    }

    // Socket.io emit if attached to app
    const io = req.app.get('io');
    if (io) {
      io.emit('cpr-emergency-alert', {
        incidentId,
        latitude,
        longitude,
        victimCondition: victimCondition || 'Out-of-Hospital Cardiac Arrest / Severe Unresponsiveness',
        address: address || 'Current User Geolocation',
        alertedCount: alertedVolunteers.length,
        timestamp: new Date()
      });
    }

    return res.json({
      message: `Emergency CPR alert broadcasted to ${alertedVolunteers.length} nearby volunteers`,
      alertedCount: alertedVolunteers.length,
      volunteers: alertedVolunteers.map(v => ({ id: v.id, name: v.name, phone: v.phone }))
    });
  } catch (err) {
    console.error('[CPR NETWORK ERROR] Broadcast failed:', err.message);
    return res.status(500).json({ error: 'Failed to broadcast CPR alert' });
  }
});

module.exports = router;
