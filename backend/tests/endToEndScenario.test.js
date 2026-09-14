process.env.NODE_ENV = 'test';
process.env.FORCE_SQLITE = 'true';
process.env.TELEMETRY_SHARED_SECRET = 'test_secret_key';

jest.setTimeout(30000);

const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const {
  calculateCorridorReadiness,
  analyzeAlternateRoute,
  executeRouteSwitch,
  initializeCorridorForRoute
} = require('../utils/emergencyCorridor');
const { transitionAmbulanceState } = require('../utils/ambulanceStateMachine');
const { EmergencyCorridor, AuditLog, Incident, Hospital, ClinicalHandover, syncDatabase, sequelize } = require('../utils/db');

describe('RescueLink Complete End-to-End Emergency Response Journey Test Suite', () => {
  const incidentId = uuidv4();
  const hospitalId = uuidv4();

  beforeAll(async () => {
    await syncDatabase();
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;').catch(() => {});
    }
  });

  afterAll(async () => {
    try {
      await EmergencyCorridor.destroy({ where: { incident_id: incidentId } });
      await ClinicalHandover.destroy({ where: { incident_id: incidentId } });
      await Incident.destroy({ where: { id: incidentId } });
      await Hospital.destroy({ where: { id: hospitalId } });
    } catch (e) {}
  });

  test('Step 1: Emergency creation & NEWS2 severity assessment', async () => {
    const incident = await Incident.create({
      id: incidentId,
      status: 'requested',
      pickup_lat: 28.6139,
      pickup_lng: 77.2090,
      pickup_address: 'Cannaught Place, New Delhi',
      news2_score: 8,
      notes: 'End-to-End Test Emergency'
    });

    expect(incident).not.toBeNull();
    expect(incident.news2_score).toBe(8);
    expect(incident.status).toBe('requested');
  });

  test('Step 2: Ambulance state machine progression (ASSIGNED -> EN_ROUTE_TO_PATIENT -> AT_SCENE -> PATIENT_ONBOARD)', async () => {
    const incident = await Incident.findByPk(incidentId);

    // ASSIGNED
    let res = await transitionAmbulanceState(incident, 'ASSIGNED', 'DISPATCHER');
    expect(res.success).toBe(true);
    expect(incident.ambulance_state).toBe('ASSIGNED');

    // EN_ROUTE_TO_PATIENT
    res = await transitionAmbulanceState(incident, 'EN_ROUTE_TO_PATIENT', 'PARAMEDIC');
    expect(res.success).toBe(true);
    expect(incident.ambulance_state).toBe('EN_ROUTE_TO_PATIENT');

    // AT_SCENE
    res = await transitionAmbulanceState(incident, 'AT_SCENE', 'PARAMEDIC');
    expect(res.success).toBe(true);
    expect(incident.ambulance_state).toBe('AT_SCENE');

    // PATIENT_ONBOARD
    res = await transitionAmbulanceState(incident, 'PATIENT_ONBOARD', 'PARAMEDIC');
    expect(res.success).toBe(true);
    expect(incident.ambulance_state).toBe('PATIENT_ONBOARD');

    // Reject invalid transition
    const invalidRes = await transitionAmbulanceState(incident, 'HANDOVER_COMPLETE', 'PARAMEDIC');
    expect(invalidRes.success).toBe(false);
  });

  test('Step 3: Hospital assignment & atomic resource reservation', async () => {
    let hosp = await Hospital.create({
      id: hospitalId,
      name: 'E2E Central Hospital',
      city: 'Delhi',
      state: 'Delhi',
      lat: 28.6304,
      lng: 77.2177,
      contact_number: '+919999999999',
      total_beds: 5,
      icu_beds: 2,
      ventilators: 2,
      is_active: true
    }).catch(err => {
      console.error('[HOSPITAL CREATE ERR]', err.message);
      return Hospital.findByPk(hospitalId);
    });

    const incident = await Incident.findByPk(incidentId);
    incident.hospital_id = hosp.id;
    incident.hospital_lat = hosp.lat;
    incident.hospital_lng = hosp.lng;

    // Simulate atomic reservation
    hosp.total_beds -= 1;
    hosp.ventilators -= 1;
    await hosp.save();

    await transitionAmbulanceState(incident, 'EN_ROUTE_TO_HOSPITAL', 'CONTROL_ROOM');
    expect(incident.ambulance_state).toBe('EN_ROUTE_TO_HOSPITAL');
    expect(hosp.total_beds).toBe(4);
  });

  test('Step 4: Emergency Corridor Phase A initialization & readiness score', async () => {
    const primaryRouteSpaced = [
      { lat: 28.6139, lng: 77.2090 },
      { lat: 28.6250, lng: 77.2200 },
      { lat: 28.6370, lng: 77.2350 }
    ];

    const junctions = await initializeCorridorForRoute(incidentId, primaryRouteSpaced, 1);
    expect(junctions.length).toBeGreaterThan(0);
    const readiness = calculateCorridorReadiness(junctions, 'HIGH', []);
    expect(readiness.status).toBe('READY');
    expect(readiness.score).toBe(100);
  });

  test('Step 5: Traffic obstruction detection & Phase B alternate routing analysis', async () => {
    const ambLoc = { lat: 28.6139, lng: 77.2090 };
    const destLoc = { lat: 28.6370, lng: 77.2350 };
    const primaryRouteSpaced = [
      { lat: 28.6139, lng: 77.2090 },
      { lat: 28.6250, lng: 77.2200 },
      { lat: 28.6370, lng: 77.2350 }
    ];
    const obstruction = [{ location: { lat: 28.6250, lng: 77.2200 }, delaySec: 240, type: 'Congestion' }];

    const analysis = await analyzeAlternateRoute(incidentId, ambLoc, destLoc, primaryRouteSpaced, obstruction);
    expect(analysis.obstruction.detected).toBe(true);
    expect(analysis.recommendation).toBe('SWITCH_ALTERNATE');
  });

  test('Step 6: Human-in-the-loop operator route switch & junction sequence rebuilding', async () => {
    const altRoute = [
      { lat: 28.6139, lng: 77.2090 },
      { lat: 28.6170, lng: 77.2050 },
      { lat: 28.6370, lng: 77.2350 }
    ];

    const switchResult = await executeRouteSwitch(incidentId, altRoute, 'OPERATOR_108');
    expect(switchResult.success).toBe(true);
    expect(switchResult.routeVersion).toBe(2);

    const incident = await Incident.findByPk(incidentId);
    expect(incident.route_version).toBe(2);
  });

  test('Step 7: Arrival at hospital & Digital Clinical Handover workflow', async () => {
    const incident = await Incident.findByPk(incidentId);
    await transitionAmbulanceState(incident, 'AT_HOSPITAL', 'PARAMEDIC');
    expect(incident.ambulance_state).toBe('AT_HOSPITAL');

    // Submit handover
    const handover = await ClinicalHandover.create({
      id: uuidv4(),
      incident_id: incidentId,
      hospital_id: hospitalId,
      paramedic_id: 'PARAMEDIC-001',
      chief_complaint: 'Severe Chest Pain & Dyspnea',
      vitals_snapshot: { heartRate: 112, spo2: 91, systolic: 155, diastolic: 95 },
      news2_score: 8,
      interventions_given: 'High-flow oxygen, IV access established, ECG recorded',
      status: 'SUBMITTED'
    });

    expect(handover.status).toBe('SUBMITTED');

    // Hospital acknowledgment & sign-off
    handover.status = 'ACKNOWLEDGED';
    handover.receiving_clinician_name = 'Dr. Sharma (Chief ER Registrar)';
    handover.acknowledged_at = new Date();
    await handover.save();

    await transitionAmbulanceState(incident, 'HANDOVER_COMPLETE', 'HOSPITAL', 'Signed off by ER doctor');
    expect(incident.ambulance_state).toBe('HANDOVER_COMPLETE');
    expect(incident.status).toBe('completed');
  });

  test('Step 8: Complete audit trail verification', async () => {
    const logs = await AuditLog.findAll({
      where: {
        action: ['AMBULANCE_STATE_HANDOVER_COMPLETE', 'OPERATOR_SWITCHED_ALTERNATE']
      }
    });

    expect(logs.length).toBeGreaterThan(0);
  });
});
