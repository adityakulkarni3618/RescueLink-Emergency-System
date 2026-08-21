const crypto = require('crypto');
const { EmergencyCorridor, AuditLog } = require('./db');

// Secure Key for telemetry validation (loaded from environment)
const TELEMETRY_SHARED_SECRET = process.env.TELEMETRY_SHARED_SECRET || 'emergency-corridor-secure-token-108';

/**
 * Standard Kalman Filter state tracker to smooth GPS drift
 */
class GPSKalmanFilter {
  constructor() {
    this.Q = 0.000001; // Process variance
    this.R = 0.00001;  // Measurement variance
    this.lat = null;
    this.lng = null;
    this.P = 1.0;      // Estimation error covariance
  }

  filter(measuredLat, measuredLng) {
    if (this.lat === null || this.lng === null) {
      this.lat = measuredLat;
      this.lng = measuredLng;
      return { lat: measuredLat, lng: measuredLng };
    }

    // Time update (prediction)
    this.P = this.P + this.Q;

    // Measurement update (correction)
    const K = this.P / (this.P + this.R); // Kalman gain
    this.lat = this.lat + K * (measuredLat - this.lat);
    this.lng = this.lng + K * (measuredLng - this.lng);
    this.P = (1 - K) * this.P;

    return { lat: this.lat, lng: this.lng };
  }
}

// Track filters for active incidents in-memory
const activeKalmanFilters = {};
const lastIncidentTelemetryUpdate = {};

/**
 * Calculates distance in meters using Haversine formula
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Dynamically extract and register junctions along any OSRM route polyline
 */
async function initializeCorridorForRoute(incidentId, routeCoordinates) {
  try {
    await EmergencyCorridor.destroy({ where: { incident_id: incidentId } });

    if (!routeCoordinates || routeCoordinates.length < 2) return [];

    const corridors = [];
    let junctionIndex = 1;

    // Select nodes along the route path coordinates spaced approximately every 800 to 1200 meters
    let lastJunctionPoint = routeCoordinates[0];
    let etaAccumulator = 45; // Start window ETA

    for (let i = 1; i < routeCoordinates.length - 1; i++) {
      const coord = routeCoordinates[i];
      const distFromLast = getDistanceMeters(lastJunctionPoint.lat, lastJunctionPoint.lng, coord.lat, coord.lng);

      if (distFromLast >= 1000) { // Spacing of ~1km
        const startWindow = new Date(Date.now() + (etaAccumulator - 20) * 1000);
        const endWindow = new Date(Date.now() + (etaAccumulator + 40) * 1000);

        const nodeName = `Dynamic Junction #${junctionIndex}`;
        const node = await EmergencyCorridor.create({
          incident_id: incidentId,
          junction_id: `junc_${incidentId}_${junctionIndex}`,
          name: nodeName,
          status: 'SCHEDULED',
          eta_seconds: etaAccumulator,
          preempt_window_start: startWindow,
          preempt_window_end: endWindow,
          latitude: coord.lat,
          longitude: coord.lng
        });

        corridors.push(node);
        junctionIndex++;
        lastJunctionPoint = coord;
        etaAccumulator += 80;
      }
    }

    console.log(`[REAL-WORLD PREEMPTION] Generated ${corridors.length} dynamic route junctions along polyline for incident ${incidentId}`);
    return corridors;
  } catch (err) {
    console.error(`[PREEMPTION INIT ERROR]`, err.message);
    return [];
  }
}

/**
 * Cryptographically validates telemetry payloads using shared HMAC keys
 */
