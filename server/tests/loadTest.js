/**
 * Standalone Socket.io load testing script for RescueLink.
 * Simulates multiple ambulances concurrently streaming telemetry to test server scaling.
 * 
 * Usage: NODE_ENV=test node server/tests/loadTest.js
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:5000';
const SIMULATED_AMBULANCES_COUNT = 50;
const STREAMING_INTERVAL_MS = 2000;
const DURATION_MS = 10000; // Run for 10 seconds

console.log(`[LOAD TEST] Starting Socket.io load simulator...`);
console.log(`[LOAD TEST] Target Server: ${SERVER_URL}`);
console.log(`[LOAD TEST] Simulating ${SIMULATED_AMBULANCES_COUNT} ambulances for ${DURATION_MS / 1000}s`);

const clients = [];
let messagesSent = 0;
let connectionsFailed = 0;

function connectAmbulance(id) {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: false
  });

  socket.on('connect', () => {
    // Join mission room
    socket.emit('join-mission', { incidentId: `incident-load-${id}` });

    // Periodically stream GPS & vitals logs
    const timer = setInterval(() => {
      const payload = {
        incidentId: `incident-load-${id}`,
        lat: 12.9716 + (Math.random() - 0.5) * 0.01,
        lng: 77.5946 + (Math.random() - 0.5) * 0.01,
        vitals: {
          heartRate: 70 + Math.floor(Math.random() * 30),
          spo2: 95 + Math.floor(Math.random() * 5),
          systolic: 120 + Math.floor(Math.random() * 20),
          diastolic: 80 + Math.floor(Math.random() * 10),
          temperature: 36.5 + (Math.random() * 1.5)
        }
      };

      socket.emit('vitals-update', payload);
      messagesSent++;
    }, STREAMING_INTERVAL_MS);

    clients.push({ socket, timer });
  });

  socket.on('connect_error', () => {
    connectionsFailed++;
  });
}

// Launch connections
for (let i = 1; i <= SIMULATED_AMBULANCES_COUNT; i++) {
  connectAmbulance(i);
}

// Teardown after duration
setTimeout(() => {
  console.log(`\n--- LOAD TEST RESULTS ---`);
  console.log(`Active Connections: ${clients.length}`);
  console.log(`Failed Connections: ${connectionsFailed}`);
  console.log(`Total Vitals Telemetry Packets Streamed: ${messagesSent}`);
  console.log(`-------------------------\n`);

  clients.forEach(c => {
    clearInterval(c.timer);
    c.socket.disconnect();
  });
  
  process.exit(connectionsFailed > 0 ? 1 : 0);
}, DURATION_MS);
