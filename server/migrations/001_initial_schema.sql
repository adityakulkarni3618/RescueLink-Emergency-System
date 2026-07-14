-- 001_initial_schema.sql
-- RescueLink Database Initialization Migration

-- 1. Table: hospitals
CREATE TABLE IF NOT EXISTS hospitals (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255),
  state VARCHAR(255),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_number VARCHAR(50),
  total_beds INTEGER DEFAULT 0,
  icu_beds INTEGER DEFAULT 0,
  ventilators INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Table: users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  mobile VARCHAR(255),
  hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  abha_number VARCHAR(255),
  fcm_token VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  totp_secret TEXT,
  backup_codes JSONB DEFAULT '[]',
  refresh_token VARCHAR(255),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Table: patients
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_masked VARCHAR(255),
  dob VARCHAR(255),
  blood_group VARCHAR(10),
  abha_number VARCHAR(255),
  allergies JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '[]',
  emergency_contact_name VARCHAR(255),
  emergency_contact_mobile VARCHAR(255),
  gender VARCHAR(50) DEFAULT 'unknown',
  active BOOLEAN DEFAULT TRUE,
  consent_obtained BOOLEAN DEFAULT FALSE,
  consent_timestamp TIMESTAMP WITH TIME ZONE,
  hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Table: incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  ambulance_id VARCHAR(255),
  paramedic_id UUID REFERENCES users(id) ON DELETE SET NULL,
  hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'requested',
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  pickup_address VARCHAR(500),
  news2_score INTEGER DEFAULT 0,
  vitals_log JSONB DEFAULT '[]',
  gps_log JSONB DEFAULT '[]',
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  razorpay_order_id VARCHAR(255),
  payment_status VARCHAR(50) DEFAULT 'pending',
  fhir_class VARCHAR(50) DEFAULT 'EMER',
  fhir_priority VARCHAR(50) DEFAULT 'routine',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Table: vitals_history
CREATE TABLE IF NOT EXISTS vitals_history (
  id UUID PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  heart_rate INTEGER,
  spo2 INTEGER,
  sbp INTEGER,
  dbp INTEGER,
  respiratory_rate INTEGER,
  temperature DOUBLE PRECISION,
  news2_value INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Table: blood_requests
CREATE TABLE IF NOT EXISTS blood_requests (
  id UUID PRIMARY KEY,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_type VARCHAR(10) NOT NULL,
  units INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  urgency VARCHAR(50) DEFAULT 'routine',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. Table: insurance_claims
CREATE TABLE IF NOT EXISTS insurance_claims (
  id UUID PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  policy_number VARCHAR(255) NOT NULL,
  claim_amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'submitted',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 8. Table: consents
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  scope VARCHAR(100) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  policy_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
  consent_details TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 9. Table: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource VARCHAR(255),
  resource_id VARCHAR(255),
  ip_address VARCHAR(45),
  severity VARCHAR(50) DEFAULT 'INFO',
  category VARCHAR(255) DEFAULT 'GENERAL',
  details JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 10. Table: pending_erasures
CREATE TABLE IF NOT EXISTS pending_erasures (
  id UUID PRIMARY KEY,
  request_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'PENDING',
  reason VARCHAR(255) NOT NULL,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_notes VARCHAR(255),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Database Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_patients_abha ON patients(abha_number);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active);
CREATE INDEX IF NOT EXISTS idx_incidents_status_created ON incidents(status, "createdAt");
CREATE INDEX IF NOT EXISTS idx_incidents_patient ON incidents(patient_id);
CREATE INDEX IF NOT EXISTS idx_incidents_paramedic ON incidents(paramedic_id);
CREATE INDEX IF NOT EXISTS idx_incidents_hospital ON incidents(hospital_id);
CREATE INDEX IF NOT EXISTS idx_vitals_incident ON vitals_history(incident_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs("createdAt");
CREATE INDEX IF NOT EXISTS idx_users_hospital ON users(hospital_id);
