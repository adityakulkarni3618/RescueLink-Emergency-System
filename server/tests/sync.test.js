process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_rescuelink_jest_tests_32_chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock Redis
jest.mock('../utils/redis', () => ({
  blacklistToken: jest.fn().mockResolvedValue(true),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false)
}));

const mockUser = {
  id: 'user-uuid-12345',
  name: 'Test Paramedic',
  email: 'paramedic@rescuelink.com',
  role: 'paramedic',
  hospital_id: 'hosp-uuid-999',
  is_active: true,
  toJSON: function() {
    return { id: this.id, name: this.name, email: this.email, role: this.role, hospital_id: this.hospital_id };
  }
};

const mockIncident = {
  id: 'REQ-12345',
  patient_id: 'pat-1',
  status: 'requested',
  gps_log: [],
  vitals_log: [],
  news2_score: 0,
  save: jest.fn().mockResolvedValue(true)
};

const mockDb = {
  User: {
    findOne: jest.fn().mockResolvedValue(mockUser),
    findByPk: jest.fn().mockResolvedValue(mockUser)
  },
  Incident: {
    findByPk: jest.fn().mockResolvedValue(mockIncident),
    findOne: jest.fn().mockResolvedValue(mockIncident),
    findAll: jest.fn().mockResolvedValue([])
  },
  AuditLog: {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' })
  },
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    sync: jest.fn().mockResolvedValue(true)
  },
  syncDatabase: jest.fn().mockResolvedValue(true)
};

jest.mock('../utils/db', () => mockDb);

const { app } = require('../server');

describe('Offline Queue Sync Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign(
      { id: 'user-uuid-12345', name: 'Test Paramedic', email: 'paramedic@rescuelink.com', role: 'paramedic' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/sync/batch', () => {
    it('should fail if incidentId is missing', async () => {
      const res = await request(app)
        .post('/api/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ gpsQueue: [], vitalsQueue: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Incident ID is required');
    });

    it('should fail if incident is not found', async () => {
      mockDb.Incident.findOne.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ incidentId: 'REQ-NOT-FOUND', gpsQueue: [], vitalsQueue: [] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Incident not found');
    });

    it('should successfully sync GPS and vitals logs and update NEWS2 score', async () => {
      mockIncident.save.mockClear();
      mockDb.Incident.findOne.mockResolvedValueOnce(mockIncident);

      const gpsQueue = [
        { latitude: 18.5204, longitude: 73.8567, speed: 40, heading: 90, accuracy: 5, timestamp: 1680000000000 }
      ];
      const vitalsQueue = [
        { heartRate: '85', spo2: '97', systolic: '125', respRate: '16', temp: '36.8', timestamp: 1680000000000 }
      ];

      const res = await request(app)
        .post('/api/sync/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ incidentId: 'REQ-12345', gpsQueue, vitalsQueue });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.gpsRecordsSynced).toBe(1);
      expect(res.body.vitalsRecordsSynced).toBe(1);
      expect(mockIncident.save).toHaveBeenCalled();
    });
  });
});
