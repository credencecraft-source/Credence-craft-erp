CREATE TABLE "order_process_controllers" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "process_template_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_process_controllers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_process_controller_processes" (
    "id" TEXT NOT NULL,
    "controller_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "order_qty" INTEGER NOT NULL DEFAULT 0,
    "created_qty" INTEGER NOT NULL DEFAULT 0,
    "completed_qty" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "order_process_controller_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_process_controller_operations" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "source_operation_id" TEXT,
    "operation" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "budgeted_price" DECIMAL(12,2) NOT NULL,
    "actual_price" DECIMAL(12,2),
    CONSTRAINT "order_process_controller_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_process_controllers" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "order_controller_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "work_order_process_controllers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_process_controller_processes" (
    "id" TEXT NOT NULL,
    "controller_id" TEXT NOT NULL,
    "source_process_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "order_qty" INTEGER NOT NULL DEFAULT 0,
    "created_qty" INTEGER NOT NULL DEFAULT 0,
    "completed_qty" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "work_order_process_controller_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_process_controller_operations" (
    "id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "source_operation_id" TEXT,
    "operation" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "budgeted_price" DECIMAL(12,2) NOT NULL,
    "actual_price" DECIMAL(12,2),
    "created_qty" INTEGER NOT NULL DEFAULT 0,
    "completed_qty" INTEGER NOT NULL DEFAULT 0,
    "quality_status" VARCHAR(50),
    "remarks" VARCHAR(1000),
    CONSTRAINT "work_order_process_controller_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_process_controllers_order_id_key" ON "order_process_controllers"("order_id");
CREATE INDEX "order_process_controllers_process_template_id_idx" ON "order_process_controllers"("process_template_id");
CREATE UNIQUE INDEX "order_process_controller_processes_controller_id_sl_no_key" ON "order_process_controller_processes"("controller_id", "sl_no");
CREATE INDEX "order_process_controller_processes_process_id_idx" ON "order_process_controller_processes"("process_id");
CREATE UNIQUE INDEX "order_process_controller_operations_process_id_sl_no_key" ON "order_process_controller_operations"("process_id", "sl_no");
CREATE UNIQUE INDEX "work_order_process_controllers_work_order_id_key" ON "work_order_process_controllers"("work_order_id");
CREATE INDEX "work_order_process_controllers_order_controller_id_idx" ON "work_order_process_controllers"("order_controller_id");
CREATE UNIQUE INDEX "work_order_process_controller_processes_controller_id_sl_no_key" ON "work_order_process_controller_processes"("controller_id", "sl_no");
CREATE INDEX "work_order_process_controller_processes_source_process_id_idx" ON "work_order_process_controller_processes"("source_process_id");
CREATE UNIQUE INDEX "work_order_process_controller_operations_process_id_sl_no_key" ON "work_order_process_controller_operations"("process_id", "sl_no");

ALTER TABLE "order_process_controllers" ADD CONSTRAINT "order_process_controllers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_process_controllers" ADD CONSTRAINT "order_process_controllers_process_template_id_fkey" FOREIGN KEY ("process_template_id") REFERENCES "master_process_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_process_controller_processes" ADD CONSTRAINT "order_process_controller_processes_controller_id_fkey" FOREIGN KEY ("controller_id") REFERENCES "order_process_controllers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_process_controller_processes" ADD CONSTRAINT "order_process_controller_processes_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_process_controller_operations" ADD CONSTRAINT "order_process_controller_operations_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "order_process_controller_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controllers" ADD CONSTRAINT "work_order_process_controllers_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controllers" ADD CONSTRAINT "work_order_process_controllers_order_controller_id_fkey" FOREIGN KEY ("order_controller_id") REFERENCES "order_process_controllers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controller_processes" ADD CONSTRAINT "work_order_process_controller_processes_controller_id_fkey" FOREIGN KEY ("controller_id") REFERENCES "work_order_process_controllers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controller_processes" ADD CONSTRAINT "work_order_process_controller_processes_source_process_id_fkey" FOREIGN KEY ("source_process_id") REFERENCES "order_process_controller_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controller_processes" ADD CONSTRAINT "work_order_process_controller_processes_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_process_controller_operations" ADD CONSTRAINT "work_order_process_controller_operations_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "work_order_process_controller_processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
