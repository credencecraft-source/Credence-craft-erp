CREATE TABLE "factory_daily_production_reports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" VARCHAR(255),
    "rejection_reason" VARCHAR(1000),
    "total_produced" INTEGER NOT NULL DEFAULT 0,
    "total_transferred" INTEGER NOT NULL DEFAULT 0,
    "total_received" INTEGER NOT NULL DEFAULT 0,
    "total_labor_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_daily_production_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_daily_production_report_lines" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "operation_name" VARCHAR(255),
    "production_update_id" TEXT,
    "bundle_transfer_id" TEXT,
    "grn_reference" VARCHAR(255),
    "produced_qty" INTEGER NOT NULL DEFAULT 0,
    "transferred_qty" INTEGER NOT NULL DEFAULT 0,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "labor_mode" VARCHAR(20),
    "labor_rate" DECIMAL(12,4),
    "labor_amount" DECIMAL(14,2),
    "vendor_name" VARCHAR(255),
    "employee_name" VARCHAR(255),
    "remarks" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factory_daily_production_report_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "factory_daily_production_reports_organization_id_report_date_key" ON "factory_daily_production_reports"("organization_id", "report_date");
CREATE INDEX "factory_daily_production_reports_organization_id_status_report_date_idx" ON "factory_daily_production_reports"("organization_id", "status", "report_date");
CREATE INDEX "factory_daily_production_report_lines_report_id_idx" ON "factory_daily_production_report_lines"("report_id");
CREATE INDEX "factory_daily_production_report_lines_work_order_id_process_name_idx" ON "factory_daily_production_report_lines"("work_order_id", "process_name");

ALTER TABLE "factory_daily_production_reports" ADD CONSTRAINT "factory_daily_production_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_daily_production_report_lines" ADD CONSTRAINT "factory_daily_production_report_lines_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "factory_daily_production_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_daily_production_report_lines" ADD CONSTRAINT "factory_daily_production_report_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
