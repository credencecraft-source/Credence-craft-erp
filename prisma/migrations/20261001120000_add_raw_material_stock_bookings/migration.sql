ALTER TABLE "master_vendors"
  ADD COLUMN "is_current_store" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "master_vendors_organization_id_id_key"
  ON "master_vendors"("organization_id", "id");
CREATE UNIQUE INDEX "master_vendors_one_current_store_per_organization_key"
  ON "master_vendors"("organization_id") WHERE "is_current_store" = true;

DROP INDEX IF EXISTS "grouped_purchase_order_lines_source_bom_item_id_key";
CREATE UNIQUE INDEX "grouped_purchase_order_lines_grouped_purchase_order_id_source_bom_item_id_key"
  ON "grouped_purchase_order_lines"("grouped_purchase_order_id", "source_bom_item_id");

CREATE UNIQUE INDEX "raw_material_stocks_organization_id_id_key"
  ON "raw_material_stocks"("organization_id", "id");

CREATE TABLE "raw_material_stock_bookings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "take_from_stock_id" TEXT NOT NULL,
  "current_store_vendor_id" TEXT NOT NULL,
  "source_bom_item_id" TEXT NOT NULL,
  "booked_quantity" DECIMAL(14,2) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'BOOKED',
  "booked_by" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "raw_material_stock_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "raw_material_stock_bookings_organization_id_created_at_idx"
  ON "raw_material_stock_bookings"("organization_id", "created_at");
CREATE INDEX "raw_material_stock_bookings_organization_id_take_from_stock_id_idx"
  ON "raw_material_stock_bookings"("organization_id", "take_from_stock_id");
CREATE INDEX "raw_material_stock_bookings_source_bom_item_id_idx"
  ON "raw_material_stock_bookings"("source_bom_item_id");

ALTER TABLE "raw_material_stock_bookings"
  ADD CONSTRAINT "raw_material_stock_bookings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "raw_material_stock_bookings"
  ADD CONSTRAINT "raw_material_stock_bookings_organization_id_take_from_stock_id_fkey"
  FOREIGN KEY ("organization_id", "take_from_stock_id") REFERENCES "raw_material_stocks"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_material_stock_bookings"
  ADD CONSTRAINT "raw_material_stock_bookings_organization_id_current_store_vendor_id_fkey"
  FOREIGN KEY ("organization_id", "current_store_vendor_id") REFERENCES "master_vendors"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_material_stock_bookings"
  ADD CONSTRAINT "raw_material_stock_bookings_source_bom_item_id_fkey"
  FOREIGN KEY ("source_bom_item_id") REFERENCES "bill_of_material_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;