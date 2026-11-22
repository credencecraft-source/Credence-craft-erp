-- Stage 1: additive schema and organization backfill support.
CREATE TYPE "StockMovementClass" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOODS', 'FG_SKU');
CREATE TYPE "StockMovementType" AS ENUM (
  'GRN_RECEIPT', 'RESERVATION', 'RESERVATION_RELEASE', 'ISSUE_OUTWARD',
  'POS_SALE', 'POS_RETURN', 'WO_FG_GRN', 'ADJUSTMENT', 'REVERSAL'
);

CREATE TABLE "stock_movements" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "stock_class" "StockMovementClass" NOT NULL,
  "stock_record_id" TEXT NOT NULL,
  "item_id" TEXT,
  "variant_id" TEXT,
  "sku_id" TEXT,
  "storage_node_id" TEXT,
  "movement_type" "StockMovementType" NOT NULL,
  "quantity_delta" DECIMAL(14,4) NOT NULL,
  "before_qty" DECIMAL(14,4) NOT NULL,
  "after_qty" DECIMAL(14,4) NOT NULL,
  "uom" VARCHAR(50) NOT NULL,
  "source_doc_type" VARCHAR(100) NOT NULL,
  "source_doc_id" TEXT NOT NULL,
  "source_line_id" TEXT,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "reason" VARCHAR(1000),
  "actor_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_movements_organization_id_idempotency_key_key"
  ON "stock_movements"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "stock_movements_organization_id_id_key"
  ON "stock_movements"("organization_id", "id");
CREATE INDEX "stock_movements_organization_id_stock_class_stock_record_id_created_at_idx"
  ON "stock_movements"("organization_id", "stock_class", "stock_record_id", "created_at");
CREATE INDEX "stock_movements_organization_id_source_doc_type_source_doc_id_idx"
  ON "stock_movements"("organization_id", "source_doc_type", "source_doc_id");
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "actor_id" TEXT,
  ADD COLUMN IF NOT EXISTS "source_context" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "request_id" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "before_data" JSONB,
  ADD COLUMN IF NOT EXISTS "after_data" JSONB,
  ADD COLUMN IF NOT EXISTS "changed_fields" JSONB;

ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "grouped_purchase_order_lines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "factory_work_order_size_lines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "factory_work_order_bom_lines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "inventory_receipt_lines" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

UPDATE "purchase_order_lines" l
SET "organization_id" = po."organization_id"
FROM "purchase_orders" po
WHERE l."purchase_order_id" = po."id" AND l."organization_id" IS NULL;
UPDATE "grouped_purchase_order_lines" l
SET "organization_id" = po."organization_id"
FROM "grouped_purchase_orders" po
WHERE l."grouped_purchase_order_id" = po."id" AND l."organization_id" IS NULL;
UPDATE "factory_work_order_size_lines" l
SET "organization_id" = wo."organization_id"
FROM "factory_work_orders" wo
WHERE l."work_order_id" = wo."id" AND l."organization_id" IS NULL;
UPDATE "factory_work_order_bom_lines" l
SET "organization_id" = wo."organization_id"
FROM "factory_work_orders" wo
WHERE l."work_order_id" = wo."id" AND l."organization_id" IS NULL;
UPDATE "inventory_receipt_lines" l
SET "organization_id" = r."organization_id"
FROM "inventory_receipts" r
WHERE l."receipt_id" = r."id" AND l."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "purchase_order_lines_organization_id_idx"
  ON "purchase_order_lines"("organization_id");
CREATE INDEX IF NOT EXISTS "grouped_purchase_order_lines_organization_id_idx"
  ON "grouped_purchase_order_lines"("organization_id");
CREATE INDEX IF NOT EXISTS "factory_work_order_size_lines_organization_id_idx"
  ON "factory_work_order_size_lines"("organization_id");
CREATE INDEX IF NOT EXISTS "factory_work_order_bom_lines_organization_id_idx"
  ON "factory_work_order_bom_lines"("organization_id");
CREATE INDEX IF NOT EXISTS "inventory_receipt_lines_organization_id_idx"
  ON "inventory_receipt_lines"("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_lines_organization_id_id_key"
  ON "purchase_order_lines"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "grouped_purchase_order_lines_organization_id_id_key"
  ON "grouped_purchase_order_lines"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "factory_work_order_size_lines_organization_id_id_key"
  ON "factory_work_order_size_lines"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "factory_work_order_bom_lines_organization_id_id_key"
  ON "factory_work_order_bom_lines"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_receipt_lines_organization_id_id_key"
  ON "inventory_receipt_lines"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_receipts_organization_id_id_key"
  ON "inventory_receipts"("organization_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "finished_goods_stocks_organization_id_id_key"
  ON "finished_goods_stocks"("organization_id", "id");
