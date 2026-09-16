-- Store the Process Master on the Operation Template header.
ALTER TABLE "master_operation_templates"
ADD COLUMN "process_id" TEXT;

CREATE INDEX "master_operation_templates_organization_id_process_id_idx"
ON "master_operation_templates"("organization_id", "process_id");

ALTER TABLE "master_operation_templates"
ADD CONSTRAINT "master_operation_templates_process_id_fkey"
FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
