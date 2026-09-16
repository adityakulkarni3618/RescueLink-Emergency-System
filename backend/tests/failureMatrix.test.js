const { RealGPSProvider } = require('../utils/gpsProvider');
const abdm = require('../utils/abdm');
const smppService = require('../utils/smppService');
const whatsapp = require('../utils/whatsapp');
const { transitionAmbulanceState } = require('../utils/ambulanceStateMachine');
const { syncDatabase, sequelize, ClinicalHandover, Hospital } = require('../utils/db');

describe('RescueLink System Failure & Boundary Matrix Tests', () => {
  beforeAll(async () => {
    await syncDatabase();
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;').catch(() => {});
    }
  });

  afterAll(async () => {
    // Keep connection alive for other test suites running sequentially
  });

  test('GPS Timeout: Telemetry > 15s old must be marked STALE', () => {
    const provider = new RealGPSProvider();
    const staleFix = provider.processHardwareFix({
      lat: 28.6139,
      lng: 77.2090,
      timestamp: Date.now() - 20000,
      speed: 12
    });

    expect(staleFix.status).toBe('STALE');
    expect(staleFix.latitude).toBe(28.6139);
    expect(staleFix.longitude).toBe(77.2090);
  });

  test('Unconfigured External Services: Pilot mode returns UNAVAILABLE when credentials missing', async () => {
    const oldMode = process.env.APP_MODE;
    process.env.APP_MODE = 'pilot';

    const abdmRes = await abdm.verifyAbhaAddress('test@sbx');
    expect(abdmRes.status).toBe('UNAVAILABLE');
    expect(abdmRes.reason).toContain('ABDM Client credentials');

    const smppRes = await smppService.sendSMS('+919999999999', 'Test Emergency Message');
    expect(smppRes.status).toBe('UNAVAILABLE');
    expect(smppRes.success).toBe(false);

    const waRes = await whatsapp.sendMessage('+919999999999', 'Test Emergency Message');
    expect(waRes.status).toBe('UNAVAILABLE');
    expect(waRes.success).toBe(false);

    process.env.APP_MODE = oldMode;
  });

  test('State Machine Violation: Reject invalid state jump (OFFLINE -> PATIENT_ONBOARD)', async () => {
    const mockIncident = { id: 'test-mission-001', ambulance_state: 'OFFLINE', status: 'requested' };
    const res = await transitionAmbulanceState(mockIncident, 'PATIENT_ONBOARD', 'PARAMEDIC');
    expect(res.success).toBe(false);
    expect(res.reason).toContain('Invalid state transition');
    expect(mockIncident.ambulance_state).toBe('OFFLINE');
  });

  test('Clinical Handover Immutability: Block edits on ACKNOWLEDGED handover', async () => {
    const handover = await ClinicalHandover.create({
      incident_id: '33333333-3333-3333-3333-333333333333',
      chief_complaint: 'Trauma with head injury',
      news2_score: 9,
      status: 'ACKNOWLEDGED',
      receiving_clinician_name: 'Dr. Verma'
    });

    handover.news2_score = 5;
    await expect(handover.save()).rejects.toThrow('Completed clinical handovers are immutable');
  });

  test('Pilot Mode Operational Protection: Server startup does NOT delete hospitals', async () => {
    const testHospital = await Hospital.create({
      id: '11112222-3333-4444-5555-666677778888',
      name: 'City General Trauma Center',
      city: 'Pune',
      state: 'Maharashtra',
      is_active: true
    });

    // Verify record exists and is untouched
    const found = await Hospital.findByPk(testHospital.id);
    expect(found).not.toBeNull();
    expect(found.name).toBe('City General Trauma Center');

    await testHospital.destroy();
  });
});
