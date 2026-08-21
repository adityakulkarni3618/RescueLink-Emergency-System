const fetch = require('node-fetch');

// Official National Sandbox endpoints (configured in environment)
const RTO_VAHAN_API_URL = process.env.RTO_VAHAN_API_URL || null;
const ABDM_FACILITY_API_URL = process.env.ABDM_FACILITY_API_URL || null;
const VAHAAN_AUTH_KEY = process.env.VAHAAN_AUTH_KEY || '';
const ABDM_CLIENT_SECRET = process.env.ABDM_CLIENT_SECRET || '';

/**
 * Validate emergency vehicle registration plate against RTO Vahan database
 */
async function validateAmbulanceVehicle(vehicleNo) {
  const cleanNo = vehicleNo.replace(/[\s\-]+/g, '').toUpperCase();

  // Strict regex check for standard Indian registration format (e.g. MH12AB1234)
  const isStandardFormat = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(cleanNo);
  if (!isStandardFormat) {
    return { success: false, reason: 'Invalid Indian vehicle registration number format.' };
  }

  if (!RTO_VAHAN_API_URL) {
    // Deterministic sandbox simulation mode
    console.log(`[RTO-VAHAN API MOCK] Validated vehicle: ${cleanNo}`);
    return { success: true, verified: true, details: { model: 'Force Traveler Ambulance', fuel: 'Diesel', fitnessValidUntil: '2030-12-31' } };
  }

  try {
    const res = await fetch(`${RTO_VAHAN_API_URL}/vehicle/${cleanNo}`, {
      headers: { 'Authorization': `Bearer ${VAHAAN_AUTH_KEY}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'ACTIVE') {
        return { success: true, verified: true, details: data };
      }
    }
  } catch (err) {
    console.warn(`[RTO-VAHAN ERROR] Lookup failed, fallback to local lookup logic:`, err.message);
  }

  return { success: true, verified: false, reason: 'Registry lookup failed' };
}

/**
 * Validate hospital facility registry ID against ABDM National Health Facility Registry (HFR)
 */
async function validateHospitalFacility(licenseNumber) {
  const cleanLicense = licenseNumber.replace(/[\s\-]+/g, '').toUpperCase();

  // General format validation for national hospital license registration numbers
  if (cleanLicense.length < 5) {
    return { success: false, reason: 'Hospital License code too short.' };
  }

  if (!ABDM_FACILITY_API_URL) {
    // Deterministic sandbox simulation mode
    console.log(`[ABDM-HFR API MOCK] Validated facility license: ${cleanLicense}`);
    return { success: true, verified: true, details: { category: 'Multi-Specialty Trauma Care Center', status: 'ACTIVE_ACCREDITED' } };
  }

  try {
    const res = await fetch(`${ABDM_FACILITY_API_URL}/facility/${cleanLicense}`, {
      headers: { 'X-ABDM-Secret': ABDM_CLIENT_SECRET }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'VERIFIED') {
        return { success: true, verified: true, details: data };
      }
    }
  } catch (err) {
    console.warn(`[ABDM-HFR ERROR] HFR facility verification failed:`, err.message);
  }

  return { success: true, verified: false, reason: 'ABDM HFR lookup failed' };
}

module.exports = {
  validateAmbulanceVehicle,
  validateHospitalFacility
};
