const request = require('supertest');
const { Hospital, Ambulance, sequelize } = require('../utils/db');

describe('Web Push Subscription Persistence Verification', () => {

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  test('should save push_subscription JSON to Hospital DB record', async () => {
    const hospital = await Hospital.create({
      name: 'Push Test Hospital',
      lat: 18.5204,
      lng: 73.8567,
      is_active: true,
      verification_status: 'APPROVED'
    });

    const mockSub = {
      endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
      keys: { p256dh: 'BEl62iUYgU...', auth: 't7c385b0d...' }
    };

    const h = await Hospital.findByPk(hospital.id);
    h.push_subscription = JSON.stringify(mockSub);
    await h.save();

    const updated = await Hospital.findByPk(hospital.id);
    expect(updated.push_subscription).toBeDefined();
    expect(JSON.parse(updated.push_subscription).endpoint).toBe(mockSub.endpoint);

    await Hospital.destroy({ where: { id: hospital.id } });
  });

  test('should save push_subscription JSON to Ambulance DB record', async () => {
    const ambulance = await Ambulance.create({
      vehicleNo: 'MH12-PUSH-01',
      driverName: 'Push Paramedic',
      contactInfo: '+91-9999999999',
      password: 'password123',
      type: 'ALS',
      is_active: true,
      verification_status: 'APPROVED'
    });

    const mockSub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/eX78a...',
      keys: { p256dh: 'BN892j...', auth: 'u901a...' }
    };

    const amb = await Ambulance.findByPk(ambulance.id);
    amb.push_subscription = JSON.stringify(mockSub);
    await amb.save();

    const updated = await Ambulance.findByPk(ambulance.id);
    expect(updated.push_subscription).toBeDefined();
    expect(JSON.parse(updated.push_subscription).endpoint).toBe(mockSub.endpoint);

    await Ambulance.destroy({ where: { id: ambulance.id } });
  });
});
