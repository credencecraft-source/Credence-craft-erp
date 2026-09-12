ALTER TABLE "organizations"
ADD COLUMN "approval_status" VARCHAR(40) NOT NULL DEFAULT 'APPROVED';

UPDATE "organizations"
SET "approval_status" = CASE WHEN "is_active" THEN 'APPROVED' ELSE 'REJECTED' END;