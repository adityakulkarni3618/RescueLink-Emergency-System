# RescueLink Technical Summary & Pilot Proposal

This document summarizes the current technical state of the RescueLink platform, identifying what is production-ready, what remains mocked for simulation/testing, and a roadmap to deploy a successful state-wide 108 ambulance or hospital pilot.

---

## 1. Technical Capabilities: Real vs. Mocked Status

| Subsystem | Production-Ready (Real) | Mocked (Simulation Fallback) |
|---|---|---|
| **Database** | PostgreSQL system of record with migrations and SQLite local fallbacks. | None (Consolidated on DB schemas). |
| **PII/PHI Security** | AES-256-GCM application-layer column encryption in the DB. | None. |
| **Auditing & Immutability** | Append-only database rules block updates/deletes to `AuditLog`. | None. |
| **Triage & NEWS2 Triage** | Real-time calculation of NEWS2 scores based on clinical vitals. | None. |
| **PWA Caching** | Service worker offline caching for ambulance streaming. | None. |
| **HL7 Gateway** | parsing HL7 ORU messages from serial interfaces. | Simulates serial output if monitor is offline. |
| **ABDM Integration** | Consent, record access, and care context endpoints conform to v0.5 specs. | Fails back to simulated callbacks if sandbox credentials are not present. |
| **Green Corridor Routing** | Google Maps Directions API + traffic layers. | Falls back to OSRM when key is not defined. |

---

## 2. Operational Needs for a Pilot Program

To transition RescueLink into a live pilot with a hospital or municipal ambulance service, the following steps must be taken:

1. **Hardware Integration (Biomedical check)**:
   - Establish physical serial/USB hookups between the ambulance edge tablet and the onboard GE Carescape or Philips IntelliVue monitor (see `docs/VITALS_HARDWARE_SETUP.md`).
2. **ABDM Sandbox Certification**:
   - Register on the National Health Authority (NHA) Sandbox portal, verify callback URLs under SSL/TLS, and pass the automated test suites to request production keys.
3. **CERT-In Security Empanelment**:
   - Commission a MeitY-empanelled security audit to perform penetration tests on our TLS configurations, JWT rotation, and append-only ledgers.

---

## 3. Implementation Schedule & Roadmap

- **Month 1: Infrastructure Commissioning**
  - Commission AWS RDS / ElastiCache clusters in MeitY-compliant MeitY zones.
  - Setup Nginx SSL termination with official state government `.gov.in` subdomains.
- **Month 2: Edge Hardware Testing**
  - Install serial-to-USB adapters in 5 pilot ambulances, mapping HL7 parsing strings to check performance.
- **Month 3: NHA Sandbox Clearance & Audit**
  - Clear NHA sandbox scenarios and trigger live production audits. Start active pilot coordination.
