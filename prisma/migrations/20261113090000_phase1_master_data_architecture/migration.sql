CREATE TABLE "divisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "division_name" VARCHAR(255) NOT NULL,
  "division_code" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "divisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "divisions_entity_code_key" UNIQUE ("organization_id", "entity_id", "division_code"),
  CONSTRAINT "divisions_organization_entity_key" UNIQUE ("organization_id", "entity_id"),
  CONSTRAINT "divisions_organization_id_key" UNIQUE ("organization_id", "id")
);

CREATE INDEX "divisions_organization_id_is_active_idx"
  ON "divisions"("organization_id", "is_active");

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id") REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "divisions" (
  "id", "organization_id", "entity_id", "division_name", "division_code", "description", "updated_at"
)
SELECT
  'division-' || entity."id",
  entity."organization_id",
  entity."id",
  left(entity."entity_name", 245) || ' Division',
  'DEFAULT',
  'Default Division created during the master-data hierarchy migration.',
  CURRENT_TIMESTAMP
FROM "master_entities" AS entity
WHERE NOT EXISTS (
  SELECT 1
  FROM "divisions" AS division
  WHERE division."organization_id" = entity."organization_id"
    AND division."entity_id" = entity."id"
);

CREATE FUNCTION create_default_division_for_entity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "divisions" (
    "id", "organization_id", "entity_id", "division_name", "division_code", "description", "updated_at"
  )
  VALUES (
    'division-' || NEW."id",
    NEW."organization_id",
    NEW."id",
    left(NEW."entity_name", 245) || ' Division',
    'DEFAULT',
    'Default Division created for this Entity.',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organization_id", "entity_id") DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "master_entities_create_default_division"
AFTER INSERT ON "master_entities"
FOR EACH ROW
EXECUTE FUNCTION create_default_division_for_entity();

CREATE FUNCTION enforce_entity_division()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  checked_organization_id TEXT;
  checked_entity_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'master_entities' THEN
    checked_organization_id := NEW."organization_id";
    checked_entity_id := NEW."id";
  ELSE
    checked_organization_id := OLD."organization_id";
    checked_entity_id := OLD."entity_id";
  END IF;

  IF EXISTS (
    SELECT 1 FROM "master_entities"
    WHERE "organization_id" = checked_organization_id AND "id" = checked_entity_id
  ) AND NOT EXISTS (
    SELECT 1 FROM "divisions"
    WHERE "organization_id" = checked_organization_id AND "entity_id" = checked_entity_id
  ) THEN
    RAISE EXCEPTION 'Every Entity must have exactly one Division.';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "master_entities_require_division"
AFTER INSERT OR UPDATE ON "master_entities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_entity_division();

CREATE CONSTRAINT TRIGGER "divisions_preserve_entity_division"
AFTER DELETE OR UPDATE ON "divisions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_entity_division();

CREATE TABLE "entity_gst_registrations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "gstin" VARCHAR(15) NOT NULL,
  "registration_state" VARCHAR(100) NOT NULL,
  "registration_type" VARCHAR(40) NOT NULL DEFAULT 'REGULAR',
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "entity_gst_registrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entity_gst_registrations_organization_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "entity_gst_registrations_organization_gstin_effective_key"
    UNIQUE ("organization_id", "gstin", "effective_from"),
  CONSTRAINT "entity_gst_registrations_effective_dates_check"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "entity_gst_registrations_gstin_format_check"
    CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);

CREATE INDEX "entity_gst_registrations_organization_entity_active_from_idx"
  ON "entity_gst_registrations"("organization_id", "entity_id", "is_active", "effective_from");

ALTER TABLE "entity_gst_registrations"
  ADD CONSTRAINT "entity_gst_registrations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entity_gst_registrations"
  ADD CONSTRAINT "entity_gst_registrations_organization_id_entity_id_fkey"
  FOREIGN KEY ("organization_id", "entity_id") REFERENCES "master_entities"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "storage_nodes"
  ADD COLUMN "master_location_id" TEXT;

CREATE UNIQUE INDEX "storage_nodes_organization_entity_master_location_key"
  ON "storage_nodes"("organization_id", "entity_id", "master_location_id");
ALTER TABLE "storage_nodes"
  ADD CONSTRAINT "storage_nodes_organization_entity_location_fkey"
  FOREIGN KEY ("organization_id", "entity_id", "master_location_id")
  REFERENCES "master_locations"("organization_id", "entity_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "master_locations"
  ADD COLUMN "division_id" TEXT;

UPDATE "master_locations" AS location
SET "division_id" = division."id"
FROM "divisions" AS division
WHERE division."organization_id" = location."organization_id"
  AND division."entity_id" = location."entity_id";

ALTER TABLE "master_locations"
  ALTER COLUMN "division_id" SET NOT NULL;

CREATE INDEX "master_locations_organization_division_active_idx"
  ON "master_locations"("organization_id", "division_id", "is_active");

ALTER TABLE "divisions"
  ADD CONSTRAINT "divisions_organization_entity_id_key" UNIQUE ("organization_id", "entity_id", "id");

ALTER TABLE "master_locations"
  ADD CONSTRAINT "master_locations_organization_entity_division_fkey"
  FOREIGN KEY ("organization_id", "entity_id", "division_id")
  REFERENCES "divisions"("organization_id", "entity_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "storage_nodes"
  DROP CONSTRAINT "storage_nodes_parent_rules_check";
ALTER TABLE "storage_nodes"
  ADD CONSTRAINT "storage_nodes_parent_rules_check" CHECK (
    ("node_type" = 'LOCATION_SITE' AND "parent_node_id" IS NULL AND "parent_node_type" IS NULL AND "entity_id" IS NOT NULL)
    OR ("node_type" = 'WAREHOUSE' AND "parent_node_id" IS NOT NULL AND "parent_node_type" = 'LOCATION_SITE' AND "entity_id" IS NULL AND "master_location_id" IS NULL)
    OR ("node_type" = 'SUB_STORE' AND "parent_node_id" IS NOT NULL AND "parent_node_type" IN ('LOCATION_SITE', 'WAREHOUSE') AND "entity_id" IS NULL AND "master_location_id" IS NULL)
    OR ("node_type" = 'RACK' AND "parent_node_id" IS NOT NULL AND "parent_node_type" IN ('LOCATION_SITE', 'WAREHOUSE', 'SUB_STORE') AND "entity_id" IS NULL AND "master_location_id" IS NULL)
    OR ("node_type" = 'BIN' AND "parent_node_id" IS NOT NULL AND "parent_node_type" IN ('LOCATION_SITE', 'WAREHOUSE', 'SUB_STORE', 'RACK') AND "entity_id" IS NULL AND "master_location_id" IS NULL)
  );
