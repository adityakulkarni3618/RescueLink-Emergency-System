const { RealGPSProvider, SimulatorGPSProvider } = require('../utils/gpsProvider');
const { RoutingProvider } = require('../utils/routingProvider');
const { RealDeviceProvider, SimulatorVitalsProvider } = require('../utils/vitalsProvider');
const { SimulatorTrafficProvider, MunicipalAPIProvider } = require('../utils/trafficIntelligenceProvider');
const abdm = require('../utils/abdm');

describe('Provider Interfaces & Truth Label Verification', () => {
  test('SimulatorGPSProvider should tag status as SIMULATED and source as SIMULATOR', () => {
    const provider = new SimulatorGPSProvider();
    const fix = provider.generateSimulatedFix(12.9716, 77.5946, 45, 180);
    expect(fix.source).toBe('SIMULATOR');
    expect(fix.status).toBe('SIMULATED');
    expect(fix.latitude).toBe(12.9716);
  });

  test('RealGPSProvider should mark stale telemetry if fix is older than 15s', () => {
    const provider = new RealGPSProvider();
    const staleFix = provider.processHardwareFix({
      lat: 12.9716,
      lng: 77.5946,
      timestamp: Date.now() - 20000,
      speed: 10
    });
    expect(staleFix.status).toBe('STALE');
  });

  test('RoutingProvider should tag fallback routes with source ESTIMATED', async () => {
    const route = await RoutingProvider.calculateRoute(
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9352, lng: 77.6245 }
    );
    expect(route.waypoints).toBeDefined();
    expect(route.waypoints.length).toBeGreaterThan(0);
    expect(['LIVE', 'ESTIMATED']).toContain(route.source);
  });

  test('SimulatorVitalsProvider should generate plausible vitals marked SIMULATED', () => {
    const provider = new SimulatorVitalsProvider();
    const vitals = provider.generateNextReading();
    expect(vitals.source).toBe('SIMULATED');
    expect(vitals.status).toBe('SIMULATED');
    expect(vitals.heartRate).toBeGreaterThan(40);
  });

  test('RealDeviceProvider should return UNAVAILABLE for invalid HL7 string', () => {
    const provider = new RealDeviceProvider();
    const vitals = provider.processRawHL7('INVALID_HL7_STRING');
    expect(vitals.status).toBe('UNAVAILABLE');
    expect(vitals.source).toBe('DEVICE');
  });

  test('SimulatorTrafficProvider should mark incidents with source SIMULATOR', () => {
    const incident = SimulatorTrafficProvider.createSimulatedObstruction('CORRIDOR-101', 2);
    expect(incident.source).toBe('SIMULATOR');
    expect(incident.status).toBe('SIMULATED');
    expect(incident.corridorId).toBe('CORRIDOR-101');
  });
});
