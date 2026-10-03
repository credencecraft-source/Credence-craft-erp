ALTER TABLE "organizations"
  ADD COLUMN "archived_at" TIMESTAMP(3);

UPDATE "organizations"
SET "archived_at" = "updated_at"
WHERE "approval_status" = 'ARCHIVED';