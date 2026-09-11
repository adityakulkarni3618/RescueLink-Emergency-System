process.env.NODE_ENV = 'test';
process.env.FORCE_SQLITE = 'true';
process.env.TELEMETRY_SHARED_SECRET = 'test_secret_key';

jest.setTimeout(30000);

const {
  transitionJunctionState,
  calculateCorridorReadiness,
  evaluateTrafficObstructions,
  getApproachDirection,
  CORRIDOR_THRESHOLDS,
  VALID_TRANSITIONS
} = require('../utils/emergencyCorridor');
const { TrafficControllerAdapter } = require('../utils/trafficControllerAdapter');
const { EmergencyCorridor, AuditLog, syncDatabase, sequelize } = require('../utils/db');

describe('Emergency Corridor Coordination Layer Test Suite', () => {
  const testIncidentId = '00000000-0000-4000-a000-000000000999';

  beforeAll(async () => {
    await syncDatabase();
    if (sequelize.getDialect() === 'sqlite') {
      await sequelize.query('PRAGMA foreign_keys = OFF;').catch(() => {});
    }
  });

  afterEach(async () => {
    try {
      await EmergencyCorridor.destroy({ where: { incident_id: testIncidentId } });
    } catch (e) {}
  });

  describe('Approach Direction Calculation', () => {
    test('should return correct cardinal approach direction from route points', () => {
      const prev = { lat: 28.6100, lng: 77.2000 };
      const currNorth = { lat: 28.6200, lng: 77.2000 };
      const dir = getApproachDirection(prev, currNorth);
      expect(dir).toBe('South → North');

      const currEast = { lat: 28.6100, lng: 77.2100 };
      const dirEast = getApproachDirection(prev, currEast);
      expect(dirEast).toBe('West → East');
    });
  });

  describe('Junction State Machine & Transitions', () => {
    test('should allow valid deterministic state transitions', async () => {
      const junc = await EmergencyCorridor.create({
        incident_id: testIncidentId,
        junction_id: 'junc_test_1',
        name: 'Test Junction 1',
        status: 'SCHEDULED',
        corridor_state: 'NORMAL',
        latitude: 28.6139,
        longitude: 77.2090
      });

      let ok = await transitionJunctionState(junc, 'ARMED', 'Ambulance approaching within 1km window');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('ARMED');

      ok = await transitionJunctionState(junc, 'APPROACHING', 'ETA < 30s');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('APPROACHING');

      ok = await transitionJunctionState(junc, 'PREEMPT_REQUESTED', 'ETA < 15s');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('PREEMPT_REQUESTED');

      ok = await transitionJunctionState(junc, 'PREEMPT_ACTIVE', 'ETA < 8s');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('PREEMPT_ACTIVE');

      ok = await transitionJunctionState(junc, 'AMBULANCE_PASSING', 'Within 40m passage threshold');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('AMBULANCE_PASSING');

      ok = await transitionJunctionState(junc, 'CLEARING', 'Exited 70m passage boundary');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('CLEARING');

      ok = await transitionJunctionState(junc, 'RESTORING', 'Safety clearance complete');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('RESTORING');

      ok = await transitionJunctionState(junc, 'NORMAL', 'Signal cycle restored');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('NORMAL');
    });

    test('should reject invalid state transitions', async () => {
      const junc = await EmergencyCorridor.create({
        incident_id: testIncidentId,
        junction_id: 'junc_test_invalid',
        name: 'Invalid Test Junction',
        status: 'SCHEDULED',
        corridor_state: 'NORMAL',
        latitude: 28.6139,
        longitude: 77.2090
      });

      const ok = await transitionJunctionState(junc, 'AMBULANCE_PASSING', 'Invalid leap');
      expect(ok).toBe(false);
      expect(junc.corridor_state).toBe('NORMAL');
    });
  });

  describe('Traffic Controller Adapter & Failure Simulation', () => {
    test('should handle controller request and activation success', async () => {
      const adapter = new TrafficControllerAdapter();
      const mockJunc = { junction_id: 'junc_101', name: 'Main St' };

      const reqRes = await adapter.requestPreemption(mockJunc);
      expect(reqRes.success).toBe(true);
      expect(reqRes.controllerStatus).toBe('ACKNOWLEDGED');

      const actRes = await adapter.activatePreemption(mockJunc);
      expect(actRes.success).toBe(true);
      expect(actRes.controllerStatus).toBe('ACTIVE');
    });

    test('should handle simulated controller failure deterministically', async () => {
      const adapter = new TrafficControllerAdapter();
      const mockJunc = { junction_id: 'junc_fail_001', name: 'Failing Junction' };

      adapter.setSimulatedFailure('junc_fail_001', true);
      const res = await adapter.requestPreemption(mockJunc);
      expect(res.success).toBe(false);
      expect(res.controllerStatus).toBe('FAILED');

      adapter.clearSimulatedFailures();
    });
  });

  describe('Corridor Readiness Scoring', () => {
    test('should calculate 100% READY score when all parameters are optimal', () => {
      const junctions = [
        { corridor_state: 'NORMAL', controller_status: 'ONLINE' },
        { corridor_state: 'ARMED', controller_status: 'ONLINE' }
      ];

      const readiness = calculateCorridorReadiness(junctions, 'HIGH', []);
      expect(readiness.status).toBe('READY');
      expect(readiness.score).toBe(100);
    });

    test('should lower score to DEGRADED when controller failure or low GPS occurs', () => {
      const junctions = [
        { corridor_state: 'NORMAL', controller_status: 'ONLINE' },
        { corridor_state: 'CONTROLLER_FAIL', controller_status: 'FAILED' }
      ];

      const readiness = calculateCorridorReadiness(junctions, 'LOW', []);
      expect(readiness.status).toBe('DEGRADED');
      expect(readiness.score).toBeLessThan(85);
    });
  });

  describe('Traffic Obstruction Rerouting Recommendation', () => {
    test('should detect route obstructions within 200m radius and produce alternate route recommendation', () => {
      const routeCoords = [
        { lat: 28.6139, lng: 77.2090 },
        { lat: 28.6200, lng: 77.2150 }
      ];
      const incidents = [
        { lat: 28.6140, lng: 77.2091, type: 'CONSTRUCTION_BLOCK' }
      ];

      const rec = evaluateTrafficObstructions(testIncidentId, routeCoords, incidents);
      expect(rec).not.toBeNull();
      expect(rec.recommendation).toBe('SWITCH TO ALTERNATE ROUTE');
    });
  });

  describe('Audit Logging Verification', () => {
    test('should record audit log when state transition occurs', async () => {
      const junc = await EmergencyCorridor.create({
        incident_id: testIncidentId,
        junction_id: 'junc_audit_test',
        name: 'Audit Test Junction',
        status: 'SCHEDULED',
        corridor_state: 'NORMAL',
        latitude: 28.6139,
        longitude: 77.2090
      });

      await transitionJunctionState(junc, 'ARMED', 'Audit log test verification');

      const auditEntries = await AuditLog.findAll({
        where: { action: 'JUNCTION_ARMED' }
      });
      expect(auditEntries.length).toBeGreaterThan(0);
    });
  });
});
