const axios = require('axios');

async function geocodeAddress(address) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    console.warn('[GEOCODER] No MAPBOX_TOKEN configured. Cannot geocode address:', address);
    return null;
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    if (data && data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch (err) {
    console.error('[GEOCODER ERROR] Geocoding failed:', err.message);
    if (err.response && err.response.status === 401) {
      console.warn('[GEOCODER] Mapbox Token unauthorized (401). Falling back to mock geocoding near Vijayawada/Bengaluru/Pune.');
      const query = address.toLowerCase();
      if (query.includes('pune')) {
        return { lat: 18.5204 + (Math.random() - 0.5) * 0.02, lng: 73.8567 + (Math.random() - 0.5) * 0.02 };
      } else if (query.includes('bengaluru') || query.includes('bangalore')) {
        return { lat: 12.9716 + (Math.random() - 0.5) * 0.02, lng: 77.5946 + (Math.random() - 0.5) * 0.02 };
      } else {
        return { lat: 16.5062 + (Math.random() - 0.5) * 0.02, lng: 80.6480 + (Math.random() - 0.5) * 0.02 };
      }
    }
  }
  return null;
}

module.exports = { geocodeAddress };
