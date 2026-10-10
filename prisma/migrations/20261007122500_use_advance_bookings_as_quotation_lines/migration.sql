DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "distribution_quotation_lines" ql
        JOIN "advance_booking_size_lines" bsl
          ON bsl."organization_id" = ql."organization_id"
         AND bsl."id" = ql."source_booking_size_id"
        GROUP BY ql."organization_id", bsl."booking_id"
        HAVING COUNT(DISTINCT ql."quotation_id") > 1
    ) THEN
        RAISE EXCEPTION 'A source advance booking is linked to multiple quotations; resolve those links before migrating quotation lines.';
    END IF;
END $$;

ALTER TABLE "distribution_quotation_lines"
ADD COLUMN "source_booking_id" TEXT;

UPDATE "distribution_quotation_lines" ql
SET "source_booking_id" = bsl."booking_id"
FROM "advance_booking_size_lines" bsl
WHERE bsl."organization_id" = ql."organization_id"
  AND bsl."id" = ql."source_booking_size_id";

WITH booking_lines AS (
    SELECT
        ql."organization_id",
        ql."quotation_id",
        ql."source_booking_id",
        MIN(ql."id") AS "keep_id",
        MIN(ql."booking_no") AS "booking_no",
        MIN(ql."order_no") AS "order_no",
        MIN(ql."item_description") AS "item_description",
        MIN(ql."brand") AS "brand",
        MIN(ql."style_name") AS "style_name",
        SUM(ql."quantity")::INTEGER AS "quantity",
        CASE
            WHEN SUM(ql."quantity") = 0 THEN 0
            ELSE ROUND(SUM(ql."unit_price" * ql."quantity") / SUM(ql."quantity"), 4)
        END AS "unit_price",
        SUM(ql."line_total") AS "line_total",
        MIN(ql."created_at") AS "created_at"
    FROM "distribution_quotation_lines" ql
    GROUP BY ql."organization_id", ql."quotation_id", ql."source_booking_id"
)
UPDATE "distribution_quotation_lines" ql
SET
    "booking_no" = booking_lines."booking_no",
    "order_no" = booking_lines."order_no",
    "item_description" = booking_lines."item_description",
    "brand" = booking_lines."brand",
    "style_name" = booking_lines."style_name",
    "quantity" = booking_lines."quantity",
    "unit_price" = booking_lines."unit_price",
    "line_total" = booking_lines."line_total",
    "created_at" = booking_lines."created_at"
FROM booking_lines
WHERE ql."organization_id" = booking_lines."organization_id"
  AND ql."quotation_id" = booking_lines."quotation_id"
  AND ql."source_booking_id" = booking_lines."source_booking_id"
  AND ql."id" = booking_lines."keep_id";

WITH booking_lines AS (
    SELECT
        ql."organization_id",
        ql."quotation_id",
        ql."source_booking_id",
        MIN(ql."id") AS "keep_id"
    FROM "distribution_quotation_lines" ql
    GROUP BY ql."organization_id", ql."quotation_id", ql."source_booking_id"
)
DELETE FROM "distribution_quotation_lines" ql
USING booking_lines
WHERE ql."organization_id" = booking_lines."organization_id"
  AND ql."quotation_id" = booking_lines."quotation_id"
  AND ql."source_booking_id" = booking_lines."source_booking_id"
  AND ql."id" <> booking_lines."keep_id";

ALTER TABLE "distribution_quotation_lines"
ALTER COLUMN "source_booking_id" SET NOT NULL;

ALTER TABLE "distribution_quotation_lines"
DROP CONSTRAINT "distribution_quotation_lines_source_booking_size_fkey";
DROP INDEX "distribution_quotation_lines_organization_id_source_booking_size_id_key";
ALTER TABLE "distribution_quotation_lines"
DROP COLUMN "source_booking_size_id",
DROP COLUMN "size";

CREATE UNIQUE INDEX "distribution_quotation_lines_organization_id_source_booking_id_key"
ON "distribution_quotation_lines"("organization_id", "source_booking_id");

ALTER TABLE "distribution_quotation_lines"
ADD CONSTRAINT "distribution_quotation_lines_source_booking_fkey"
FOREIGN KEY ("organization_id", "source_booking_id")
REFERENCES "advance_bookings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
