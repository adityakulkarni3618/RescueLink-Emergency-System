# RescueLink Database Schema Documentation

This document defines the schema of the RescueLink PostgreSQL database, aligning with HL7 FHIR v4.0.1 resources and establishing compliance with the Digital Personal Data Protection (DPDP) Act 2023.

---

## Data Encryption Policy

All Personally Identifiable Information (PII) and Protected Health Information (PHI) columns are encrypted at the application layer using AES-GCM-256 (via `server/utils/encryption.js`) before persisting in the database.

- **Encrypted Columns**:
  - `patients.name` (PHI/PII)
  - `patients.dob` (PII)
  - `patients.abha_number` (National ID / PII)
  - `patients.emergency_contact_name` (PII)
  - `patients.emergency_contact_mobile` (PII)
  - `users.mobile` (PII)
  - `users.totp_secret` (Security Credential)
  - `incidents.pickup_address` (Location/PII)

---

## 1. Table: `hospitals`
Maps to HL7 FHIR `Organization` resource. Holds healthcare facility metadata.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique hospital identifier. | No |
| `name` | `VARCHAR(255)` | `NOT NULL` | Registered hospital name. | No |
| `city` | `VARCHAR(255)` | - | City name. | No |
| `state` | `VARCHAR(255)` | - | State name. | No |
| `lat` | `DOUBLE PRECISION` | - | Location Latitude. | No |
| `lng` | `DOUBLE PRECISION` | - | Location Longitude. | No |
| `contact_number`| `VARCHAR(50)` | - | Official contact phone. | No |
| `total_beds` | `INTEGER` | `DEFAULT 0` | Total hospital beds. | No |
| `icu_beds` | `INTEGER` | `DEFAULT 0` | ICU beds capacity. | No |
| `ventilators` | `INTEGER` | `DEFAULT 0` | Total ventilators available. | No |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE`| Active status flag. | No |

---

## 2. Table: `users`
Maps to HL7 FHIR `Practitioner` / `RelatedPerson` resources depending on role.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique user identifier. | No |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full name. | No |
| `email` | `VARCHAR(255)` | `UNIQUE`, `NOT NULL` | Login email address. | No |
| `password` | `VARCHAR(255)` | `NOT NULL` | Bcrypt password hash. | No |
| `role` | `VARCHAR(50)` | `NOT NULL` | Role: `patient`, `paramedic`, `doctor`, `hospital_admin`, `city_admin`, `family`. | No |
| `mobile` | `VARCHAR(255)` | - | Mobile number. | **Yes** |
| `hospital_id` | `UUID` | `FOREIGN KEY` | Association to `hospitals`. | No |
| `abha_number` | `VARCHAR(255)` | - | ABDM ABHA ID. | No |
| `fcm_token` | `VARCHAR(255)` | - | Push notification token. | No |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE`| Active status flag. | No |
| `totp_secret` | `TEXT` | - | MFA TOTP secret key. | **Yes** |
| `backup_codes` | `JSONB` | `DEFAULT '[]'` | Encrypted backup codes. | No |

---

## 3. Table: `patients`
Maps to HL7 FHIR `Patient` resource. Contains clinical baseline profile.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique patient identifier. | No |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full Name. | **Yes** |
| `name_masked` | `VARCHAR(255)` | - | Scrambled/masked representation (e.g. A***** K*******). | No |
| `dob` | `VARCHAR(255)` | - | Date of birth. | **Yes** |
| `blood_group` | `VARCHAR(10)` | - | Blood group baseline. | No |
| `abha_number` | `VARCHAR(255)` | - | ABDM ABHA ID. | **Yes** |
| `allergies` | `JSONB` | `DEFAULT '[]'` | FHIR AllergyIntolerance equivalent array. | No |
| `conditions` | `JSONB` | `DEFAULT '[]'` | FHIR Condition array. | No |
| `emergency_contact_name`| `VARCHAR(255)`| - | Next of kin contact name. | **Yes** |
| `emergency_contact_mobile`| `VARCHAR(255)`| - | Next of kin contact mobile. | **Yes** |
| `gender` | `VARCHAR(50)` | `DEFAULT 'unknown'` | Gender. | No |
| `active` | `BOOLEAN` | `DEFAULT TRUE`| Current active record flag. | No |
| `consent_obtained`| `BOOLEAN` | `DEFAULT FALSE`| Active consent indicator. | No |
| `consent_timestamp`| `TIMESTAMP` | - | Time consent was granted. | No |
| `hospital_id` | `UUID` | `FOREIGN KEY` | Associated hospital facility. | No |

