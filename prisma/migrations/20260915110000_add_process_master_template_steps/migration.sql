-- Add reusable process masters and ordered process-template child rows.
CREATE TABLE "master_processes" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_processes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_process_template_steps" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "process_template_id" TEXT NOT NULL,
    "process_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_process_template_steps_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "merchandising_orders"
ADD COLUMN "process_template_id" TEXT;

CREATE TABLE "merchandising_order_process_steps" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "source_template_step_id" TEXT,
    "process_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "cost" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merchandising_order_process_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_processes_organization_id_process_name_key"
ON "master_processes"("organization_id", "process_name");
CREATE UNIQUE INDEX "master_processes_value_id_key"
ON "master_processes"("value_id");
CREATE INDEX "master_processes_organization_id_is_active_idx"
ON "master_processes"("organization_id", "is_active");

CREATE UNIQUE INDEX "master_process_template_steps_value_id_key"
ON "master_process_template_steps"("value_id");
CREATE UNIQUE INDEX "master_process_template_steps_org_template_process_key"
ON "master_process_template_steps"("organization_id", "process_template_id", "process_id");
CREATE INDEX "master_process_template_steps_org_template_sl_no_idx"
ON "master_process_template_steps"("organization_id", "process_template_id", "sl_no");

CREATE UNIQUE INDEX "merchandising_order_process_steps_order_id_sl_no_key"
ON "merchandising_order_process_steps"("order_id", "sl_no");
CREATE INDEX "merchandising_order_process_steps_order_id_sl_no_idx"
ON "merchandising_order_process_steps"("order_id", "sl_no");

ALTER TABLE "master_processes"
ADD CONSTRAINT "master_processes_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_process_template_steps"
ADD CONSTRAINT "master_process_template_steps_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_process_template_steps_process_template_id_fkey"
FOREIGN KEY ("process_template_id") REFERENCES "master_process_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_process_template_steps_process_id_fkey"
FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "merchandising_orders"
ADD CONSTRAINT "merchandising_orders_process_template_id_fkey"
FOREIGN KEY ("process_template_id") REFERENCES "master_process_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "merchandising_order_process_steps"
ADD CONSTRAINT "merchandising_order_process_steps_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "merchandising_order_process_steps_source_template_step_id_fkey"
FOREIGN KEY ("source_template_step_id") REFERENCES "master_process_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "merchandising_order_process_steps_process_id_fkey"
FOREIGN KEY ("process_id") REFERENCES "master_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
