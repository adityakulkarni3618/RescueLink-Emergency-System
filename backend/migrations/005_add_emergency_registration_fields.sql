-- 005_add_emergency_registration_fields.sql
-- Adds emergency contact, insurance, paramedic licensing, and trauma rating fields to corresponding tables

-- 1. Patients / Users table extensions
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS policy_number VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS group_number VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_to_share_data BOOLEAN DEFAULT FALSE;

-- 2. Ambulances table extensions
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS license_number VARCHAR(255);
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS is_system_standard BOOLEAN DEFAULT TRUE;
ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS oxygen_capacity_liters INTEGER DEFAULT 0;

-- 3. Hospitals table extensions
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS trauma_tier VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS accreditation_id VARCHAR(255);
