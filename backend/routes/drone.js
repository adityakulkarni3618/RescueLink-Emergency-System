const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { MedicalDrone } = require('../utils/db');
const { logAudit } = require('../utils/auditLogger');

// Helper for Haversine Distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * @route GET /api/drone/fleet
 * @desc Retrieve active emergency drone fleet status
 */
router.get('/fleet', verifyToken(), async (req, res) => {
  try {
    let drones = await MedicalDrone.findAll({ order: [['createdAt', 'ASC']] });

    // Seed default drone fleet if empty
    if (drones.length === 0) {
      drones = await MedicalDrone.bulkCreate([
        { drone_code: 'DRONE-ALPHA-AED', payload_capacity_kg: 4.5, battery_pct: 98, status: 'IDLE', payload_type: 'AED', current_lat: 18.5204, current_lng: 73.8567 },
        { drone_code: 'DRONE-BRAVO-BLOOD', payload_capacity_kg: 6.0, battery_pct: 92, status: 'IDLE', payload_type: 'BLOOD_BAG', current_lat: 18.5300, current_lng: 73.8400 },
        { drone_code: 'DRONE-CHARLIE-EPI', payload_capacity_kg: 3.5, battery_pct: 100, status: 'IDLE', payload_type: 'EPI_PEN', current_lat: 18.5100, current_lng: 73.8700 }
      ]);
    }

    return res.json(drones);
  } catch (err) {
    console.error('[DRONE ROUTE ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to retrieve drone fleet' });
  }
});

/**
 * @route POST /api/drone/dispatch
 * @desc Dispatch nearest medical drone with specified payload (AED/Blood/EpiPen)
 */
router.post('/dispatch', verifyToken(), async (req, res) => {
  const { target_lat, target_lng, payload_type, incident_id } = req.body;

  if (!target_lat || !target_lng) {
    return res.status(400).json({ error: 'Target latitude and longitude are required.' });
  }

  try {
    let drones = await MedicalDrone.findAll({ where: { status: 'IDLE' } });
    if (drones.length === 0) {
      // Reset returning drones to idle for demo readiness
      await MedicalDrone.update({ status: 'IDLE' }, { where: {} });
      drones = await MedicalDrone.findAll({ where: { status: 'IDLE' } });
    }

    // Filter by matching payload if requested, else pick closest
    let candidateDrones = drones.filter(d => !payload_type || d.payload_type === payload_type);
    if (candidateDrones.length === 0) candidateDrones = drones;

    let nearestDrone = null;
    let minDistance = Infinity;

    for (const drone of candidateDrones) {
      const dist = calculateDistance(drone.current_lat, drone.current_lng, target_lat, target_lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestDrone = drone;
      }
    }

    if (!nearestDrone) {
      return res.status(404).json({ error: 'No active drones available in range.' });
    }

    const flightTimeMin = Math.ceil((minDistance / nearestDrone.speed_kmh) * 60);

    await nearestDrone.update({
      status: 'DISPATCHED',
      payload_type: payload_type || nearestDrone.payload_type,
      target_lat: parseFloat(target_lat),
      target_lng: parseFloat(target_lng),
      assigned_incident_id: incident_id || `INC-${Date.now()}`
    });

    const io = req.app.get('socketio');
    if (io) {
      io.emit('drone-dispatched', { drone: nearestDrone, distanceKm: minDistance.toFixed(2), etaMinutes: flightTimeMin });
    }

    await logAudit(
      'DRONE_NETWORK',
      'DISPATCH_DRONE',
      { droneCode: nearestDrone.drone_code, payload: nearestDrone.payload_type, distanceKm: minDistance.toFixed(2), etaMin: flightTimeMin },
      'CRITICAL',
      req.user.id,
      req.ip || req.connection.remoteAddress
    );

    return res.json({
      message: `Medical Drone ${nearestDrone.drone_code} Dispatched!`,
      drone: nearestDrone,
      distanceKm: parseFloat(minDistance.toFixed(2)),
      etaMinutes: flightTimeMin
    });
  } catch (err) {
    console.error('[DRONE DISPATCH ERROR]', err.message);
    return res.status(500).json({ error: 'Drone dispatch failed' });
  }
});

/**
 * @route POST /api/drone/telemetry
 * @desc Update live drone telemetry position & status
 */
router.post('/telemetry', verifyToken(), async (req, res) => {
  const { drone_code, current_lat, current_lng, battery_pct, status } = req.body;

  try {
    const drone = await MedicalDrone.findOne({ where: { drone_code } });
    if (!drone) return res.status(404).json({ error: 'Drone not found' });

    await drone.update({
      current_lat: current_lat !== undefined ? parseFloat(current_lat) : drone.current_lat,
      current_lng: current_lng !== undefined ? parseFloat(current_lng) : drone.current_lng,
      battery_pct: battery_pct !== undefined ? parseInt(battery_pct, 10) : drone.battery_pct,
      status: status || drone.status
    });

    return res.json({ message: 'Telemetry updated', drone });
  } catch (err) {
    return res.status(500).json({ error: 'Telemetry update failed' });
  }
});

module.exports = router;
