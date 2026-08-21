require('dotenv').config();
const { io } = require('socket.io-client');
const { Incident, syncDatabase } = require('../utils/db');
const { initializeCorridorForRoute, evaluatePreemption } = require('../utils/emergencyCorridor');

// Connect client socket to local backend instance
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';
const socket = io(SOCKET_URL);

// Coordinate route checkpoints interpolating Vijayawada path
const ROUTE_PATH = [
  { lat: 16.5120, lng: 80.6385, name: 'Starting Point (Governorpet)' },
  { lat: 16.5085, lng: 80.6420, name: 'PCR Junction' },
  { lat: 16.5060, lng: 80.6455, name: 'En Route Labbipet' },
  { lat: 16.5042, lng: 80.6495, name: 'Labbipet Junction' },
  { lat: 16.5020, lng: 80.6525, name: 'En Route Benz Circle' },
  { lat: 16.5002, lng: 80.6554, name: 'Benz Circle' },
  { lat: 16.4975, lng: 80.6585, name: 'En Route Aster Ramesh' },
  { lat: 16.4950, lng: 80.6612, name: 'Aster Ramesh Cross' },
  { lat: 16.4930, lng: 80.6635, name: 'Aster Ramesh Hospital (Destination)' }
];

async function startSimulation() {
  console.log('--- STARTING EMERGENCY CORRIDOR SIMULATOR ---');
  await syncDatabase();

  // Find or create an active incident
  let activeIncident = await Incident.findOne({ where: { status: 'hospital_accepted' } });
  if (!activeIncident) {
    activeIncident = await Incident.create({
      status: 'hospital_accepted',
      pickup_lat: ROUTE_PATH[0].lat,
      pickup_lng: ROUTE_PATH[0].lng,
      pickup_address: 'Vijayawada Governorpet',
      news2_score: 8,
      notes: 'Cardiac Emergency Corridor Run'
    });
    console.log(`[SIM] Created new active incident for corridor simulator: ${activeIncident.id}`);
  } else {
    console.log(`[SIM] Hooking into existing active incident: ${activeIncident.id}`);
  }

  // Populate junctions
  await initializeCorridorForRoute(activeIncident.id, ROUTE_PATH);

  socket.on('connect', () => {
    console.log(`[SOCKET] Connected to RescueLink backend: ${SOCKET_URL}`);
    socket.emit('register-ambulance', {
      unitId: 'AMB-VIJ-108',
      driverName: 'Eshwar Rao',
      vehicleNo: 'AP-16-TJ-1081',
      token: 'mock-auth-token-bypass' // Sandbox auth bypass configured on mock checks
    });
  });

  let index = 0;
  const interval = setInterval(async () => {
    if (index >= ROUTE_PATH.length) {
      console.log('[SIM] Ambulance has reached the destination hospital. Stopping simulation.');
      clearInterval(interval);
      socket.disconnect();
      return;
    }

    const pos = ROUTE_PATH[index];
    console.log(`\n========================================`);
    console.log(`[SIM] STEP ${index + 1}: Ambulance location: ${pos.name} (${pos.lat}, ${pos.lng})`);

    // Emit live location update via socket
    socket.emit('location-update', {
      reqId: activeIncident.id,
      lat: pos.lat,
      lng: pos.lng,
      speed: 65, // km/h
      heading: 120,
      accuracy: 5,
      timestamp: Date.now(),
      arrivedAtUser: true
    });

    index++;
  }, 4000);
}

startSimulation().catch(err => {
  console.error('Simulation run error:', err);
});
