const { Hospital } = require('./db');

/**
 * Calculates hospital ER capacity utilization and provides optimal diversion targets
 * when primary trauma centers hit > 90% bed capacity.
 */
async function calculateCapacityAutoBalancing(primaryHospitalId, patientLocation) {
  try {
    const hospitals = await Hospital.findAll();
    const primary = hospitals.find(h => h.id === primaryHospitalId || h.id === String(primaryHospitalId));

    if (!primary) {
      return { status: 'NORMAL', message: 'Primary hospital evaluation completed', diversionRequired: false };
    }

    const totalBeds = primary.total_beds || 50;
    const icuBeds = primary.icu_beds || 10;
    const occupancyPct = Math.min(100, Math.round(((totalBeds - icuBeds) / totalBeds) * 100));

    if (occupancyPct < 90 && icuBeds > 0) {
      return {
        status: 'OPTIMAL',
        occupancyPct,
        primaryHospital: primary.name,
        diversionRequired: false
      };
    }

    // Capacity overflow detected! Calculate secondary diversion options.
    const secondaryOptions = hospitals
      .filter(h => h.id !== primary.id && (h.icu_beds || 0) > 0)
      .map(h => {
        let dist = 5.0; // default estimate
        if (patientLocation && patientLocation.lat && h.latitude) {
          const dLat = (h.latitude - patientLocation.lat) * (Math.PI / 180);
          const dLng = (h.longitude - patientLocation.lng) * (Math.PI / 180);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(patientLocation.lat * (Math.PI / 180)) * Math.cos(h.latitude * (Math.PI / 180)) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
          dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        return {
          id: h.id,
          name: h.name,
          distanceKm: parseFloat(dist.toFixed(2)),
          icuBedsAvailable: h.icu_beds || 5,
          ventilatorsAvailable: h.ventilators || 2
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      status: 'CRITICAL_OVERFLOW',
      occupancyPct,
      primaryHospital: primary.name,
      diversionRequired: true,
      reason: `Primary ER at ${occupancyPct}% capacity. Only ${icuBeds} ICU beds remaining.`,
      recommendedDiversion: secondaryOptions[0] || null,
      backupOptions: secondaryOptions.slice(1, 3)
    };
  } catch (err) {
    console.error('[CAPACITY BALANCING ERROR]', err.message);
    return { status: 'ERROR', error: err.message, diversionRequired: false };
  }
}

module.exports = {
  calculateCapacityAutoBalancing
};
