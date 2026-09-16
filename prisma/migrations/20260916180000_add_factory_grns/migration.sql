CREATE TABLE "factory_grns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "grn_no" VARCHAR(100) NOT NULL,
    "grn_date" DATE NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "bundle_transfer_id" TEXT NOT NULL,
    "from_process_id" TEXT NOT NULL,
    "to_process_id" TEXT NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "received_by" VARCHAR(255),
    "approved_by" VARCHAR(255),
    "approved_at" TIMESTAMP(3),
    "remarks" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_grns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_grn_lines" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "operation_id" TEXT,
    "operation_name" VARCHAR(255) NOT NULL,
    "actual_made_qty" INTEGER NOT NULL DEFAULT 0,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "vendor_name" VARCHAR(255),
    "employee_name" VARCHAR(255),
    "actual_price" DECIMAL(12,4),
    "remarks" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factory_grn_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "factory_daily_production_report_lines" ADD COLUMN "grn_id" TEXT;
ALTER TABLE "factory_daily_production_report_lines" ADD COLUMN "grn_line_id" TEXT;
ALTER TABLE "factory_daily_production_report_lines" ADD COLUMN "actual_made_qty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "factory_daily_production_report_lines" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "factory_grns_organization_id_grn_no_key" ON "factory_grns"("organization_id", "grn_no");
CREATE INDEX "factory_grns_organization_id_grn_date_status_idx" ON "factory_grns"("organization_id", "grn_date", "status");
CREATE INDEX "factory_grns_bundle_transfer_id_created_at_idx" ON "factory_grns"("bundle_transfer_id", "created_at");
CREATE INDEX "factory_grn_lines_grn_id_idx" ON "factory_grn_lines"("grn_id");
CREATE INDEX "factory_grn_lines_operation_id_idx" ON "factory_grn_lines"("operation_id");
CREATE INDEX "factory_daily_production_report_lines_grn_id_idx" ON "factory_daily_production_report_lines"("grn_id");
CREATE INDEX "factory_daily_production_report_lines_grn_line_id_idx" ON "factory_daily_production_report_lines"("grn_line_id");

ALTER TABLE "factory_grns" ADD CONSTRAINT "factory_grns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_grns" ADD CONSTRAINT "factory_grns_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_grns" ADD CONSTRAINT "factory_grns_bundle_transfer_id_fkey" FOREIGN KEY ("bundle_transfer_id") REFERENCES "factory_bundle_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_grns" ADD CONSTRAINT "factory_grns_from_process_id_fkey" FOREIGN KEY ("from_process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_grns" ADD CONSTRAINT "factory_grns_to_process_id_fkey" FOREIGN KEY ("to_process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "factory_grn_lines" ADD CONSTRAINT "factory_grn_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "factory_grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_grn_lines" ADD CONSTRAINT "factory_grn_lines_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "work_order_process_controller_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "factory_daily_production_report_lines" ADD CONSTRAINT "factory_daily_production_report_lines_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "factory_grns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "factory_daily_production_report_lines" ADD CONSTRAINT "factory_daily_production_report_lines_grn_line_id_fkey" FOREIGN KEY ("grn_line_id") REFERENCES "factory_grn_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
