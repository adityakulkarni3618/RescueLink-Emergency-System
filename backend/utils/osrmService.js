const fetch = require('node-fetch');

// Self-hosted OSRM endpoint fallback (defaults to localhost daemon or demo public router)
const OSRM_ROUTER_URL = process.env.OSRM_ROUTER_URL || 'http://localhost:5000';

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// In-memory registry of traffic congestion speeds mapped by coordinate keys (rounded to 3 decimals ~110m)
const trafficGridCongestions = {};

/**
 * Update dynamic traffic congestion speed factor for a coordinate sector (e.g. 0.2 represents heavy delay)
 */
function updateTrafficSpeed(lat, lng, speedFactor = 0.5) {
  const key = `${parseFloat(lat).toFixed(3)}_${parseFloat(lng).toFixed(3)}`;
  trafficGridCongestions[key] = parseFloat(speedFactor);
  console.log(`[OSRM TRAFFIC] Dynamic traffic speed factor updated at ${key} to ${speedFactor}x`);
}

/**
 * Get route waypoints from self-hosted OSRM routing engine
 */
async function getSmartRoute(origin, dest) {
  if (!origin || !dest) return null;
  const url = `${OSRM_ROUTER_URL}/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const coords = data.routes[0].geometry.coordinates;
        return coords.map(c => [c[1], c[0]]);
      }
    }
  } catch (err) {
    console.warn(`[OSRM FALLBACK] Routing daemon offline. Generating A* mock routing vector:`, err.message);
  }

  const steps = 15;
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = origin.lat + (dest.lat - origin.lat) * ratio;
    const lng = origin.lng + (dest.lng - origin.lng) * ratio;
    path.push([lat, lng]);
  }
  return path;
}

/**
 * Get estimated transit duration and distance from self-hosted OSRM
 */
async function getETA(originLat, originLng, destLat, destLng) {
  const url = `${OSRM_ROUTER_URL}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
  
  let congestionMultiplier = 1.0;
  const originKey = `${parseFloat(originLat).toFixed(3)}_${parseFloat(originLng).toFixed(3)}`;
  const destKey = `${parseFloat(destLat).toFixed(3)}_${parseFloat(destLng).toFixed(3)}`;
  if (trafficGridCongestions[originKey]) {
    congestionMultiplier = 1 / trafficGridCongestions[originKey];
  } else if (trafficGridCongestions[destKey]) {
    congestionMultiplier = 1 / trafficGridCongestions[destKey];
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes[0]) {
        const route = data.routes[0];
        return {
          etaMinutes: parseFloat(((route.duration / 60) * congestionMultiplier).toFixed(1)),
          distanceKm: parseFloat((route.distance / 1000).toFixed(2))
        };
      }
    }
  } catch (err) {
    // Fallback math calculation
  }

  const dist = haversineDistance(originLat, originLng, destLat, destLng);
  const avgSpeed = 45; // km/h
  const timeHours = dist / avgSpeed;
  return {
    etaMinutes: parseFloat((timeHours * 60 * 1.2 * congestionMultiplier).toFixed(1)),
    distanceKm: parseFloat(dist.toFixed(2))
  };
}

module.exports = {
  getSmartRoute,
  getETA,
  haversineDistance,
  updateTrafficSpeed,
  trafficGridCongestions
};
