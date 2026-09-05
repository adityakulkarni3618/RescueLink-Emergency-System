const { getRealRoute } = require('./routing');
const { haversineDistance } = require('../utils/maps');
const whatsappService = require('../utils/whatsapp');
const { createSystemNotification } = require('../utils/systemNotifications');

const MAX_DISPATCH_RADIUS_KM = parseFloat(process.env.MAX_DISPATCH_RADIUS_KM) || 35; // Default 35 km max operating radius

async function rankAmbulancesByRealETA(pickupLat, pickupLng, liveAmbulancesList = [], maxCandidates = 15) {
  // 1. Fetch ALL DB registered ambulances (regardless of active toggle status)
  let dbAmbulances = [];
  try {
    const { Ambulance } = require('../utils/db');
    const records = await Ambulance.findAll();
    dbAmbulances = records.map(r => typeof r.toJSON === 'function' ? r.toJSON() : r);
  } catch (err) {
    console.error('[DISPATCH AGENT DB FETCH ERROR]', err.message);
  }

  // 2. Combine DB registered units + live socket units
  const combinedMap = new Map();

  // Add DB registered ambulances
  for (const amb of dbAmbulances) {
    const key = amb.vehicleNo || amb.id;
    combinedMap.set(key, {
      unitId: amb.vehicleNo || amb.id,
      driverName: amb.driverName || 'Registered Paramedic',
      vehicleNo: amb.vehicleNo,
      contactInfo: amb.contactInfo,
      type: amb.type || 'BLS',
      location: { lat: amb.latitude || pickupLat, lng: amb.longitude || pickupLng },
      available: true,
      isOffline: true,
      dbId: amb.id
    });
  }

  // Overlay live online socket ambulances (which take precedence for socketId & live location)
  for (const liveAmb of liveAmbulancesList) {
    if (!liveAmb || !liveAmb.location) continue;
    const key = liveAmb.vehicleNo || liveAmb.unitId || liveAmb.id;
    const existing = combinedMap.get(key);
    combinedMap.set(key, {
      ...existing,
      ...liveAmb,
      isOffline: false,
      socketId: liveAmb.socketId || liveAmb.id
    });
  }

  // 3. Filter candidates within operating radius
  let candidates = Array.from(combinedMap.values()).filter(amb => {
    if (!amb.available || !amb.location) return false;
    const distKm = haversineDistance(pickupLat, pickupLng, amb.location.lat, amb.location.lng);
    return distKm <= MAX_DISPATCH_RADIUS_KM;
  });

  // FALLBACK: If no registered unit is within 35km radius, include all registered units in DB
  if (candidates.length === 0 && combinedMap.size > 0) {
    console.log(`[DISPATCH AGENT] No units within ${MAX_DISPATCH_RADIUS_KM}km. Fallback: Including all ${combinedMap.size} registered units in DB.`);
    candidates = Array.from(combinedMap.values());
  }

  const withEta = await Promise.all(candidates.map(async (amb) => {
    const route = await getRealRoute(amb.location.lat, amb.location.lng, pickupLat, pickupLng);
    return { ambulance: amb, etaSeconds: route.durationSeconds };
  }));

  return withEta.sort((a, b) => a.etaSeconds - b.etaSeconds).slice(0, maxCandidates);
}

async function waitForClaimOrTimeout(requestId, activeRequests, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const req = activeRequests[requestId];
      if (!req) {
        clearInterval(interval);
        resolve(null);
        return;
      }
      if (req.status === 'ambulance_accepted' || req.status === 'ambulance_assigned') {
        clearInterval(interval);
        resolve(req);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 1000);
  });
}

