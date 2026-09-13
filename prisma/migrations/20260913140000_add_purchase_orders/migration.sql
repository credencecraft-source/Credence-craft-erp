CREATE TABLE "purchase_orders" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "purchase_order_no" VARCHAR(100) NOT NULL,
  "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  "created_by" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "purchase_order_sources" (
  "id" TEXT NOT NULL,
  "purchase_order_id" TEXT NOT NULL,
  "master_purchase_order_id" TEXT NOT NULL,
  CONSTRAINT "purchase_order_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "purchase_order_lines" (
  "id" TEXT NOT NULL,
  "purchase_order_id" TEXT NOT NULL,
  "source_master_line_id" TEXT NOT NULL,
  "raw_material" VARCHAR(255),
  "category" VARCHAR(255),
  "sub_category" VARCHAR(255),
  "source_order_no" VARCHAR(100),
  "style_name" VARCHAR(255),
  "quantity" DECIMAL(12,2) NOT NULL,
  "price" DECIMAL(12,4),
  "gst" DECIMAL(10,2),
  "hsn_code" VARCHAR(100),
  "total" DECIMAL(12,4),
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchase_orders_organization_id_purchase_order_no_key" ON "purchase_orders"("organization_id", "purchase_order_no");
CREATE INDEX "purchase_orders_organization_id_status_created_at_idx" ON "purchase_orders"("organization_id", "status", "created_at");
CREATE INDEX "purchase_orders_organization_id_vendor_id_idx" ON "purchase_orders"("organization_id", "vendor_id");
CREATE UNIQUE INDEX "purchase_order_sources_purchase_order_id_key" ON "purchase_order_sources"("purchase_order_id");
CREATE UNIQUE INDEX "purchase_order_sources_master_purchase_order_id_key" ON "purchase_order_sources"("master_purchase_order_id");
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_source_master_line_id_key" ON "purchase_order_lines"("purchase_order_id", "source_master_line_id");
CREATE INDEX "purchase_order_lines_purchase_order_id_idx" ON "purchase_order_lines"("purchase_order_id");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "master_vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_sources" ADD CONSTRAINT "purchase_order_sources_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_sources" ADD CONSTRAINT "purchase_order_sources_master_purchase_order_id_fkey" FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;