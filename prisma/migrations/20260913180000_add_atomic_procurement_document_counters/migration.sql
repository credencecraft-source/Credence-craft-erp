CREATE TABLE "procurement_document_counters" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "document_type" VARCHAR(30) NOT NULL,
  "current_value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_document_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "procurement_document_counters_organization_id_document_type_key"
  ON "procurement_document_counters"("organization_id", "document_type");

ALTER TABLE "procurement_document_counters"
  ADD CONSTRAINT "procurement_document_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "procurement_document_counters" ("id", "organization_id", "document_type", "current_value", "updated_at")
SELECT gen_random_uuid()::text, organization_id, 'GROUPED_PO', COALESCE(MAX(display_no), 0), CURRENT_TIMESTAMP
FROM "grouped_purchase_orders"
GROUP BY organization_id;

INSERT INTO "procurement_document_counters" ("id", "organization_id", "document_type", "current_value", "updated_at")
SELECT gen_random_uuid()::text, organization_id, 'MASTER_GROUP', COALESCE(MAX(display_no), 0), CURRENT_TIMESTAMP
FROM "master_purchase_orders"
GROUP BY organization_id;

INSERT INTO "procurement_document_counters" ("id", "organization_id", "document_type", "current_value", "updated_at")
SELECT gen_random_uuid()::text, organization_id, 'PURCHASE_ORDER', COALESCE(MAX(display_no), 0), CURRENT_TIMESTAMP
FROM "purchase_orders"
GROUP BY organization_id;