async function dispatchTiered(requestId, pickupLat, pickupLng, io, ambulances, activeRequests) {
  const liveAmbulanceList = ambulances ? Object.values(ambulances) : [];
  const ranked = await rankAmbulancesByRealETA(pickupLat, pickupLng, liveAmbulanceList);
  const TIER_SIZE = 3;
  const TIER_TIMEOUT_MS = 20000; // 20s
  let offset = 0;

  console.log(`[DISPATCH TIER START] Total ranked candidate units (live + DB registered): ${ranked.length}`);

  while (offset < ranked.length) {
    const tier = ranked.slice(offset, offset + TIER_SIZE);
    if (tier.length === 0) break;

    console.log(`[DISPATCH TIER] Request ${requestId}: Notifying Tier (Size: ${tier.length}, Offset: ${offset})`);
    for (const { ambulance, etaSeconds } of tier) {
      // 1. Socket notification if online
      if (ambulance.socketId && io) {
        io.to(ambulance.socketId).emit('incoming-ambulance-request', {
          ...activeRequests[requestId],
          etaSeconds
        });
        console.log(`[SOCKET DISPATCH] Sent incoming-ambulance-request to live socket ${ambulance.socketId}`);
      }

      // 2. System Notification (stored for offline panel login)
      const recipientId = ambulance.vehicleNo || ambulance.unitId || ambulance.dbId;
      createSystemNotification(
        recipientId,
        'ambulance',
        '🚨 EMERGENCY DISPATCH REQUEST',
        `Urgent dispatch assigned near your station (${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}).`,
        { ...activeRequests[requestId], etaSeconds }
      );

      // Also create notification for dbId if distinct
      if (ambulance.dbId && ambulance.dbId !== recipientId) {
        createSystemNotification(
          ambulance.dbId,
          'ambulance',
          '🚨 EMERGENCY DISPATCH REQUEST',
          `Urgent dispatch assigned near your station (${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}).`,
          { ...activeRequests[requestId], etaSeconds }
        );
      }

      // 3. SMS Notification to registered phone number
      if (ambulance.contactInfo) {
        const patientName = activeRequests[requestId]?.patientDetails?.name || 'Emergency Case';
        const smsMsg = `🚨 *RESCUELINK EMERGENCY ALERT*:\nDispatch request assigned near your location (${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}).\nPatient: ${patientName}.\nPlease log into your RescueLink panel to respond immediately.`;
        whatsappService.sendSMS(ambulance.contactInfo, smsMsg).catch(err => {
          console.warn(`[DISPATCH SMS FAIL] Failed to send SMS to ${ambulance.contactInfo}: ${err.message}`);
        });
      }
    }

    const accepted = await waitForClaimOrTimeout(requestId, activeRequests, TIER_TIMEOUT_MS);
    if (accepted) {
      console.log(`[DISPATCH TIER SUCCESS] Request ${requestId} claimed by ambulance: ${accepted.unitId}`);
      return accepted;
    }

    offset += TIER_SIZE;
  }

  console.log(`[DISPATCH TIER EXHAUSTED] No ambulance accepted request ${requestId}. Escalating...`);
  const driverContacts = ranked.map(r => ({
    driverName: r.ambulance.driverName || 'Paramedic Unit',
    contactInfo: r.ambulance.contactInfo || 'Not Listed',
    vehicleNo: r.ambulance.vehicleNo || r.ambulance.unitId || 'EMS Unit'
  }));
  if (io) {
    io.to('admin_warroom').emit('warroom:no-ambulance-accepted', { requestId, driverContacts });
  }

  const { Incident } = require('../utils/db');
  await Incident.update({ status: 'cancelled' }, { where: { id: requestId } }).catch(() => {});
  if (activeRequests[requestId]) {
    activeRequests[requestId].status = 'escalated';
    if (io && activeRequests[requestId].userSocket) {
      io.to(activeRequests[requestId].userSocket).emit('ambulance-request-response', {
        id: requestId,
        status: 'escalated',
        message: 'Request broadcasted to all registered units & SMS alerts sent. Command center notified.'
      });
    }
  }
  return null;
}

module.exports = { rankAmbulancesByRealETA, dispatchTiered };
