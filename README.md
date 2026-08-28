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

## 2. Real-World Healthcare Features & Capabilities

- **🚨 Guest Emergency Dispatch (Authentication Bypass)**: Instant SOS dispatch triggering geolocation capture and immediate ambulance routing without requiring account setup or passwords during acute crises.
- **🧍 Patient Emer-Health Profile Management**: Full patient portal allowing management of ABDM ABHA IDs, blood groups, allergies, chronic conditions, next-of-kin emergency contact numbers, and insurance policies.
- **🚑 Certified Ambulance & Crew Management**: Paramedic license tracking, expiration dates, oxygen capacity (liters), and standard EMS vehicle safety compliance checks.
- **🏥 Hospital Trauma Tier Routing**: Clinical Trauma Center Ratings (Tier 1 Comprehensive, Tier 2 Major, Tier 3 General ER) combined with JCI/NABH national accreditation tracking for intelligent AI destination routing.
- **🛡️ DPDP Act 2023 & HIPAA Compliance**: Application-layer AES-256-GCM encryption for PHI/PII, dynamic consent revocation, automated 3-year record purge policies, and immutable cryptographic audit logs.
- **🛡️ Registration Admin Approvals (Fraud Prevention)**: Workflow to enforce system authorization for hospitals and ambulances. Registrations remain inactive (`is_active: false`) until approved by the City Administrator in the War Room tab dashboard.
- **🚦 AI Emergency Corridor & Dynamic Signal Preemption**: Dynamic traffic signal override synchronizer with Kalman filter GPS drift smoothing, HMAC-SHA256 telemetry signature checks, and automatic watchdog timeouts to prevent city-wide traffic locks during ambulance network disconnections.

---

## 3. Tech Stack

- **Backend**: Node.js, Express, Socket.io, Sequelize ORM, PostgreSQL / SQLite.
- **Frontend**: React.js, Leaflet Maps, Recharts, Custom Glassmorphism UI System.
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
