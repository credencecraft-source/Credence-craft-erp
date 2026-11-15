ALTER TABLE "inventory_receipts"
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse" VARCHAR(150);

ALTER TABLE "inventory_receipts"
  ALTER COLUMN "entity_id" DROP NOT NULL,
  ALTER COLUMN "location_id" DROP NOT NULL,
  ALTER COLUMN "warehouse" DROP NOT NULL;

UPDATE "inventory_receipts" AS receipt
SET "entity_id" = location."entity_id",
    "location_id" = location."id"
FROM "master_locations" AS location
WHERE receipt."organization_id" = location."organization_id"
  AND (
    receipt."location_id" = location."id"
    OR (receipt."location_id" IS NULL AND receipt."warehouse" = location."location_name")
  )
  AND (receipt."entity_id" IS NULL OR receipt."location_id" IS NULL);

ALTER TABLE "raw_material_stocks"
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse" VARCHAR(150);

ALTER TABLE "raw_material_stocks"
  ALTER COLUMN "entity_id" DROP NOT NULL,
  ALTER COLUMN "location_id" DROP NOT NULL,
  ALTER COLUMN "warehouse" DROP NOT NULL;

ALTER TABLE "finished_goods_stocks"
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse" VARCHAR(150);

ALTER TABLE "finished_goods_stocks"
  ALTER COLUMN "entity_id" DROP NOT NULL,
  ALTER COLUMN "location_id" DROP NOT NULL,
  ALTER COLUMN "warehouse" DROP NOT NULL;

UPDATE "raw_material_stocks" AS stock
SET "entity_id" = location."entity_id",
    "location_id" = location."id"
FROM "master_locations" AS location
WHERE stock."organization_id" = location."organization_id"
  AND stock."warehouse" = location."location_name"
  AND (stock."entity_id" IS NULL OR stock."location_id" IS NULL);

UPDATE "finished_goods_stocks" AS stock
SET "entity_id" = location."entity_id",
    "location_id" = location."id"
FROM "master_locations" AS location
WHERE stock."organization_id" = location."organization_id"
  AND stock."warehouse" = location."location_name"
  AND (stock."entity_id" IS NULL OR stock."location_id" IS NULL);

ALTER TABLE "finished_goods_sku_stocks"
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "location_id" TEXT;

ALTER TABLE "finished_goods_sku_stocks"
  ALTER COLUMN "entity_id" DROP NOT NULL,
  ALTER COLUMN "location_id" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'raw_material_stocks_organization_id_entity_id_location_id_fkey'
      AND conrelid = 'raw_material_stocks'::regclass
  ) THEN
    ALTER TABLE "raw_material_stocks"
      ADD CONSTRAINT "raw_material_stocks_organization_id_entity_id_location_id_fkey"
      FOREIGN KEY ("organization_id", "entity_id", "location_id")
      REFERENCES "master_locations"("organization_id", "entity_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finished_goods_stocks_organization_id_entity_id_location_id_fkey'
      AND conrelid = 'finished_goods_stocks'::regclass
  ) THEN
    ALTER TABLE "finished_goods_stocks"
      ADD CONSTRAINT "finished_goods_stocks_organization_id_entity_id_location_id_fkey"
      FOREIGN KEY ("organization_id", "entity_id", "location_id")
      REFERENCES "master_locations"("organization_id", "entity_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'finished_goods_sku_stocks_organization_id_entity_id_location_id_fkey'
      AND conrelid = 'finished_goods_sku_stocks'::regclass
  ) THEN
    ALTER TABLE "finished_goods_sku_stocks"
      ADD CONSTRAINT "finished_goods_sku_stocks_organization_id_entity_id_location_id_fkey"
      FOREIGN KEY ("organization_id", "entity_id", "location_id")
      REFERENCES "master_locations"("organization_id", "entity_id", "id")
      ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "raw_material_stocks_organization_id_raw_material_location_id_key"
  ON "raw_material_stocks"("organization_id", "raw_material", "location_id");
CREATE INDEX IF NOT EXISTS "raw_material_stocks_organization_id_location_id_idx"
  ON "raw_material_stocks"("organization_id", "location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "finished_goods_stocks_organization_id_style_name_size_location_id_key"
  ON "finished_goods_stocks"("organization_id", "style_name", "size", "location_id");
CREATE INDEX IF NOT EXISTS "finished_goods_stocks_organization_id_location_id_idx"
  ON "finished_goods_stocks"("organization_id", "location_id");
CREATE INDEX IF NOT EXISTS "finished_goods_sku_stocks_organization_id_location_id_idx"
  ON "finished_goods_sku_stocks"("organization_id", "location_id");