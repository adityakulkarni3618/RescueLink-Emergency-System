require('dotenv').config();
const { io: ioClient } = require('socket.io-client');
const { Incident, syncDatabase } = require('../utils/db');
const { initializeCorridorForRoute } = require('../utils/emergencyCorridor');
const { getSmartRouteObjects } = require('../utils/osrmService');

// Connect client socket to local backend instance
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';
const socket = ioClient(SOCKET_URL);

/**
 * Emergency Corridor Simulator — DYNAMIC REAL-WORLD VERSION
 *
 * This script:
 *  1. Finds an active hospital_accepted mission in the DB
 *  2. Fetches its real pickup/hospital locations
 *  3. Queries OSRM/public routing API for the actual road route
 *  4. Initializes corridor junctions along that route (with real junction names via Nominatim)
 *  5. Replays ambulance movement step-by-step for live testing
 *
 * Usage:
 *   node scripts/corridorSimulator.js
 *   OR with explicit coordinates for testing:
 *   FROM_LAT=28.6139 FROM_LNG=77.2090 TO_LAT=28.6304 TO_LNG=77.2177 node scripts/corridorSimulator.js
 */

async function buildRouteFromIncident(activeIncident) {
  const fromLat = parseFloat(process.env.FROM_LAT) || activeIncident.pickup_lat;
  const fromLng = parseFloat(process.env.FROM_LNG) || activeIncident.pickup_lng;
  const toLat = parseFloat(process.env.TO_LAT) || activeIncident.hospital_lat;
  const toLng = parseFloat(process.env.TO_LNG) || activeIncident.hospital_lng;

  if (!fromLat || !fromLng) {
    throw new Error('No pickup location available on the incident. Set FROM_LAT/FROM_LNG env vars to override.');
  }

  const origin = { lat: fromLat, lng: fromLng };
  const dest = toLat && toLng ? { lat: toLat, lng: toLng } : null;

  if (!dest) {
    console.warn('[SIM] No hospital destination on incident. Using a default 3km offset destination for testing.');
    dest = { lat: fromLat + 0.025, lng: fromLng + 0.025 };
  }

  console.log(`[SIM] Fetching real-world route: ${origin.lat},${origin.lng} → ${dest.lat},${dest.lng}`);
  const routePoints = await getSmartRouteObjects(origin, dest);
  if (!routePoints || routePoints.length < 2) {
    throw new Error('Routing API returned empty route. Check connectivity.');
  }

  console.log(`[SIM] Real-world route fetched: ${routePoints.length} waypoints`);
  return routePoints;
}

async function startSimulation() {
  console.log('\n--- EMERGENCY CORRIDOR SIMULATOR (REAL-WORLD DYNAMIC) ---\n');
  await syncDatabase();

  // Find an active mission to hook into
  let activeIncident = await Incident.findOne({ where: { status: 'hospital_accepted' } });

  if (!activeIncident) {
    // For testing: create a synthetic incident using env-provided or default coordinates
    const fromLat = parseFloat(process.env.FROM_LAT) || 28.6139; // Default: New Delhi
    const fromLng = parseFloat(process.env.FROM_LNG) || 77.2090;
    const toLat = parseFloat(process.env.TO_LAT) || 28.6304;
    const toLng = parseFloat(process.env.TO_LNG) || 77.2177;

    activeIncident = await Incident.create({
      status: 'hospital_accepted',
      pickup_lat: fromLat,
      pickup_lng: fromLng,
      hospital_lat: toLat,
      hospital_lng: toLng,
      pickup_address: `Dynamic SIM Origin (${fromLat.toFixed(4)}, ${fromLng.toFixed(4)})`,
      news2_score: 8,
      notes: 'Emergency Corridor Simulator Run — Dynamic Real-World Route'
    });
    console.log(`[SIM] Created synthetic incident: ${activeIncident.id}`);
  } else {
    console.log(`[SIM] Hooking into existing active incident: ${activeIncident.id}`);
  }

  // Build the real-world route
  let routePoints;
  try {
    routePoints = await buildRouteFromIncident(activeIncident);
  } catch (err) {
    console.error('[SIM] Route build failed:', err.message);
    process.exit(1);
  }

  // Initialize corridor junctions with real OSM junction names
  console.log('[SIM] Initializing corridor junctions (reverse geocoding via Nominatim)...');
  await initializeCorridorForRoute(activeIncident.id, routePoints);

  socket.on('connect', () => {
    console.log(`[SOCKET] Connected to RescueLink backend: ${SOCKET_URL}`);
    socket.emit('register-ambulance', {
      unitId: 'AMB-SIM-DYNAMIC',
      driverName: 'Dynamic Simulator Unit',
      vehicleNo: 'SIM-DYNAMIC-001',
      token: 'mock-auth-token-bypass'
    });
  });

  socket.on('corridor:preempt_junction', (data) => {
    console.log(`[CORRIDOR] 🚦 PREEMPTING: ${data.name} (${data.distance}m away)`);
  });

  socket.on('corridor:route_cleared', (data) => {
    console.log(`[CORRIDOR] ✅ CLEARED: ${data.name}`);
  });

  socket.on('corridor:status_update', (data) => {
    console.log(`[CORRIDOR] Status → ${data.name}: ${data.status}`);
  });

  // Replay ambulance movement step-by-step along real route
  let index = 0;
  const interval = setInterval(async () => {
    if (index >= routePoints.length) {
      console.log('\n[SIM] ✅ Ambulance reached destination. Simulation complete.');
      clearInterval(interval);
      socket.disconnect();
      return;
    }

    const pos = routePoints[index];
    console.log(`\n[SIM] Step ${index + 1}/${routePoints.length}: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);

    socket.emit('location-update', {
      reqId: activeIncident.id,
      lat: pos.lat,
      lng: pos.lng,
      speed: 65,
      heading: 0,
      accuracy: 5,
      timestamp: Date.now(),
      arrivedAtUser: true
    });

    index++;
  }, 3000); // Move every 3 seconds
}

startSimulation().catch(err => {
  console.error('[SIM] Fatal error:', err.message);
  process.exit(1);
});
