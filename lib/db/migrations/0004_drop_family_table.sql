-- 0004_drop_family_table.sql
--
-- Kills the `Family` indirection. After this migration:
--   * The user has exactly one family, identified by `User.id` (the family
--     container is implicit in the user row). `User.familyName` is the only
--     place the family name lives.
--   * Every PHI table carries a denormalized `userId` so ownership checks
--     are a single column compare — no joins, no subqueries, no `IN (SELECT
--     ... JOIN Family ...)`.
--   * `Family` table and `FamilyMember.familyId` are gone.
--
-- Order of operations inside the transaction is critical: add nullable
-- columns → backfill from `Family.createdBy` → set NOT NULL → drop indirection.
-- If you run these in the wrong order you either lose data or break the
-- NOT NULL constraint on rows that don't yet have a `userId`.

-- (Drizzle wraps this file in a transaction automatically — do NOT add
-- an explicit BEGIN; / COMMIT; here, that would defeat atomicity.)

-- 1. Add new columns (nullable, FK to User)
ALTER TABLE "User"            ADD COLUMN IF NOT EXISTS "familyName" text;
ALTER TABLE "FamilyMember"    ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "Medication"      ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "MedicationLog"   ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "Vital"           ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "VitalThreshold"  ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "MedicalDocument" ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentChunk"   ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;
ALTER TABLE "HealthMemory"    ADD COLUMN IF NOT EXISTS "userId" uuid REFERENCES "User"(id) ON DELETE CASCADE;

-- 2a. Backfill `User.familyName` from the user's first `Family` row.
--     A user with multiple families (rare) takes the most recently created.
--     Users with no family at all get a default.
UPDATE "User" u
SET "familyName" = sub.name
FROM (
  SELECT DISTINCT ON ("createdBy") "createdBy", name
  FROM "Family"
  WHERE "createdBy" IS NOT NULL
  ORDER BY "createdBy", "createdAt" DESC
) sub
WHERE u.id = sub."createdBy";

UPDATE "User"
SET "familyName" = 'My Family'
WHERE "familyName" IS NULL;

-- 2b. Backfill `FamilyMember.userId` from `Family.createdBy`.
--     All existing `FamilyMember` rows have a `familyId` (NOT NULL FK), so
--     this update covers every row.
UPDATE "FamilyMember" fm
SET "userId" = f."createdBy"
FROM "Family" f
WHERE fm."familyId" = f.id
  AND f."createdBy" IS NOT NULL
  AND fm."userId" IS NULL;

-- 2c. Backfill the PHI tables from `FamilyMember.userId`. Same shape for
--     every table — we set `userId` by joining through the member row.
UPDATE "Medication"      m  SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE m."memberId"  = fm.id AND m."userId"  IS NULL;
UPDATE "MedicationLog"   ml SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE ml."memberId" = fm.id AND ml."userId" IS NULL;
UPDATE "Vital"           v  SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE v."memberId"  = fm.id AND v."userId"  IS NULL;
UPDATE "VitalThreshold"  vt SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE vt."memberId" = fm.id AND vt."userId" IS NULL;
UPDATE "MedicalDocument" md SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE md."memberId" = fm.id AND md."userId" IS NULL;
UPDATE "HealthMemory"    hm SET "userId" = fm."userId" FROM "FamilyMember" fm WHERE hm."memberId" = fm.id AND hm."userId" IS NULL;

-- 2d. Backfill `DocumentChunk.userId` via its document's `userId` (set in 2c).
UPDATE "DocumentChunk" dc
SET "userId" = md."userId"
FROM "MedicalDocument" md
WHERE dc."documentId" = md.id
  AND dc."userId" IS NULL;

-- 3. Enforce NOT NULL now that backfill is complete. A user that somehow
--    skipped step 2a (e.g. corrupt data) gets 'My Family' first.
UPDATE "User" SET "familyName" = 'My Family' WHERE "familyName" IS NULL;
ALTER TABLE "User"            ALTER COLUMN "familyName" SET DEFAULT 'My Family';
ALTER TABLE "User"            ALTER COLUMN "familyName" SET NOT NULL;

ALTER TABLE "FamilyMember"    ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Medication"      ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "MedicationLog"   ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Vital"           ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "VitalThreshold"  ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "MedicalDocument" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "DocumentChunk"   ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "HealthMemory"    ALTER COLUMN "userId" SET NOT NULL;

-- 4. Indexes — the `userId` column is the new primary access path for
--    every PHI table. Indexing it makes ownership lookups O(log n).
CREATE INDEX IF NOT EXISTS "FamilyMember_userId_idx"    ON "FamilyMember"("userId");
CREATE INDEX IF NOT EXISTS "Medication_userId_idx"      ON "Medication"("userId");
CREATE INDEX IF NOT EXISTS "MedicationLog_userId_idx"   ON "MedicationLog"("userId");
CREATE INDEX IF NOT EXISTS "Vital_userId_idx"           ON "Vital"("userId");
CREATE INDEX IF NOT EXISTS "VitalThreshold_userId_idx"  ON "VitalThreshold"("userId");
CREATE INDEX IF NOT EXISTS "MedicalDocument_userId_idx" ON "MedicalDocument"("userId");
CREATE INDEX IF NOT EXISTS "DocumentChunk_userId_idx"   ON "DocumentChunk"("userId");
CREATE INDEX IF NOT EXISTS "HealthMemory_userId_idx"    ON "HealthMemory"("userId");

-- 5. Drop the indirection.
--    `FamilyMember.familyId` first, then `Family`. Order matters: dropping
--    `Family` first would cascade-delete every `FamilyMember` row through
--    the existing FK.
ALTER TABLE "FamilyMember" DROP COLUMN IF EXISTS "familyId";
DROP TABLE IF EXISTS "Family";

