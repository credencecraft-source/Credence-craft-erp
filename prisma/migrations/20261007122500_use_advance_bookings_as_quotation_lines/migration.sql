ALTER TABLE "distribution_quotation_lines"
  ADD COLUMN IF NOT EXISTS "source_booking_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_booking_size_id" TEXT,
  ADD COLUMN IF NOT EXISTS "size" VARCHAR(100);

ALTER TABLE "distribution_quotation_lines"
  ALTER COLUMN "source_booking_id" DROP NOT NULL,
  ALTER COLUMN "source_booking_size_id" DROP NOT NULL,
  ALTER COLUMN "size" DROP NOT NULL;

UPDATE "distribution_quotation_lines" AS quotation_line
SET "source_booking_id" = booking_size_line."booking_id"
FROM "advance_booking_size_lines" AS booking_size_line
WHERE booking_size_line."organization_id" = quotation_line."organization_id"
  AND booking_size_line."id" = quotation_line."source_booking_size_id"
  AND quotation_line."source_booking_id" IS NULL;

DROP INDEX IF EXISTS "distribution_quotation_lines_organization_id_source_booking_id_key";
DROP INDEX IF EXISTS "distribution_quotation_lines_organization_id_source_booking_size_id_key";

CREATE INDEX IF NOT EXISTS "distribution_quotation_lines_org_source_booking_idx"
ON "distribution_quotation_lines"("organization_id", "source_booking_id");

CREATE INDEX IF NOT EXISTS "distribution_quotation_lines_org_source_booking_size_idx"
ON "distribution_quotation_lines"("organization_id", "source_booking_size_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'distribution_quotation_lines_source_booking_fkey'
          AND conrelid = 'distribution_quotation_lines'::regclass
    ) THEN
        ALTER TABLE "distribution_quotation_lines"
        ADD CONSTRAINT "distribution_quotation_lines_source_booking_fkey"
        FOREIGN KEY ("organization_id", "source_booking_id")
        REFERENCES "advance_bookings"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'distribution_quotation_lines_source_booking_size_fkey'
          AND conrelid = 'distribution_quotation_lines'::regclass
    ) THEN
        ALTER TABLE "distribution_quotation_lines"
        ADD CONSTRAINT "distribution_quotation_lines_source_booking_size_fkey"
        FOREIGN KEY ("organization_id", "source_booking_size_id")
        REFERENCES "advance_booking_size_lines"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;
