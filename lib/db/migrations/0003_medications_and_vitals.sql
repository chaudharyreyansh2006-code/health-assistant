-- Migration 0003: medications, vitals, and per-type alert thresholds.
-- Tables back the new "Today" screen and structured queries the chat
-- can run. All four tables cascade on FamilyMember delete, and
-- MedicationLog cascades on Medication delete so a deleted prescription
-- leaves no orphan dose events.

CREATE TABLE IF NOT EXISTS "Medication" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId" uuid NOT NULL REFERENCES "FamilyMember"("id") ON DELETE CASCADE,
  "drugName" text NOT NULL,
  "brandName" text,
  "doseValue" numeric(10, 3) NOT NULL,
  "doseUnit" varchar(32) NOT NULL,
  "frequency" varchar(32) NOT NULL,
  "scheduleTimes" jsonb NOT NULL,
  "withFood" varchar(16) NOT NULL DEFAULT 'any',
  "startDate" date NOT NULL DEFAULT CURRENT_DATE,
  "endDate" date,
  "prescribedBy" text,
  "notes" text,
  "remainingQty" numeric(10, 2),
  "refillAt" date,
  "pharmacy" text,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "createdBy" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Medication_memberId_idx" ON "Medication" ("memberId");

CREATE TABLE IF NOT EXISTS "MedicationLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "medicationId" uuid NOT NULL REFERENCES "Medication"("id") ON DELETE CASCADE,
  "memberId" uuid NOT NULL REFERENCES "FamilyMember"("id") ON DELETE CASCADE,
  "scheduledFor" timestamp NOT NULL,
  "takenAt" timestamp,
  "status" varchar(16) NOT NULL,
  "skipReason" varchar(64),
  "notes" text,
  "source" varchar(32) NOT NULL DEFAULT 'manual',
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "MedicationLog_medicationId_idx" ON "MedicationLog" ("medicationId");
CREATE INDEX IF NOT EXISTS "MedicationLog_memberId_scheduledFor_idx" ON "MedicationLog" ("memberId", "scheduledFor");
CREATE UNIQUE INDEX IF NOT EXISTS "MedicationLog_medicationId_scheduledFor_unique" ON "MedicationLog" ("medicationId", "scheduledFor");

CREATE TABLE IF NOT EXISTS "Vital" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId" uuid NOT NULL REFERENCES "FamilyMember"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "recordedAt" timestamp NOT NULL,
  "value" numeric(12, 3),
  "unit" varchar(16),
  "systolic" numeric(6, 2),
  "diastolic" numeric(6, 2),
  "pulse" numeric(6, 2),
  "context" varchar(32),
  "source" varchar(32) NOT NULL DEFAULT 'manual',
  "notes" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Vital_memberId_type_recordedAt_idx" ON "Vital" ("memberId", "type", "recordedAt");

CREATE TABLE IF NOT EXISTS "VitalThreshold" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "memberId" uuid NOT NULL REFERENCES "FamilyMember"("id") ON DELETE CASCADE,
  "type" varchar(32) NOT NULL,
  "warnMin" numeric(10, 2),
  "warnMax" numeric(10, 2),
  "criticalMin" numeric(10, 2),
  "criticalMax" numeric(10, 2),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "VitalThreshold_memberId_type_unique" ON "VitalThreshold" ("memberId", "type");
