process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_rescuelink_jest_tests_32_chars';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mockKeyId12345'; // Force mock payments mode

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock Redis
jest.mock('../utils/redis', () => ({
  blacklistToken: jest.fn().mockResolvedValue(true),
  isTokenBlacklisted: jest.fn().mockResolvedValue(false)
}));

const mockHospital = { id: 'hosp-uuid-999', name: 'Metro Cardiac Center' };
const mockPatient = { id: 'pat-1', name: 'Jane Doe' };
const mockIncident = { id: 'incident-uuid-abc', patient_id: 'pat-1', hospital_id: 'hosp-uuid-999' };
const mockClaim = { id: 'claim-1', status: 'submitted' };
const mockErasure = { id: 'erasure-1', status: 'PENDING', patient_id: 'pat-1' };

const mockDb = {
  User: {
    findByPk: jest.fn().mockResolvedValue({ id: 'user-uuid-12345', role: 'city_admin' }),
    findOne: jest.fn().mockResolvedValue({ id: 'user-uuid-12345', role: 'city_admin' })
  },
  Hospital: {
    findByPk: jest.fn().mockResolvedValue(mockHospital)
  },
  Patient: {
    findByPk: jest.fn().mockResolvedValue(mockPatient),
    findOne: jest.fn().mockResolvedValue(mockPatient),
    create: jest.fn().mockResolvedValue(mockPatient),
    destroy: jest.fn().mockResolvedValue(1)
  },
  Incident: {
    findOne: jest.fn().mockResolvedValue(mockIncident),
    findAll: jest.fn().mockResolvedValue([mockIncident]),
    create: jest.fn().mockResolvedValue(mockIncident)
  },
  BloodRequest: {
    create: jest.fn().mockResolvedValue({ id: 'blood-1', blood_type: 'O+', units: 5 }),
    findAll: jest.fn().mockResolvedValue([{ id: 'blood-1', blood_type: 'O+', units: 5 }])
  },
  InsuranceClaim: {
    create: jest.fn().mockResolvedValue(mockClaim)
  },
  Consent: {
    destroy: jest.fn().mockResolvedValue(1)
  },
  VitalsHistory: {
    destroy: jest.fn().mockResolvedValue(1)
  },
  PendingErasure: {
    create: jest.fn().mockResolvedValue(mockErasure),
    findByPk: jest.fn().mockResolvedValue(mockErasure),
    findAll: jest.fn().mockResolvedValue([mockErasure])
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

describe('Additional Routes Integration Tests', () => {
  let token;

  beforeAll(() => {
    token = jwt.sign(
      { id: 'user-uuid-12345', name: 'City Admin', email: 'admin@rescuelink.com', role: 'city_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('Blood Bank Router (/api/blood)', () => {
    it('should create a blood request', async () => {
      const res = await request(app)
        .post('/api/blood/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ bloodType: 'O-', patientName: 'Aarav Sharma', urgency: 'CRITICAL' });

      expect(res.status).toBe(201);
      expect(res.body.bloodType).toBe('O-');
    });

    it('should retrieve blood request list', async () => {
      const res = await request(app)
        .get('/api/blood/requests')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Insurance Claim Router (/api/insurance)', () => {
    it('should file an insurance pre-approval eligibility successfully', async () => {
      const res = await request(app)
        .post('/api/insurance/pre-approve')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientName: 'Jane Doe', condition: 'Acute Heart Failure', estimatedCost: 150000 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBeDefined();
    });
  });

  describe('Payments Router (/api/payments)', () => {
    it('should create a payment order', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1500 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });
  });

  describe('Disaster (MCI) Router (/api/disaster)', () => {
    it('should retrieve alerts', async () => {
      const res = await request(app)
        .get('/api/disaster/ndma-alerts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Right-to-Erasure Router (/api/erasure)', () => {
    it('should register an erasure request', async () => {
      const res = await request(app)
        .post('/api/erasure/request')
        .set('Authorization', `Bearer ${token}`)
        .send({ patient_id: 'pat-1', reason: 'DPDP compliance request' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('PENDING');
    });

    it('should list pending erasure requests', async () => {
      const res = await request(app)
        .get('/api/erasure/pending')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
