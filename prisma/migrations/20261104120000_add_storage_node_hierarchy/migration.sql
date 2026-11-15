CREATE TYPE "storage_node_type" AS ENUM (
  'LOCATION_SITE',
  'WAREHOUSE',
  'SUB_STORE',
  'RACK',
  'BIN'
);

CREATE TABLE "storage_nodes" (
  "id" TEXT NOT NULL,
  "value_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "node_type" "storage_node_type" NOT NULL,
  "node_code" VARCHAR(100) NOT NULL,
  "node_name" VARCHAR(255) NOT NULL,
  "parent_node_id" TEXT,
  "parent_node_type" "storage_node_type",
  "entity_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "storage_nodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storage_nodes_parent_rules_check" CHECK (
    ("node_type" = 'LOCATION_SITE' AND "parent_node_id" IS NULL AND "parent_node_type" IS NULL AND "entity_id" IS NOT NULL)
    OR ("node_type" = 'WAREHOUSE' AND "parent_node_id" IS NOT NULL AND "parent_node_type" = 'LOCATION_SITE' AND "entity_id" IS NULL)
    OR ("node_type" = 'SUB_STORE' AND "parent_node_id" IS NOT NULL AND "parent_node_type" = 'WAREHOUSE' AND "entity_id" IS NULL)
    OR ("node_type" = 'RACK' AND "parent_node_id" IS NOT NULL AND "parent_node_type" = 'SUB_STORE' AND "entity_id" IS NULL)
    OR ("node_type" = 'BIN' AND "parent_node_id" IS NOT NULL AND "parent_node_type" = 'RACK' AND "entity_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "storage_nodes_value_id_key" ON "storage_nodes"("value_id");
CREATE UNIQUE INDEX "storage_nodes_organization_id_id_key"
  ON "storage_nodes"("organization_id", "id");
CREATE UNIQUE INDEX "storage_nodes_organization_id_id_node_type_key"
  ON "storage_nodes"("organization_id", "id", "node_type");
CREATE UNIQUE INDEX "storage_nodes_organization_id_node_code_key"
  ON "storage_nodes"("organization_id", "node_code");
CREATE INDEX "storage_nodes_organization_id_node_type_is_active_idx"
  ON "storage_nodes"("organization_id", "node_type", "is_active");
CREATE INDEX "storage_nodes_organization_id_parent_node_id_idx"
  ON "storage_nodes"("organization_id", "parent_node_id");
CREATE INDEX "storage_nodes_organization_id_entity_id_idx"
  ON "storage_nodes"("organization_id", "entity_id");

ALTER TABLE "storage_nodes"
  ADD CONSTRAINT "storage_nodes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storage_nodes"
  ADD CONSTRAINT "storage_nodes_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id") REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "storage_nodes"
  ADD CONSTRAINT "storage_nodes_organization_id_parent_node_id_parent_node_type_fkey"
  FOREIGN KEY ("organization_id", "parent_node_id", "parent_node_type")
  REFERENCES "storage_nodes"("organization_id", "id", "node_type")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "raw_material_stocks"
  ADD COLUMN "storage_node_id" TEXT;
CREATE INDEX "raw_material_stocks_organization_id_storage_node_id_idx"
  ON "raw_material_stocks"("organization_id", "storage_node_id");
ALTER TABLE "raw_material_stocks"
  ADD CONSTRAINT "raw_material_stocks_organization_id_storage_node_id_fkey"
  FOREIGN KEY ("organization_id", "storage_node_id") REFERENCES "storage_nodes"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
