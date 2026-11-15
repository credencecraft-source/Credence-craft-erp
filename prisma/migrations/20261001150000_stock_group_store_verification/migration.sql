ALTER TABLE "rm_grn_verifications"
  ALTER COLUMN "inventory_receipt_line_id" DROP NOT NULL,
  ADD COLUMN "source_grouped_purchase_order_id" TEXT;

CREATE UNIQUE INDEX "rm_grn_verifications_organization_id_source_grouped_purchase_order_id_key"
  ON "rm_grn_verifications"("organization_id", "source_grouped_purchase_order_id");

ALTER TABLE "rm_grn_verifications"
  ADD CONSTRAINT "rm_grn_verifications_organization_id_source_grouped_purchase_order_id_fkey"
  FOREIGN KEY ("organization_id", "source_grouped_purchase_order_id")
  REFERENCES "grouped_purchase_orders"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "raw_material_stock_bookings"
  ADD COLUMN "fulfilled_quantity" DECIMAL(14, 2) NOT NULL DEFAULT 0;