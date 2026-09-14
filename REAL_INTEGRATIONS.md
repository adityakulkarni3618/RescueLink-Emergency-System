# RescueLink — Real-World Integration & Hardware Adapter Specifications

This document outlines the technical interface abstraction layer required to connect **RescueLink** to physical municipal infrastructure, real medical IoT devices, external routing engines, and production hospital EHR systems.

---

## 1. Provider Interface Abstraction Architecture

RescueLink enforces clean provider abstractions separating business state logic from external hardware drivers and service APIs:

```
+-----------------------------------------------------------------------------------+
|                           RescueLink Core Server Logic                            |
+-----------------------------------------------------------------------------------+
        |                       |                       |                      |
        v                       v                       v                      v
+---------------+       +---------------+       +---------------+      +---------------+
|  GPSProvider  |       | RoutingProv.  |       | VitalsProvider|      | TrafficIntel. |
+---------------+       +---------------+       +---------------+      +---------------+
  - RealGPS               - Mapbox (LIVE)         - RealDevice           - MunicipalAPI
  - MobileBrowser         - OSRM (LIVE)           - SimulatorVitals      - TrafficAPI
  - SimulatorGPS          - Fallback (ESTIMATED)                         - Simulator
```

---

## 2. Interface Specifications & Data Provenance Matrix

| Subsystem | Provider Interface | Current Implementation | Source Tag | Truth Status | Production Provider Connection Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GPS Telemetry** | `GPSProvider` | `MobileBrowserGPSProvider` / `SimulatorGPSProvider` | `GPS`, `DEVICE`, `SIMULATOR` | `LIVE`, `SIMULATED`, `STALE`, `UNAVAILABLE` | Vehicle OBD-II / Hardware Cellular Gateway |
| **Emergency Routing** | `RoutingProvider` | Mapbox Directions / OSRM / Haversine | `LIVE`, `ESTIMATED` | `LIVE`, `ESTIMATED`, `UNAVAILABLE` | Mapbox Production Key / Self-Hosted OSRM |
| **Patient Vitals** | `VitalsProvider` | Serial Port HL7 ORU^R01 / Simulator | `DEVICE`, `MANUAL`, `SIMULATED` | `LIVE`, `SIMULATED`, `STALE`, `UNAVAILABLE` | Mindray/Philips Serial Bridge |
| **Traffic Intelligence** | `TrafficIntelligenceProvider` | `SimulatorTrafficProvider` / `OperatorReportedProvider` | `MUNICIPAL_API`, `TRAFFIC_PROVIDER`, `OPERATOR`, `SIMULATOR` | `LIVE`, `SIMULATED` | City Traffic Management Center API |
| **Signal Control** | `TrafficControllerAdapter` | `TrafficControllerAdapter` (`SIMULATED`) | `MUNICIPAL_CONTROLLER`, `SIMULATOR` | `LIVE`, `SIMULATED`, `FAILED` | NTCIP 1202 SNMP / SCATS / SCOOT Gateway |
| **National Health Gateway** | `ABDMService` | ABDM Dev Sandbox / Simulator | `ABDM_SANDBOX`, `ABDM_PRODUCTION`, `SIMULATOR` | `LIVE`, `SIMULATED`, `UNAVAILABLE` | ABDM Production Client ID & Secret |
| **SMS / WhatsApp** | `WhatsAppService` / `smppService` | SMPP v3.4 Gateway / Twilio API | `SMPP`, `TWILIO`, `SIMULATOR` | `LIVE`, `SIMULATED`, `UNAVAILABLE` | Telecom SMPP Shortcode / Twilio Account SID |

---

## 3. Municipal Traffic Signal Control (NTCIP 1202 / UTMC)

### Current Implementation
- `TrafficControllerAdapter` operating with explicit `MunicipalTrafficController` vs `SimulatedTrafficController` boundaries.
- Validates preemption requests and returns deterministic ACK/ACTIVE status over socket events.

### Production Integration Requirements
- **Protocol**: NTCIP 1202 (National Transportation Communications for ITS Protocol) or UTMC (Urban Traffic Management and Control).
- **Interface Method**:
  ```javascript
  class MunicipalNTCIPAdapter extends TrafficControllerAdapter {
    async requestPreemption(junctionNode) {
      // SNMP / UDP PDU to Municipal Signal Controller IP
      // OID: 1.3.6.1.4.1.1206.4.2.1.5 (ASC Preemption Control)
    }
  }
  ```
- **Prerequisites**: Municipal traffic department API gateway access, IPSec VPN tunnel to traffic management center (TMC).

---

## 4. Medical Patient Monitor Vitals (HL7 / IEEE 11073)

### Current Implementation
- Serial Port parsing of HL7 ORU^R01 messages (`vitalsBridge.js`) and `VitalsProvider` abstraction.

### Production Integration Requirements
- **Protocol**: HL7 v2.x ORU^R01 (Observation Result) or IEEE 11073 (Personal Health Data).
- **Hardware Hookup**: Serial-to-Ethernet bridge on Mindray / Philips / Welch Allyn patient monitors connected to RescueLink Edge Gateway.

---

## 5. Failure Handling & Integration Transparency Rule

When external credentials or hardware gateways are unconfigured in `pilot` or `production` environment modes (`APP_MODE=pilot` or `APP_MODE=production`):
- Services return `{ status: 'UNAVAILABLE', reason: '...' }` with an explicit diagnostic message.
- System **never** returns fake success or disguises simulated output as `LIVE`.
