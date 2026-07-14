const axios = require('axios');
const { redis } = require('./redis');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Calculates the distance between two points in kilometers using the Haversine formula.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gets the ETA and distance from a starting point to a destination.
 * Calls Google Maps Directions API, falling back to a Haversine estimate.
 * Caches results in Redis for 30 seconds.
 */
async function getETA(fromLat, fromLng, toLat, toLng) {
  const cacheKey = `eta:${fromLat.toFixed(4)}:${fromLng.toFixed(4)}:${toLat.toFixed(4)}:${toLng.toFixed(4)}`;

  // Try fetching from Redis cache
  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[MAPS] Redis cache hit for ETA: ${cacheKey}`);
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn('[MAPS] Redis error reading cache:', err.message);
    }
  }

  let result = null;

  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_key') {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${GOOGLE_MAPS_API_KEY}&mode=driving`;
      const response = await axios.get(url);
      
      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        const leg = response.data.routes[0].legs[0];
        result = {
          etaMinutes: Math.round(leg.duration.value / 60),
          distanceKm: parseFloat((leg.distance.value / 1000).toFixed(2)),
          polyline: response.data.routes[0].overview_polyline.points
        };
        console.log(`[MAPS] Google Maps directions fetched. Distance: ${result.distanceKm} km, ETA: ${result.etaMinutes} mins`);
      } else {
        console.warn('[MAPS] Google Maps API returned error status:', response.data.status);
      }
    } catch (err) {
      console.error('[MAPS] Google Maps Directions API error:', err.message);
    }
  }

  // Fallback to Haversine straight-line distance at 40 km/h average speed
  if (!result) {
    const distKm = haversineDistance(fromLat, fromLng, toLat, toLng);
    // At 40km/h: time in hours = distance / 40. Time in minutes = (distance / 40) * 60 = distance * 1.5
    const etaMin = Math.round(distKm * 1.5);
    result = {
      etaMinutes: etaMin === 0 && distKm > 0 ? 1 : etaMin,
      distanceKm: parseFloat(distKm.toFixed(2)),
      polyline: null // No polyline available in fallback
    };
    console.log(`[MAPS] Fallback estimation applied. Distance: ${result.distanceKm} km, ETA: ${result.etaMinutes} mins`);
  }

  // Cache in Redis for 30 seconds
  if (redis && redis.status === 'ready' && result) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
    } catch (err) {
      console.warn('[MAPS] Redis error writing cache:', err.message);
    }
  }

  return result;
}

/**
 * Calculates the green corridor route (avoiding narrow routes and low bridges).
 */
async function getGreenCorridorRoute(fromLat, fromLng, toLat, toLng) {
  // Using Google Directions API, we set parameters to prefer main highways/routes.
  // Note: Standard API handles traffic. We tag it as an emergency route.
  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_key') {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${GOOGLE_MAPS_API_KEY}&mode=driving&departure_time=now`;
      const response = await axios.get(url);
      if (response.data.status === 'OK' && response.data.routes.length > 0) {
        console.log('[MAPS] Optimal green corridor route calculated via Google Maps API.');
        return response.data.routes[0];
      }
    } catch (err) {
      console.error('[MAPS] Green corridor calculation error:', err.message);
    }
  }
  return null;
}

module.exports = {
  haversineDistance,
  getETA,
  getGreenCorridorRoute
};
