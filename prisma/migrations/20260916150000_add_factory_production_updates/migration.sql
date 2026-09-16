CREATE TABLE "factory_production_updates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "operation_id" TEXT,
    "update_level" VARCHAR(20) NOT NULL DEFAULT 'PROCESS',
    "completed_qty" INTEGER NOT NULL DEFAULT 0,
    "vendor_billable" BOOLEAN NOT NULL DEFAULT false,
    "vendor_name" VARCHAR(255),
    "employee_name" VARCHAR(255),
    "remarks" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_production_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "factory_production_update_size_lines" (
    "id" TEXT NOT NULL,
    "production_update_id" TEXT NOT NULL,
    "size" VARCHAR(100),
    "buyer_size" VARCHAR(100),
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "factory_production_update_size_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "factory_production_updates_organization_id_work_order_id_created_at_idx" ON "factory_production_updates"("organization_id", "work_order_id", "created_at");
CREATE INDEX "factory_production_updates_process_id_created_at_idx" ON "factory_production_updates"("process_id", "created_at");
CREATE INDEX "factory_production_updates_operation_id_idx" ON "factory_production_updates"("operation_id");
CREATE INDEX "factory_production_update_size_lines_production_update_id_idx" ON "factory_production_update_size_lines"("production_update_id");

ALTER TABLE "factory_production_updates" ADD CONSTRAINT "factory_production_updates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_production_updates" ADD CONSTRAINT "factory_production_updates_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_production_updates" ADD CONSTRAINT "factory_production_updates_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_production_updates" ADD CONSTRAINT "factory_production_updates_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "work_order_process_controller_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "factory_production_update_size_lines" ADD CONSTRAINT "factory_production_update_size_lines_production_update_id_fkey" FOREIGN KEY ("production_update_id") REFERENCES "factory_production_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
