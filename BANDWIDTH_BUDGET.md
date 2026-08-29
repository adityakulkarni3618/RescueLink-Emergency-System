# RescueLink Bandwidth Budget

This document estimates the network egress requirements for RescueLink under typical student demo conditions (1 active emergency, 1 admin, 1 hospital dashboard, 3-5 users).

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

### C. Homepage Background Polling (Throttled)
* **Update Frequency**: 60 seconds (1/60 Hz)
* **Payload Size**: ~3 KB per GET fetch
* **Recipients**: 5 idle clients
* **Calculation**:
  $$\text{Data Rate} = 5 \times 3\text{ KB} \times 1\text{ fetch/min} = 15\text{ KB/minute}$$

---

## 2. Total Budget Summary (Estimates)

| Usage Level | Active Duration | Bandwidth Usage |
| :--- | :--- | :--- |
| **Per Minute (Active Emergency)** | 1 Minute | ~51 KB / minute |
| **Per Hour (Continuous Demo)** | 60 Minutes | ~3.06 MB / hour |
| **Per Month (Typical Student Demo)** | 10 Hours / month | ~30.6 MB / month |

These calculations confirm that RescueLink will operate well below Render's 5 GB Free plan monthly transfer quota.
