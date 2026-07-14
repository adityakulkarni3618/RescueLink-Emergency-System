# RescueLink: Real-Time Emergency Care Coordination Platform

RescueLink is an enterprise-grade emergency care system designed to coordinate real-time patient telemetry, GPS ambulance routing, and secure hospital resource allocation.

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
        D -->|Rate Limiter & Helmet| E{Authentication / MFA}
        E -->|Doctor / Admin Role| F[maskSensitiveData Middleware]
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

## 2. Tech Stack

- **Backend**: Node.js, Express, Socket.io, Sequelize ORM.
- **Frontend**: React.js, Leaflet Maps, offline PWA Service Worker.
- **Database**: PostgreSQL (system of record), SQLite (automatic local fallback), Redis (blacklists).
- **Security**: AES-256-GCM application-layer encryption, TOTP Multi-factor authentication.
- **Deployments**: Docker, docker-compose, SSL/TLS Nginx.

---

## 3. Compliance and Operational Index

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

## 4. Local Quickstart

### Prerequisites
- Node.js v18+
- PostgreSQL / SQLite

### Installation
1. Install server dependencies:
   ```bash
   cd server
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Run migrations and database seeds:
   ```bash
   npm run seed
   ```
4. Start development server:
   ```bash
   npm run dev
   ```
