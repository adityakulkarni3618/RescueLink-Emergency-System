# RescueLink Security Audit & Threat Modeling Guide

This document outlines the security architecture, threat model, cryptographic mechanisms, and compliance postures implemented in RescueLink to prepare for government and hospital security reviews.

---

## 1. Authentication & Session Security Model

RescueLink employs a multi-tiered authentication architecture to restrict access to Patient Health Information (PHI) and clinical operations.

- **Short-Lived JWT Access Tokens**:
  - Access tokens have a strictly enforced **15-minute expiration window** (`JWT_EXPIRES_IN=15m`) to minimize session hijacking risk.
- **Rotated Refresh Tokens**:
  - On successful login, the server generates a cryptographically secure random refresh token stored in the database.
  - Refresh tokens are rotated on every invocation of `/api/auth/refresh`. When a client exchanges a refresh token for a new access token, a new refresh token is generated and returned, invalidating the old one.
- **Mandatory MFA (TOTP)**:
  - MFA is mandatory for high-privilege hospital roles (`doctor`, `hospital_admin`, `city_admin`).
  - Access tokens are withheld on login for these roles until a 6-digit TOTP token is verified via `/api/auth/verify-mfa`.

---

## 2. Cryptography & Encryption at Rest

RescueLink applies application-layer encryption to ensure compliance with the **Digital Personal Data Protection (DPDP) Act 2023** and **HIPAA** guidelines.

- **Algorithm**: AES-256-GCM (implemented via `node-forge` in `server/utils/encryption.js`).
- **Encrypted Fields**:
  - `patients.name` (Encrypted to hide identity from unauthorized roles)
  - `patients.dob` (Encrypted PII)
  - `patients.abha_number` (Encrypted Health ID)
  - `patients.emergency_contact_name` (Encrypted PII)
  - `patients.emergency_contact_mobile` (Encrypted PII)
  - `users.mobile` (Encrypted PII)
  - `users.totp_secret` (Encrypted security credential)
  - `incidents.pickup_address` (Encrypted location details)

---

## 3. Auditing & Immutability Ledger

Audit logging is the cornerstone of regulatory compliance.

- **Append-Only Hooks**:
  - The `AuditLog` Sequelize model blocks all `UPDATE`, `DELETE`, and bulk destroy queries at the ORM level.
- **Read & Write Auditing**:
  - Every write transaction (logins, incident updates, resource locks) and every read transaction (patient listings, detail views, FHIR exports) triggers a entry in the `audit_logs` database table.

---

## 4. Penetration Testing Guidelines

Before deploying RescueLink in a live hospital sandbox, penetration testers should focus on the following vectors:

1. **Token Theft and Reuse**:
   - Verify that revoked access tokens cannot be reused (tested via redis blacklist middleware).
   - Test that refresh tokens are rotated and cannot be reused.
2. **Access Control (Bypassing Triage & Masking)**:
   - Verify that low-acuity roles (e.g. `paramedic` or `driver`) cannot see unmasked patient name strings without an explicit doctor-level OTP consent link.
3. **MFA Bypass**:
   - Verify that doctor accounts without MFA enabled are prevented from making API requests to clinical endpoints (e.g. `/api/patients/:id`).
4. **Input Validation Fuzzing**:
   - Test validation constraints on sync endpoints (`/api/sync/batch`) using malformed telemetry structures.
