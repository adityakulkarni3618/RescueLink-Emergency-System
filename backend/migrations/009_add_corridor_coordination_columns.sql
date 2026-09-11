-- 009_add_corridor_coordination_columns.sql
-- Adds operational emergency corridor columns for state machine, ETA, bearings, and preemption flags
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS route_order INTEGER DEFAULT 0;
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS distance_from_ambulance FLOAT DEFAULT 0;
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS distance_from_start FLOAT DEFAULT 0;
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS approach_direction VARCHAR(255);
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS required_movement VARCHAR(255) DEFAULT 'Through';
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS normal_signal_state VARCHAR(255) DEFAULT 'RED_CYCLE';
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS corridor_state VARCHAR(255) DEFAULT 'NORMAL';
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS preemption_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS preemption_active BOOLEAN DEFAULT FALSE;
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS controller_status VARCHAR(255) DEFAULT 'ONLINE';
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS gps_confidence VARCHAR(255) DEFAULT 'HIGH';
ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS last_updated DATETIME;
