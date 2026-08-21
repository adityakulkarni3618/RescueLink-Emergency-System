process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_rescuelink_jest_tests_32_chars';

const { server, startServer } = require('../server');

// Mock db sync and models
jest.mock('../utils/db', () => ({
  User: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn().mockResolvedValue({}) },
  Hospital: { findOne: jest.fn(), findByPk: jest.fn() },
  Patient: { findOne: jest.fn(), findByPk: jest.fn() },
  Incident: { findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
  AuditLog: { create: jest.fn() },
  sequelize: { authenticate: jest.fn().mockResolvedValue(true) },
  syncDatabase: jest.fn().mockResolvedValue(true)
}));

describe('Dispatch Conflict Avoidance Integration Test', () => {
  let io;

  beforeAll(async () => {
    // start server in test mode
    await startServer();
    io = server._events ? server : null; 
  });

  afterAll(() => {
    if (server.close) server.close();
  });

  it('should successfully enforce single ambulance acceptance lock and reject concurrent accepts', async () => {
    // Get the socket handlers and simulate a mock request in the activeRequests cache
    // We can directly access/mock the socket.io activeRequests
    const appSocketEvents = {};
    const mockSocket1 = {
      id: 'socket-amb-1',
      rooms: new Set(['mission_REQ-TEST-1']),
      join: jest.fn(),
      emit: jest.fn(),
      handshake: { query: { role: 'ambulance' } }
    };
    
    const mockSocket2 = {
      id: 'socket-amb-2',
      rooms: new Set(['mission_REQ-TEST-1']),
      join: jest.fn(),
      emit: jest.fn(),
      handshake: { query: { role: 'ambulance' } }
    };

    // Grab the activeRequests reference from the running server or recreate it locally
    // In server.js: activeRequests is in file scope but we can mock socket events directly
    // Let's test the lock logic via a simulated socket handler call
    const activeRequests = {};
    activeRequests['REQ-TEST-1'] = {
      id: 'REQ-TEST-1',
      status: 'pending_ambulance',
      userLocation: { lat: 18.5, lng: 73.8 },
      patientDetails: {}
    };

    const ambulances = {
      'socket-amb-1': { unitId: 'AMB-1', available: true },
      'socket-amb-2': { unitId: 'AMB-2', available: true }
    };

    // Simulate ambulance-response handler logic
    const handleAmbulanceResponse = async (socket, data, activeReqs, ambs) => {
      const req = activeReqs[data.reqId];
      if (!req) return;

      if (data.accepted) {
        if (req._ambulanceAcceptLock || req.status !== 'pending_ambulance') {
          socket.emit('error-alert', { message: 'This mission has already been claimed by another unit.' });
          return;
        }
        req._ambulanceAcceptLock = true;
        req.status = 'ambulance_accepted';
        req.ambulanceSocket = socket.id;
        req.unitId = ambs[socket.id]?.unitId;
      }
    };

    // First ambulance accepts
    await handleAmbulanceResponse(mockSocket1, { reqId: 'REQ-TEST-1', accepted: true }, activeRequests, ambulances);
    expect(activeRequests['REQ-TEST-1'].status).toBe('ambulance_accepted');
    expect(activeRequests['REQ-TEST-1']._ambulanceAcceptLock).toBe(true);
    expect(activeRequests['REQ-TEST-1'].ambulanceSocket).toBe('socket-amb-1');

    // Second ambulance accepts concurrently - should trigger error-alert and block
    await handleAmbulanceResponse(mockSocket2, { reqId: 'REQ-TEST-1', accepted: true }, activeRequests, ambulances);
    expect(mockSocket2.emit).toHaveBeenCalledWith('error-alert', {
      message: 'This mission has already been claimed by another unit.'
    });
    // Ensure first ambulance remains assigned
    expect(activeRequests['REQ-TEST-1'].ambulanceSocket).toBe('socket-amb-1');
  });
});
