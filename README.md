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

## 2. Implemented Features & Operational Checklist

- **🚨 Guest Emergency Dispatch (Authentication Bypass)**: Instant SOS dispatch triggering geolocation capture and immediate ambulance routing without requiring password login.
- **📍 Registered Profile Coordinate Map Pinning**: Dynamic position rendering for hospitals, ambulances, and user portals anchored directly to profile database latitude and longitude.
- **🔒 Strict Portal Gateway Role Guards**: Role mismatch validation preventing cross-portal authentication attempts (e.g. blocking hospital credentials from logging into the Admin Gateway).
- **🚖 Dual-Mode Radial & DB Registered Dispatch Engine**: Hybrid ambulance ranking system combining live socket units and registered database ambulances with offline notification queuing.
- **🔔 Offline Paramedic & Hospital System Notification Queue**: In-memory and database notification queue ensuring offline dispatch alerts persist until paramedic/hospital reconnects.
- **🛡️ War Room Verification Gate**: Admin approval workflows for newly registered hospital/ambulance accounts (`is_active: false` until verified by city admin).
- **📱 QR Emergency Health Passport**: Offline QR code generation for patient profile access during emergency intake.
- **🗺️ Zero-Token Map Engine**: Leaflet maps with custom dark-mode styling for zero-API-key emergency visual rendering.
- **⚡ Bandwidth-Safe Telemetry Throttling**: Restricts socket events to mission rooms (`mission_${reqId}`) and admin war room (`admin_warroom`), reducing cloud bandwidth egress by >90%.
- **💾 SQLite & PostgreSQL Persistence**: Persistent database storage with automatic local SQLite fallback for seamless offline resilience.
- **🧍 Patient Emer-Health Profile Management**: Full patient portal backed by encrypted persistence for medical history, allergies, ABHA ID, and emergency contacts.
- **🚑 Ambulance & Crew Management**: Paramedic license tracking, oxygen capacity monitoring, and standard vehicle safety compliance.
- **🛡️ DPDP Act 2023 & HIPAA Compliance**: Application-layer AES-256-GCM encryption for PHI/PII, dynamic consent revocation, and automated retention policies.

---

## 3. Tech Stack

- **Backend**: Node.js, Express, Socket.io, Sequelize ORM, PostgreSQL / SQLite, Gzip Compression.
- **Frontend**: React.js, Leaflet, Mapbox GL, Recharts, Custom Glassmorphism UI System.
- **Database**: PostgreSQL (system of record), SQLite (automatic local fallback), Redis (session & token blacklists).
- **Security**: AES-256-GCM application-layer encryption, TOTP Multi-factor authentication, DPDP Act 2023 dynamic consent control.
- **Deployments**: Docker, docker-compose, Vercel (Frontend), Render (Backend Node API).

---

## 4. Git Branching & Feature Workflow Strategy

All new development work, bug fixes, and feature additions follow a strict git branching policy:
- **Sub-Branch Isolated Development**: Every new feature or fix is developed on a separate feature sub-branch (`feature/<feature-name>`).
- **Granular Commit History**: Code changes are committed in modular, single-responsibility commits.
- **Remote Synchronization**: Feature sub-branches are pushed directly to remote origin (`origin/feature/<feature-name>`).

---

## 5. Compliance and Operational Index

RescueLink is built from the ground up for healthcare compliance audits:
- **Database Schema**: [SCHEMA.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/SCHEMA.md)
- **Security hardening & Threat Model**: [SECURITY.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/SECURITY.md)
- **Production Deployments**: [DEPLOYMENT.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/DEPLOYMENT.md)
- **Data Erasure & Purge Specifications**: [DATA_HANDLING.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/DATA_HANDLING.md)
- **DPDP Act 2023 Compliance**: [PRIVACY_POLICY.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/PRIVACY_POLICY.md)
- **ABDM Sandbox Integration Guide**: [ABDM_INTEGRATION.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/docs/ABDM_INTEGRATION.md)
- **Hardware Monitor Hookup**: [VITALS_HARDWARE_SETUP.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/docs/VITALS_HARDWARE_SETUP.md)
- **Incident Response Manual**: [RUNBOOK.md](file:///c:/Users/Aditya%20Kulkarni/Downloads/Health-care-system/RUNBOOK.md)

---

## 6. Local Quickstart & Verification

### Backend Verification & Test Suite
```bash
cd backend
npm install
npm test
```

### Frontend Verification & Build
```bash
cd frontend
npm install
npm run build
```
