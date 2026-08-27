const { Hospital } = require('../utils/db');
const { getRealRoute } = require('./routing');

const calcDist = (pos1, pos2) => {
  if (!pos1 || !pos2) return 999;
  const lat1 = pos1.lat !== undefined ? pos1.lat : pos1[0];
  const lng1 = pos1.lng !== undefined ? pos1.lng : pos1[1];
  const lat2 = pos2.lat !== undefined ? pos2.lat : pos2[0];
  const lng2 = pos2.lng !== undefined ? pos2.lng : pos2[1];
  
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

async function rankHospitals(pickupLat, pickupLng) {
  const registeredHospitals = await Hospital.findAll({ where: { is_active: true } });
  
  const ranked = await Promise.all(registeredHospitals.map(async (h) => {
    const route = await getRealRoute(pickupLat, pickupLng, h.lat, h.lng);
    const distanceKm = route.distanceMeters / 1000;
    const durationSeconds = route.durationSeconds;
    
    let score = 100;
    score -= (distanceKm * 10);
    const icuBeds = h.icu_beds || 10;
    const ventilators = h.ventilators || 5;
    score += (icuBeds * 5);
    score += (ventilators * 8);

    return {
      hospital: h,
      distanceKm: Number(distanceKm.toFixed(2)),
      etaSeconds: durationSeconds,
      score: Math.max(0, Math.round(score)),
      icuBeds,
      ventilators
    };
  }));

  return ranked.sort((a, b) => b.score - a.score);
}

function startHospitalMatchingAgent(missionId, io, activeRequests) {
  const interval = setInterval(async () => {
    const req = activeRequests[missionId];
    if (!req || ['hospital_confirmed', 'closed', 'cancelled', 'escalated'].includes(req.status)) {
      clearInterval(interval);
      return;
    }
    try {
      const ranked = await rankHospitals(req.userLocation.lat, req.userLocation.lng);
      io.to(`mission_${missionId}`).emit('hospital:recommendations-updated', {
        top: ranked.slice(0, 3).map(r => ({
          hospitalId: r.hospital.id,
          name: r.hospital.name,
          etaSeconds: r.etaSeconds,
          distanceKm: r.distanceKm,
          score: r.score,
          icuBeds: r.icuBeds,
          ventilators: r.ventilators
        }))
      });
    } catch (err) {
      console.error('[HOSPITAL AGENT ERROR]', err.message);
    }
  }, 30000);
}

async function checkForBetterHospitalMidTransport(missionId, currentLat, currentLng, io, activeRequests) {
  const req = activeRequests[missionId];
  if (!req || req.status !== 'en_route_to_hospital' || !req.hospitalId) return;

  const currentRoute = await getRealRoute(currentLat, currentLng, req.assignedHospital.lat, req.assignedHospital.lng);
  if (!currentRoute) return;

  if (!req.confirmed_eta_seconds) {
    req.confirmed_eta_seconds = currentRoute.durationSeconds;
  }
  const originalEta = req.confirmed_eta_seconds;
  const delayRatio = currentRoute.durationSeconds / originalEta;

  if (delayRatio > 1.25 || (currentRoute.durationSeconds - originalEta) > 300) {
    const alternatives = await rankHospitals(currentLat, currentLng);
    const better = alternatives.find(a => 
      a.hospital.id !== req.hospitalId && a.etaSeconds < currentRoute.durationSeconds * 0.85
    );
    if (better) {
      console.log(`[REROUTE SUGGESTION] Suggesting alternative hospital ${better.hospital.name} (ETA: ${better.etaSeconds}s) for mission ${missionId}`);
      io.to(`mission_${missionId}`).emit('corridor:reroute-suggested', {
        currentEtaSeconds: currentRoute.durationSeconds,
        alternative: { 
          hospitalId: better.hospital.id,
          hospitalName: better.hospital.name, 
          etaSeconds: better.etaSeconds,
          distanceKm: better.distanceKm
        }
      });
      io.to(`hospital:${req.hospitalId}`).emit('mission:possible-reroute-pending', { missionId });
    }
  }
}

module.exports = { rankHospitals, startHospitalMatchingAgent, checkForBetterHospitalMidTransport };