function verifyTelemetrySignature(payload, signature) {
  if (!signature) return false;
  try {
    const hash = crypto
      .createHmac('sha256', TELEMETRY_SHARED_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

/**
 * Evaluates ambulance telemetry, applies Kalman filter, and updates preemption state
 */
async function evaluatePreemption(incidentId, rawLoc, io, signature = null) {
  if (!rawLoc || !rawLoc.lat || !rawLoc.lng) return;

  // Real-world security verification
  if (process.env.NODE_ENV === 'production' && signature) {
    const isValid = verifyTelemetrySignature({ lat: rawLoc.lat, lng: rawLoc.lng, timestamp: rawLoc.timestamp }, signature);
    if (!isValid) {
      console.warn(`[SECURITY WARNING] Telemetry signature verification failed for incident ${incidentId}. Ignoring payload.`);
      return;
    }
  }

  // Update last update timestamp for watchdog release
  lastIncidentTelemetryUpdate[incidentId] = Date.now();

  // Apply Kalman Filter to smooth GPS drift
  if (!activeKalmanFilters[incidentId]) {
    activeKalmanFilters[incidentId] = new GPSKalmanFilter();
  }
  const currentLoc = activeKalmanFilters[incidentId].filter(rawLoc.lat, rawLoc.lng);

  try {
    const junctions = await EmergencyCorridor.findAll({ where: { incident_id: incidentId } });
    if (junctions.length === 0) return;

    for (const junc of junctions) {
      const distance = getDistanceMeters(currentLoc.lat, currentLoc.lng, junc.latitude, junc.longitude);
      const oldStatus = junc.status;
      let newStatus = oldStatus;

      if (oldStatus === 'SCHEDULED' && distance < 450) {
        newStatus = 'PREEMPTING';

        await AuditLog.create({
          action: 'TRAFFIC_SIGNAL_PREEMPTION',
          details: `Preempt window active for junction ${junc.name} (Incident: ${incidentId}). Initiating dynamic green wave.`,
          severity: 'INFO'
        }).catch(err => console.error(err));

        if (io) {
          io.to(`mission_${incidentId}`).emit('corridor:preempt_junction', {
            incidentId,
            junctionId: junc.junction_id,
            name: junc.name,
            status: 'PREEMPTING',
            distance: Math.round(distance)
          });
        }
      } else if (oldStatus === 'PREEMPTING' && distance < 120) {
        newStatus = 'CORRIDOR_ACTIVE';

        await AuditLog.create({
          action: 'TRAFFIC_SIGNAL_PREEMPTION',
          details: `CORRIDOR ACTIVE at ${junc.name} (Incident: ${incidentId}). Route fully preempted and cleared.`,
          severity: 'WARNING'
        }).catch(err => console.error(err));
      } else if ((oldStatus === 'PREEMPTING' || oldStatus === 'CORRIDOR_ACTIVE') && distance > 180) {
        newStatus = 'PASSED';

        await AuditLog.create({
          action: 'TRAFFIC_SIGNAL_PREEMPTION',
          details: `Ambulance cleared junction bounds for ${junc.name}. Restoring standard traffic cycles.`,
          severity: 'INFO'
        }).catch(err => console.error(err));

        if (io) {
          io.to(`mission_${incidentId}`).emit('corridor:route_cleared', {
            incidentId,
            junctionId: junc.junction_id,
            name: junc.name,
            status: 'PASSED'
          });
        }
      }

      if (newStatus !== oldStatus) {
        junc.status = newStatus;
        await junc.save();

        if (io) {
          io.to(`mission_${incidentId}`).emit('corridor:status_update', {
            incidentId,
            junctionId: junc.junction_id,
            name: junc.name,
            status: newStatus,
            eta_seconds: Math.max(0, Math.round(distance / 12.5))
          });
          io.to('admin_warroom').emit('corridor:status_update', {
            incidentId,
            junctionId: junc.junction_id,
            name: junc.name,
            status: newStatus
          });
        }
      }
    }
  } catch (err) {
    console.error(`[PREEMPTION EVAL ERROR]`, err.message);
  }
}

// Clean inactive preemptions (watchdog)
async function startWatchdog(io, intervalMs = 10000) {
  setInterval(async () => {
    const now = Date.now();
    try {
      const activePreemptions = await EmergencyCorridor.findAll({
        where: {
          status: ['PREEMPTING', 'CORRIDOR_ACTIVE']
        }
      });

      for (const junc of activePreemptions) {
        const lastUpdate = lastIncidentTelemetryUpdate[junc.incident_id] || 0;
        if (lastUpdate && (now - lastUpdate > 20000)) {
          junc.status = 'PASSED';
          await junc.save();

          await AuditLog.create({
            action: 'TRAFFIC_SIGNAL_PREEMPTION',
            details: `WATCHDOG FAILSAFE: Released preemption at ${junc.name} due to telemetry timeout.`,
            severity: 'WARNING'
          }).catch(err => console.error(err));

          if (io) {
            io.to(`mission_${junc.incident_id}`).emit('corridor:status_update', {
              incidentId: junc.incident_id,
              junctionId: junc.junction_id,
              name: junc.name,
              status: 'PASSED'
            });
            io.to(`mission_${junc.incident_id}`).emit('corridor:route_cleared', {
              incidentId: junc.incident_id,
              junctionId: junc.junction_id,
              name: junc.name,
              status: 'PASSED'
            });
            io.to('admin_warroom').emit('corridor:status_update', {
              incidentId: junc.incident_id,
              junctionId: junc.junction_id,
              name: junc.name,
              status: 'PASSED'
            });
          }
          console.log(`[WATCHDOG FAILSAFE] Released junction ${junc.name} for incident ${junc.incident_id}`);
        }
      }
    } catch (err) {
      console.error('[WATCHDOG ERROR]', err.message);
    }
  }, intervalMs);
}

module.exports = {
  initializeCorridorForRoute,
  evaluatePreemption,
  startWatchdog,
  verifyTelemetrySignature
};
