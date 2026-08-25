const axios = require('axios');

async function getRealRoute(fromLat, fromLng, toLat, toLng) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    console.warn('[ROUTING] No MAPBOX_TOKEN configured. Falling back to straight-line route.');
    return getFallbackRoute(fromLat, fromLng, toLat, toLng);
  }

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
      `${fromLng},${fromLat};${toLng},${toLat}` +
      `?geometries=geojson&steps=true&overview=full&access_token=${token}`;

    const { data } = await axios.get(url, { timeout: 6000 });
    if (!data.routes || data.routes.length === 0) {
      return getFallbackRoute(fromLat, fromLng, toLat, toLng);
    }

    const route = data.routes[0];
    return {
      geometry: route.geometry,              // GeoJSON LineString coordinates
      distanceMeters: route.distance,        // real distance in meters
      durationSeconds: route.duration,       // traffic-aware duration in seconds
      steps: route.legs[0].steps,            // list of turning maneuvers
    };
  } catch (err) {
    console.error('[ROUTING ERROR] Mapbox Directions call failed:', err.message);
    return getFallbackRoute(fromLat, fromLng, toLat, toLng);
  }
}

function getFallbackRoute(fromLat, fromLng, toLat, toLng) {
  // straight-line interpolation as safe fallback
  const steps = 15;
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = fromLat + (toLat - fromLat) * ratio;
    const lng = fromLng + (toLng - fromLng) * ratio;
    coordinates.push([lng, lat]);
  }

  // Haversine fallback distance
  const R = 6371e3; // meters
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLon = (toLng - fromLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;

  return {
    geometry: { type: 'LineString', coordinates },
    distanceMeters: dist,
    durationSeconds: dist / 12, // assuming avg 43 km/h
    steps: [
      {
        maneuver: {
          type: 'depart',
          location: [fromLng, fromLat],
          instruction: 'Depart from emergency origin'
        }
      },
      {
        maneuver: {
          type: 'arrive',
          location: [toLng, toLat],
          instruction: 'Arrive at destination point'
        }
      }
    ]
  };
}

module.exports = { getRealRoute };
