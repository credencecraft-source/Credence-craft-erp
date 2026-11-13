CREATE TABLE "pos_counters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "counter_name" VARCHAR(150) NOT NULL,
    "sub_sub_location_id" TEXT NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_counters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_counters_org_sub_sub_location_idx"
  ON "pos_counters"("organization_id", "sub_sub_location_id");

CREATE UNIQUE INDEX "pos_counters_organization_id_id_key"
  ON "pos_counters"("organization_id", "id");

CREATE UNIQUE INDEX "pos_counters_org_name_key"
  ON "pos_counters"("organization_id", "counter_name");

ALTER TABLE "pos_counters"
  ADD CONSTRAINT "pos_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_counters"
  ADD CONSTRAINT "pos_counters_organization_id_sub_sub_location_id_fkey"
  FOREIGN KEY ("organization_id", "sub_sub_location_id")
  REFERENCES "storage_nodes"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
