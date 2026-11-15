DROP INDEX "raw_material_stocks_organization_id_raw_material_location_id_key";

ALTER TABLE "raw_material_stocks"
  ADD COLUMN "source_type" VARCHAR(20) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "inventory_receipt_line_id" TEXT,
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "raw_material_stocks_inventory_receipt_line_id_key"
  ON "raw_material_stocks"("inventory_receipt_line_id");

CREATE INDEX "raw_material_stocks_organization_id_raw_material_location_id_created_at_idx"
  ON "raw_material_stocks"("organization_id", "raw_material", "location_id", "created_at");

ALTER TABLE "raw_material_stocks"
  ADD CONSTRAINT "raw_material_stocks_inventory_receipt_line_id_fkey"
  FOREIGN KEY ("inventory_receipt_line_id")
  REFERENCES "inventory_receipt_lines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;