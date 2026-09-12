CREATE TABLE "grouped_purchase_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "grouped_po_no" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_PRICE_APPROVAL',
    "submitted_by" VARCHAR(255),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" VARCHAR(255),
    "approved_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "grouped_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grouped_purchase_order_lines" (
    "id" TEXT NOT NULL,
    "grouped_purchase_order_id" TEXT NOT NULL,
    "source_bom_item_id" TEXT NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "order_no" VARCHAR(100),
    "style_name" VARCHAR(255),
    "brand" VARCHAR(255),
    "category" VARCHAR(255),
    "sub_category" VARCHAR(255),
    "item_name" VARCHAR(255),
    "internal_consumption" DECIMAL(12,4),
    "required_qty" DECIMAL(12,2) NOT NULL,
    "grouped_qty" DECIMAL(12,2) NOT NULL,
    "vendor_price" DECIMAL(12,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "grouped_purchase_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grouped_purchase_orders_organization_id_grouped_po_no_key"
  ON "grouped_purchase_orders"("organization_id", "grouped_po_no");
CREATE INDEX "grouped_purchase_orders_organization_id_status_created_at_idx"
  ON "grouped_purchase_orders"("organization_id", "status", "created_at");
CREATE INDEX "grouped_purchase_orders_organization_id_vendor_id_idx"
  ON "grouped_purchase_orders"("organization_id", "vendor_id");
CREATE UNIQUE INDEX "grouped_purchase_order_lines_source_bom_item_id_key"
  ON "grouped_purchase_order_lines"("source_bom_item_id");
CREATE INDEX "grouped_purchase_order_lines_grouped_purchase_order_id_idx"
  ON "grouped_purchase_order_lines"("grouped_purchase_order_id");
CREATE INDEX "grouped_purchase_order_lines_source_order_id_idx"
  ON "grouped_purchase_order_lines"("source_order_id");

ALTER TABLE "grouped_purchase_orders"
  ADD CONSTRAINT "grouped_purchase_orders_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grouped_purchase_orders"
  ADD CONSTRAINT "grouped_purchase_orders_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "master_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grouped_purchase_order_lines"
  ADD CONSTRAINT "grouped_purchase_order_lines_grouped_purchase_order_id_fkey"
  FOREIGN KEY ("grouped_purchase_order_id") REFERENCES "grouped_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grouped_purchase_order_lines"
  ADD CONSTRAINT "grouped_purchase_order_lines_source_bom_item_id_fkey"
  FOREIGN KEY ("source_bom_item_id") REFERENCES "bill_of_material_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "grouped_purchase_order_lines"
  ADD CONSTRAINT "grouped_purchase_order_lines_source_order_id_fkey"
  FOREIGN KEY ("source_order_id") REFERENCES "merchandising_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;