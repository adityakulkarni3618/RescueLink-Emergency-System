const { getRealRoute } = require('./routing');

async function rankAmbulancesByRealETA(pickupLat, pickupLng, ambulancesList, maxCandidates = 15) {
  const candidates = ambulancesList.filter(amb => amb.available && amb.location);

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
  const ranked = await rankAmbulancesByRealETA(pickupLat, pickupLng, Object.values(ambulances));
  const TIER_SIZE = 3;
  const TIER_TIMEOUT_MS = 20000; // 20s
  let offset = 0;

  while (offset < ranked.length) {
    const tier = ranked.slice(offset, offset + TIER_SIZE);
    if (tier.length === 0) break;

    console.log(`[DISPATCH TIER] Request ${requestId}: Notifying Tier (Size: ${tier.length}, Offset: ${offset})`);
    for (const { ambulance } of tier) {
      io.to(ambulance.socketId).emit('incoming-ambulance-request', {
        ...activeRequests[requestId],
        etaSeconds: ranked.find(r => r.ambulance.socketId === ambulance.socketId).etaSeconds,
      });
    }

    const accepted = await waitForClaimOrTimeout(requestId, activeRequests, TIER_TIMEOUT_MS);
    if (accepted) {
      console.log(`[DISPATCH TIER SUCCESS] Request ${requestId} claimed by ambulance: ${accepted.unitId}`);
      return accepted;
    }

    offset += TIER_SIZE;
  }

  console.log(`[DISPATCH TIER EXHAUSTED] No ambulance accepted request ${requestId}. Escalating...`);
  io.to('admin_warroom').emit('warroom:no-ambulance-accepted', { requestId });
  const { Incident } = require('../utils/db');
  await Incident.update({ status: 'cancelled' }, { where: { id: requestId } }).catch(() => {});
  if (activeRequests[requestId]) {
    activeRequests[requestId].status = 'escalated';
    io.to(activeRequests[requestId].userSocket).emit('ambulance-request-response', { id: requestId, status: 'escalated', message: 'No available ambulances accepted the dispatch in your area. Request escalated to city command.' });
  }
  return null;
}

module.exports = { rankAmbulancesByRealETA, dispatchTiered };
