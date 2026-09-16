-- Add reusable operation templates with ordered operation child rows.
CREATE TABLE "master_operation_templates" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "operation_template_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_operation_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_operation_template_steps" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "operation_template_id" TEXT NOT NULL,
    "operation" VARCHAR(255) NOT NULL,
    "sl_no" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_operation_template_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_operation_templates_organization_id_name_key"
ON "master_operation_templates"("organization_id", "operation_template_name");
CREATE UNIQUE INDEX "master_operation_templates_value_id_key"
ON "master_operation_templates"("value_id");
CREATE INDEX "master_operation_templates_organization_id_is_active_idx"
ON "master_operation_templates"("organization_id", "is_active");

CREATE UNIQUE INDEX "master_operation_template_steps_value_id_key"
ON "master_operation_template_steps"("value_id");
CREATE UNIQUE INDEX "master_operation_template_steps_org_template_operation_key"
ON "master_operation_template_steps"("organization_id", "operation_template_id", "operation");
CREATE INDEX "master_operation_template_steps_org_template_sl_no_idx"
ON "master_operation_template_steps"("organization_id", "operation_template_id", "sl_no");

ALTER TABLE "master_operation_templates"
ADD CONSTRAINT "master_operation_templates_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_operation_template_steps"
ADD CONSTRAINT "master_operation_template_steps_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_operation_template_steps_operation_template_id_fkey"
FOREIGN KEY ("operation_template_id") REFERENCES "master_operation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
