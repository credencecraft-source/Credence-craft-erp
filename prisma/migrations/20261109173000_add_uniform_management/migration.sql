CREATE TYPE "UniformOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

CREATE TABLE "uniform_participants" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "participant_code" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "group_label" VARCHAR(160),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_order_counters" (
    "organization_id" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_order_counters_pkey" PRIMARY KEY ("organization_id")
);

CREATE TABLE "uniform_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_no" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" "UniformOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "due_date" TIMESTAMP(3),
    "notes" VARCHAR(1000),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_style_measurement_fields" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "style_id" TEXT NOT NULL,
    "field_key" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(12) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_style_measurement_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_order_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "style_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_order_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "uniform_assignment_measurements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "field_key" VARCHAR(64) NOT NULL,
    "field_label" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(12) NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uniform_assignment_measurements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniform_participants_organization_id_id_key" ON "uniform_participants"("organization_id", "id");
CREATE UNIQUE INDEX "uniform_participants_organization_id_participant_code_key" ON "uniform_participants"("organization_id", "participant_code");
CREATE INDEX "uniform_participants_organization_id_is_active_full_name_idx" ON "uniform_participants"("organization_id", "is_active", "full_name");
CREATE UNIQUE INDEX "uniform_orders_organization_id_id_key" ON "uniform_orders"("organization_id", "id");
CREATE UNIQUE INDEX "uniform_orders_organization_id_order_no_key" ON "uniform_orders"("organization_id", "order_no");
CREATE INDEX "uniform_orders_organization_id_status_created_at_idx" ON "uniform_orders"("organization_id", "status", "created_at" DESC);
CREATE UNIQUE INDEX "uniform_style_measurement_fields_organization_id_id_key" ON "uniform_style_measurement_fields"("organization_id", "id");
CREATE UNIQUE INDEX "uniform_style_measurement_fields_organization_id_style_id_field_key_key" ON "uniform_style_measurement_fields"("organization_id", "style_id", "field_key");
CREATE INDEX "uniform_style_measurement_fields_organization_id_style_id_is_active_sort_order_idx" ON "uniform_style_measurement_fields"("organization_id", "style_id", "is_active", "sort_order");
CREATE UNIQUE INDEX "uniform_order_assignments_organization_id_id_key" ON "uniform_order_assignments"("organization_id", "id");
CREATE UNIQUE INDEX "uniform_order_assignments_organization_id_order_id_participant_id_style_id_key" ON "uniform_order_assignments"("organization_id", "order_id", "participant_id", "style_id");
CREATE INDEX "uniform_order_assignments_organization_id_order_id_style_id_variant_id_size_id_idx" ON "uniform_order_assignments"("organization_id", "order_id", "style_id", "variant_id", "size_id");
CREATE INDEX "uniform_order_assignments_organization_id_participant_id_created_at_idx" ON "uniform_order_assignments"("organization_id", "participant_id", "created_at" DESC);
CREATE UNIQUE INDEX "uniform_assignment_measurements_organization_id_assignment_id_field_key_key" ON "uniform_assignment_measurements"("organization_id", "assignment_id", "field_key");
CREATE INDEX "uniform_assignment_measurements_organization_id_assignment_id_idx" ON "uniform_assignment_measurements"("organization_id", "assignment_id");
CREATE UNIQUE INDEX "master_articles_organization_id_id_key" ON "master_articles"("organization_id", "id");
CREATE UNIQUE INDEX "master_article_variants_organization_id_id_key" ON "master_article_variants"("organization_id", "id");

ALTER TABLE "uniform_participants" ADD CONSTRAINT "uniform_participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_order_counters" ADD CONSTRAINT "uniform_order_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_orders" ADD CONSTRAINT "uniform_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_orders" ADD CONSTRAINT "uniform_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "uniform_style_measurement_fields" ADD CONSTRAINT "uniform_style_measurement_fields_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_style_measurement_fields" ADD CONSTRAINT "uniform_style_measurement_fields_organization_id_style_id_fkey" FOREIGN KEY ("organization_id", "style_id") REFERENCES "master_articles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "uniform_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_participant_id_fkey" FOREIGN KEY ("organization_id", "participant_id") REFERENCES "uniform_participants"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_style_id_fkey" FOREIGN KEY ("organization_id", "style_id") REFERENCES "master_articles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_variant_id_fkey" FOREIGN KEY ("organization_id", "variant_id") REFERENCES "master_article_variants"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uniform_order_assignments" ADD CONSTRAINT "uniform_order_assignments_organization_id_size_id_fkey" FOREIGN KEY ("organization_id", "size_id") REFERENCES "master_sizes"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uniform_assignment_measurements" ADD CONSTRAINT "uniform_assignment_measurements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uniform_assignment_measurements" ADD CONSTRAINT "uniform_assignment_measurements_organization_id_assignment_id_fkey" FOREIGN KEY ("organization_id", "assignment_id") REFERENCES "uniform_order_assignments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
