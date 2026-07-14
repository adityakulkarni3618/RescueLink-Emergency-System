# Ayushman Bharat Digital Mission (ABDM) Integration Guide

This guide details the integration architecture and sandbox certification parameters for the RescueLink Emergency System with India's Ayushman Bharat Digital Mission (ABDM) gateway.

---

## 1. HL7 FHIR R4 Profiles & NRCES Compliance
RescueLink exports emergency records matching India's **National Resource Centre for EHR Standards (NRCES)** profiles:

- **Patient profile**: [NRCES Patient Profile](https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient)
  - Enforces mapping of ABHA ID, demographics, gender, and contact info.
- **Encounter profile**: [NRCES Encounter Profile](https://nrces.in/ndhm/fhir/r4/StructureDefinition/Encounter)
  - Maps real-time emergency dispatch events (`FHIR Class: EMER`).
- **Observation profile**: [NRCES Observation Profile](https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation)
  - Groups physical telemetry outputs (Heart rate, SpO2, Blood pressure, Temperature) linked directly to the patient's context.

---

## 2. Sandbox Verification Callbacks (M1, M2, M3 Milestones)
ABDM Sandbox certification requires specific webhooks to receive callbacks from the national Consent Manager (NDHM Gateway).

### Consent Notification Flow (HIP / HIU)
- **Webhook Endpoint**: `POST /api/abdm/v0.5/consents/hip/notify`
- **Gateway Trigger**: Fired when a patient approves, revokes, or expires a consent request.
- **Action**: HIP decrypts the consent signature, verifies the digital lock, updates the internal `consents` registry, and returns a `202 Accepted` response.

### Longitudinal Data Transfer (HIP)
- **Webhook Endpoint**: `POST /api/abdm/v0.5/health-information/hip/request`
- **Gateway Trigger**: Fired when an authorized doctor/HIU requests actual records.
- **Action**: HIP verifies the consent ID, generates an encrypted payload using DH Key Exchange (ECDH) + AES-GCM-256, posts the encrypted FHIR Bundle to the requested `dataPushUrl`, and fires `/on-request` to the Gateway.

### Care Context Discovery & Linking
- **Link Init**: `POST /api/abdm/v0.5/links/link/init`
  - Gateway initiates a discovery check for matching medical contexts (e.g. matching mobile or ABHA ID).
- **Link Confirm**: `POST /api/abdm/v0.5/links/link/confirm`
  - Confirms the care context link after checking the patient's OTP verification response.

---

## 3. Integration Status Dashboard

| Module | Status | Sandbox Certified | Production Ready |
|---|---|---|---|
| ABHA Address Verification | Mock / Sandbox-Ready | Yes (Stubs aligned with specs) | No (Requires prod gateway credentials) |
| Aadhaar OTP Initiation | Mock / Sandbox-Ready | Yes (Initiates transaction ID) | No |
| Consent Webhook Notify | Implemented | Yes (Processes gateway notify schema) | No |
| Data Transfer Webhook | Implemented / Stubbed | Yes (Stubbed dataPushUrl receiver) | No (Requires ECDH wrapper) |
| Care Context Linking | Implemented / Stubbed | Yes (Callback listener active) | No |

---

## 4. Certification Checklist
To achieve full ABDM production deployment:
1. Register HIU/HIP IDs on the [ABDM Sandbox portal](https://sandbox.abdm.gov.in/).
2. Setup SSL on callback webhooks (ABDM requires HTTPS with valid public certs).
3. Implement the Cryptographic wrapper (ECDH) for payload encryption.
4. Pass the automated testing scenarios on the sandbox dashboard to get the production gateway keys.
