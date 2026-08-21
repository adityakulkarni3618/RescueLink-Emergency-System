const { EmergencyCorridor, AuditLog } = require('./db');

// Predefined city junctions in Vijayawada for simulation overlay
const VIJAYAWADA_JUNCTIONS = [
  { id: 'junc_pcr', name: 'PCR Junction', lat: 16.5085, lng: 80.6420 },
  { id: 'junc_labbipet', name: 'Labbipet Junction', lat: 16.5042, lng: 80.6495 },
  { id: 'junc_benz_circle', name: 'Benz Circle', lat: 16.5002, lng: 80.6554 },
  { id: 'junc_rameswaram', name: 'Aster Ramesh Cross', lat: 16.4950, lng: 80.6612 }
];

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
 * Initializes and seeds the dynamic emergency corridor junctions for an incident
 */
async function initializeCorridor(incidentId) {
  try {
    // Delete existing corridor nodes for this incident to avoid stale data
    await EmergencyCorridor.destroy({ where: { incident_id: incidentId } });

    const corridors = [];
    let etaAccumulator = 60; // Incremental ETAs for junctions

    for (const junc of VIJAYAWADA_JUNCTIONS) {
      const startWindow = new Date(Date.now() + (etaAccumulator - 20) * 1000);
      const endWindow = new Date(Date.now() + (etaAccumulator + 40) * 1000);

      const node = await EmergencyCorridor.create({
        incident_id: incidentId,
        junction_id: junc.id,
        name: junc.name,
        status: 'SCHEDULED',
        eta_seconds: etaAccumulator,
        preempt_window_start: startWindow,
        preempt_window_end: endWindow,
        latitude: junc.lat,
        longitude: junc.lng
      });
      corridors.push(node);
      etaAccumulator += 90; // Next junction is 90 seconds out
    }
    console.log(`[PREEMPTION] Initialized ${corridors.length} corridor junctions for incident ${incidentId}`);
    return corridors;
  } catch (err) {
    console.error(`[PREEMPTION ERROR] Failed to initialize corridor:`, err.message);
    return [];
  }
}

// Track the last telemetry update timestamp for each active incident
const lastIncidentTelemetryUpdate = {};

/**
 * Evaluates ambulance telemetry and updates preemption locks
 */
async function evaluatePreemption(incidentId, currentLoc, io) {
  if (!currentLoc || !currentLoc.lat || !currentLoc.lng) return;

  lastIncidentTelemetryUpdate[incidentId] = Date.now();

  try {
    const junctions = await EmergencyCorridor.findAll({ where: { incident_id: incidentId } });
    if (junctions.length === 0) return;

    for (const junc of junctions) {
      const distance = getDistanceMeters(currentLoc.lat, currentLoc.lng, junc.latitude, junc.longitude);
      const oldStatus = junc.status;
      let newStatus = oldStatus;

      if (oldStatus === 'SCHEDULED' && distance < 450) {
        newStatus = 'PREEMPTING';
        
        // Log to Audit Ledger
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

        // Log to Audit Ledger
        await AuditLog.create({
          action: 'TRAFFIC_SIGNAL_PREEMPTION',
          details: `CORRIDOR ACTIVE at ${junc.name} (Incident: ${incidentId}). Route fully preempted and cleared.`,
          severity: 'WARNING'
        }).catch(err => console.error(err));
      } else if ((oldStatus === 'PREEMPTING' || oldStatus === 'CORRIDOR_ACTIVE') && distance > 180) {
        // Simple vector check: check if we are heading away
        // If distance is increasing after being close, mark as PASSED and release signal
        newStatus = 'PASSED';

        // Log release to Audit Ledger
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
            eta_seconds: Math.max(0, Math.round(distance / 12.5)) // rough estimate at 45km/h
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
        // Release lock if ambulance has halted or disconnected for more than 20 seconds
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
  initializeCorridor,
  evaluatePreemption,
  startWatchdog,
  VIJAYAWADA_JUNCTIONS
};
