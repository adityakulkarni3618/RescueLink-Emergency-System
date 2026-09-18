const { rankHospitals, broadcastToNearbyHospitals, startContinuousHospitalSearch, checkContinuousHospitalSearch } = require('../services/hospitalMatchingAgent');
const { rankAmbulancesByRealETA, dispatchTiered } = require('../services/dispatchAgent');
const { notifyEntity, createSystemNotification } = require('../utils/systemNotifications');
const { Hospital, Ambulance, NotificationQueue, EmergencyCorridor, sequelize } = require('../utils/db');

describe('RescueLink Master System Flow Verification', () => {

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  test('Part 3 — Only Verified & Approved Entities Ever Enter Candidate Pools', async () => {
    // Create an unverified test hospital
    const unverifiedHospital = await Hospital.create({
      name: 'Unverified Test Clinic',
      lat: 18.5204,
      lng: 73.8567,
      is_active: false,
      verification_status: 'PENDING'
    });

    const rankedHospitals = await rankHospitals(18.5200, 73.8560);
    const unverifiedFound = rankedHospitals.some(h => h.hospital.id === unverifiedHospital.id);
    expect(unverifiedFound).toBe(false);

    // Clean up
    await Hospital.destroy({ where: { id: unverifiedHospital.id } });
  });

  test('Part 2 & 4 — Multi-Channel Active Delivery and Notification Queue', async () => {
    const mockEntity = {
      id: 'hosp-test-01',
      name: 'City Care Hospital',
      contact_number: '+91-9876543210',
      push_subscription: JSON.stringify({ endpoint: 'https://push.example.com/sub/123' })
    };

    const mockPayload = { requestId: 'REQ-TEST-108', pickupLat: 18.5204, pickupLng: 73.8567 };

    await notifyEntity(mockEntity, 'incoming-case-availability-check', mockPayload);

    // Verify DB NotificationQueue entry created
    const queueRecord = await NotificationQueue.findOne({
      where: { entity_id: mockEntity.id, event_type: 'incoming-case-availability-check' }
    });

    expect(queueRecord).not.toBeNull();
    expect(queueRecord.delivered_via_socket).toBe(false);

    // Clean up
    await NotificationQueue.destroy({ where: { id: queueRecord.id } });
  });

  test('Part 6 — Continuous Best-Hospital Search Suggestion Engine', async () => {
    const closeHospital = await Hospital.create({
      name: 'Nearby Emergency Trauma Care',
      lat: 18.5210,
      lng: 73.8570,
      is_active: true,
      verification_status: 'APPROVED',
      icu_beds: 15,
      ventilators: 8
    });

    const mockActiveRequests = {
      'REQ-CONT-1': {
        id: 'REQ-CONT-1',
        status: 'en_route_to_hospital',
        hospitalId: 'hosp-old',
        assignedHospital: { id: 'hosp-old', name: 'Far Away Hospital', lat: 19.5000, lng: 74.5000 },
        userLocation: { lat: 18.5204, lng: 73.8567 },
        ambulanceLocation: { lat: 18.5204, lng: 73.8567 },
        confirmed_eta_seconds: 3600
      }
    };

    let emittedEvent = null;
    let emittedPayload = null;

    const mockIo = {
      to: (room) => ({
        emit: (event, payload) => {
          emittedEvent = event;
          emittedPayload = payload;
        }
      })
    };

    const timer = startContinuousHospitalSearch('REQ-CONT-1', mockIo, mockActiveRequests, 100);
    await checkContinuousHospitalSearch('REQ-CONT-1', mockIo, mockActiveRequests);
    clearInterval(timer);

    expect(emittedEvent).toBe('hospital:better-option-found');
    expect(emittedPayload).toBeDefined();
    expect(emittedPayload.currentHospital).toBe('hosp-old');
    expect(emittedPayload.suggestedHospital.name).toBe('Nearby Emergency Trauma Care');

    await Hospital.destroy({ where: { id: closeHospital.id } });
  });
});