---

## 4. Table: `incidents`
Maps to HL7 FHIR `Encounter` resource. Tracks active/completed rescue missions.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique encounter identifier. | No |
| `patient_id` | `UUID` | `FOREIGN KEY` | Associated patient. | No |
| `ambulance_id` | `VARCHAR(255)` | - | Active ambulance ID. | No |
| `paramedic_id` | `UUID` | `FOREIGN KEY` | Responding paramedic. | No |
| `hospital_id` | `UUID` | `FOREIGN KEY` | Target destination hospital. | No |
| `status` | `VARCHAR(50)` | `DEFAULT 'requested'`| Status: `requested`, `dispatched`, `en_route`, `arrived`, `completed`, `cancelled`. | No |
| `pickup_lat` | `DOUBLE PRECISION`| - | Latitude of incident location. | No |
| `pickup_lng` | `DOUBLE PRECISION`| - | Longitude of incident location. | No |
| `pickup_address`| `VARCHAR(500)` | - | Physical location details. | **Yes** |
| `news2_score` | `INTEGER` | `DEFAULT 0` | Calculated triage severity score. | No|
| `vitals_log` | `JSONB` | `DEFAULT '[]'` | Time-series stream of vitals data. | No |
| `gps_log` | `JSONB` | `DEFAULT '[]'` | Coordinates history of transit. | No |
| `notes` | `TEXT` | - | Paramedic diagnostic notes. | No |
| `started_at` | `TIMESTAMP` | `DEFAULT NOW` | Dispatch initiation timestamp. | No |
| `completed_at` | `TIMESTAMP` | - | Mission handover timestamp. | No |
| `razorpay_order_id`| `VARCHAR(255)`| - | Billing/payment gateway ID. | No |
| `payment_status`| `VARCHAR(50)` | `DEFAULT 'pending'`| Status: `pending`, `paid`, `insurance`, `waived`. | No |
| `fhir_class` | `VARCHAR(50)` | `DEFAULT 'EMER'` | FHIR encounter class. | No |
| `fhir_priority` | `VARCHAR(50)` | `DEFAULT 'routine'`| FHIR encounter priority. | No |

---

## 5. Table: `vitals_history`
Maps to HL7 FHIR `Observation` resource. Holds granular physical readings.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique observation identifier. | No |
| `incident_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Linked incident/encounter. | No |
| `timestamp` | `TIMESTAMP` | `NOT NULL` | Timestamp of measurement. | No |
| `heart_rate` | `INTEGER` | - | Heart rate (bpm). | No |
| `spo2` | `INTEGER` | - | Blood oxygen saturation (%). | No |
| `sbp` | `INTEGER` | - | Systolic Blood Pressure (mmHg).| No |
| `dbp` | `INTEGER` | - | Diastolic Blood Pressure (mmHg).| No |
| `respiratory_rate`| `INTEGER` | - | Respiration rate. | No |
| `temperature` | `DOUBLE PRECISION`| - | Temperature in Celsius. | No |
| `news2_value` | `INTEGER` | - | Intermediary computed NEWS2. | No |

---

## 6. Table: `blood_requests`
Maps to HL7 FHIR `ServiceRequest` resource.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique request identifier. | No |
| `hospital_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Requesting hospital unit. | No |
| `blood_type` | `VARCHAR(10)` | `NOT NULL` | Requested type (e.g. A-). | No |
| `units` | `INTEGER` | `NOT NULL` | Units needed. | No |
| `status` | `VARCHAR(50)` | `DEFAULT 'pending'`| Status: `pending`, `fulfilled`, `cancelled`. | No |
| `urgency` | `VARCHAR(50)` | `DEFAULT 'routine'`| Status: `routine`, `urgent`, `stat`. | No |

