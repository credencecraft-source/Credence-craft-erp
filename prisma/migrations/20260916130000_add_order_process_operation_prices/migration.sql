-- Snapshot operation prices on each order process step so order-level changes do not alter master data.
CREATE TABLE "merchandising_order_process_operations" (
    "id" TEXT NOT NULL,
    "order_process_step_id" TEXT NOT NULL,
    "source_operation_template_step_id" TEXT,
    "operation" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "price" DECIMAL(12, 2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "merchandising_order_process_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_process_ops_step_sl_no_key"
ON "merchandising_order_process_operations"("order_process_step_id", "sl_no");

CREATE INDEX "order_process_ops_step_sl_no_idx"
ON "merchandising_order_process_operations"("order_process_step_id", "sl_no");

ALTER TABLE "merchandising_order_process_operations"
ADD CONSTRAINT "merchandising_order_process_operations_order_process_step_id_fkey"
FOREIGN KEY ("order_process_step_id") REFERENCES "merchandising_order_process_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "merchandising_order_process_operations_source_operation_template_step_id_fkey"
FOREIGN KEY ("source_operation_template_step_id") REFERENCES "master_operation_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
