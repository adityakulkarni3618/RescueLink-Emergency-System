-- 003_add_missing_columns.sql
-- Adds columns introduced in newer model definitions that are absent from the DB

-- hospitals: add bed_statuses
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS bed_statuses TEXT DEFAULT '[]';

-- users: add patient-profile fields and authority
ALTER TABLE users ADD COLUMN IF NOT EXISTS abha_address VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_group VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chronic_conditions TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS authority VARCHAR(255);

-- incidents: add attending doctor/team fields
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS attending_doctor_name VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS attending_doctor_specialty VARCHAR(255);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS attending_team_details JSONB;
