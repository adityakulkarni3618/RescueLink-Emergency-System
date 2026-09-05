const { rankAmbulancesByRealETA } = require('../services/dispatchAgent');
const { createSystemNotification, getPendingNotifications, clearDeliveredNotifications } = require('../utils/systemNotifications');

describe('Offline Registered Ambulance & System Notifications', () => {
  test('should queue and retrieve pending system notifications for offline units', () => {
    const notif = createSystemNotification(
      'AMB-TEST-001',
      'ambulance',
      '🚨 TEST DISPATCH',
      'Test emergency notification',
      { reqId: 'REQ-123' }
    );

    expect(notif).toBeDefined();
    expect(notif.recipientId).toBe('AMB-TEST-001');

    const pending = getPendingNotifications('AMB-TEST-001');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].title).toBe('🚨 TEST DISPATCH');

    clearDeliveredNotifications('AMB-TEST-001');
    const remaining = getPendingNotifications('AMB-TEST-001');
    expect(remaining.length).toBe(0);
  });

  test('should rank DB registered ambulances alongside live socket units', async () => {
    const liveUnits = [
      {
        unitId: 'LIVE-AMB-01',
        socketId: 'sock_123',
        location: { lat: 18.5204, lng: 73.8567 },
        available: true
      }
    ];

    const ranked = await rankAmbulancesByRealETA(18.5200, 73.8500, liveUnits);
    expect(Array.isArray(ranked)).toBe(true);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].ambulance).toBeDefined();
    expect(ranked[0].etaSeconds).toBeGreaterThanOrEqual(0);
  }, 30000);
});
