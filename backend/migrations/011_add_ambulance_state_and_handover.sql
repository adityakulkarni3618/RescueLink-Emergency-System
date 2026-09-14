-- 011_add_ambulance_state_and_handover.sql
-- Migration adding ambulance_state to incidents and creating clinical_handovers table

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS ambulance_state VARCHAR(64) DEFAULT 'ASSIGNED';

CREATE TABLE IF NOT EXISTS clinical_handovers (
  id VARCHAR(36) PRIMARY KEY,
  incident_id VARCHAR(36) NOT NULL,
  hospital_id VARCHAR(36),
  paramedic_id VARCHAR(128),
  receiving_clinician_name VARCHAR(128),
  chief_complaint TEXT NOT NULL,
  vitals_snapshot TEXT,
  news2_score INTEGER DEFAULT 0,
  interventions_given TEXT,
  clinical_observations TEXT,
  status VARCHAR(32) DEFAULT 'SUBMITTED',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
