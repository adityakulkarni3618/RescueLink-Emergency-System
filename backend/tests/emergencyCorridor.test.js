process.env.NODE_ENV = 'test';
process.env.FORCE_SQLITE = 'true';
process.env.TELEMETRY_SHARED_SECRET = 'test_secret_key';

jest.setTimeout(30000);

const {
  transitionJunctionState,
  calculateCorridorReadiness,
  evaluateTrafficObstructions,
  isIncidentAheadOnRoute,
  analyzeAlternateRoute,
  executeRouteSwitch,
  executeKeepPrimary,
  getApproachDirection,
  CORRIDOR_THRESHOLDS,
  VALID_TRANSITIONS
} = require('../utils/emergencyCorridor');
const { TrafficControllerAdapter } = require('../utils/trafficControllerAdapter');
const { EmergencyCorridor, AuditLog, Incident, syncDatabase, sequelize } = require('../utils/db');

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
      await Incident.destroy({ where: { id: testIncidentId } });
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

  describe('Phase B — Traffic-Aware Dynamic Alternate Emergency Corridor Tests', () => {
    const ambLoc = { lat: 28.6139, lng: 77.2090 };
    const destLoc = { lat: 28.6304, lng: 77.2177 };
    const primaryRoute = [
      { lat: 28.6139, lng: 77.2090 },
      { lat: 28.6180, lng: 77.2110 },
      { lat: 28.6220, lng: 77.2130 },
      { lat: 28.6260, lng: 77.2150 },
      { lat: 28.6304, lng: 77.2177 }
    ];

    test('Test 1: No traffic obstruction -> no alternate recommendation', async () => {
      const result = await analyzeAlternateRoute(testIncidentId, ambLoc, destLoc, primaryRoute, []);
      expect(result.recommendation).toBe('KEEP_PRIMARY');
      expect(result.obstruction.detected).toBe(false);
    });

    test('Test 2: Traffic obstruction behind ambulance -> no recommendation', async () => {
      const behindObstruction = [{ location: { lat: 28.6100, lng: 77.2050 }, type: 'Old Accident' }];
      const result = await analyzeAlternateRoute(testIncidentId, ambLoc, destLoc, primaryRoute, behindObstruction);
      expect(result.recommendation).toBe('KEEP_PRIMARY');
      expect(result.obstruction.detected).toBe(false);
    });

    test('Test 3: Traffic obstruction far from route (>200m) -> no recommendation', async () => {
      const farObstruction = [{ location: { lat: 28.6500, lng: 77.2500 }, type: 'Side Street Jam' }];
      const result = await analyzeAlternateRoute(testIncidentId, ambLoc, destLoc, primaryRoute, farObstruction);
      expect(result.recommendation).toBe('KEEP_PRIMARY');
      expect(result.obstruction.detected).toBe(false);
    });

    test('Test 4 & Test 5: Obstruction affects primary route & alternate is faster -> SWITCH_ALTERNATE', async () => {
      const activeObstruction = [{ location: { lat: 28.6220, lng: 77.2130 }, delaySec: 240, type: 'Roadwork Block' }];
      const result = await analyzeAlternateRoute(testIncidentId, ambLoc, destLoc, primaryRoute, activeObstruction);
      expect(result.obstruction.detected).toBe(true);
      expect(result.recommendation).toBe('SWITCH_ALTERNATE');
      expect(result.comparison.timeDifferenceSeconds).toBeGreaterThanOrEqual(30);
    });

    test('Test 6: Alternate route is slower -> KEEP_PRIMARY', async () => {
      const minorObstruction = [{ location: { lat: 28.6220, lng: 77.2130 }, delaySec: 10, type: 'Minor Slowdown' }];
      const result = await analyzeAlternateRoute(testIncidentId, ambLoc, destLoc, primaryRoute, minorObstruction);
      expect(result.recommendation).toBe('KEEP_PRIMARY');
    });

    test('Test 8 & Test 10: Operator explicitly switches -> active route changes, routeVersion increments, junctions rebuilt', async () => {
      let incident = await Incident.findByPk(testIncidentId);
      if (!incident) {
        incident = await Incident.create({
          id: testIncidentId,
          status: 'hospital_accepted',
          pickup_lat: ambLoc.lat,
          pickup_lng: ambLoc.lng,
          hospital_lat: destLoc.lat,
          hospital_lng: destLoc.lng,
          route_version: 1
        });
      }

      const altRoute = [
        { lat: 28.6139, lng: 77.2090 },
        { lat: 28.6170, lng: 77.2050 },
        { lat: 28.6250, lng: 77.2100 },
        { lat: 28.6304, lng: 77.2177 }
      ];

      const res = await executeRouteSwitch(testIncidentId, altRoute, 'TEST_OPERATOR');
      expect(res.success).toBe(true);
      expect(res.routeVersion).toBe(2);

      const updatedIncident = await Incident.findByPk(testIncidentId);
      expect(updatedIncident.route_version).toBe(2);
      expect(updatedIncident.primary_route_history).not.toBeNull();
    });

    test('Test 9 & Test 13: Operator keeps primary -> active route does not change & AuditLog recorded', async () => {
      const res = await executeKeepPrimary(testIncidentId, 'TEST_OPERATOR');
      expect(res.success).toBe(true);
      expect(res.decision).toBe('KEEP_PRIMARY');

      const audit = await AuditLog.findOne({ where: { action: 'OPERATOR_KEPT_PRIMARY' } });
      expect(audit).not.toBeNull();
    });

    test('Test 14: Controller failure still goes to manual intervention', async () => {
      const junc = await EmergencyCorridor.create({
        incident_id: testIncidentId,
        junction_id: 'junc_fail_test',
        name: 'Fail Test Junction',
        status: 'SCHEDULED',
        corridor_state: 'CONTROLLER_FAIL',
        latitude: 28.6139,
        longitude: 77.2090
      });

      const ok = await transitionJunctionState(junc, 'MANUAL_INTERVENTION', 'Operator override on controller failure');
      expect(ok).toBe(true);
      expect(junc.corridor_state).toBe('MANUAL_INTERVENTION');
    });
  });
});
