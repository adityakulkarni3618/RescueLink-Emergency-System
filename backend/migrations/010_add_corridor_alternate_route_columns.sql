-- 010_add_corridor_alternate_route_columns.sql
-- Adds route versioning, primary route history, and alternate route recommendation columns
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS route_version INTEGER DEFAULT 1;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS primary_route_history TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS alternate_route_recommendation TEXT;

ALTER TABLE emergency_corridors ADD COLUMN IF NOT EXISTS route_version INTEGER DEFAULT 1;
