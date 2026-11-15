CREATE TABLE "finished_goods_outward_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "request_no" VARCHAR(100) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "requested_by" VARCHAR(255),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_by" VARCHAR(255),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finished_goods_outward_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finished_goods_outward_request_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "source_booking_id" TEXT,
    "source_stock_type" VARCHAR(20) NOT NULL,
    "source_stock_id" VARCHAR(255) NOT NULL,
    "stock_bucket" VARCHAR(20) NOT NULL,
    "location_name" VARCHAR(255),
    "sku_code" VARCHAR(100),
    "style_name" VARCHAR(255) NOT NULL,
    "order_no" VARCHAR(255) NOT NULL,
    "article_no" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(255),
    "size" VARCHAR(100),
    "colour" VARCHAR(150),
    "requested_quantity" DECIMAL(14,2) NOT NULL,
    "picked_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shipped_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "picked_by" VARCHAR(255),
    "picked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finished_goods_outward_request_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finished_goods_outward_request_lines_quantity_check"
      CHECK ("requested_quantity" > 0 AND "picked_quantity" >= 0 AND "picked_quantity" <= "requested_quantity"
        AND "shipped_quantity" >= 0 AND "shipped_quantity" <= "picked_quantity")
);

CREATE TABLE "finished_goods_outward_boxes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "box_no" VARCHAR(100) NOT NULL,
    "packed_by" VARCHAR(255),
    "packed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_outward_boxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finished_goods_outward_box_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "request_line_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_outward_box_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finished_goods_outward_box_lines_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "finished_goods_outward_shipments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "packing_list_no" VARCHAR(100) NOT NULL,
    "shipped_by" VARCHAR(255),
    "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_outward_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finished_goods_outward_shipment_boxes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "box_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finished_goods_outward_shipment_boxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finished_goods_outward_requests_organization_id_request_no_key"
  ON "finished_goods_outward_requests"("organization_id", "request_no");
CREATE UNIQUE INDEX "finished_goods_outward_requests_organization_id_id_key"
  ON "finished_goods_outward_requests"("organization_id", "id");
CREATE INDEX "finished_goods_outward_requests_organization_id_status_requested_at_idx"
  ON "finished_goods_outward_requests"("organization_id", "status", "requested_at");

CREATE UNIQUE INDEX "finished_goods_outward_request_lines_organization_id_id_key"
  ON "finished_goods_outward_request_lines"("organization_id", "id");
CREATE UNIQUE INDEX "fg_outward_request_lines_source_stock_key"
  ON "finished_goods_outward_request_lines"("organization_id", "request_id", "source_stock_type", "source_stock_id");
CREATE INDEX "fg_outward_request_lines_stock_idx"
  ON "finished_goods_outward_request_lines"("organization_id", "source_stock_type", "source_stock_id", "status");
CREATE INDEX "fg_outward_request_lines_request_status_idx"
  ON "finished_goods_outward_request_lines"("organization_id", "request_id", "status");
CREATE INDEX "fg_outward_request_lines_booking_idx"
  ON "finished_goods_outward_request_lines"("organization_id", "source_booking_id");

CREATE UNIQUE INDEX "finished_goods_outward_boxes_organization_id_box_no_key"
  ON "finished_goods_outward_boxes"("organization_id", "box_no");
CREATE UNIQUE INDEX "finished_goods_outward_boxes_organization_id_id_key"
  ON "finished_goods_outward_boxes"("organization_id", "id");
CREATE INDEX "finished_goods_outward_boxes_organization_id_packed_at_idx"
  ON "finished_goods_outward_boxes"("organization_id", "packed_at");

CREATE UNIQUE INDEX "finished_goods_outward_box_lines_organization_id_id_key"
  ON "finished_goods_outward_box_lines"("organization_id", "id");
CREATE UNIQUE INDEX "finished_goods_outward_box_lines_organization_id_box_id_request_line_id_key"
  ON "finished_goods_outward_box_lines"("organization_id", "box_id", "request_line_id");
CREATE INDEX "finished_goods_outward_box_lines_organization_id_request_line_id_idx"
  ON "finished_goods_outward_box_lines"("organization_id", "request_line_id");

CREATE UNIQUE INDEX "finished_goods_outward_shipments_organization_id_packing_list_no_key"
  ON "finished_goods_outward_shipments"("organization_id", "packing_list_no");
CREATE UNIQUE INDEX "finished_goods_outward_shipments_organization_id_id_key"
  ON "finished_goods_outward_shipments"("organization_id", "id");
CREATE INDEX "finished_goods_outward_shipments_organization_id_shipped_at_idx"
  ON "finished_goods_outward_shipments"("organization_id", "shipped_at");

CREATE UNIQUE INDEX "finished_goods_outward_shipment_boxes_box_id_key"
  ON "finished_goods_outward_shipment_boxes"("box_id");
CREATE UNIQUE INDEX "finished_goods_outward_shipment_boxes_organization_id_id_key"
  ON "finished_goods_outward_shipment_boxes"("organization_id", "id");
CREATE UNIQUE INDEX "finished_goods_outward_shipment_boxes_organization_id_box_id_key"
  ON "finished_goods_outward_shipment_boxes"("organization_id", "box_id");
CREATE UNIQUE INDEX "fg_outward_shipment_boxes_shipment_box_key"
  ON "finished_goods_outward_shipment_boxes"("organization_id", "shipment_id", "box_id");
CREATE INDEX "fg_outward_shipment_boxes_shipment_idx"
  ON "finished_goods_outward_shipment_boxes"("organization_id", "shipment_id");

ALTER TABLE "finished_goods_outward_requests"
  ADD CONSTRAINT "finished_goods_outward_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_request_lines"
  ADD CONSTRAINT "finished_goods_outward_request_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_request_lines"
  ADD CONSTRAINT "finished_goods_outward_request_lines_organization_id_request_id_fkey"
  FOREIGN KEY ("organization_id", "request_id")
  REFERENCES "finished_goods_outward_requests"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_request_lines"
  ADD CONSTRAINT "finished_goods_outward_request_lines_organization_id_source_booking_id_fkey"
  FOREIGN KEY ("organization_id", "source_booking_id")
  REFERENCES "advance_bookings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_boxes"
  ADD CONSTRAINT "finished_goods_outward_boxes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_box_lines"
  ADD CONSTRAINT "finished_goods_outward_box_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_box_lines"
  ADD CONSTRAINT "finished_goods_outward_box_lines_organization_id_box_id_fkey"
  FOREIGN KEY ("organization_id", "box_id")
  REFERENCES "finished_goods_outward_boxes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_box_lines"
  ADD CONSTRAINT "finished_goods_outward_box_lines_organization_id_request_line_id_fkey"
  FOREIGN KEY ("organization_id", "request_line_id")
  REFERENCES "finished_goods_outward_request_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_shipments"
  ADD CONSTRAINT "finished_goods_outward_shipments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_shipment_boxes"
  ADD CONSTRAINT "finished_goods_outward_shipment_boxes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_shipment_boxes"
  ADD CONSTRAINT "finished_goods_outward_shipment_boxes_organization_id_shipment_id_fkey"
  FOREIGN KEY ("organization_id", "shipment_id")
  REFERENCES "finished_goods_outward_shipments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finished_goods_outward_shipment_boxes"
  ADD CONSTRAINT "finished_goods_outward_shipment_boxes_organization_id_box_id_fkey"
  FOREIGN KEY ("organization_id", "box_id")
  REFERENCES "finished_goods_outward_boxes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
