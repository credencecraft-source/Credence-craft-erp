ALTER TABLE "master_process_templates"
ADD COLUMN "first_process_id" TEXT,
ADD COLUMN "last_process_id" TEXT;

ALTER TABLE "master_process_template_steps"
ADD COLUMN "is_returnable_process" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "block_by_process_id" TEXT;

CREATE INDEX "master_process_templates_first_process_id_idx"
ON "master_process_templates"("first_process_id");

CREATE INDEX "master_process_templates_last_process_id_idx"
ON "master_process_templates"("last_process_id");

CREATE INDEX "master_process_template_steps_block_by_process_id_idx"
ON "master_process_template_steps"("block_by_process_id");

ALTER TABLE "master_process_templates"
ADD CONSTRAINT "master_process_templates_first_process_id_fkey"
FOREIGN KEY ("first_process_id") REFERENCES "master_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "master_process_templates_last_process_id_fkey"
FOREIGN KEY ("last_process_id") REFERENCES "master_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "master_process_template_steps"
ADD CONSTRAINT "master_process_template_steps_block_by_process_id_fkey"
FOREIGN KEY ("block_by_process_id") REFERENCES "master_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
