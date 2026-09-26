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

- 🔄 **RescueLink Master System Flow & Parallel Multi-Channel Dispatch**: End-to-end automated emergency workflow executing parallel broadcast across candidate ambulances, continuous background hospital matching engine until bed reservation confirmation, and multi-channel system notifications (WebPush, SMS, WhatsApp queue).
- 📱 **RescueLink Mobile Edge Integration**: Full React Native mobile companion app integration supporting real-time GPS telemetry streaming, paramedic active incident intake, patient SOS tracking, and centralized API configuration (`RescueLinkMobile`).
- 🚨 **Guest Emergency Dispatch (Authentication Bypass)**: Instant SOS dispatch triggering geolocation capture and immediate ambulance routing without requiring password login.
- 🚥 **Emergency Green Corridor Coordination Layer**: Intelligent traffic signal preemption, multi-junction signal state machines (`NORMAL → ARMED → APPROACHING → PREEMPT_REQUESTED → PREEMPT_ACTIVE → AMBULANCE_PASSING → RESTORING → CLEARING → NORMAL`), Kalman-filtered ambulance telemetry, dynamic ETA calculation, automated traffic controller fallback, readiness scoring engine, and audit logging.
- 🚧 **Traffic-Aware Dynamic Alternate Corridor**: Real-time traffic obstruction detection ahead on remaining ambulance route, primary vs alternate route ETA comparison, safety-first recommendation engine (`SWITCH_ALTERNATE` vs `KEEP_PRIMARY`), human-in-the-loop control room confirmation, route versioning (`routeVersion`), and automatic corridor junction sequence rebuilding for the newly selected route.
- 📊 **Corridor Operational Panel & Simulator**: Live administrative green corridor dashboard featuring traffic signal overrides, junction readiness scores, ambulance telemetry simulation engine, state machine step progression, traffic intelligence ETA badges, and simulated traffic controller adapter integration.
- 📍 **Registered Profile Coordinate Map Pinning**: Dynamic position rendering for hospitals, ambulances, and user portals anchored directly to profile database latitude and longitude.
- 🔒 **Strict Portal Gateway Role Guards**: Role mismatch validation preventing cross-portal authentication attempts (e.g. blocking hospital credentials from logging into the Admin Gateway).
- 🚖 **Dual-Mode Radial & DB Registered Dispatch Engine**: Hybrid ambulance ranking system combining live socket units and registered database ambulances with offline notification queuing.
- 🔔 **Offline Paramedic & Hospital System Notification Queue**: In-memory and database notification queue ensuring offline dispatch alerts persist until paramedic/hospital reconnects.
- 🛡️ **War Room Verification Gate**: Admin approval workflows for newly registered hospital/ambulance accounts (`is_active: false` until verified by city admin).
- 📱 **QR Emergency Health Passport**: Offline QR code generation for patient profile access during emergency intake.
- 🗺️ **Zero-Token Map Engine**: Leaflet maps with custom dark-mode styling for zero-API-key emergency visual rendering.
- ⚡ **Bandwidth-Safe Telemetry Throttling**: Restricts socket events to mission rooms (`mission_${reqId}`) and admin war room (`admin_warroom`), reducing cloud bandwidth egress by >90%.
- 💾 **SQLite & PostgreSQL Persistence**: Persistent database storage with automatic local SQLite fallback for seamless offline resilience.
- 🧍 **Patient Emer-Health Profile Management**: Full patient portal backed by encrypted persistence for medical history, allergies, ABHA ID, and emergency contacts.
- 🚑 **Ambulance & Crew Management**: Paramedic license tracking, oxygen capacity monitoring, and standard vehicle safety compliance.
- 🌐 **Environment-Driven API Configuration**: Fully centralized API endpoint routing (`API_BASE_URL`) sourced dynamically from environment configurations with zero hardcoded deployment domains.
- 🩺 **Rule-Based Clinical Decision Support**: Real-time vital sign risk assessment offering instant clinical guidance without synthetic loading delays or misleading AI framing.
- 🗺️ **Dynamic Emergency Corridor Geocoding**: Real-time OpenStreetMap Nominatim reverse-geocoding of mission coordinates for automatic municipal corridor region resolution.
- 🛡️ **DPDP Act 2023 & HIPAA Compliance**: Application-layer AES-256-GCM encryption for PHI/PII, dynamic consent revocation, and automated retention policies.
- 🏥 **Clean User-Registered Entity Registry**: Guaranteed production environment free of hardcoded seed entities (`City General`, `Apollo`, `Manipal`, `AMB-101` .. `AMB-105`), showing exclusively user-registered hospitals and ambulances from the Neon Cloud PostgreSQL database.
- 🔑 **Strict Multi-Factor Authentication & Account Verification Guards**: Mandated 2FA validation with role-based access controls and explicit 403 `PENDING_APPROVAL` guards that prevent unverified or pending accounts from entering active portals.
- 🧹 **Automatic Session Auto-Purge & Storage Isolation**: Session handling isolated to `sessionStorage` with on-mount auto-purging of legacy tokens to ensure clean state isolation across reloads.
- 🚑 **Real DB Indian Vehicle & Unit Preservation**: Native persistence and full API visibility for user-registered Indian vehicle numbers (including `MH12` regional vehicle formats) in the PostgreSQL database without synthetic filtering.
- 📜 **Emergency Corridor Schema Synchronization**: Migration scripts (`012_fix_emergency_corridor_enum.sql`) ensuring strict database enum type safety for corridor state machines and dynamic alternate route options.
- 🧪 **Full End-to-End Emergency Journey Validation & System Proof**: Automated 21-stage E2E test suite (`backend/tests/e2eEmergencyJourney.test.js` / scenario `E2E-EMERGENCY-001`) validating complete lifecycle coordination from patient SOS to hospital admission, SBAR clinical handover sign-off, atomic bed reservation, 9-stage green corridor progression, RBAC enforcement, failure matrix, and 3-incident multi-tenant isolation.

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
- **Database Schema**: [SCHEMA.md](SCHEMA.md)
- **Security Hardening & Threat Model**: [SECURITY.md](SECURITY.md)
- **Production Deployments**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Data Erasure & Purge Specifications**: [DATA_HANDLING.md](DATA_HANDLING.md)
- **DPDP Act 2023 Compliance**: [PRIVACY_POLICY.md](PRIVACY_POLICY.md)
- **ABDM Sandbox Integration Guide**: [ABDM_INTEGRATION.md](docs/ABDM_INTEGRATION.md)
- **Technical Summary & Pilot Proposal**: [TECHNICAL_SUMMARY.md](TECHNICAL_SUMMARY.md)
- **Real-Time Architecture Specs**: [REALTIME_ARCHITECTURE.md](REALTIME_ARCHITECTURE.md)
- **Enterprise Roadmap**: [RescueLink_Enterprise_Roadmap.md](RescueLink_Enterprise_Roadmap.md)
- **Backend Production Readiness**: [BACKEND_PRODUCTION_READINESS.md](BACKEND_PRODUCTION_READINESS.md)
- **Bandwidth & Render Readiness**: [RENDER_BANDWIDTH_READINESS_REPORT.md](RENDER_BANDWIDTH_READINESS_REPORT.md) / [BANDWIDTH_AUDIT_REPORT.md](BANDWIDTH_AUDIT_REPORT.md)
- **Incident Response Manual**: [RUNBOOK.md](RUNBOOK.md)
- **Interactive Demo Script & Guide**: [DEMO_GUIDE.md](DEMO_GUIDE.md)
- **Real vs Simulated Integrations Matrix**: [REAL_INTEGRATIONS.md](REAL_INTEGRATIONS.md)
- **Municipal Pilot Readiness Assessment**: [PILOT_READINESS.md](PILOT_READINESS.md)
- **End-to-End Real-World Validation Report**: [REAL_WORLD_VALIDATION_REPORT.md](REAL_WORLD_VALIDATION_REPORT.md)
- **Full Emergency Journey E2E Validation & System Proof**: [E2E_EMERGENCY_VALIDATION_REPORT.md](E2E_EMERGENCY_VALIDATION_REPORT.md)

---

## 6. Local Quickstart & Verification

### Interactive End-to-End Simulation Demo
```bash
cd backend
npm run demo
```

### Backend Verification & Test Suite
```bash
cd backend
npm install
npm test
```

### Frontend Verification & Build
```bash
cd backend/../frontend
npm install
npm run build
```
