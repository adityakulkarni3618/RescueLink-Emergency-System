# RescueLink Bandwidth Budget

This document estimates the network egress requirements for RescueLink under typical student demo conditions (1 active emergency, 1 admin, 1 hospital dashboard, 3-5 users) after applying two rounds of source-code optimizations.

## 1. Bandwidth Egress Calculations (Per Emergency Run)

### A. Live GPS Telemetry
* **Update Frequency**: 2 seconds (0.5 Hz)
* **Payload Size**: ~200 Bytes per update
* **Recipients**: 3 (Patient, assigned Hospital, active Admin)
* **Calculation**:
  $$\text{Data Rate} = 3 \times 200\text{ B} \times 30\text{ updates/min} = 18\text{ KB/minute}$$

### B. Live Patient Vitals
* **Update Frequency**: 1 second (1.0 Hz)
* **Payload Size**: ~150 Bytes per update
* **Recipients**: 2 (Receiving Doctor, Paramedic)
* **Calculation**:
  $$\text{Data Rate} = 2 \times 150\text{ B} \times 60\text{ updates/min} = 18\text{ KB/minute}$$

### C. Mapbox/OSRM Directions Routing (Throttled)
* **Update Frequency**: 12 seconds (throttled from 2s on every location update)
* **Payload Size**: ~10 KB per directions packet
* **Recipients**: 2 (Patient, Hospital)
* **Calculation**:
  $$\text{Data Rate} = 2 \times 10\text{ KB} \times 5\text{ requests/min} = 100\text{ KB/minute}$$

### D. Homepage Background Polling (Throttled & Tab Paused)
* **Update Frequency**: 60 seconds (1/60 Hz, suspended when tab is hidden)
* **Payload Size**: ~3 KB per GET fetch
* **Recipients**: 5 idle clients
* **Calculation**:
  $$\text{Data Rate} = 5 \times 3\text{ KB} \times 1\text{ fetch/min} = 15\text{ KB/minute}$$

---

## 2. Total Budget Summary (Estimates)

| Traffic Source / Channel | Before (per min) | After (per min) | Egress Reduction |
| :--- | :--- | :--- | :--- |
| **Global Websocket Telemetry** | ~1,200 KB / min | ~36 KB / min | **~97.0%** |
| **Mapbox directions Routing** | ~600 KB / min | ~100 KB / min | **~83.3%** |
| **REST HTTP API Egress** | ~120 KB / min | ~15 KB / min | **~87.5%** |
| **Total Active Egress** | **~1,920 KB / min** | **~151 KB / min** | **~92.1%** |

These calculations confirm that RescueLink will operate comfortably below Render's Hobby plan monthly transfer limits under typical demo use-cases.
