-- Alter table hospitals
ALTER TABLE hospitals ADD COLUMN license_number VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN departments TEXT;
ALTER TABLE hospitals ADD COLUMN bay_capacity INTEGER DEFAULT 5;

-- Alter table ambulances
ALTER TABLE ambulances ADD COLUMN hospital_id UUID;
ALTER TABLE ambulances ADD COLUMN equipment_checklist TEXT;
ALTER TABLE ambulances ADD COLUMN crew_members TEXT;

-- Alter table users
ALTER TABLE users ADD COLUMN specialty VARCHAR(255);
ALTER TABLE users ADD COLUMN is_on_duty BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN doctor_status VARCHAR(255) DEFAULT 'AVAILABLE';
