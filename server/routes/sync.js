const express = require('express');
const router = express.Router();
const { Incident, AuditLog } = require('../utils/db');
const { verifyToken } = require('../middleware/auth');

/**
 * Calculates the NEWS2 Score based on clinical vital metrics.
 */
function calculateNEWS2(hr, sp, sys, rr, temp) {
  let score = 0;
  
  if (hr) {
    const hrVal = parseInt(hr);
    if (hrVal <= 40 || hrVal >= 131) score += 3;
    else if ((hrVal >= 41 && hrVal <= 50) || (hrVal >= 111 && hrVal <= 130)) score += 1;
    else if (hrVal >= 91 && hrVal <= 110) score += 1;
  }
  
  if (sp) {
    const spVal = parseInt(sp);
    if (spVal <= 91) score += 3;
    else if (spVal >= 92 && spVal <= 93) score += 2;
    else if (spVal >= 94 && spVal <= 95) score += 1;
  }
  
  if (sys) {
    const sysVal = parseInt(sys);
    if (sysVal <= 90 || sysVal >= 220) score += 3;
    else if (sysVal >= 91 && sysVal <= 100) score += 2;
    else if (sysVal >= 101 && sysVal <= 110) score += 1;
  }
  
  if (rr) {
    const rrVal = parseInt(rr);
    if (rrVal <= 8 || rrVal >= 25) score += 3;
    else if (rrVal >= 21 && rrVal <= 24) score += 2;
    else if (rrVal >= 9 && rrVal <= 11) score += 1;
  }
  
  if (temp) {
    const tempVal = parseFloat(temp);
    if (tempVal <= 35.0) score += 3;
    else if (tempVal >= 39.1) score += 2;
    else if ((tempVal >= 35.1 && tempVal <= 36.0) || (tempVal >= 38.1 && tempVal <= 39.0)) score += 1;
  }
  
  return score;
}

/**
 * @route POST /api/sync/batch
 * @desc Sync offline-queued vitals and GPS logs for an active incident
 */
router.post('/batch', verifyToken(['paramedic', 'doctor', 'hospital_admin']), async (req, res) => {
  const { incidentId, gpsQueue, vitalsQueue } = req.body;
  
  if (!incidentId) {
    return res.status(400).json({ error: 'Incident ID is required' });
  }

  try {
    const whereClause = { id: incidentId };
    if (['doctor', 'hospital_admin', 'paramedic'].includes(req.user.role)) {
      whereClause.hospital_id = req.user.hospital_id;
    }
    const incident = await Incident.findOne({ where: whereClause });
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Append GPS logs
    const newGpsLogs = gpsQueue || [];
    if (newGpsLogs.length > 0) {
      const existingGps = incident.gps_log || [];
      incident.gps_log = [...existingGps, ...newGpsLogs];
      
      // Update incident's current coordinates to the latest synced point
      const latestPoint = newGpsLogs[newGpsLogs.length - 1];
      if (latestPoint && latestPoint.latitude && latestPoint.longitude) {
        incident.pickup_lat = latestPoint.latitude;
        incident.pickup_lng = latestPoint.longitude;
      }
    }

    // Append Vitals logs
    const newVitalsLogs = vitalsQueue || [];
    if (newVitalsLogs.length > 0) {
      const existingVitals = incident.vitals_log || [];
      incident.vitals_log = [...existingVitals, ...newVitalsLogs];
      
      // Recalculate NEWS2 score based on the latest vital reading in the synced batch
      const latestVitals = newVitalsLogs[newVitalsLogs.length - 1];
      if (latestVitals) {
        const score = calculateNEWS2(
          latestVitals.heartRate,
          latestVitals.spo2,
          latestVitals.systolic,
          latestVitals.respRate,
          latestVitals.temp
        );
        incident.news2_score = score;
      }
    }

    await incident.save();

    // Broadcast live update over websockets to the connected hospital and admin screens
    const io = req.app.get('socketio');
    if (io) {
      // Broadcast location update
      if (newGpsLogs.length > 0) {
        const latestPoint = newGpsLogs[newGpsLogs.length - 1];
        io.to(`mission_${incidentId}`).emit('location-update', {
          incidentId,
          lat: latestPoint.latitude,
          lng: latestPoint.longitude,
          speed: latestPoint.speed || 0,
          heading: latestPoint.heading || 0,
          accuracy: latestPoint.accuracy || 0,
          isSynced: true
        });
      }
      
      // Broadcast vitals update
      if (newVitalsLogs.length > 0) {
        const latestVitals = newVitalsLogs[newVitalsLogs.length - 1];
        io.to(`mission_${incidentId}`).emit('vitals-update', {
          incidentId,
          vitals: latestVitals,
          isSynced: true
        });
      }
    }

    // Write to HIPAA AuditLog
    await AuditLog.create({
      user_id: req.user.id,
      action: 'TELEMETRY_SYNC',
      resource: 'Incident',
      resource_id: incidentId,
      ip_address: req.ip || req.connection.remoteAddress,
      details: {
        gpsRecordsCount: newGpsLogs.length,
        vitalsRecordsCount: newVitalsLogs.length,
        news2Score: incident.news2_score
      }
    });

    return res.json({
      success: true,
      message: 'Telemetry queue synchronized successfully',
      gpsRecordsSynced: newGpsLogs.length,
      vitalsRecordsSynced: newVitalsLogs.length,
      currentNews2Score: incident.news2_score
    });
  } catch (err) {
    console.error('[SYNC API ERROR]', err.message);
    return res.status(500).json({ error: 'Failed to synchronize telemetry queue' });
  }
});

module.exports = router;
