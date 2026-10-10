ALTER TABLE "pos_purchase_records"
ADD COLUMN "record_number" VARCHAR(30);

ALTER TABLE "pos_purchase_bills"
ADD COLUMN "document_number" VARCHAR(30);

WITH numbered_records AS (
    SELECT
        "id",
        CONCAT('GPR-', LPAD(ROW_NUMBER() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id")::TEXT, 4, '0')) AS "number"
    FROM "pos_purchase_records"
)
UPDATE "pos_purchase_records" AS records
SET "record_number" = numbered_records."number"
FROM numbered_records
WHERE records."id" = numbered_records."id";

WITH numbered_bills AS (
    SELECT
        "id",
        CONCAT('PB-', LPAD(ROW_NUMBER() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id")::TEXT, 4, '0')) AS "number"
    FROM "pos_purchase_bills"
)
UPDATE "pos_purchase_bills" AS bills
SET "document_number" = numbered_bills."number"
FROM numbered_bills
WHERE bills."id" = numbered_bills."id";

ALTER TABLE "pos_purchase_records"
ALTER COLUMN "record_number" SET NOT NULL;

ALTER TABLE "pos_purchase_bills"
ALTER COLUMN "document_number" SET NOT NULL;

CREATE UNIQUE INDEX "pos_purchase_records_organization_id_record_number_key"
ON "pos_purchase_records"("organization_id", "record_number");

CREATE UNIQUE INDEX "pos_purchase_bills_organization_id_document_number_key"
ON "pos_purchase_bills"("organization_id", "document_number");

INSERT INTO "procurement_document_counters" ("id", "organization_id", "document_type", "current_value", "updated_at")
SELECT
    md5('pos-purchase-record-counter:' || organizations."id"),
    organizations."id",
    'PURCHASE_RECORD_GROUP',
    COALESCE(MAX(SUBSTRING(records."record_number" FROM '[0-9]+$')::INTEGER), 0),
    CURRENT_TIMESTAMP
FROM "organizations" AS organizations
LEFT JOIN "pos_purchase_records" AS records
    ON records."organization_id" = organizations."id"
GROUP BY organizations."id"
ON CONFLICT ("organization_id", "document_type") DO UPDATE
SET "current_value" = GREATEST(
    "procurement_document_counters"."current_value",
    EXCLUDED."current_value"
),
"updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "procurement_document_counters" ("id", "organization_id", "document_type", "current_value", "updated_at")
SELECT
    md5('pos-purchase-bill-counter:' || organizations."id"),
    organizations."id",
    'PURCHASE_BILL',
    COALESCE(MAX(SUBSTRING(bills."document_number" FROM '[0-9]+$')::INTEGER), 0),
    CURRENT_TIMESTAMP
FROM "organizations" AS organizations
LEFT JOIN "pos_purchase_bills" AS bills
    ON bills."organization_id" = organizations."id"
GROUP BY organizations."id"
ON CONFLICT ("organization_id", "document_type") DO UPDATE
SET "current_value" = GREATEST(
    "procurement_document_counters"."current_value",
    EXCLUDED."current_value"
),
"updated_at" = CURRENT_TIMESTAMP;
