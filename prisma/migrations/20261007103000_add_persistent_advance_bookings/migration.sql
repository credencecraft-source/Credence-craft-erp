ALTER TABLE "merchandising_orders"
ADD CONSTRAINT "merchandising_orders_organization_id_id_key"
UNIQUE ("organization_id", "id");

CREATE TABLE "advance_bookings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "booking_no" VARCHAR(100) NOT NULL,
    "customer" VARCHAR(255) NOT NULL,
    "brand" VARCHAR(255),
    "style_name" VARCHAR(255),
    "delivery_date" DATE,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "advance_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advance_booking_size_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "size" VARCHAR(100) NOT NULL,
    "booked_quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "advance_booking_size_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advance_booking_work_order_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_size_line_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "work_order_size_line_id" TEXT NOT NULL,
    "assigned_quantity" INTEGER NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "advance_booking_work_order_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_inventory_grn_booking_allocations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "grn_line_id" TEXT NOT NULL,
    "booking_assignment_id" TEXT NOT NULL,
    "allocated_quantity" INTEGER NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_inventory_grn_booking_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "advance_bookings_organization_id_id_key"
ON "advance_bookings"("organization_id", "id");
CREATE UNIQUE INDEX "advance_bookings_organization_id_booking_no_key"
ON "advance_bookings"("organization_id", "booking_no");
CREATE INDEX "advance_bookings_organization_id_order_id_created_at_idx"
ON "advance_bookings"("organization_id", "order_id", "created_at");

CREATE UNIQUE INDEX "advance_booking_size_lines_organization_id_id_key"
ON "advance_booking_size_lines"("organization_id", "id");
CREATE UNIQUE INDEX "advance_booking_size_lines_booking_id_size_key"
ON "advance_booking_size_lines"("booking_id", "size");
CREATE INDEX "advance_booking_size_lines_organization_id_booking_id_idx"
ON "advance_booking_size_lines"("organization_id", "booking_id");

CREATE UNIQUE INDEX "advance_booking_work_order_assignments_organization_id_id_key"
ON "advance_booking_work_order_assignments"("organization_id", "id");
CREATE UNIQUE INDEX "advance_booking_work_order_assignments_booking_size_line_id_work_order_size_line_id_key"
ON "advance_booking_work_order_assignments"("booking_size_line_id", "work_order_size_line_id");
CREATE INDEX "advance_booking_work_order_assignments_organization_id_work_order_id_work_order_size_line_id_idx"
ON "advance_booking_work_order_assignments"("organization_id", "work_order_id", "work_order_size_line_id");

CREATE UNIQUE INDEX "work_order_inventory_grn_booking_allocations_grn_line_id_booking_assignment_id_key"
ON "work_order_inventory_grn_booking_allocations"("grn_line_id", "booking_assignment_id");
CREATE INDEX "work_order_inventory_grn_booking_allocations_organization_id_booking_assignment_id_idx"
ON "work_order_inventory_grn_booking_allocations"("organization_id", "booking_assignment_id");

ALTER TABLE "advance_bookings"
ADD CONSTRAINT "advance_bookings_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_bookings"
ADD CONSTRAINT "advance_bookings_organization_order_id_fkey"
FOREIGN KEY ("organization_id", "order_id")
REFERENCES "merchandising_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advance_booking_size_lines"
ADD CONSTRAINT "advance_booking_size_lines_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_booking_size_lines"
ADD CONSTRAINT "advance_booking_size_lines_booking_fkey"
FOREIGN KEY ("organization_id", "booking_id")
REFERENCES "advance_bookings"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_booking_work_order_assignments"
ADD CONSTRAINT "advance_booking_work_order_assignments_organization_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_booking_work_order_assignments"
ADD CONSTRAINT "advance_booking_work_order_assignments_booking_size_fkey"
FOREIGN KEY ("organization_id", "booking_size_line_id")
REFERENCES "advance_booking_size_lines"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_booking_work_order_assignments"
ADD CONSTRAINT "advance_booking_work_order_assignments_work_order_size_fkey"
FOREIGN KEY ("work_order_id", "work_order_size_line_id")
REFERENCES "factory_work_order_size_lines"("work_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advance_booking_work_order_assignments"
ADD CONSTRAINT "advance_booking_work_order_assignments_work_order_fkey"
FOREIGN KEY ("organization_id", "work_order_id")
REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grn_booking_allocations"
ADD CONSTRAINT "work_order_inventory_grn_booking_allocations_org_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grn_booking_allocations"
ADD CONSTRAINT "work_order_inventory_grn_booking_allocations_grn_line_fkey"
FOREIGN KEY ("grn_line_id") REFERENCES "work_order_inventory_grn_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_inventory_grn_booking_allocations"
ADD CONSTRAINT "work_order_inventory_grn_booking_allocations_assignment_fkey"
FOREIGN KEY ("organization_id", "booking_assignment_id")
REFERENCES "advance_booking_work_order_assignments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS "audit_advance_bookings" ON "advance_bookings";
CREATE TRIGGER "audit_advance_bookings"
AFTER INSERT OR UPDATE OR DELETE ON "advance_bookings"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();

DROP TRIGGER IF EXISTS "audit_advance_booking_work_order_assignments" ON "advance_booking_work_order_assignments";
CREATE TRIGGER "audit_advance_booking_work_order_assignments"
AFTER INSERT OR UPDATE OR DELETE ON "advance_booking_work_order_assignments"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
