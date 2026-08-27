require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Hospital } = require('../utils/db');
const { geocodeAddress } = require('../utils/geocoder');

async function backfill() {
  console.log('[BACKFILL] Starting geocoding backfill for hospitals...');
  try {
    const hospitals = await Hospital.findAll();
    for (const h of hospitals) {
      // Check if coordinates are null, missing, or default placeholder
      const isPlaceholder = (h.lat === 12.9716 && h.lng === 77.5946) || 
                            (h.lat === 16.5062 && h.lng === 80.6480) || 
                            (h.lat === 18.5204 && h.lng === 73.8567) ||
                            !h.lat || !h.lng;

      if (isPlaceholder) {
        console.log(`[BACKFILL] Geocoding hospital: ${h.name}`);
        const searchQuery = `${h.name}, ${h.city || ''}, ${h.state || ''}`;
        const coords = await geocodeAddress(searchQuery);
        if (coords) {
          h.lat = coords.lat;
          h.lng = coords.lng;
          await h.save();
          console.log(`[BACKFILL] Success! New coords for ${h.name}: ${coords.lat}, ${coords.lng}`);
        } else {
          console.warn(`[BACKFILL] Failed to geocode ${h.name} with query: "${searchQuery}"`);
        }
      }
    }
    console.log('[BACKFILL] Completed.');
  } catch (err) {
    console.error('[BACKFILL ERROR]', err);
  }
}

backfill().then(() => process.exit(0));
