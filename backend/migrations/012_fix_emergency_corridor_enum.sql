-- 012_fix_emergency_corridor_enum.sql
-- Idempotent schema migration to add canonical state machine values to PostgreSQL enums
-- and align emergency_corridors status & corridor_state columns with the application state machine.

DO $$
BEGIN
  -- 1. Add canonical values to enum_emergency_corridors_status if PostgreSQL ENUM exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_emergency_corridors_status') THEN
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'NORMAL';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'ARMED';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'APPROACHING';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'PREEMPT_REQUESTED';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'PREEMPT_ACTIVE';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'AMBULANCE_PASSING';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'CLEARING';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'RESTORING';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'CONTROLLER_FAIL';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'MANUAL_INTERVENTION';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'SCHEDULED';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'PREEMPTING';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'CORRIDOR_ACTIVE';
    ALTER TYPE enum_emergency_corridors_status ADD VALUE IF NOT EXISTS 'PASSED';
  END IF;

  -- 2. Add canonical values to enum_emergency_corridors_corridor_state if PostgreSQL ENUM exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_emergency_corridors_corridor_state') THEN
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'NORMAL';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'ARMED';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'APPROACHING';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'PREEMPT_REQUESTED';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'PREEMPT_ACTIVE';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'AMBULANCE_PASSING';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'CLEARING';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'RESTORING';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'CONTROLLER_FAIL';
    ALTER TYPE enum_emergency_corridors_corridor_state ADD VALUE IF NOT EXISTS 'MANUAL_INTERVENTION';
  END IF;
END $$;

-- 3. Safely convert status & corridor_state columns in emergency_corridors table to VARCHAR(255) to guarantee full string compatibility
ALTER TABLE emergency_corridors ALTER COLUMN status TYPE VARCHAR(255) USING status::text;
ALTER TABLE emergency_corridors ALTER COLUMN status SET DEFAULT 'NORMAL';

ALTER TABLE emergency_corridors ALTER COLUMN corridor_state TYPE VARCHAR(255) USING corridor_state::text;
ALTER TABLE emergency_corridors ALTER COLUMN corridor_state SET DEFAULT 'NORMAL';
