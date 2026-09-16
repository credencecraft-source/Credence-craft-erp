-- Connect process-template child rows to operation templates and store operation prices.
ALTER TABLE "master_operation_template_steps"
ADD COLUMN "price" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "master_process_template_steps"
ADD COLUMN "operation_template_id" TEXT;

CREATE INDEX "master_process_template_steps_operation_template_id_idx"
ON "master_process_template_steps"("operation_template_id");

ALTER TABLE "master_process_template_steps"
ADD CONSTRAINT "master_process_template_steps_operation_template_id_fkey"
FOREIGN KEY ("operation_template_id") REFERENCES "master_operation_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
