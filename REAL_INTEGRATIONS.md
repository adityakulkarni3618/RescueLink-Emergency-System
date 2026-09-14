# RescueLink — Real-World Integration & Hardware Adapter Specifications

This document outlines the technical interface abstraction layer required to connect **RescueLink** to physical municipal infrastructure, real medical IoT devices, external routing engines, mobile phone GPS streaming, and production hospital EHR systems.

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

| Subsystem | Provider Interface | Implementation Sourcing | Source Tag | Truth Status | Production Connection Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Mobile Phone GPS** | `GPSProvider` | `MobileBrowserGPSProvider` (`HTML5 Geolocation`) | `DEVICE` | `LIVE`, `STALE`, `UNAVAILABLE` | Paramedic Android/iOS PWA Location Access |
| **Emergency Routing** | `RoutingProvider` | Mapbox Directions / OSRM / Haversine | `LIVE`, `ESTIMATED` | `LIVE`, `ESTIMATED`, `UNAVAILABLE` | Mapbox Production Key / Self-Hosted OSRM |
| **Patient Vitals** | `VitalsProvider` | Serial Port HL7 ORU^R01 / Simulator | `DEVICE`, `MANUAL`, `SIMULATED` | `LIVE`, `SIMULATED`, `STALE`, `UNAVAILABLE` | Mindray/Philips Serial Bridge |
| **Traffic Intelligence** | `TrafficIntelligenceProvider` | `SimulatorTrafficProvider` / `OperatorReportedProvider` | `MUNICIPAL_API`, `TRAFFIC_PROVIDER`, `OPERATOR`, `SIMULATOR` | `LIVE`, `SIMULATED` | City Traffic Management Center API |
| **Signal Control** | `TrafficControllerAdapter` | `TrafficControllerAdapter` (`SIMULATED`) | `MUNICIPAL_CONTROLLER`, `SIMULATOR` | `LIVE`, `SIMULATED`, `FAILED` | NTCIP 1202 SNMP / SCATS / SCOOT Gateway |
| **National Health Gateway** | `ABDMService` | ABDM Dev Sandbox / Simulator | `ABDM_SANDBOX`, `ABDM_PRODUCTION`, `SIMULATOR` | `LIVE`, `SIMULATED`, `UNAVAILABLE` | ABDM Production Client ID & Secret |
| **SMS / WhatsApp** | `WhatsAppService` / `smppService` | SMPP v3.4 Gateway / Twilio API | `SMPP`, `TWILIO`, `SIMULATED` | `LIVE`, `SIMULATED`, `UNAVAILABLE` | Telecom SMPP Shortcode / Twilio Account SID |

---

## 3. Real Mobile GPS Streaming (Priority 1 Implementation)

### Current Implementation
- `MobileBrowserGPSProvider` receives continuous HTML5 `navigator.geolocation.watchPosition` telemetry fixes from paramedic mobile devices.
- Transmits live latitude, longitude, accuracy (`±Xm`), speed (km/h), and heading over Socket.IO event `ambulance:location-update`.
- If permission is denied or GPS is lost, marks status as `UNAVAILABLE` or `STALE` without fabricating coordinates.

---

## 4. Operational Provider Health Endpoints

- **`GET /health/live`**: Kubernetes/Liveness probe returning `{ status: 'UP' }`.
- **`GET /health/ready`**: Database & subsystem readiness check.
- **`GET /api/provider-status`**: Exposes real-time provider matrix for Control Room dashboards (`GPSProvider`, `RoutingProvider`, `VitalsProvider`, `TrafficControllerAdapter`, `WhatsAppService`, `ABDMService`).

---

## 5. Failure Handling & Integration Transparency Rule

When external credentials or hardware gateways are unconfigured in `pilot` or `production` environment modes (`APP_MODE=pilot` or `APP_MODE=production`):
- Services return `{ status: 'UNAVAILABLE', reason: '...' }` with an explicit diagnostic message.
- System **never** returns fake success or disguises simulated output as `LIVE`.
