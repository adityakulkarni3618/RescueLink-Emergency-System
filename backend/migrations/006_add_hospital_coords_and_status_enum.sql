-- Migration 006: Add hospital_lat/hospital_lng to incidents table
-- These columns enable real-world corridor routing by persisting the hospital destination GPS
-- Also adds the extended status ENUM values used by the socket dispatch layer

-- Add hospital destination columns
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS hospital_lat FLOAT,
  ADD COLUMN IF NOT EXISTS hospital_lng FLOAT;

-- Extend status column to include socket-layer dispatch states
-- Note: In SQLite, ENUM doesn't exist as a constraint — this is a no-op in SQLite mode.
-- In PostgreSQL: Alter enum type to add new values if not already present
DO $$
BEGIN
  -- Add pending_ambulance
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_ambulance' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'pending_ambulance';
  END IF;
  -- Add ambulance_assigned
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ambulance_assigned' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'ambulance_assigned';
  END IF;
  -- Add admission_request
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'admission_request' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'admission_request';
  END IF;
  -- Add hospital_accepted
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'hospital_accepted' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'hospital_accepted';
  END IF;
  -- Add patient_onboard
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'patient_onboard' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'patient_onboard';
  END IF;
  -- Add pending_hospital_accept
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_hospital_accept' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_incidents_status')) THEN
    ALTER TYPE "enum_incidents_status" ADD VALUE 'pending_hospital_accept';
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL; -- Table/type may not exist in SQLite mode, safe to skip
  WHEN others THEN NULL;           -- Skip on any other error (e.g., SQLite which has no pg_enum)
END$$;
