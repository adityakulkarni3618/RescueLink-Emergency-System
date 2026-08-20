-- 004_add_prescriptions.sql
CREATE TABLE IF NOT EXISTS "prescriptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "incident_id" VARCHAR(255) NOT NULL,
  "patient_id" UUID,
  "doctor_id" UUID,
  "hospital_id" UUID,
  "medications" TEXT DEFAULT '[]',
  "diagnosis" VARCHAR(255),
  "notes" TEXT,
  "follow_up_date" VARCHAR(255),
  "discharge_time" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
