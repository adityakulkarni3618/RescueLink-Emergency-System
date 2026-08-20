require('dotenv').config();
const { Hospital } = require('../utils/db');

async function listHospitals() {
  try {
    console.log('[LIST] Fetching all registered hospitals...');
    const hospitals = await Hospital.findAll();
    console.log(`[LIST] Found ${hospitals.length} hospitals:`);
    hospitals.forEach(h => {
      console.log(`- "${h.name}" (ID: ${h.id})`);
    });
    process.exit(0);
  } catch (err) {
    console.error('[LIST ERROR]', err);
    process.exit(1);
  }
}

listHospitals();
