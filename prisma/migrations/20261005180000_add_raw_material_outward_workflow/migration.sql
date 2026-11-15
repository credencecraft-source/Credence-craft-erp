CREATE TABLE "raw_material_outward_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "work_order_id" TEXT NOT NULL,
  "request_no" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  "requested_by" VARCHAR(255),
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_by" VARCHAR(255),
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "raw_material_outward_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_material_outward_request_lines" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "work_order_bom_line_id" TEXT NOT NULL,
  "raw_material" VARCHAR(255),
  "category" VARCHAR(255),
  "size" VARCHAR(100),
  "allocated_quantity" DECIMAL(14,2) NOT NULL,
  "requested_quantity" DECIMAL(14,2) NOT NULL,
  "picked_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  "picked_by" VARCHAR(255),
  "picked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "raw_material_outward_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_material_outward_boxes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "box_no" VARCHAR(100) NOT NULL,
  "packed_by" VARCHAR(255),
  "packed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "raw_material_outward_boxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_material_outward_box_lines" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "box_id" TEXT NOT NULL,
  "request_line_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "raw_material_outward_box_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_material_outward_shipments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "packing_list_no" VARCHAR(100) NOT NULL,
  "shipped_by" VARCHAR(255),
  "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "raw_material_outward_shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "raw_material_outward_shipment_boxes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "shipment_id" TEXT NOT NULL,
  "box_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "raw_material_outward_shipment_boxes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "raw_material_outward_requests_organization_id_request_no_key"
  ON "raw_material_outward_requests"("organization_id", "request_no");
CREATE UNIQUE INDEX "raw_material_outward_requests_organization_id_id_key"
  ON "raw_material_outward_requests"("organization_id", "id");
CREATE INDEX "raw_material_outward_requests_organization_id_status_reques_idx"
  ON "raw_material_outward_requests"("organization_id", "status", "requested_at");
CREATE INDEX "raw_material_outward_requests_work_order_id_requested_at_idx"
  ON "raw_material_outward_requests"("work_order_id", "requested_at");

CREATE UNIQUE INDEX "raw_material_outward_request_lines_organization_id_id_key"
  ON "raw_material_outward_request_lines"("organization_id", "id");
CREATE INDEX "raw_material_outward_request_lines_organization_id_request__idx"
  ON "raw_material_outward_request_lines"("organization_id", "request_id", "status");
CREATE INDEX "raw_material_outward_request_lines_work_order_bom_line_id_idx"
  ON "raw_material_outward_request_lines"("work_order_bom_line_id");

CREATE UNIQUE INDEX "raw_material_outward_boxes_organization_id_box_no_key"
  ON "raw_material_outward_boxes"("organization_id", "box_no");
CREATE UNIQUE INDEX "raw_material_outward_boxes_organization_id_id_key"
  ON "raw_material_outward_boxes"("organization_id", "id");
CREATE INDEX "raw_material_outward_boxes_organization_id_packed_at_idx"
  ON "raw_material_outward_boxes"("organization_id", "packed_at");

CREATE UNIQUE INDEX "raw_material_outward_box_lines_organization_id_id_key"
  ON "raw_material_outward_box_lines"("organization_id", "id");
CREATE UNIQUE INDEX "raw_material_outward_box_lines_organization_id_box_id_reque_key"
  ON "raw_material_outward_box_lines"("organization_id", "box_id", "request_line_id");
CREATE INDEX "raw_material_outward_box_lines_organization_id_request_line_idx"
  ON "raw_material_outward_box_lines"("organization_id", "request_line_id");

CREATE UNIQUE INDEX "raw_material_outward_shipments_organization_id_packing_list_key"
  ON "raw_material_outward_shipments"("organization_id", "packing_list_no");
CREATE UNIQUE INDEX "raw_material_outward_shipments_organization_id_id_key"
  ON "raw_material_outward_shipments"("organization_id", "id");
CREATE INDEX "raw_material_outward_shipments_organization_id_shipped_at_idx"
  ON "raw_material_outward_shipments"("organization_id", "shipped_at");

CREATE UNIQUE INDEX "raw_material_outward_shipment_boxes_box_id_key"
  ON "raw_material_outward_shipment_boxes"("box_id");
CREATE UNIQUE INDEX "raw_material_outward_shipment_boxes_organization_id_id_key"
  ON "raw_material_outward_shipment_boxes"("organization_id", "id");
CREATE UNIQUE INDEX "raw_material_outward_shipment_boxes_organization_id_box_id_key"
  ON "raw_material_outward_shipment_boxes"("organization_id", "box_id");
CREATE UNIQUE INDEX "raw_material_outward_shipment_boxes_organization_id_shipmen_key"
  ON "raw_material_outward_shipment_boxes"("organization_id", "shipment_id", "box_id");
CREATE INDEX "raw_material_outward_shipment_boxes_organization_id_shipmen_idx"
  ON "raw_material_outward_shipment_boxes"("organization_id", "shipment_id");

ALTER TABLE "raw_material_outward_requests"
  ADD CONSTRAINT "raw_material_outward_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_requests_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "raw_material_outward_request_lines"
  ADD CONSTRAINT "raw_material_outward_request_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_request_lines_organization_id_request_fkey"
  FOREIGN KEY ("organization_id", "request_id") REFERENCES "raw_material_outward_requests"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_request_lines_work_order_bom_line_id_fkey"
  FOREIGN KEY ("work_order_bom_line_id") REFERENCES "factory_work_order_bom_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "raw_material_outward_boxes"
  ADD CONSTRAINT "raw_material_outward_boxes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "raw_material_outward_box_lines"
  ADD CONSTRAINT "raw_material_outward_box_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_box_lines_organization_id_box_id_fkey"
  FOREIGN KEY ("organization_id", "box_id") REFERENCES "raw_material_outward_boxes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_box_lines_organization_id_request_lin_fkey"
  FOREIGN KEY ("organization_id", "request_line_id") REFERENCES "raw_material_outward_request_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "raw_material_outward_shipments"
  ADD CONSTRAINT "raw_material_outward_shipments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "raw_material_outward_shipment_boxes"
  ADD CONSTRAINT "raw_material_outward_shipment_boxes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_shipment_boxes_organization_id_shipme_fkey"
  FOREIGN KEY ("organization_id", "shipment_id") REFERENCES "raw_material_outward_shipments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "raw_material_outward_shipment_boxes_organization_id_box_id_fkey"
  FOREIGN KEY ("organization_id", "box_id") REFERENCES "raw_material_outward_boxes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
