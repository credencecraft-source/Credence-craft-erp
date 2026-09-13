CREATE TABLE "master_purchase_orders" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "master_po_no" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'MASTER_GROUPED',
  "created_by" VARCHAR(255),
  "raw_material" VARCHAR(255),
  "category" VARCHAR(255),
  "sub_category" VARCHAR(255),
  "total_required_qty" DECIMAL(12,2),
  "total_grouped_qty" DECIMAL(12,2),
  "no_of_styles" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "master_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "master_purchase_order_sources" (
  "id" TEXT NOT NULL,
  "master_purchase_order_id" TEXT NOT NULL,
  "grouped_purchase_order_id" TEXT NOT NULL,
  CONSTRAINT "master_purchase_order_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "master_purchase_order_lines" (
  "id" TEXT NOT NULL,
  "master_purchase_order_id" TEXT NOT NULL,
  "source_grouped_line_id" TEXT NOT NULL,
  "source_grouped_po_no" VARCHAR(100),
  "source_order_id" TEXT NOT NULL,
  "source_order_no" VARCHAR(100),
  "style_name" VARCHAR(255),
  "brand" VARCHAR(255),
  "raw_material" VARCHAR(255),
  "category" VARCHAR(255),
  "sub_category" VARCHAR(255),
  "required_qty" DECIMAL(12,2) NOT NULL,
  "grouped_qty" DECIMAL(12,2) NOT NULL,
  "vendor_price" DECIMAL(12,4),
  "total_spend" DECIMAL(12,4),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "master_purchase_order_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "master_purchase_orders_organization_id_master_po_no_key" ON "master_purchase_orders"("organization_id", "master_po_no");
CREATE INDEX "master_purchase_orders_organization_id_status_created_at_idx" ON "master_purchase_orders"("organization_id", "status", "created_at");
CREATE UNIQUE INDEX "master_purchase_order_sources_grouped_purchase_order_id_key" ON "master_purchase_order_sources"("grouped_purchase_order_id");
CREATE UNIQUE INDEX "master_purchase_order_sources_master_purchase_order_id_grouped_purchase_order_id_key" ON "master_purchase_order_sources"("master_purchase_order_id", "grouped_purchase_order_id");
CREATE INDEX "master_purchase_order_sources_master_purchase_order_id_idx" ON "master_purchase_order_sources"("master_purchase_order_id");
CREATE UNIQUE INDEX "master_purchase_order_lines_source_grouped_line_id_key" ON "master_purchase_order_lines"("source_grouped_line_id");
CREATE INDEX "master_purchase_order_lines_master_purchase_order_id_idx" ON "master_purchase_order_lines"("master_purchase_order_id");
ALTER TABLE "master_purchase_orders" ADD CONSTRAINT "master_purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_purchase_orders" ADD CONSTRAINT "master_purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "master_purchase_order_sources" ADD CONSTRAINT "master_purchase_order_sources_master_purchase_order_id_fkey" FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_purchase_order_sources" ADD CONSTRAINT "master_purchase_order_sources_grouped_purchase_order_id_fkey" FOREIGN KEY ("grouped_purchase_order_id") REFERENCES "grouped_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "master_purchase_order_lines" ADD CONSTRAINT "master_purchase_order_lines_master_purchase_order_id_fkey" FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;