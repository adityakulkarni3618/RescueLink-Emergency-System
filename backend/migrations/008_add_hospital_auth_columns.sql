-- 008_add_hospital_auth_columns.sql
-- Adds missing email, password, totp_secret columns to hospitals table
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
