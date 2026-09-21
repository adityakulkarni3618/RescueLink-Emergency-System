const { isValidStateTransition, transitionAmbulanceState } = require('../utils/ambulanceStateMachine');
const { Incident, ClinicalHandover, sequelize } = require('../utils/db');

describe('RescueLink Real-World End-to-End Validation Test Suite', () => {

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  test('E2E Lifecycle — Valid 15-Stage Emergency Transition Sequence', async () => {
    // 1. Create initial incident record
    const incident = await Incident.create({
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      pickup_address: 'Deccan Gymkhana, Pune',
      status: 'requested',
      ambulance_state: 'AVAILABLE'
    });

    expect(incident.id).toBeDefined();

    // 2. Transition sequence: ASSIGNED -> EN_ROUTE_TO_PATIENT -> AT_SCENE -> PATIENT_ONBOARD -> EN_ROUTE_TO_HOSPITAL -> AT_HOSPITAL -> HANDOVER_COMPLETE
    const validStates = [
      'ASSIGNED',
      'EN_ROUTE_TO_PATIENT',
      'AT_SCENE',
      'PATIENT_ONBOARD',
      'EN_ROUTE_TO_HOSPITAL',
      'AT_HOSPITAL',
      'HANDOVER_COMPLETE'
    ];

    for (const targetState of validStates) {
      const res = await transitionAmbulanceState(incident, targetState, 'PARAMEDIC', `Test transition to ${targetState}`);
      expect(res.success).toBe(true);
    }

    expect(incident.status).toBe('completed');
    expect(incident.completed_at).not.toBeNull();
  });

  test('State Machine Safety — Reject Invalid Out-of-Sequence Transitions', async () => {
    const incident = await Incident.create({
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      status: 'completed'
    });

    // Attempt invalid transition: COMPLETED -> EN_ROUTE_TO_PATIENT directly
    const invalidRes = await transitionAmbulanceState(incident, 'EN_ROUTE_TO_PATIENT', 'PARAMEDIC', 'Illegal transition');
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.reason).toContain('Invalid state transition');
    expect(incident.status).toBe('completed');
  });

  test('Clinical Handover Integrity — Immutability Hook Enforcement', async () => {
    const incident = await Incident.create({
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      status: 'patient_onboard'
    });

    const handover = await ClinicalHandover.create({
      incident_id: incident.id,
      chief_complaint: 'Acute Chest Pain and Shortness of Breath',
      status: 'ACKNOWLEDGED',
      acknowledged_at: new Date()
    });

    // Attempting to modify an ACKNOWLEDGED handover must throw an immutability error
    handover.chief_complaint = 'Altered Complaint After Finalization';
    await expect(handover.save()).rejects.toThrow('Completed clinical handovers are immutable and cannot be modified.');
  });
});