---

## 7. Table: `insurance_claims`
Maps to HL7 FHIR `Claim` resource.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique claim identifier. | No |
| `incident_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Linked incident/encounter. | No |
| `patient_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Target patient. | No |
| `policy_number` | `VARCHAR(255)`| `NOT NULL` | Insurance plan number. | No |
| `claim_amount` | `NUMERIC(10,2)`| `NOT NULL` | Total billing amount. | No |
| `status` | `VARCHAR(50)` | `DEFAULT 'submitted'`| Status: `submitted`, `approved`, `rejected`. | No |

---

## 8. Table: `consents`
Maps to HL7 FHIR `Consent` resource.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique identifier. | No |
| `patient_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Target patient identifier. | No |
| `user_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Practitioner granted access. | No |
| `status` | `VARCHAR(50)` | `NOT NULL` | Status: `active`, `proposed`, `inactive`. | No |
| `scope` | `VARCHAR(100)` | `NOT NULL` | Scope of access. | No |
| `expires_at` | `TIMESTAMP` | - | Validity end date. | No |

---

## 9. Table: `audit_logs`
Maps to HL7 FHIR `AuditEvent` resource. Complete records of read/write transactions.

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Unique audit record identifier. | No |
| `user_id` | `UUID` | `FOREIGN KEY` | Interacting practitioner. | No |
| `action` | `VARCHAR(255)` | `NOT NULL` | Operations: `READ`, `WRITE`, `PATIENT_UNMASK`, etc. | No |
| `resource` | `VARCHAR(255)` | - | Resource type. | No |
| `resource_id` | `VARCHAR(255)` | - | Specific resource ID accessed. | No |
| `ip_address` | `VARCHAR(45)` | - | IPv4/IPv6 client IP. | No |
| `severity` | `VARCHAR(50)` | `DEFAULT 'INFO'` | Event level: `INFO`, `WARNING`, `CRITICAL`. | No |
| `category` | `VARCHAR(255)` | `DEFAULT 'GENERAL'`| Logical category. | No |
| `details` | `JSONB` | `DEFAULT '{}'` | Metadata snapshot of operation. | No |
| `createdAt` | `TIMESTAMP` | `NOT NULL` | Insertion timestamp. | No |

---

## 10. Table: `pending_erasures`
Complies with DPDP Act 2023 Section 12 (Right to Correction and Erasure).

| Column | Type | Constraints | Description | Encrypted |
|---|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY` | Request ID. | No |
| `request_by_user_id`| `UUID` | `FOREIGN KEY`, `NOT NULL` | Initiating user. | No |
| `patient_id` | `UUID` | `FOREIGN KEY`, `NOT NULL` | Target patient profile. | No |
| `status` | `VARCHAR(50)` | `DEFAULT 'PENDING'`| Status: `PENDING`, `APPROVED`, `REJECTED`. | No |
| `reason` | `VARCHAR(255)` | `NOT NULL` | Legal/personal explanation. | No |
| `reviewed_by_user_id`| `UUID` | `FOREIGN KEY` | Admin performing review. | No |
| `review_notes` | `VARCHAR(255)`| - | Audit notes on execution. | No |
| `createdAt` | `TIMESTAMP` | `NOT NULL` | Creation timestamp. | No |
| `updatedAt` | `TIMESTAMP` | `NOT NULL` | Update/Approval timestamp. | No |

---

## DPDP Act 2023 Data Retention & Erasure Policy

In compliance with the Digital Personal Data Protection Act (DPDP) 2023:
1. **Right to Erasure**: Patients can submit erasure requests (stored in `pending_erasures`). Upon approval by an authorized system administrator, the patient profile is marked inactive (`active = false`) and PII/PHI columns are completely scrubbed (overwritten or deleted), while leaving non-identifying clinical timestamps and metrics for statutory audit requirements.
2. **Data Retention**: Under medical data regulations, standard health records must be maintained for 3 years post-treatment or as mandated by state guidelines. Non-identifiable aggregated statistics are retained indefinitely.
