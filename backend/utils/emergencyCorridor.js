const crypto = require('crypto');
const fetch = require('node-fetch');
const { EmergencyCorridor, AuditLog } = require('./db');
const { defaultControllerAdapter } = require('./trafficControllerAdapter');

// Secure Key for telemetry validation (loaded from environment)
const TELEMETRY_SHARED_SECRET = process.env.TELEMETRY_SHARED_SECRET || 'emergency-corridor-secure-token-108';

/**
 * Configurable Corridor Operational Thresholds
 */
const CORRIDOR_THRESHOLDS = {
  ARM_ETA_SECONDS: 60,          // ETA > 60s -> ARMED
  APPROACH_ETA_SECONDS: 30,     // 30-60s -> APPROACHING
  PREEMPT_REQ_ETA_SECONDS: 15,  // 10-30s -> PREEMPT_REQUESTED
  PREEMPT_ACTIVE_ETA_SECONDS: 8, // < 10s -> PREEMPT_ACTIVE
  APPROACH_RADIUS: 500,         // meters
  PASSAGE_RADIUS: 40,           // meters (enters junction pass zone)
  CLEAR_RADIUS: 70,             // meters (clears junction boundary)
  FALLBACK_SPEED_KMH: 50,       // km/h default fallback speed when telemetry speed is missing/invalid
  GPS_NOISE_THRESHOLD: 15       // meters
};

/**
 * Phase B Alternate Routing Operational Constants
 */
const ALTERNATE_ROUTE_MIN_SAVING_SECONDS = parseInt(process.env.ALTERNATE_ROUTE_MIN_SAVING_SECONDS || '30', 10);
const ROUTE_OBSTRUCTION_RADIUS_METERS = parseInt(process.env.ROUTE_OBSTRUCTION_RADIUS_METERS || '200', 10);
const ROUTE_RECOMMENDATION_COOLDOWN_SECONDS = parseInt(process.env.ROUTE_RECOMMENDATION_COOLDOWN_SECONDS || '30', 10);

// Recommendation cooldown timestamp tracking per incident
const recommendationCooldowns = {};

/**
 * Deterministic Junction State Machine Transition Graph
 */
