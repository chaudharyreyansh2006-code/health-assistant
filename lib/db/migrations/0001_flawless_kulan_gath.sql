CREATE EXTENSION IF NOT EXISTS vector;

-- Alter Chat table to add memberId and runningSummary
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "memberId" uuid;
ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "runningSummary" text DEFAULT '';

-- Create Family table
CREATE TABLE IF NOT EXISTS "Family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

-- Create FamilyMember table
CREATE TABLE IF NOT EXISTS "FamilyMember" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familyId" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"dateOfBirth" date,
	"gender" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

-- Create HealthMemory table
CREATE TABLE IF NOT EXISTS "HealthMemory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memberId" uuid NOT NULL,
	"category" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"source" varchar(32) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "HealthMemory_memberId_category_unique" UNIQUE("memberId","category")
);

-- Create MedicalDocument table
CREATE TABLE IF NOT EXISTS "MedicalDocument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memberId" uuid NOT NULL,
	"fileName" text NOT NULL,
	"url" text NOT NULL,
	"fileType" text NOT NULL,
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);

-- Create DocumentChunk table
CREATE TABLE IF NOT EXISTS "DocumentChunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768)
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "Chat" ADD CONSTRAINT "Chat_memberId_FamilyMember_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."FamilyMember"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Family" ADD CONSTRAINT "Family_createdBy_User_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_Family_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."Family"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "HealthMemory" ADD CONSTRAINT "HealthMemory_memberId_FamilyMember_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."FamilyMember"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "MedicalDocument" ADD CONSTRAINT "MedicalDocument_memberId_FamilyMember_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."FamilyMember"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_MedicalDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."MedicalDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
