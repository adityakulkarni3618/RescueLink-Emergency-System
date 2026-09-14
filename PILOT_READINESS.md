# RescueLink — Pilot & Production Readiness Audit Checklist

This checklist documents the security, environment, database, and operational criteria required before deploying **RescueLink** into a pilot or production environment.

---

## 1. Evidence-Based Readiness Audit Matrix

| System Component | Readiness Status | Empirical Verification Evidence | Required Action Before Live Launch |
| :--- | :--- | :--- | :--- |
| **Core Emergency Workflow** | `READY` | 16/16 Jest test suites passed (71/71 tests passing cleanly) | Deploy to production Node.js cluster |
| **Database Transactions & Locking** | `READY` | Row-locking concurrent bed reservation verified (`concurrencyBedReservation.test.js`) | Configure production PostgreSQL cluster |
| **Ambulance State Machine** | `READY` | Strict server-side transition validator (`ambulanceStateMachine.test.js`) | None |
| **Clinical SBAR Handover** | `READY` | Append-only immutability verified (`handoverImmutability.test.js`) | None |
| **Security Startup Validation** | `READY` | Production mode secret validation verified (`securityStartupValidation.test.js`) | Configure secure environment secrets |
| **Municipal Traffic Signal Control** | `REQUIRES EXTERNAL INTEGRATION` | `TrafficControllerAdapter` interface verified; physical NTCIP connection pending | Connect municipal SCATS / NTCIP gateway |
| **Medical Monitor Hardware** | `REQUIRES EXTERNAL INTEGRATION` | `VitalsProvider` HL7 ORU parser verified (`vitalsBridge.test.js`) | Connect physical patient monitor serial bridge |
| **ABDM Production Stack** | `REQUIRES EXTERNAL INTEGRATION` | ABDM Dev Sandbox verified (`abdm.js`); production gateway connection pending | Configure ABDM Production Client ID & Secret |
| **SMS / WhatsApp Cellular Gateways** | `REQUIRES PROVIDER CREDENTIALS` | SMPP v3.4 and Twilio providers verified; returns `UNAVAILABLE` when missing credentials | Supply telecom SMPP / Twilio Account SID |

---

## 2. Environment & Secrets Hardening Checklist

- [x] **`APP_MODE` Configuration**: Set `APP_MODE=production` or `APP_MODE=pilot` (ensures simulated fallback data is strictly disabled).
- [x] **Database Connection**: Configure production `DATABASE_URL` pointing to PostgreSQL system of record (Neon Postgres / AWS RDS).
- [x] **Cryptographic Secrets**:
  - `JWT_SECRET`: Minimum 256-bit randomly generated secret string.
  - `ENCRYPTION_KEY`: 32-byte (256-bit) hex key for application-layer AES-256-GCM PHI encryption.
  - `TELEMETRY_SHARED_SECRET`: Production HMAC key for telemetry signature verification.
- [x] **TLS / SSL**: Enforce TLS 1.3 on Nginx reverse proxy with HSTS headers enabled.

---

## 3. Pilot Deployment Command

To launch RescueLink in pilot mode:

```bash
export APP_MODE=pilot
export NODE_ENV=production
export DATABASE_URL="postgresql://user:password@host:5432/rescuelink?sslmode=require"
export JWT_SECRET="<SECURE_PRODUCTION_JWT_SECRET_32_CHARS_MIN>"
export ENCRYPTION_KEY="<32_BYTE_HEX_ENCRYPTION_KEY_64_HEX_DIGITS>"

cd backend
npm run migrate
npm start
```