const VALID_TRANSITIONS = {
  NORMAL: ['ARMED', 'APPROACHING', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION', 'PREEMPTING', 'SCHEDULED'],
  ARMED: ['APPROACHING', 'PREEMPT_REQUESTED', 'NORMAL', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  APPROACHING: ['PREEMPT_REQUESTED', 'PREEMPT_ACTIVE', 'ARMED', 'NORMAL', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  PREEMPT_REQUESTED: ['PREEMPT_ACTIVE', 'AMBULANCE_PASSING', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION', 'NORMAL'],
  PREEMPT_ACTIVE: ['AMBULANCE_PASSING', 'CLEARING', 'CORRIDOR_ACTIVE', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  AMBULANCE_PASSING: ['CLEARING', 'RESTORING', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  CLEARING: ['RESTORING', 'NORMAL', 'PASSED', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  RESTORING: ['NORMAL', 'ARMED', 'PASSED', 'CONTROLLER_FAIL', 'MANUAL_INTERVENTION'],
  CONTROLLER_FAIL: ['MANUAL_INTERVENTION', 'RESTORING', 'NORMAL', 'ARMED'],
  MANUAL_INTERVENTION: ['PREEMPT_ACTIVE', 'RESTORING', 'NORMAL', 'PASSED']
};

/**
 * Standard Kalman Filter state tracker to smooth GPS drift
 */
class GPSKalmanFilter {
  constructor() {
    this.Q = 0.000001; // Process variance
    this.R = 0.00001;  // Measurement variance
    this.lat = null;
    this.lng = null;
    this.P = 1.0;      // Estimation error covariance
  }

  filter(measuredLat, measuredLng) {
    if (this.lat === null || this.lng === null) {
      this.lat = measuredLat;
      this.lng = measuredLng;
      return { lat: measuredLat, lng: measuredLng };
    }

    // Time update (prediction)
    this.P = this.P + this.Q;

    // Measurement update (correction)
    const K = this.P / (this.P + this.R); // Kalman gain
    this.lat = this.lat + K * (measuredLat - this.lat);
    this.lng = this.lng + K * (measuredLng - this.lng);
    this.P = (1 - K) * this.P;

    return { lat: this.lat, lng: this.lng };
  }
}

// Track filters and telemetry timestamps in-memory
const activeKalmanFilters = {};
const lastIncidentTelemetryUpdate = {};

/**
 * Calculates distance in meters using Haversine formula
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculates bearing in degrees between two points
 */
function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  const bearing = ((theta * 180) / Math.PI + 360) % 360;
  return bearing;
}

/**
 * Converts bearing angle to cardinal approach direction string (e.g., "South → North")
 */
function getApproachDirection(prevPt, currPt) {
  if (!prevPt || !currPt) return 'Northbound';
  const bearing = calculateBearing(prevPt.lat, prevPt.lng, currPt.lat, currPt.lng);

  if (bearing >= 337.5 || bearing < 22.5) return 'South → North';
  if (bearing >= 22.5 && bearing < 67.5) return 'Southwest → Northeast';
  if (bearing >= 67.5 && bearing < 112.5) return 'West → East';
  if (bearing >= 112.5 && bearing < 157.5) return 'Northwest → Southeast';
  if (bearing >= 157.5 && bearing < 202.5) return 'North → South';
  if (bearing >= 202.5 && bearing < 247.5) return 'Northeast → Southwest';
  if (bearing >= 247.5 && bearing < 292.5) return 'East → West';
  if (bearing >= 292.5 && bearing < 337.5) return 'Southeast → Northwest';
  return 'Northbound';
}

/**
 * Deterministic State Machine Transition Validator & Executor
 */
async function transitionJunctionState(junction, targetState, reason = '', auditContext = {}) {
  const currentState = junction.corridor_state || junction.status || 'NORMAL';

  if (currentState === targetState) return false;

  const allowed = VALID_TRANSITIONS[currentState] || [];
  // Allow explicit override if force is requested
  const isAllowed = allowed.includes(targetState) || auditContext.force === true;

  if (!isAllowed) {
    console.warn(`[CORRIDOR STATE MACHINE REJECTED] Invalid transition from ${currentState} to ${targetState} for junction ${junction.name}`);
    return false;
  }

  junction.corridor_state = targetState;
  // Maintain backward-compatible status field string mapping
  if (['NORMAL', 'ARMED', 'SCHEDULED'].includes(targetState)) junction.status = 'SCHEDULED';
  else if (['APPROACHING', 'PREEMPT_REQUESTED', 'PREEMPTING'].includes(targetState)) junction.status = 'PREEMPTING';
  else if (['PREEMPT_ACTIVE', 'AMBULANCE_PASSING', 'CORRIDOR_ACTIVE'].includes(targetState)) junction.status = 'CORRIDOR_ACTIVE';
  else if (['CLEARING', 'RESTORING', 'PASSED'].includes(targetState)) junction.status = 'PASSED';
  else junction.status = targetState;

  if (targetState === 'PREEMPT_REQUESTED') junction.preemption_requested = true;
  if (targetState === 'PREEMPT_ACTIVE') junction.preemption_active = true;
  if (targetState === 'CLEARING' || targetState === 'RESTORING' || targetState === 'NORMAL') {
    junction.preemption_requested = false;
    junction.preemption_active = false;
  }
  if (targetState === 'CONTROLLER_FAIL') {
    junction.controller_status = 'FAILED';
  } else if (['PREEMPT_ACTIVE', 'AMBULANCE_PASSING'].includes(targetState)) {
    junction.controller_status = 'ACTIVE';
  } else if (['ARMED', 'APPROACHING', 'PREEMPT_REQUESTED'].includes(targetState)) {
    junction.controller_status = 'ACKNOWLEDGED';
  } else if (targetState === 'NORMAL') {
    junction.controller_status = 'ONLINE';
  }

  junction.last_updated = new Date();
  await junction.save();

  // Create immutable audit log entry
  const severity = (targetState === 'CONTROLLER_FAIL' || targetState === 'MANUAL_INTERVENTION') ? 'WARNING' : 'INFO';
  await AuditLog.create({
    action: `JUNCTION_${targetState}`,
    details: `Emergency Corridor Coordination: Junction "${junction.name}" (Incident: ${junction.incident_id}) transitioned ${currentState} -> ${targetState}. ${reason}`,
    severity
  }).catch(err => console.error('[AUDIT LOG ERROR]', err.message));

  return true;
}

/**
 * Reverse geocode a coordinate to get a human-readable junction name via Nominatim
 */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const res = await fetch(url, {
      timeout: 4000,
      headers: { 'User-Agent': 'RescueLink-Emergency-System/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const parts = [
      addr.road || addr.highway || addr.pedestrian,
      addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district,
      addr.city || addr.town || addr.village
    ].filter(Boolean);
    return parts.length > 0 ? parts.slice(0, 2).join(', ') : (data.display_name || `Junction @ ${lat.toFixed(4)},${lng.toFixed(4)}`);
  } catch (err) {
    return null;
  }
}

/**
 * Dynamically extract and register junctions along any OSRM route polyline.
 */
async function initializeCorridorForRoute(incidentId, routeCoordinates, routeVersion = 1) {
  try {
    await EmergencyCorridor.destroy({ where: { incident_id: incidentId } });

    if (!routeCoordinates || routeCoordinates.length < 2) return [];

    const normalizedRoute = routeCoordinates.map(c => {
      if (Array.isArray(c)) return { lat: c[0], lng: c[1] };
      return { lat: c.lat, lng: c.lng };
    }).filter(c => c.lat && c.lng);

    if (normalizedRoute.length < 2) return [];

    const corridors = [];
    let junctionIndex = 1;
    let lastJunctionPoint = normalizedRoute[0];
    let etaAccumulator = 45;
    let accumulatedDistanceStart = 0;

    for (let i = 1; i < normalizedRoute.length - 1; i++) {
      const coord = normalizedRoute[i];
      const prevCoord = normalizedRoute[i - 1];
      const distFromLast = getDistanceMeters(lastJunctionPoint.lat, lastJunctionPoint.lng, coord.lat, coord.lng);
      accumulatedDistanceStart += getDistanceMeters(prevCoord.lat, prevCoord.lng, coord.lat, coord.lng);

      if (distFromLast >= 1000) { // Spacing ~1km between junctions
        const startWindow = new Date(Date.now() + (etaAccumulator - 20) * 1000);
        const endWindow = new Date(Date.now() + (etaAccumulator + 40) * 1000);

        let junctionName = await reverseGeocode(coord.lat, coord.lng);
        if (!junctionName) {
          junctionName = `Junction #${junctionIndex} (${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)})`;
        }

        const approachDir = getApproachDirection(prevCoord, coord);

        const node = await EmergencyCorridor.create({
          incident_id: incidentId,
          junction_id: `junc_${incidentId}_v${routeVersion}_${junctionIndex}`,
          name: junctionName,
          status: 'SCHEDULED',
          corridor_state: 'NORMAL',
          route_order: junctionIndex,
          distance_from_ambulance: Math.round(accumulatedDistanceStart),
          distance_from_start: Math.round(accumulatedDistanceStart),
          eta_seconds: etaAccumulator,
          approach_direction: approachDir,
          required_movement: 'Through',
          normal_signal_state: 'RED_CYCLE',
          preemption_requested: false,
          preemption_active: false,
          controller_status: 'ONLINE',
          gps_confidence: 'HIGH',
          preempt_window_start: startWindow,
          preempt_window_end: endWindow,
          latitude: coord.lat,
          longitude: coord.lng,
          route_version: routeVersion,
          last_updated: new Date()
        });

        corridors.push(node);
        console.log(`[CORRIDOR] Junction ${junctionIndex} (v${routeVersion}): "${junctionName}" (${approachDir}) @ ${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`);
        junctionIndex++;
        lastJunctionPoint = coord;
        etaAccumulator += 80;
      }
    }

    await AuditLog.create({
      action: 'CORRIDOR_CREATED',
      details: `Initialized ${corridors.length} emergency corridor preemption junctions (v${routeVersion}) for incident ${incidentId}`,
      severity: 'INFO'
    }).catch(e => {});

    console.log(`[CORRIDOR COORDINATION] Registered ${corridors.length} route junctions (v${routeVersion}) for incident ${incidentId}`);
    return corridors;
  } catch (err) {
    console.error(`[PREEMPTION INIT ERROR]`, err.message);
    return [];
  }
}

/**
 * Checks whether an incident/obstruction is ahead of the ambulance on its remaining route
 */
function isIncidentAheadOnRoute(ambulanceLoc, incidentLoc, routeCoordinates) {
  if (!ambulanceLoc || !incidentLoc || !routeCoordinates || routeCoordinates.length === 0) {
    return { isAffected: false, distanceAheadMeters: 0, minDistanceToRouteMeters: 9999 };
  }

  const ambLat = ambulanceLoc.lat !== undefined ? ambulanceLoc.lat : ambulanceLoc[0];
  const ambLng = ambulanceLoc.lng !== undefined ? ambulanceLoc.lng : ambulanceLoc[1];
  const incLat = incidentLoc.lat !== undefined ? incidentLoc.lat : incidentLoc[0];
  const incLng = incidentLoc.lng !== undefined ? incidentLoc.lng : incidentLoc[1];

  const normalizedRoute = routeCoordinates.map(c => Array.isArray(c) ? { lat: c[0], lng: c[1] } : { lat: c.lat, lng: c.lng });

  // Find point on route closest to current ambulance position
  let closestIndex = 0;
  let minAmbDist = Infinity;
  for (let i = 0; i < normalizedRoute.length; i++) {
    const d = getDistanceMeters(ambLat, ambLng, normalizedRoute[i].lat, normalizedRoute[i].lng);
    if (d < minAmbDist) {
      minAmbDist = d;
      closestIndex = i;
    }
  }

  // Evaluate remaining route coordinates ahead of ambulance
  const remainingRoute = normalizedRoute.slice(closestIndex);
  let minIncDistToRoute = Infinity;
  let distanceAheadMeters = 0;
  let isAffected = false;

  let cumulativeDist = 0;
  for (let i = 0; i < remainingRoute.length; i++) {
    if (i > 0) {
      cumulativeDist += getDistanceMeters(remainingRoute[i - 1].lat, remainingRoute[i - 1].lng, remainingRoute[i].lat, remainingRoute[i].lng);
    }
    const dInc = getDistanceMeters(incLat, incLng, remainingRoute[i].lat, remainingRoute[i].lng);
    if (dInc < minIncDistToRoute) {
      minIncDistToRoute = dInc;
      distanceAheadMeters = cumulativeDist;
    }
    if (dInc <= ROUTE_OBSTRUCTION_RADIUS_METERS) {
      isAffected = true;
    }
  }

  return {
    isAffected,
    distanceAheadMeters: Math.round(distanceAheadMeters),
    minDistanceToRouteMeters: Math.round(minIncDistToRoute)
  };
}

/**
 * Calculates primary vs alternate route ETAs and generates deterministic recommendation
 */
async function analyzeAlternateRoute(incidentId, ambulanceLoc, destinationLoc, primaryRouteCoordinates, activeObstructions = [], routeVersion = 1) {
  const now = Date.now();
  const lastCooldown = recommendationCooldowns[incidentId] || 0;
  if (now - lastCooldown < ROUTE_RECOMMENDATION_COOLDOWN_SECONDS * 1000) {
    return null; // Cooldown active
  }

  if (!ambulanceLoc || !destinationLoc || !primaryRouteCoordinates || primaryRouteCoordinates.length < 2) {
    return {
      incidentId,
      routeVersion,
      primaryRoute: { distanceMeters: 0, etaSeconds: 0, estimatedDelaySeconds: 0 },
      alternateRoute: null,
      comparison: { timeDifferenceSeconds: 0, distanceDifferenceMeters: 0 },
      obstruction: { detected: false },
      recommendation: 'KEEP_PRIMARY',
      reason: 'Insufficient route geometry for alternate analysis.'
    };
  }

  const ambLat = ambulanceLoc.lat !== undefined ? ambulanceLoc.lat : ambulanceLoc[0];
  const ambLng = ambulanceLoc.lng !== undefined ? ambulanceLoc.lng : ambulanceLoc[1];
  const destLat = destinationLoc.lat !== undefined ? destinationLoc.lat : destinationLoc[0];
  const destLng = destinationLoc.lng !== undefined ? destinationLoc.lng : destinationLoc[1];

  let primaryDistMeters = 0;
  const normalizedPrimary = primaryRouteCoordinates.map(c => Array.isArray(c) ? { lat: c[0], lng: c[1] } : { lat: c.lat, lng: c.lng });
  for (let i = 1; i < normalizedPrimary.length; i++) {
    primaryDistMeters += getDistanceMeters(normalizedPrimary[i - 1].lat, normalizedPrimary[i - 1].lng, normalizedPrimary[i].lat, normalizedPrimary[i].lng);
  }
  const speedMs = CORRIDOR_THRESHOLDS.FALLBACK_SPEED_KMH / 3.6;
  let primaryEtaSec = Math.round(primaryDistMeters / speedMs);

  let primaryObstruction = null;
  for (const obs of activeObstructions) {
    const obsLat = obs.location?.lat || obs.lat;
    const obsLng = obs.location?.lng || obs.lng;
    if (!obsLat || !obsLng) continue;

    const analysis = isIncidentAheadOnRoute(ambulanceLoc, { lat: obsLat, lng: obsLng }, primaryRouteCoordinates);
    if (analysis.isAffected) {
      primaryObstruction = { ...obs, analysis, lat: obsLat, lng: obsLng };
      break;
    }
  }

  if (!primaryObstruction) {
    return {
      incidentId,
      routeVersion,
      primaryRoute: {
        distanceMeters: Math.round(primaryDistMeters),
        etaSeconds: primaryEtaSec,
        estimatedDelaySeconds: 0
      },
      alternateRoute: null,
      comparison: { timeDifferenceSeconds: 0, distanceDifferenceMeters: 0 },
      obstruction: { detected: false },
      recommendation: 'KEEP_PRIMARY',
      reason: 'No traffic obstruction affecting remaining primary route sector.'
    };
  }

  const estimatedDelaySec = primaryObstruction.delaySec || primaryObstruction.estimatedDelaySeconds || 180;
  primaryEtaSec += estimatedDelaySec;

  const { getSmartRouteObjects } = require('./osrmService');
  let alternatePoints = await getSmartRouteObjects({ lat: ambLat, lng: ambLng }, { lat: destLat, lng: destLng });

  if (!alternatePoints || alternatePoints.length < 2) {
    const steps = 15;
    alternatePoints = [];
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const offset = Math.sin(ratio * Math.PI) * 0.005;
      alternatePoints.push({
        lat: ambLat + (destLat - ambLat) * ratio + offset,
        lng: ambLng + (destLng - ambLng) * ratio - offset
      });
    }
  }

  let altDistMeters = 0;
  for (let i = 1; i < alternatePoints.length; i++) {
    altDistMeters += getDistanceMeters(alternatePoints[i - 1].lat, alternatePoints[i - 1].lng, alternatePoints[i].lat, alternatePoints[i].lng);
  }
  const altEtaSec = Math.round(altDistMeters / speedMs);

  const timeDifferenceSeconds = primaryEtaSec - altEtaSec;
  const distanceDifferenceMeters = Math.round(altDistMeters - primaryDistMeters);

  let recommendation = 'KEEP_PRIMARY';
  let reason = `Alternate route saving (${timeDifferenceSeconds}s) is below threshold (${ALTERNATE_ROUTE_MIN_SAVING_SECONDS}s).`;

  if (timeDifferenceSeconds >= ALTERNATE_ROUTE_MIN_SAVING_SECONDS) {
    recommendation = 'SWITCH_ALTERNATE';
    reason = `Obstruction detected on primary route (+${estimatedDelaySec}s delay). Alternate route saves ${timeDifferenceSeconds} seconds.`;
  } else if (altEtaSec >= primaryEtaSec) {
    recommendation = 'KEEP_PRIMARY';
    reason = `Alternate route is slower or equal (+${altEtaSec - primaryEtaSec}s). Retaining primary route.`;
  }

  return {
    incidentId,
    routeVersion,
    primaryRoute: {
      distanceMeters: Math.round(primaryDistMeters),
      etaSeconds: primaryEtaSec,
      estimatedDelaySeconds: estimatedDelaySec
    },
    alternateRoute: {
      distanceMeters: Math.round(altDistMeters),
      etaSeconds: altEtaSec,
      coordinates: alternatePoints
    },
    comparison: {
      timeDifferenceSeconds,
      distanceDifferenceMeters
    },
    obstruction: {
      detected: true,
      distanceFromAmbulanceMeters: primaryObstruction.analysis.distanceAheadMeters,
      distanceFromRouteMeters: primaryObstruction.analysis.minDistanceToRouteMeters,
      severity: primaryObstruction.severity || 'HIGH',
      type: primaryObstruction.type || 'Heavy Traffic Congestion',
      location: { lat: primaryObstruction.lat, lng: primaryObstruction.lng }
    },
    recommendation,
    reason,
    timestamp: new Date().toISOString()
  };
}

/**
 * Safely executes explicit operator route switch decision
 */
async function executeRouteSwitch(incidentId, alternateRouteCoordinates, operatorId = 'CONTROL_ROOM', io = null) {
  try {
    const { Incident } = require('./db');
    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found.`);
    }

    const currentVersion = incident.route_version || 1;
    const newVersion = currentVersion + 1;

    let routeHistory = [];
    if (incident.primary_route_history) {
      try {
        routeHistory = typeof incident.primary_route_history === 'string'
          ? JSON.parse(incident.primary_route_history)
          : incident.primary_route_history;
      } catch (e) {
        routeHistory = [];
      }
    }
    routeHistory.push({
      version: currentVersion,
      switchedAt: new Date().toISOString(),
      operatorId
    });

    incident.route_version = newVersion;
    incident.primary_route_history = JSON.stringify(routeHistory);
    incident.alternate_route_recommendation = null;
    await incident.save();

    // Rebuild corridor junctions for new route exclusively
    const newCorridors = await initializeCorridorForRoute(incidentId, alternateRouteCoordinates, newVersion);

    await AuditLog.create({
      action: 'OPERATOR_SWITCHED_ALTERNATE',
      details: `Operator ${operatorId} confirmed route switch for incident ${incidentId}. Route version updated to v${newVersion}. Registered ${newCorridors.length} new junctions.`,
      severity: 'INFO'
    }).catch(() => {});

    const eventPayload = {
      incidentId,
      routeVersion: newVersion,
      operatorId,
      newRouteCoordinates: alternateRouteCoordinates,
      junctionCount: newCorridors.length,
      timestamp: new Date().toISOString()
    };

    if (io) {
      io.to(`mission_${incidentId}`).emit('corridor:route-switched', eventPayload);
      io.to('admin_warroom').emit('corridor:route-switched', eventPayload);
    }

    console.log(`[ROUTE SWITCH] Mission ${incidentId} switched to alternate route v${newVersion} by ${operatorId}.`);
    return { success: true, routeVersion: newVersion, junctions: newCorridors };
  } catch (err) {
    console.error(`[ROUTE SWITCH ERROR]`, err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Safely executes explicit operator keep primary route decision
 */
async function executeKeepPrimary(incidentId, operatorId = 'CONTROL_ROOM', io = null) {
  try {
    recommendationCooldowns[incidentId] = Date.now();

    await AuditLog.create({
      action: 'OPERATOR_KEPT_PRIMARY',
      details: `Operator ${operatorId} chose to retain primary route for incident ${incidentId}. Recommendation cooldown activated (${ROUTE_RECOMMENDATION_COOLDOWN_SECONDS}s).`,
      severity: 'INFO'
    }).catch(() => {});

    const eventPayload = {
      incidentId,
      operatorId,
      decision: 'KEEP_PRIMARY',
      timestamp: new Date().toISOString()
    };

    if (io) {
      io.to(`mission_${incidentId}`).emit('corridor:route-switch-rejected', eventPayload);
      io.to('admin_warroom').emit('corridor:route-switch-rejected', eventPayload);
    }

    console.log(`[KEEP PRIMARY] Operator ${operatorId} retained primary route for mission ${incidentId}.`);
    return { success: true, decision: 'KEEP_PRIMARY' };
  } catch (err) {
    console.error(`[KEEP PRIMARY ERROR]`, err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Calculates deterministic corridor readiness score and status badge
 */
function calculateCorridorReadiness(junctions, gpsConfidence = 'HIGH', activeIncidents = []) {
  if (!junctions || junctions.length === 0) {
    return {
      status: 'NOT_READY',
      score: 0,
      details: ['No corridor preemption junctions registered for active route.']
    };
  }

  let score = 100;
  const details = [];

  // Check controller failures
  const failedJunctions = junctions.filter(j => j.corridor_state === 'CONTROLLER_FAIL' || j.controller_status === 'FAILED');
  if (failedJunctions.length > 0) {
    const penalty = (failedJunctions.length / junctions.length) * 40;
    score -= penalty;
    details.push(`${failedJunctions.length}/${junctions.length} signal controllers reporting failure or manual fallback.`);
  }

  // Check GPS confidence
  if (gpsConfidence === 'LOW') {
    score -= 25;
    details.push('Ambulance GPS telemetry reporting low accuracy / signal drift.');
  } else if (gpsConfidence === 'MEDIUM') {
    score -= 10;
    details.push('Ambulance GPS telemetry reporting moderate accuracy.');
  }

  // Check traffic incidents / obstructions along route
  if (activeIncidents.length > 0) {
    score -= 15;
    details.push(`${activeIncidents.length} traffic incident(s) reported along mission sector.`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let status = 'READY';
  if (score < 50) status = 'NOT_READY';
  else if (score < 85) status = 'DEGRADED';

  if (details.length === 0) {
    details.push(`All ${junctions.length}/${junctions.length} junctions ready. Controller: ONLINE. Telemetry: HIGH CONFIDENCE.`);
  }

  return { status, score, details };
}

/**
 * Evaluates active traffic incident zones against emergency route coordinates
 */
function evaluateTrafficObstructions(incidentId, routeCoordinates, activeIncidentZones = []) {
  if (!routeCoordinates || routeCoordinates.length === 0 || !activeIncidentZones || activeIncidentZones.length === 0) {
    return null;
  }

  const normalizedRoute = routeCoordinates.map(c => Array.isArray(c) ? { lat: c[0], lng: c[1] } : { lat: c.lat, lng: c.lng });
  const obstructions = [];

  for (const zone of activeIncidentZones) {
    const zoneLat = zone.location?.lat || zone.lat;
    const zoneLng = zone.location?.lng || zone.lng;
    if (!zoneLat || !zoneLng) continue;

    for (const pt of normalizedRoute) {
      const dist = getDistanceMeters(pt.lat, pt.lng, zoneLat, zoneLng);
      if (dist < 200) { // Obstruction within 200m of route
        obstructions.push({ ...zone, distToRoute: Math.round(dist) });
        break;
      }
    }
  }

  if (obstructions.length === 0) return null;

  return {
    incidentId,
    obstructionCount: obstructions.length,
    recommendation: 'SWITCH TO ALTERNATE ROUTE',
    primaryRouteDelaySec: 180,
    alternateRouteEtaDiffSec: -65,
    details: `Traffic obstruction detected within route sector (${obstructions[0].type || 'Incident'}). Alternate route recommended.`
  };
}

/**
 * Cryptographically validates telemetry payloads using shared HMAC keys
 */
function verifyTelemetrySignature(payload, signature) {
  if (!signature) return false;
  try {
    const hash = crypto
      .createHmac('sha256', TELEMETRY_SHARED_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}

/**
 * Evaluates ambulance telemetry, updates preemption state machine, calls controller adapter, and emits socket events
 */
async function evaluatePreemption(incidentId, rawLoc, io, signature = null, activeIncidentZones = []) {
  if (!rawLoc || !rawLoc.lat || !rawLoc.lng) return;

  if (process.env.NODE_ENV === 'production' && signature) {
    const isValid = verifyTelemetrySignature({ lat: rawLoc.lat, lng: rawLoc.lng, timestamp: rawLoc.timestamp }, signature);
    if (!isValid) {
      console.warn(`[SECURITY WARNING] Telemetry signature verification failed for incident ${incidentId}. Ignoring payload.`);
      return;
    }
  }

  lastIncidentTelemetryUpdate[incidentId] = Date.now();

  if (!activeKalmanFilters[incidentId]) {
    activeKalmanFilters[incidentId] = new GPSKalmanFilter();
  }
  const currentLoc = activeKalmanFilters[incidentId].filter(rawLoc.lat, rawLoc.lng);

  // Evaluate GPS confidence
  let gpsConfidence = 'HIGH';
  if (rawLoc.accuracy && rawLoc.accuracy > 30) gpsConfidence = 'LOW';
  else if (rawLoc.accuracy && rawLoc.accuracy > 15) gpsConfidence = 'MEDIUM';

  // Calculate speed in m/s (default to 50 km/h = 13.89 m/s if not provided)
  const speedKmh = (rawLoc.speed && rawLoc.speed > 0) ? rawLoc.speed : CORRIDOR_THRESHOLDS.FALLBACK_SPEED_KMH;
  const speedMs = speedKmh / 3.6;

  try {
    const junctions = await EmergencyCorridor.findAll({
      where: { incident_id: incidentId },
      order: [['route_order', 'ASC']]
    });
    if (junctions.length === 0) return;

    for (const junc of junctions) {
      const distance = getDistanceMeters(currentLoc.lat, currentLoc.lng, junc.latitude, junc.longitude);
      const etaSeconds = Math.max(0, Math.round(distance / speedMs));

      junc.distance_from_ambulance = Math.round(distance);
      junc.eta_seconds = etaSeconds;
      junc.gps_confidence = gpsConfidence;

      const currentState = junc.corridor_state || junc.status || 'NORMAL';
      let targetState = currentState;

      // Passage threshold logic
      if (distance <= CORRIDOR_THRESHOLDS.PASSAGE_RADIUS && currentState !== 'CLEARING' && currentState !== 'RESTORING' && currentState !== 'PASSED') {
        targetState = 'AMBULANCE_PASSING';
      } else if (currentState === 'AMBULANCE_PASSING' && distance > CORRIDOR_THRESHOLDS.CLEAR_RADIUS) {
        targetState = 'CLEARING';
      } else if (currentState === 'CLEARING' && distance > CORRIDOR_THRESHOLDS.CLEAR_RADIUS + 50) {
        targetState = 'RESTORING';
      } else if (currentState === 'RESTORING' && distance > CORRIDOR_THRESHOLDS.CLEAR_RADIUS + 150) {
        targetState = 'NORMAL';
      }
      // ETA-based preemption thresholds on approach
      else if (currentState !== 'AMBULANCE_PASSING' && currentState !== 'CLEARING' && currentState !== 'RESTORING' && currentState !== 'PASSED' && currentState !== 'CONTROLLER_FAIL' && currentState !== 'MANUAL_INTERVENTION') {
        if (etaSeconds <= CORRIDOR_THRESHOLDS.PREEMPT_ACTIVE_ETA_SECONDS || distance < 120) {
          targetState = 'PREEMPT_ACTIVE';
        } else if (etaSeconds <= CORRIDOR_THRESHOLDS.PREEMPT_REQ_ETA_SECONDS || distance < 250) {
          targetState = 'PREEMPT_REQUESTED';
        } else if (etaSeconds <= CORRIDOR_THRESHOLDS.APPROACH_ETA_SECONDS || distance < 500) {
          targetState = 'APPROACHING';
        } else if (etaSeconds <= CORRIDOR_THRESHOLDS.ARM_ETA_SECONDS || distance < 1000) {
          targetState = 'ARMED';
        } else {
          targetState = 'NORMAL';
        }
      }

      if (targetState !== currentState) {
        // Trigger Controller Adapter interface methods
        let adapterResult = { success: true };
        if (targetState === 'PREEMPT_REQUESTED') {
          adapterResult = await defaultControllerAdapter.requestPreemption(junc);
        } else if (targetState === 'PREEMPT_ACTIVE') {
          adapterResult = await defaultControllerAdapter.activatePreemption(junc);
        } else if (targetState === 'AMBULANCE_PASSING') {
          adapterResult = await defaultControllerAdapter.confirmAmbulancePassage(junc);
        } else if (targetState === 'CLEARING') {
          adapterResult = await defaultControllerAdapter.clearPreemption(junc);
        } else if (targetState === 'RESTORING' || targetState === 'NORMAL') {
          adapterResult = await defaultControllerAdapter.restoreNormalSignal(junc);
        }

        // Handle Controller Failure
        if (!adapterResult.success) {
          targetState = 'CONTROLLER_FAIL';
          await transitionJunctionState(junc, 'CONTROLLER_FAIL', adapterResult.reason || 'Simulated controller preemption failure');

          if (io) {
            io.to(`mission_${incidentId}`).emit('corridor:controller_failure', {
              incidentId,
              junctionId: junc.junction_id,
              name: junc.name,
              reason: adapterResult.reason,
              timestamp: new Date().toISOString()
            });
            io.to('admin_warroom').emit('corridor:controller_failure', {
              incidentId,
              junctionId: junc.junction_id,
              name: junc.name,
              reason: adapterResult.reason
            });
          }
        } else {
          const transitioned = await transitionJunctionState(junc, targetState, `ETA: ${etaSeconds}s, Distance: ${Math.round(distance)}m`);

          if (transitioned && io) {
            const eventPayload = {
              incidentId,
              junctionId: junc.junction_id,
              name: junc.name,
              status: junc.status,
              corridor_state: junc.corridor_state,
              eta_seconds: etaSeconds,
              distance: Math.round(distance),
              approach_direction: junc.approach_direction || 'Northbound',
              required_movement: junc.required_movement || 'Through',
              controller_status: junc.controller_status || 'ONLINE',
              gps_confidence: gpsConfidence
            };

            io.to(`mission_${incidentId}`).emit('corridor:status_update', eventPayload);
            io.to(`mission_${incidentId}`).emit('corridor:junction_updated', eventPayload);
            io.to('admin_warroom').emit('corridor:status_update', eventPayload);

            if (targetState === 'PREEMPT_REQUESTED' || targetState === 'PREEMPT_ACTIVE') {
              io.to(`mission_${incidentId}`).emit('corridor:preempt_junction', eventPayload);
            } else if (targetState === 'CLEARING' || targetState === 'RESTORING') {
              io.to(`mission_${incidentId}`).emit('corridor:route_cleared', eventPayload);
            }
          }
        }
      } else {
        // Save distance and ETA updates without full state transition
        await junc.save();
      }
    }

    // Compute Overall Corridor Readiness
    const readiness = calculateCorridorReadiness(junctions, gpsConfidence, activeIncidentZones);
    if (io) {
      io.to(`mission_${incidentId}`).emit('corridor:readiness_updated', { incidentId, ...readiness });
      io.to('admin_warroom').emit('corridor:readiness_updated', { incidentId, ...readiness });
    }

    // Check traffic incident obstructions for route recommendation
    const routeRec = evaluateTrafficObstructions(incidentId, junctions, activeIncidentZones);
    if (routeRec && io) {
      io.to(`mission_${incidentId}`).emit('corridor:route_recommendation', routeRec);
    }
  } catch (err) {
    console.error(`[PREEMPTION EVAL ERROR]`, err.message);
  }
}

/**
 * Clean inactive preemptions (watchdog failsafe)
 */
async function startWatchdog(io, intervalMs = 10000) {
  setInterval(async () => {
    const now = Date.now();
    try {
      const activePreemptions = await EmergencyCorridor.findAll({
        where: {
          status: ['PREEMPTING', 'CORRIDOR_ACTIVE'],
          corridor_state: ['APPROACHING', 'PREEMPT_REQUESTED', 'PREEMPT_ACTIVE', 'AMBULANCE_PASSING']
        }
      });

      for (const junc of activePreemptions) {
        const lastUpdate = lastIncidentTelemetryUpdate[junc.incident_id] || 0;
        if (lastUpdate && (now - lastUpdate > 20000)) {
          await transitionJunctionState(junc, 'RESTORING', 'WATCHDOG FAILSAFE: Released preemption due to telemetry timeout.');
          await transitionJunctionState(junc, 'NORMAL', 'WATCHDOG FAILSAFE: Restored normal signal cycle.');

          if (io) {
            const eventPayload = {
              incidentId: junc.incident_id,
              junctionId: junc.junction_id,
              name: junc.name,
              status: 'PASSED',
              corridor_state: 'NORMAL'
            };
            io.to(`mission_${junc.incident_id}`).emit('corridor:status_update', eventPayload);
            io.to(`mission_${junc.incident_id}`).emit('corridor:route_cleared', eventPayload);
            io.to('admin_warroom').emit('corridor:status_update', eventPayload);
          }
          console.log(`[WATCHDOG FAILSAFE] Released junction "${junc.name}" for incident ${junc.incident_id}`);
        }
      }
    } catch (err) {
      console.error('[WATCHDOG ERROR]', err.message);
    }
  }, intervalMs);
}

module.exports = {
  initializeCorridorForRoute,
  evaluatePreemption,
  startWatchdog,
  verifyTelemetrySignature,
  reverseGeocode,
  calculateCorridorReadiness,
  evaluateTrafficObstructions,
  isIncidentAheadOnRoute,
  analyzeAlternateRoute,
  executeRouteSwitch,
  executeKeepPrimary,
  transitionJunctionState,
  getApproachDirection,
  CORRIDOR_THRESHOLDS,
  VALID_TRANSITIONS,
  ALTERNATE_ROUTE_MIN_SAVING_SECONDS,
  ROUTE_OBSTRUCTION_RADIUS_METERS,
  ROUTE_RECOMMENDATION_COOLDOWN_SECONDS
};
