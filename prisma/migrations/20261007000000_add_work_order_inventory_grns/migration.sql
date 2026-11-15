ALTER TABLE "factory_work_orders"
ADD CONSTRAINT "factory_work_orders_organization_id_id_key" UNIQUE ("organization_id", "id");

ALTER TABLE "factory_work_order_size_lines"
ADD CONSTRAINT "factory_work_order_size_lines_work_order_id_id_key" UNIQUE ("work_order_id", "id");

CREATE TABLE "work_order_inventory_grns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "grn_no" VARCHAR(100) NOT NULL,
    "grn_date" DATE NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "submitted_by" VARCHAR(255) NOT NULL,
    "verified_by" VARCHAR(255),
    "verified_at" TIMESTAMP(3),
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_inventory_grns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_inventory_grn_lines" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "work_order_size_line_id" TEXT NOT NULL,
    "size" VARCHAR(100),
    "buyer_size" VARCHAR(100),
    "ordered_quantity" INTEGER NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "received_quantity" INTEGER NOT NULL,
    "verified_actual_quantity" INTEGER,
    "approved_quantity" INTEGER,
    "rejected_quantity" INTEGER,
    "advance_booked_quantity" INTEGER,
    "general_inventory_quantity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_inventory_grn_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_order_inventory_grns_id_work_order_id_key"
ON "work_order_inventory_grns"("id", "work_order_id");
CREATE UNIQUE INDEX "work_order_inventory_grns_organization_id_grn_no_key"
ON "work_order_inventory_grns"("organization_id", "grn_no");
CREATE INDEX "work_order_inventory_grns_organization_id_status_grn_date_idx"
ON "work_order_inventory_grns"("organization_id", "status", "grn_date");
CREATE INDEX "work_order_inventory_grns_organization_id_work_order_id_created_at_idx"
ON "work_order_inventory_grns"("organization_id", "work_order_id", "created_at");
CREATE UNIQUE INDEX "work_order_inventory_grn_lines_grn_id_work_order_size_line_id_key"
ON "work_order_inventory_grn_lines"("grn_id", "work_order_size_line_id");
CREATE INDEX "work_order_inventory_grn_lines_work_order_id_work_order_size_line_id_idx"
ON "work_order_inventory_grn_lines"("work_order_id", "work_order_size_line_id");

ALTER TABLE "work_order_inventory_grns"
ADD CONSTRAINT "work_order_inventory_grns_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grns"
ADD CONSTRAINT "work_order_inventory_grns_organization_id_work_order_id_fkey"
FOREIGN KEY ("organization_id", "work_order_id")
REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grn_lines"
ADD CONSTRAINT "work_order_inventory_grn_lines_grn_id_work_order_id_fkey"
FOREIGN KEY ("grn_id", "work_order_id")
REFERENCES "work_order_inventory_grns"("id", "work_order_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grn_lines"
ADD CONSTRAINT "work_order_inventory_grn_lines_work_order_id_work_order_size_line_id_fkey"
FOREIGN KEY ("work_order_id", "work_order_size_line_id")
REFERENCES "factory_work_order_size_lines"("work_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS "audit_work_order_inventory_grns" ON "work_order_inventory_grns";
CREATE TRIGGER "audit_work_order_inventory_grns"
AFTER INSERT OR UPDATE OR DELETE ON "work_order_inventory_grns"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
