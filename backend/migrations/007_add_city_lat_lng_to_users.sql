-- 007_add_city_lat_lng_to_users.sql
-- Adds missing city, lat, lng columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Adds missing email, password, totp_secret columns to hospitals table
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS password VARCHAR(255);
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(255);
