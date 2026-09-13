CREATE TABLE "inventory_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "receipt_no" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    "warehouse" VARCHAR(150) NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" VARCHAR(255),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "inventory_receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "purchase_order_line_id" TEXT NOT NULL,
    "raw_material" VARCHAR(255),
    "ordered_quantity" DECIMAL(12,2) NOT NULL,
    "received_quantity" DECIMAL(12,2) NOT NULL,
    "accepted_quantity" DECIMAL(12,2) NOT NULL,
    "rejected_quantity" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_receipt_lines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "raw_material_stocks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "raw_material" VARCHAR(255) NOT NULL,
    "warehouse" VARCHAR(150) NOT NULL,
    "quantity_on_hand" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity_issued" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "raw_material_stocks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "finished_goods_stocks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "style_name" VARCHAR(255) NOT NULL,
    "size" VARCHAR(100),
    "warehouse" VARCHAR(150) NOT NULL,
    "quantity_on_hand" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity_reserved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quantity_issued" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finished_goods_stocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_receipts_organization_id_receipt_no_key" ON "inventory_receipts"("organization_id", "receipt_no");
CREATE INDEX "inventory_receipts_organization_id_received_date_idx" ON "inventory_receipts"("organization_id", "received_date");
CREATE INDEX "inventory_receipts_purchase_order_id_idx" ON "inventory_receipts"("purchase_order_id");
CREATE UNIQUE INDEX "inventory_receipt_lines_receipt_id_purchase_order_line_id_key" ON "inventory_receipt_lines"("receipt_id", "purchase_order_line_id");
CREATE INDEX "inventory_receipt_lines_purchase_order_line_id_idx" ON "inventory_receipt_lines"("purchase_order_line_id");
CREATE UNIQUE INDEX "raw_material_stocks_organization_id_raw_material_warehouse_key" ON "raw_material_stocks"("organization_id", "raw_material", "warehouse");
CREATE INDEX "raw_material_stocks_organization_id_warehouse_idx" ON "raw_material_stocks"("organization_id", "warehouse");
CREATE UNIQUE INDEX "finished_goods_stocks_organization_id_style_name_size_warehouse_key" ON "finished_goods_stocks"("organization_id", "style_name", "size", "warehouse");
CREATE INDEX "finished_goods_stocks_organization_id_warehouse_idx" ON "finished_goods_stocks"("organization_id", "warehouse");
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_receipt_lines" ADD CONSTRAINT "inventory_receipt_lines_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_material_stocks" ADD CONSTRAINT "raw_material_stocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_stocks" ADD CONSTRAINT "finished_goods_stocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;