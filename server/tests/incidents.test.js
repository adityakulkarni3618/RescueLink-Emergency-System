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
  name: 'Test Doctor',
  email: 'doctor@rescuelink.com',
  password: 'hashedpassword',
  role: 'doctor',
  hospital_id: 'hosp-uuid-999',
  is_active: true,
  toJSON: function() {
    return { id: this.id, name: this.name, email: this.email, role: this.role, hospital_id: this.hospital_id };
  }
};

const mockHospital = {
  id: 'hosp-uuid-999',
  name: 'Metro Cardiac Center',
  total_beds: 100,
  icu_beds: 10,
  ventilators: 5
};

const mockPatient = {
  id: 'pat-1',
  name: 'Jane Doe',
  abha_number: '123456789012'
};

const mockIncident = {
  id: 'REQ-12345',
  patient_id: 'pat-1',
  status: 'completed',
  pickup_lat: 12.9716,
  pickup_lng: 77.5946,
  news2_score: 5,
  notes: 'Stable',
  createdAt: new Date(),
  Hospital: { name: 'Metro Cardiac Center' }
};

const mockDb = {
  User: {
    findOne: jest.fn().mockResolvedValue(mockUser),
    findByPk: jest.fn().mockResolvedValue(mockUser)
  },
  Hospital: {
    findAll: jest.fn().mockResolvedValue([mockHospital]),
    findByPk: jest.fn().mockResolvedValue(mockHospital)
  },
  Patient: {
    findOne: jest.fn().mockResolvedValue(mockPatient),
    findByPk: jest.fn().mockResolvedValue(mockPatient)
  },
  Incident: {
    count: jest.fn().mockResolvedValue(10),
    findAll: jest.fn().mockResolvedValue([mockIncident]),
    findOne: jest.fn().mockResolvedValue(mockIncident)
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

// Mock Database models using the relative path from the test file to satisfy Jest's resolver
jest.mock('../utils/db', () => mockDb);


// Import app
const { app } = require('../server');

describe('Incidents & Status Endpoints', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign(
      { id: 'user-uuid-12345', name: 'Test Doctor', email: 'doctor@rescuelink.com', role: 'doctor' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/status', () => {
    it('should retrieve system statuses and connected role counts', async () => {
      const res = await request(app)
        .get('/api/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('activeMissionsCount');
      expect(res.body).toHaveProperty('connectedRoles');
    });
  });

  describe('GET /api/hospitals', () => {
    it('should return a list of active hospital tenants', async () => {
      const res = await request(app)
        .get('/api/hospitals');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe('Metro Cardiac Center');
    });
  });

  describe('GET /api/analytics/occupancy', () => {
    it('should calculate bed and ventilator occupancy rates', async () => {
      const res = await request(app)
        .get('/api/analytics/occupancy')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('occupancyRate');
      expect(res.body[0].icuBeds).toBe(10);
    });
  });
});
