const request = require('supertest');
const { app } = require('../server');
const { Hospital, Ambulance, sequelize } = require('../utils/db');

describe('Web Push Subscription Persistence Verification', () => {

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  test('PUT /api/hospitals/:id/push-subscription - should return 200 and persist subscription to DB', async () => {
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

    const res = await request(app)
      .put(`/api/hospitals/${hospital.id}/push-subscription`)
      .send({ subscription: mockSub });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const dbRecord = await Hospital.findByPk(hospital.id);
    expect(dbRecord.push_subscription).toBeDefined();
    expect(JSON.parse(dbRecord.push_subscription).endpoint).toBe(mockSub.endpoint);

    await Hospital.destroy({ where: { id: hospital.id } });
  });

  test('PUT /api/ambulances/:id/push-subscription - should return 200 and persist subscription to DB', async () => {
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

    const res = await request(app)
      .put(`/api/ambulances/${ambulance.id}/push-subscription`)
      .send({ subscription: mockSub });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const dbRecord = await Ambulance.findByPk(ambulance.id);
    expect(dbRecord.push_subscription).toBeDefined();
    expect(JSON.parse(dbRecord.push_subscription).endpoint).toBe(mockSub.endpoint);

    await Ambulance.destroy({ where: { id: ambulance.id } });
  });
});

