# RescueLink Emergency System — Judge Demonstration Guide

This guide provides a step-by-step walkthrough for demonstrating the complete end-to-end emergency response journey in **RescueLink**.

---

## 1. Quickstart — Running the Demo

### Backend Startup & Simulator Mode
```bash
cd backend
npm install
npm run demo
```
*or start the API server in demo mode:*
```bash
APP_MODE=demo npm start
```

### Frontend War Room Launch
```bash
cd frontend
npm install
npm start
```
Navigate to `http://localhost:3000` and open the **Emergency War Room / Command Center**.

---

## 2. Complete End-to-End Emergency Journey

```
[PATIENT SOS] ➔ [AMBULANCE DISPATCH] ➔ [TELEMETRY STREAM] ➔ [HOSPITAL ACCEPTANCE & BED LOCK] ➔ 
[PRIMARY ROUTE & CORRIDOR] ➔ [TRAFFIC OBSTRUCTION] ➔ [ALTERNATE REROUTE] ➔ [HUMAN OPERATOR APPROVAL] ➔ 
[CORRIDOR REBUILD] ➔ [HOSPITAL ARRIVAL] ➔ [DIGITAL SBAR HANDOVER] ➔ [CORRIDOR RESTORATION]
```

### Demonstration Steps

1. **Patient Emergency Creation**:
   - In the War Room or Patient Portal, trigger a new SOS Emergency Dispatch.
   - Observe automatic geolocation resolution, initial NEWS2 severity scoring, and immediate nearest-ambulance matching.

2. **Ambulance State Machine Progression**:
   - The assigned ambulance transitions through server-side states:
     `AVAILABLE → ASSIGNED → EN_ROUTE_TO_PATIENT → AT_SCENE → PATIENT_ONBOARD`.
   - Observe the live status badge updating in real time across connected sockets.

3. **Hospital Selection & Atomic Bed Reservation**:
   - Target hospital receives the admission request. Upon confirmation, atomic DB row locking decrements available bed and ventilator counts (`AVAILABLE → RESERVED`).

4. **Primary Route & Green Corridor Preemption (Phase A)**:
   - The OSRM routing engine generates the primary route path.
   - Emergency Corridor junctions initialize and transition deterministically:
     `NORMAL → ARMED → APPROACHING → PREEMPT_REQUESTED → PREEMPT_ACTIVE → AMBULANCE_PASSING → CLEARING → RESTORING → NORMAL`.
   - Notice the `SIMULATED` badge on traffic signal controller status, reflecting physical signal hardware abstraction.

5. **Traffic Obstruction & Alternate Route Analysis (Phase B)**:
   - A simulated traffic obstruction appears ahead on the remaining primary route sector.
   - The system detects the obstruction (within 200m threshold) and computes primary ETA (with delay) vs. alternate route ETA.

6. **Human-in-the-Loop Control Room Approval**:
   - The War Room displays the **Traffic & Route Intelligence** panel showing primary ETA, alternate ETA, and estimated time saved.
   - Click `[ SWITCH ROUTE ]` or `[ KEEP PRIMARY ]`.
   - On approval, `routeVersion` increments (v1 ➔ v2), previous primary route geometry is preserved in history, and corridor junctions rebuild exclusively for the new active route.

7. **Hospital Arrival & Digital SBAR Clinical Handover**:
   - Ambulance arrives at the hospital (`AT_HOSPITAL`).
   - Paramedic submits a digital SBAR Clinical Handover note (vitals snapshot, chief complaint, interventions).
   - Receiving hospital doctor acknowledges and signs off (`HANDOVER_ACKNOWLEDGED ➔ HANDOVER_COMPLETE`).

8. **Mission Completion & Corridor Restoration**:
   - Emergency corridor status returns to `NORMAL`, signals restore to standard cycles, and the complete immutable sequence is saved in `AuditLog`.

---

## 3. Data Source Truth Badges

Every metric in the UI clearly displays its operational origin:

- **`LIVE`**: Verified socket connections and authenticated database records.
- **`SIMULATED`**: Deterministic simulation adapters (e.g. traffic signal preemption, vehicle OBD telemetry).
- **`ESTIMATED`**: Calculated routing ETAs and Haversine distances.
- **`STALE`**: Telemetry streams paused > 15 seconds.
- **`UNAVAILABLE`**: Unconfigured external APIs or disconnected devices.
