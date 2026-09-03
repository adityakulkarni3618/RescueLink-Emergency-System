const { Ambulance, Hospital, Incident, AuditLog } = require('./db');
const { haversineDistance } = require('./maps');

/**
 * Finds all active, verified ambulances within 10 km radius of patient coordinates.
 */
async function findEligibleAmbulances(patientLat, patientLng, maxRadiusKm = 10) {
  try {
    const allAmbulances = await Ambulance.findAll({
      where: {
        is_active: true,
        verification_status: 'APPROVED'
      }
    });

    const eligible = [];
    for (const amb of allAmbulances) {
      const ambLat = amb.latitude || 12.9716;
      const ambLng = amb.longitude || 77.5946;
      const distanceKm = haversineDistance(patientLat, patientLng, ambLat, ambLng);
      if (distanceKm <= maxRadiusKm) {
        const plain = amb.get({ plain: true });
        plain.distanceKm = parseFloat(distanceKm.toFixed(2));
        eligible.push(plain);
      }
    }

    eligible.sort((a, b) => a.distanceKm - b.distanceKm);
    return eligible;
  } catch (err) {
    console.error('[DISPATCH AGENT ERROR] findEligibleAmbulances failed:', err);
    return [];
  }
}

/**
 * Finds all active, verified hospitals within 20 km radius of patient coordinates.
 * Returns sorted list by shortest distance first.
 */
async function findEligibleHospitals(patientLat, patientLng, maxRadiusKm = 20) {
  try {
    const allHospitals = await Hospital.findAll({
      where: {
        is_active: true,
        verification_status: 'APPROVED'
      }
    });

    const eligible = [];
    for (const hosp of allHospitals) {
      if (!hosp.lat || !hosp.lng) continue;
      const distanceKm = haversineDistance(patientLat, patientLng, hosp.lat, hosp.lng);
      if (distanceKm <= maxRadiusKm) {
        const plain = hosp.get({ plain: true });
        plain.distanceKm = parseFloat(distanceKm.toFixed(2));
        eligible.push(plain);
      }
    }

    eligible.sort((a, b) => a.distanceKm - b.distanceKm);
    return eligible;
  } catch (err) {
    console.error('[DISPATCH AGENT ERROR] findEligibleHospitals failed:', err);
    return [];
  }
}

/**
 * Handles Uber/Ola style ambulance cancellation recovery.
 * Frees the cancelling ambulance, notifies the patient, and re-broadcasts emergency request to 10km units.
 */
async function handleAmbulanceCancellation(io, incidentId, ambulanceId, patientLat, patientLng) {
  try {
    console.log(`[DISPATCH AGENT] Handling ambulance cancellation for incident ${incidentId} by ambulance ${ambulanceId}`);
    
    // 1. Reset cancelling ambulance state
    const amb = await Ambulance.findByPk(ambulanceId);
    if (amb) {
      amb.status = 'AVAILABLE';
      await amb.save();
    }

    // 2. Re-search nearby eligible ambulances within 10 km
    const eligibleAmbulances = await findEligibleAmbulances(patientLat, patientLng, 10);
    const eligibleHospitals = await findEligibleHospitals(patientLat, patientLng, 20);

    // 3. Emit Socket broadcast for cancellation recovery
    if (io) {
      io.to(`mission_${incidentId}`).to('admin_warroom').emit('emergency:ambulance_cancelled', {
        incidentId,
        cancelledAmbulanceId: ambulanceId,
        message: 'Ambulance canceled the trip. Auto-searching nearest 10km ambulances...',
        eligibleAmbulances,
        nearestHospital: eligibleHospitals[0] || null
      });

      // Broadcast fresh dispatch offer to remaining ambulances room
      io.to('global_ambulances').emit('emergency:dispatch_offer', {
        incidentId,
        patientLocation: { lat: patientLat, lng: patientLng },
        eligibleAmbulances,
        isRebroadcast: true
      });
    }

    return { success: true, reBroadcastCount: eligibleAmbulances.length };
  } catch (err) {
    console.error('[DISPATCH AGENT ERROR] handleAmbulanceCancellation error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Handles patient cancellation cleanup.
 */
async function handlePatientCancellation(io, incidentId, patientId) {
  try {
    console.log(`[DISPATCH AGENT] Handling patient cancellation for incident ${incidentId}`);
    if (io) {
      io.to(`mission_${incidentId}`).to('admin_warroom').emit('emergency:patient_cancelled', {
        incidentId,
        patientId,
        message: 'Emergency SOS cancelled by patient.'
      });
    }
    return { success: true };
  } catch (err) {
    console.error('[DISPATCH AGENT ERROR] handlePatientCancellation error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  findEligibleAmbulances,
  findEligibleHospitals,
  handleAmbulanceCancellation,
  handlePatientCancellation
};
