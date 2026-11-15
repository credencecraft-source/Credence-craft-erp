CREATE OR REPLACE FUNCTION create_default_division_for_entity()
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
  ON CONFLICT ("organization_id", "entity_id", "division_code") DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER TABLE "divisions"
  DROP CONSTRAINT IF EXISTS "divisions_organization_entity_key";

CREATE OR REPLACE FUNCTION enforce_entity_division()
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
    RAISE EXCEPTION 'Every Entity must have at least one Division.';
  END IF;

  RETURN NULL;
END;
$$;

ALTER TABLE "master_entities"
  ADD COLUMN IF NOT EXISTS "gstin" VARCHAR(15),
  ADD COLUMN IF NOT EXISTS "registered_address_line_1" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "registered_address_line_2" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "registered_city" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "registered_state" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "registered_postal_code" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "registered_country" VARCHAR(100);

UPDATE "master_entities" AS entity
SET
  "gstin" = registration."gstin",
  "registered_state" = registration."registration_state",
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("organization_id", "entity_id")
    "organization_id",
    "entity_id",
    "gstin",
    "registration_state"
  FROM "entity_gst_registrations"
  WHERE "is_active" = true
    AND "effective_from" <= CURRENT_DATE
    AND ("effective_to" IS NULL OR "effective_to" >= CURRENT_DATE)
  ORDER BY "organization_id", "entity_id", "effective_from" DESC, "created_at" DESC, "id" DESC
) AS registration
WHERE entity."organization_id" = registration."organization_id"
  AND entity."id" = registration."entity_id"
  AND entity."gstin" IS NULL;
