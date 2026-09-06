# RescueLink: Real-Time Emergency Care Coordination Platform

RescueLink is an enterprise-grade emergency care platform designed to coordinate real-time patient telemetry, GPS ambulance dispatch, ABDM/FHIR clinical interoperability, and hospital resource allocation.

---

## 1. System Architecture

Below is the production architecture illustrating the flow from the ambulance edge to the Postgres-backed core API server and external national gateways (ABDM).

```mermaid
graph TD
    subgraph Ambulance Edge (PWA Client)
        A[Vitals IoT Bridge / Serial] -->|HL7 ORU| B(Ambulance Streamer App)
        B -->|Socket.io Telemetry| C[Nginx Proxy]
        B -.->|Offline Mode Caching| B
    end

    subgraph API Gateway / Server Node
        C -->|Port 443 / TLS| D[Express Application Server]
        D -->|Rate Limiter & Helmet| E{Authentication / MFA / Guest SOS}
        E -->|Doctor / Admin / Paramedic Role| F[maskSensitiveData Middleware]
    end

    subgraph Persistence Layer
        F -->|AES-256-GCM Cryptography| G[(PostgreSQL System of Record)]
        G -->|Append-Only Logs| H[(Immutable Audit Logs)]
    end

    subgraph External National Gateways
        D -->|Green Corridor| I[Google Maps Directions API]
        D -->|Health Records Link| J[ABDM Gateway Callbacks]
    end
```

---

## 2. Current Implementation Status (Implemented vs Mocked)

To ensure full transparency on what is actively running in this codebase versus what is mocked or planned on the roadmap, here is the implementation status:

### ✅ Fully Implemented & Functional in Codebase
- **🚨 Guest Emergency Dispatch (Authentication Bypass)**: Functional. Instant SOS dispatch triggering geolocation capture and immediate ambulance routing.
- **🚖 Radial Dispatch Engine**: Functional. Ambulance and hospital search algorithms with automated routing.
- **🛡️ War Room Verification Gate**: Functional. Admin approval workflows for new hospital/ambulance accounts (`is_active: false` until verified).
- **📱 QR Emergency Health Passport**: Functional. Offline QR code generation for patient profiles.
- **🗺️ Zero-Token Leaflet Map Engine**: Functional. Leaflet maps with custom CSS dark-mode filtering for reliable rendering without API keys.
- **⚡ HTTP Gzip Response Compression**: Functional. Express Gzip compression actively running on Render.
- **🧍 Patient Emer-Health Profile Management**: Functional. Full patient portal backed by PostgreSQL.
- **🚑 Ambulance & Crew Management**: Functional. Dashboards for paramedics to receive dispatches.
- **🛡️ DPDP Act 2023 & HIPAA Compliance Structure**: Functional. AES-256-GCM application-layer encryption for PHI/PII and automated retention policies.

### 🚧 Mocked / Roadmap / External Hardware (From Digest)
- **🛸 Drone AED Dispatch Network**: **Not Implemented**. Mentioned in design documents but there is no active physical drone hardware integration.
- **🚦 Traffic Signal Preemption (Emergency Corridor)**: **Simulated**. The backend calculates junction intersections (`emergencyCorridor.js`), but it does NOT actually override real-world municipal traffic lights.
- **🏥 ABDM / FHIR Clinical Interoperability**: **Simulated / Sandbox**. The code (`abdm.js`, `fhirConverter.js`) handles FHIR bundles, but requires paid/government-approved credentials to interact with real Indian Govt gateways.
- **💓 Hardware Vitals Monitors (Philips/GE)**: **Simulated**. The `vitalsBridge.js` sends mock HL7 waveforms unless you connect a physical Web-Bluetooth device to the browser.
- **Multi-Hospital Capacity Auto-Balancing**: **Basic**. The dashboard calculates theoretical loads, but true inter-hospital automated transfers require deeper municipal API integrations.
---

## 3. Tech Stack

- **Backend**: Node.js, Express, Socket.io, Sequelize ORM, PostgreSQL / SQLite, Gzip Compression.
- **Frontend**: React.js, Leaflet, Mapbox GL, Recharts, Custom Glassmorphism UI System.
- **Database**: PostgreSQL (system of record), SQLite (automatic local fallback), Redis (session & token blacklists).
- **Security**: AES-256-GCM application-layer encryption, TOTP Multi-factor authentication, DPDP Act 2023 dynamic consent control.
- **Deployments**: Docker, docker-compose, Vercel (Frontend), Render (Backend Node API).

---

## 4. Compliance and Operational Index

RescueLink is built from the ground up for healthcare compliance audits:
- **Database Schema**: [SCHEMA.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/SCHEMA.md)
- **Security hardening & Threat Model**: [SECURITY.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/SECURITY.md)
- **Production Deployments**: [DEPLOYMENT.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/DEPLOYMENT.md)
- **Data Erasure & Purge Specifications**: [DATA_HANDLING.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/DATA_HANDLING.md)
- **DPDP Act 2023 Compliance**: [PRIVACY_POLICY.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/PRIVACY_POLICY.md)
- **ABDM Sandbox Integration Guide**: [ABDM_INTEGRATION.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/docs/ABDM_INTEGRATION.md)
- **Hardware Monitor Hookup (Philips/GE)**: [VITALS_HARDWARE_SETUP.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/docs/VITALS_HARDWARE_SETUP.md)
- **Incident Response Manual**: [RUNBOOK.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/RUNBOOK.md)

---

## 5. Local Quickstart

### Prerequisites
- Node.js v18+
- PostgreSQL / SQLite

### Installation
1. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Run migrations and database setup:
   ```bash
   npm start
   ```
4. Start frontend application:
   ```bash
   cd ../frontend
   npm start
   ```

---

## 6. Bandwidth & Real-Time Optimization
To resolve high cloud egress bandwidth limits (such as Render's 5 GB Hobby quota), RescueLink implements advanced network optimization layers:
- **Targeted Sockets**: Global fleet location broadcasts (`io.emit('ambulances-update')`) are restricted and redirected to the `admin_warroom` room. GPS telemetry is strictly contained in active `mission_${reqId}` rooms.
- **REST Telemetry Throttling**: Background HTTP polling loops for ambulances, hospitals, and disaster cases on the frontend are throttled from 8s/10s to **60 seconds**, reducing background GET request data consumption by **~87%**.
- **Real-Time Architecture Reference**: See [REALTIME_ARCHITECTURE.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/REALTIME_ARCHITECTURE.md) and [BANDWIDTH_OPTIMIZATION_REPORT.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/BANDWIDTH_OPTIMIZATION_REPORT.md) for detailed performance audit and implementation specs.

---

## 7. Real-Time Telemetry & Hardware Integration
By default in production modes, RescueLink bypasses mock/simulated streams to rely strictly on real-world endpoints:
- **Browser-Native Geolocation**: Ambulance coordinates are mapped directly using native GPS device locations through `navigator.geolocation.watchPosition` with high accuracy mode enabled, disabling artificial drifts.
- **Web Bluetooth Integration**: Paramedic inputs default to real sensor data streams utilizing GATT services for Heart Rate Measurement (HRM), or manual entries via the paramedic dashboard.
- **Production Database Registry**: Hospital listings and resources are sourced dynamically from the PostgreSQL instance, disabling simulated fallback registries.
