CREATE TABLE "finished_goods_general_stock_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "grn_line_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "grn_no" VARCHAR(100) NOT NULL,
    "grn_date" DATE NOT NULL,
    "work_order_no" VARCHAR(100) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "article_no" VARCHAR(255),
    "style_name" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(255),
    "buyer" VARCHAR(255),
    "product_category" VARCHAR(255),
    "colour" VARCHAR(255),
    "size" VARCHAR(100) NOT NULL,
    "buyer_size" VARCHAR(100),
    "received_quantity" INTEGER NOT NULL,
    "actual_received_quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER NOT NULL,
    "rejected_quantity" INTEGER NOT NULL,
    "quantity_in" INTEGER NOT NULL,
    "quantity_out" INTEGER NOT NULL DEFAULT 0,
    "current_stock" INTEGER NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "verified_by" VARCHAR(255) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_general_stock_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finished_goods_general_stock_receipts_actual_check"
      CHECK ("actual_received_quantity" = "approved_quantity" + "rejected_quantity"),
    CONSTRAINT "finished_goods_general_stock_receipts_stock_check"
      CHECK ("quantity_in" >= 0 AND "quantity_out" >= 0 AND "quantity_out" <= "quantity_in" AND "current_stock" = "quantity_in" - "quantity_out")
);

CREATE UNIQUE INDEX "wo_grn_lines_grn_work_order_id_key"
  ON "work_order_inventory_grn_lines"("grn_id", "work_order_id", "id");

CREATE TABLE "finished_goods_allocated_stock_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "grn_line_id" TEXT NOT NULL,
    "grn_allocation_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "booking_size_line_id" TEXT NOT NULL,
    "booking_assignment_id" TEXT NOT NULL,
    "grn_no" VARCHAR(100) NOT NULL,
    "grn_date" DATE NOT NULL,
    "work_order_no" VARCHAR(100) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "booking_no" VARCHAR(100) NOT NULL,
    "article_no" VARCHAR(255),
    "style_name" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(255),
    "buyer" VARCHAR(255),
    "product_category" VARCHAR(255),
    "colour" VARCHAR(255),
    "size" VARCHAR(100) NOT NULL,
    "buyer_size" VARCHAR(100),
    "received_quantity" INTEGER NOT NULL,
    "actual_received_quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER NOT NULL,
    "rejected_quantity" INTEGER NOT NULL,
    "quantity_in" INTEGER NOT NULL,
    "quantity_out" INTEGER NOT NULL DEFAULT 0,
    "current_stock" INTEGER NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "verified_by" VARCHAR(255) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_allocated_stock_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finished_goods_allocated_stock_receipts_actual_check"
      CHECK ("actual_received_quantity" = "approved_quantity" + "rejected_quantity"),
    CONSTRAINT "finished_goods_allocated_stock_receipts_stock_check"
      CHECK ("quantity_in" >= 0 AND "quantity_out" >= 0 AND "quantity_out" <= "quantity_in" AND "current_stock" = "quantity_in" - "quantity_out")
);

CREATE UNIQUE INDEX "fg_general_receipt_grn_line_key"
  ON "finished_goods_general_stock_receipts"("grn_line_id");
CREATE UNIQUE INDEX "fg_general_stock_grn_line_scope_key"
  ON "finished_goods_general_stock_receipts"("grn_id", "work_order_id", "grn_line_id");
CREATE UNIQUE INDEX "fg_general_receipt_org_id_key"
  ON "finished_goods_general_stock_receipts"("organization_id", "id");
CREATE INDEX "fg_general_receipt_location_posted_idx"
  ON "finished_goods_general_stock_receipts"("organization_id", "location_id", "posted_at");
CREATE INDEX "fg_general_receipt_order_size_idx"
  ON "finished_goods_general_stock_receipts"("organization_id", "order_no", "size");

CREATE UNIQUE INDEX "fg_allocated_receipt_allocation_key"
  ON "finished_goods_allocated_stock_receipts"("grn_allocation_id");
CREATE UNIQUE INDEX "fg_allocated_receipt_org_id_key"
  ON "finished_goods_allocated_stock_receipts"("organization_id", "id");
CREATE UNIQUE INDEX "fg_allocated_receipt_line_assignment_key"
  ON "finished_goods_allocated_stock_receipts"("organization_id", "grn_line_id", "booking_assignment_id");
CREATE INDEX "fg_alloc_receipt_location_posted_idx"
  ON "finished_goods_allocated_stock_receipts"("organization_id", "location_id", "posted_at");
CREATE INDEX "fg_alloc_receipt_booking_size_idx"
  ON "finished_goods_allocated_stock_receipts"("organization_id", "booking_id", "size");
CREATE INDEX "fg_alloc_receipt_order_size_idx"
  ON "finished_goods_allocated_stock_receipts"("organization_id", "order_no", "size");

ALTER TABLE "finished_goods_general_stock_receipts"
  ADD CONSTRAINT "finished_goods_general_stock_receipts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_general_stock_receipts_location_fkey"
  FOREIGN KEY ("organization_id", "entity_id", "location_id") REFERENCES "master_locations"("organization_id", "entity_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_general_stock_receipts_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_general_stock_receipts_order_fkey"
  FOREIGN KEY ("organization_id", "order_id") REFERENCES "merchandising_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_general_stock_receipts_grn_line_fkey"
  FOREIGN KEY ("grn_id", "work_order_id", "grn_line_id") REFERENCES "work_order_inventory_grn_lines"("grn_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_goods_allocated_stock_receipts"
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_location_fkey"
  FOREIGN KEY ("organization_id", "entity_id", "location_id") REFERENCES "master_locations"("organization_id", "entity_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_order_fkey"
  FOREIGN KEY ("organization_id", "order_id") REFERENCES "merchandising_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_booking_fkey"
  FOREIGN KEY ("organization_id", "booking_id") REFERENCES "advance_bookings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_booking_size_line_fkey"
  FOREIGN KEY ("organization_id", "booking_size_line_id") REFERENCES "advance_booking_size_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_booking_assignment_fkey"
  FOREIGN KEY ("organization_id", "booking_assignment_id") REFERENCES "advance_booking_work_order_assignments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_grn_line_fkey"
  FOREIGN KEY ("grn_id", "work_order_id", "grn_line_id") REFERENCES "work_order_inventory_grn_lines"("grn_id", "work_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "finished_goods_allocated_stock_receipts_grn_allocation_fkey"
  FOREIGN KEY ("grn_allocation_id") REFERENCES "work_order_inventory_grn_booking_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
