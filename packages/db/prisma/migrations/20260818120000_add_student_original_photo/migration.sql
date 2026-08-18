-- AlterTable
ALTER TABLE "Student" ADD COLUMN "originalPhotoUrl" TEXT;

-- Keep a backup for existing students (may already be an edited crop).
UPDATE "Student"
SET "originalPhotoUrl" = "photoUrl"
WHERE "photoUrl" IS NOT NULL
  AND "photoUrl" <> ''
  AND ("originalPhotoUrl" IS NULL OR "originalPhotoUrl" = '');
