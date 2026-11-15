CREATE TABLE "preventive_maintenance_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_tag" VARCHAR(100) NOT NULL,
    "master_raw_material_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "serial_number" VARCHAR(150),
    "criticality" VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preventive_maintenance_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "preventive_maintenance_plans" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "plan_name" VARCHAR(120) NOT NULL,
    "interval_days" INTEGER NOT NULL,
    "next_due_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preventive_maintenance_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "preventive_maintenance_plan_checklist" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "instruction" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "preventive_maintenance_plan_checklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "preventive_maintenance_work_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "scheduled_for" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    "completed_by" VARCHAR(255),
    "completed_at" TIMESTAMP(3),
    "downtime_minutes" INTEGER,
    "completion_notes" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preventive_maintenance_work_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "preventive_maintenance_work_order_checklist" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "instruction" VARCHAR(240) NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completion_note" VARCHAR(500),
    "completed_at" TIMESTAMP(3),
    "completed_by" VARCHAR(255),
    CONSTRAINT "preventive_maintenance_work_order_checklist_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "preventive_maintenance_assets_organization_id_status_critic_idx"
    ON "preventive_maintenance_assets"("organization_id", "status", "criticality");
CREATE UNIQUE INDEX "preventive_maintenance_assets_organization_id_id_key"
    ON "preventive_maintenance_assets"("organization_id", "id");
CREATE UNIQUE INDEX "preventive_maintenance_assets_organization_id_asset_tag_key"
    ON "preventive_maintenance_assets"("organization_id", "asset_tag");
CREATE INDEX "preventive_maintenance_plans_organization_id_is_active_next_idx"
    ON "preventive_maintenance_plans"("organization_id", "is_active", "next_due_date");
CREATE UNIQUE INDEX "preventive_maintenance_plans_organization_id_id_key"
    ON "preventive_maintenance_plans"("organization_id", "id");
CREATE UNIQUE INDEX "preventive_maintenance_plans_organization_id_asset_id_plan__key"
    ON "preventive_maintenance_plans"("organization_id", "asset_id", "plan_name");
CREATE UNIQUE INDEX "preventive_maintenance_plan_checklist_organization_id_plan__key"
    ON "preventive_maintenance_plan_checklist"("organization_id", "plan_id", "sort_order");
CREATE INDEX "preventive_maintenance_work_orders_organization_id_status_s_idx"
    ON "preventive_maintenance_work_orders"("organization_id", "status", "scheduled_for");
CREATE UNIQUE INDEX "preventive_maintenance_work_orders_organization_id_id_key"
    ON "preventive_maintenance_work_orders"("organization_id", "id");
CREATE UNIQUE INDEX "preventive_maintenance_work_orders_organization_id_plan_id__key"
    ON "preventive_maintenance_work_orders"("organization_id", "plan_id", "scheduled_for");
CREATE UNIQUE INDEX "preventive_maintenance_work_order_checklist_organization_id_key"
    ON "preventive_maintenance_work_order_checklist"("organization_id", "work_order_id", "sort_order");
CREATE UNIQUE INDEX "master_raw_materials_organization_id_id_key"
    ON "master_raw_materials"("organization_id", "id");

ALTER TABLE "preventive_maintenance_assets"
    ADD CONSTRAINT "preventive_maintenance_assets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_assets"
    ADD CONSTRAINT "preventive_maintenance_assets_organization_id_master_raw_m_fkey"
    FOREIGN KEY ("organization_id", "master_raw_material_id")
    REFERENCES "master_raw_materials"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_assets"
    ADD CONSTRAINT "preventive_maintenance_assets_organization_id_entity_id_lo_fkey"
    FOREIGN KEY ("organization_id", "entity_id", "location_id")
    REFERENCES "master_locations"("organization_id", "entity_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_plans"
    ADD CONSTRAINT "preventive_maintenance_plans_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_plans"
    ADD CONSTRAINT "preventive_maintenance_plans_organization_id_asset_id_fkey"
    FOREIGN KEY ("organization_id", "asset_id")
    REFERENCES "preventive_maintenance_assets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_plan_checklist"
    ADD CONSTRAINT "preventive_maintenance_plan_checklist_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_plan_checklist"
    ADD CONSTRAINT "preventive_maintenance_plan_checklist_organization_id_plan_fkey"
    FOREIGN KEY ("organization_id", "plan_id")
    REFERENCES "preventive_maintenance_plans"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_work_orders"
    ADD CONSTRAINT "preventive_maintenance_work_orders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_work_orders"
    ADD CONSTRAINT "preventive_maintenance_work_orders_organization_id_asset_i_fkey"
    FOREIGN KEY ("organization_id", "asset_id")
    REFERENCES "preventive_maintenance_assets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_work_orders"
    ADD CONSTRAINT "preventive_maintenance_work_orders_organization_id_plan_id_fkey"
    FOREIGN KEY ("organization_id", "plan_id")
    REFERENCES "preventive_maintenance_plans"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_work_order_checklist"
    ADD CONSTRAINT "preventive_maintenance_work_order_checklist_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preventive_maintenance_work_order_checklist"
    ADD CONSTRAINT "preventive_maintenance_work_order_checklist_work_order_fkey"
    FOREIGN KEY ("organization_id", "work_order_id")
    REFERENCES "preventive_maintenance_work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
