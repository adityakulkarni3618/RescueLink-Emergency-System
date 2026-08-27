const fetch = require('node-fetch');

// Priority 1: Self-hosted OSRM (if running, set OSRM_ROUTER_URL in .env)
// Priority 2: Public OSRM demo API (router.project-osrm.org)
// Priority 3: OpenRouteService (free, needs ORS_API_KEY in .env)
// Priority 4: Haversine straight-line fallback
const SELF_HOSTED_OSRM = process.env.OSRM_ROUTER_URL || null;
const PUBLIC_OSRM_URL = 'https://router.project-osrm.org';
const ORS_API_KEY = process.env.ORS_API_KEY || null;
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

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
 * Try fetching route from an OSRM-compatible endpoint.
 * Returns array of {lat, lng} objects on success, null on failure.
 */
async function fetchOsrmRoute(baseUrl, origin, dest) {
  const url = `${baseUrl}/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url, { timeout: 6000 });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.routes && data.routes[0]) {
    return data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
  }
  return null;
}

/**
 * Try fetching route from OpenRouteService as a secondary fallback.
 */
async function fetchORSRoute(origin, dest) {
  if (!ORS_API_KEY) return null;
  try {
    const res = await fetch(ORS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': ORS_API_KEY },
      body: JSON.stringify({ coordinates: [[origin.lng, origin.lat], [dest.lng, dest.lat]], format: 'geojson' }),
      timeout: 8000
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.features && data.features[0]) {
      return data.features[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
    }
  } catch (err) {
    console.warn('[ORS FALLBACK] OpenRouteService failed:', err.message);
  }
  return null;
}

/**
 * Get route waypoints from best available routing engine.
 * Returns array of {lat, lng} objects.
 */
async function getSmartRoute(origin, dest) {
  if (!origin || !dest) return null;

  // Priority 0: Mapbox Directions API with live traffic
  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
  if (MAPBOX_TOKEN) {
    try {
      const { getRealRoute } = require('../services/routing');
      const routeData = await getRealRoute(origin.lat, origin.lng, dest.lat, dest.lng);
      if (routeData && routeData.geometry && routeData.geometry.coordinates) {
        console.log(`[ROUTING] Route fetched from Mapbox Traffic API (${routeData.geometry.coordinates.length} waypoints)`);
        return routeData.geometry.coordinates.map(c => [c[1], c[0]]);
      }
    } catch (err) {
      console.warn('[ROUTING] Mapbox Directions failed, trying fallbacks:', err.message);
    }
  }

  // Priority 1: Self-hosted OSRM
  if (SELF_HOSTED_OSRM) {
    try {
      const route = await fetchOsrmRoute(SELF_HOSTED_OSRM, origin, dest);
      if (route) {
        console.log(`[ROUTING] Route fetched from self-hosted OSRM (${route.length} points)`);
        return route.map(p => [p.lat, p.lng]);
      }
    } catch (err) {
      console.warn('[ROUTING] Self-hosted OSRM failed, trying public OSRM:', err.message);
    }
  }

  // Priority 2: Public OSRM demo router
  try {
    const route = await fetchOsrmRoute(PUBLIC_OSRM_URL, origin, dest);
    if (route) {
      console.log(`[ROUTING] Route fetched from public OSRM (${route.length} points)`);
      return route.map(p => [p.lat, p.lng]);
    }
  } catch (err) {
    console.warn('[ROUTING] Public OSRM failed, trying ORS:', err.message);
  }

  // Priority 3: OpenRouteService
  const orsRoute = await fetchORSRoute(origin, dest);
  if (orsRoute) {
    console.log(`[ROUTING] Route fetched from OpenRouteService (${orsRoute.length} points)`);
    return orsRoute.map(p => [p.lat, p.lng]);
  }

  // Priority 4: Straight-line interpolation fallback
  console.warn('[ROUTING] All routing APIs failed — using straight-line fallback');
  const steps = 20;
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
 * Same as getSmartRoute but returns {lat, lng} objects instead of [lat, lng] arrays.
 * Used by corridor initialization.
 */
async function getSmartRouteObjects(origin, dest) {
  if (!origin || !dest) return null;

  // Priority 0: Mapbox Directions API with live traffic
  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
  if (MAPBOX_TOKEN) {
    try {
      const { getRealRoute } = require('../services/routing');
      const routeData = await getRealRoute(origin.lat, origin.lng, dest.lat, dest.lng);
      if (routeData && routeData.geometry && routeData.geometry.coordinates) {
        return routeData.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
      }
    } catch (err) {
      console.warn('[ROUTING] Mapbox Objects Directions failed, trying fallbacks:', err.message);
    }
  }

  if (SELF_HOSTED_OSRM) {
    try {
      const route = await fetchOsrmRoute(SELF_HOSTED_OSRM, origin, dest);
      if (route) return route;
    } catch {}
  }

  try {
    const route = await fetchOsrmRoute(PUBLIC_OSRM_URL, origin, dest);
    if (route) return route;
  } catch {}

  const orsRoute = await fetchORSRoute(origin, dest);
  if (orsRoute) return orsRoute;

  // Straight-line fallback
  const steps = 20;
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    path.push({
      lat: origin.lat + (dest.lat - origin.lat) * ratio,
      lng: origin.lng + (dest.lng - origin.lng) * ratio
    });
  }
  return path;
}

/**
 * Get estimated transit duration and distance from best available routing engine.
 */
async function getETA(originLat, originLng, destLat, destLng) {
  // Priority 0: Mapbox Directions API with live traffic
  const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;
  if (MAPBOX_TOKEN) {
    try {
      const { getRealRoute } = require('../services/routing');
      const routeData = await getRealRoute(originLat, originLng, destLat, destLng);
      if (routeData) {
        return {
          etaMinutes: parseFloat((routeData.durationSeconds / 60).toFixed(1)),
          distanceKm: parseFloat((routeData.distanceMeters / 1000).toFixed(2))
        };
      }
    } catch (err) {
      console.warn('[ROUTING] Mapbox ETA failed, trying fallbacks:', err.message);
    }
  }

  let congestionMultiplier = 1.0;
  const originKey = `${parseFloat(originLat).toFixed(3)}_${parseFloat(originLng).toFixed(3)}`;
  const destKey = `${parseFloat(destLat).toFixed(3)}_${parseFloat(destLng).toFixed(3)}`;
  if (trafficGridCongestions[originKey]) {
    congestionMultiplier = 1 / trafficGridCongestions[originKey];
  } else if (trafficGridCongestions[destKey]) {
    congestionMultiplier = 1 / trafficGridCongestions[destKey];
  }

  const origin = { lat: originLat, lng: originLng };
  const dest = { lat: destLat, lng: destLng };

  const tryEndpoint = async (baseUrl) => {
    const url = `${baseUrl}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const route = data.routes[0];
      return {
        etaMinutes: parseFloat(((route.duration / 60) * congestionMultiplier).toFixed(1)),
        distanceKm: parseFloat((route.distance / 1000).toFixed(2))
      };
    }
    return null;
  };

  if (SELF_HOSTED_OSRM) {
    try { const r = await tryEndpoint(SELF_HOSTED_OSRM); if (r) return r; } catch {}
  }
  try { const r = await tryEndpoint(PUBLIC_OSRM_URL); if (r) return r; } catch {}

  // Haversine fallback
  const dist = haversineDistance(originLat, originLng, destLat, destLng);
  const avgSpeed = 45; // km/h
  return {
    etaMinutes: parseFloat((dist / avgSpeed * 60 * 1.2 * congestionMultiplier).toFixed(1)),
    distanceKm: parseFloat(dist.toFixed(2))
  };
}

module.exports = {
  getSmartRoute,
  getSmartRouteObjects,
  getETA,
  haversineDistance,
  updateTrafficSpeed,
  trafficGridCongestions
};
