/**
 * RescueLink Ambulance State Machine
 *
 * Deterministic Server-Side State Machine for Paramedic & Emergency Mission Progression.
 */

const { AuditLog } = require('./db');

const AMBULANCE_STATES = {
  OFFLINE: 'OFFLINE',
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE_TO_PATIENT: 'EN_ROUTE_TO_PATIENT',
  AT_SCENE: 'AT_SCENE',
  PATIENT_ONBOARD: 'PATIENT_ONBOARD',
  EN_ROUTE_TO_HOSPITAL: 'EN_ROUTE_TO_HOSPITAL',
  AT_HOSPITAL: 'AT_HOSPITAL',
  HANDOVER_COMPLETE: 'HANDOVER_COMPLETE'
};

const VALID_AMBULANCE_TRANSITIONS = {
  REQUESTED: ['ASSIGNED', 'AMBULANCE_ASSIGNED', 'AVAILABLE', 'OFFLINE'],
  PENDING_AMBULANCE: ['ASSIGNED', 'AMBULANCE_ASSIGNED', 'AVAILABLE', 'OFFLINE'],
  OFFLINE: ['AVAILABLE'],
  AVAILABLE: ['ASSIGNED', 'AMBULANCE_ASSIGNED', 'OFFLINE'],
  ASSIGNED: ['EN_ROUTE_TO_PATIENT', 'EN_ROUTE', 'AVAILABLE', 'OFFLINE'],
  AMBULANCE_ASSIGNED: ['EN_ROUTE_TO_PATIENT', 'EN_ROUTE', 'AVAILABLE', 'OFFLINE'],
  EN_ROUTE: ['AT_SCENE', 'ARRIVED', 'AVAILABLE'],
  EN_ROUTE_TO_PATIENT: ['AT_SCENE', 'ARRIVED', 'AVAILABLE'],
  ARRIVED: ['PATIENT_ONBOARD', 'EN_ROUTE_TO_PATIENT'],
  AT_SCENE: ['PATIENT_ONBOARD', 'EN_ROUTE_TO_PATIENT'],
  PATIENT_ONBOARD: ['EN_ROUTE_TO_HOSPITAL', 'HOSPITAL_ACCEPTED'],
  HOSPITAL_ACCEPTED: ['AT_HOSPITAL', 'EN_ROUTE_TO_HOSPITAL'],
  EN_ROUTE_TO_HOSPITAL: ['AT_HOSPITAL', 'ARRIVED_HOSPITAL'],
  AT_HOSPITAL: ['HANDOVER_COMPLETE'],
  ARRIVED_HOSPITAL: ['HANDOVER_COMPLETE', 'AT_HOSPITAL'],
  HANDOVER_COMPLETE: ['AVAILABLE', 'OFFLINE']
};

/**
 * Validates whether a state transition is permitted by the state machine
 */
function isValidStateTransition(currentState, targetState) {
  if (!currentState || currentState.toUpperCase() === targetState.toUpperCase()) return true;
  const normCurrent = currentState.toUpperCase();
  const normTarget = targetState.toUpperCase();
  const allowed = (VALID_AMBULANCE_TRANSITIONS[normCurrent] || []).map(s => s.toUpperCase());
  return allowed.includes(normTarget);
}

/**
 * Executes state transition safely with audit logging
 */
async function transitionAmbulanceState(incident, targetState, actor = 'PARAMEDIC', details = '') {
  if (!incident) return { success: false, reason: 'Incident record required' };
  const currentState = (incident.ambulance_state || incident.status || 'AVAILABLE').toUpperCase();
  const normTarget = targetState.toUpperCase();

  if (!isValidStateTransition(currentState, normTarget)) {
    console.warn(`[AMBULANCE STATE MACHINE REJECTED] Invalid transition from ${currentState} to ${normTarget} for mission ${incident.id}`);
    return { success: false, reason: `Invalid state transition from ${currentState} to ${normTarget}` };
  }

  incident.ambulance_state = normTarget;
  
  // Keep legacy status field aligned for backward compatibility
  if (targetState === 'ASSIGNED') incident.status = 'ambulance_assigned';
  else if (targetState === 'EN_ROUTE_TO_PATIENT') incident.status = 'en_route';
  else if (targetState === 'AT_SCENE') incident.status = 'arrived';
  else if (targetState === 'PATIENT_ONBOARD') incident.status = 'patient_onboard';
  else if (targetState === 'EN_ROUTE_TO_HOSPITAL') incident.status = 'hospital_accepted';
  else if (targetState === 'AT_HOSPITAL') incident.status = 'arrived_hospital';
  else if (targetState === 'HANDOVER_COMPLETE') {
    incident.status = 'completed';
    incident.completed_at = new Date();
  }

  await incident.save();

  await AuditLog.create({
    action: `AMBULANCE_STATE_${targetState}`,
    details: `Mission ${incident.id}: State transitioned ${currentState} -> ${targetState} by ${actor}. ${details}`,
    severity: 'INFO'
  }).catch(err => console.error('[AUDIT LOG ERROR]', err.message));

  console.log(`[AMBULANCE STATE] Mission ${incident.id} state -> ${targetState} (by ${actor})`);
  return { success: true, currentState: targetState };
}

module.exports = {
  AMBULANCE_STATES,
  VALID_AMBULANCE_TRANSITIONS,
  isValidStateTransition,
  transitionAmbulanceState
};
