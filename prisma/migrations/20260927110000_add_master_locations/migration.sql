CREATE TABLE "master_locations" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "location_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_locations_value_id_key"
    ON "master_locations"("value_id");

CREATE UNIQUE INDEX "master_locations_organization_id_location_name_key"
    ON "master_locations"("organization_id", "location_name");

CREATE INDEX "master_locations_organization_id_entity_id_idx"
    ON "master_locations"("organization_id", "entity_id");

CREATE INDEX "master_locations_organization_id_is_active_idx"
    ON "master_locations"("organization_id", "is_active");

ALTER TABLE "master_locations"
    ADD CONSTRAINT "master_locations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_locations"
    ADD CONSTRAINT "master_locations_entity_id_fkey"
    FOREIGN KEY ("entity_id") REFERENCES "master_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;