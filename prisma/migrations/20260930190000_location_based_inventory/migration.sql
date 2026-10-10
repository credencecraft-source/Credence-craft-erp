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
  ADD COLUMN "entity_id" TEXT,
  ADD COLUMN "location_id" TEXT;

ALTER TABLE "finished_goods_stocks"
  ADD COLUMN "entity_id" TEXT,
  ADD COLUMN "location_id" TEXT;

UPDATE "raw_material_stocks" AS stock
SET "entity_id" = location."entity_id",
    "location_id" = location."id"
FROM "master_locations" AS location
WHERE stock."organization_id" = location."organization_id"
  AND stock."warehouse" = location."location_name";

UPDATE "finished_goods_stocks" AS stock
SET "entity_id" = location."entity_id",
    "location_id" = location."id"
FROM "master_locations" AS location
WHERE stock."organization_id" = location."organization_id"
  AND stock."warehouse" = location."location_name";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "inventory_receipts"
    WHERE "entity_id" IS NULL OR "location_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot remove inventory receipt warehouse values: map every receipt to an organization Location first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "raw_material_stocks"
    WHERE "entity_id" IS NULL OR "location_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate raw material stock: map every stock warehouse to an organization Location first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "finished_goods_stocks"
    WHERE "entity_id" IS NULL OR "location_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate finished goods stock: map every stock warehouse to an organization Location first.';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "finished_goods_sku_stocks") THEN
    RAISE EXCEPTION 'Cannot migrate Finished Goods SKU stock without a verified Location assignment for every existing record.';
  END IF;
END $$;

ALTER TABLE "finished_goods_sku_stocks"
  ADD COLUMN "entity_id" TEXT NOT NULL,
  ADD COLUMN "location_id" TEXT NOT NULL;

DROP INDEX "raw_material_stocks_organization_id_raw_material_warehouse_key";
DROP INDEX "raw_material_stocks_organization_id_warehouse_idx";
DROP INDEX "finished_goods_stocks_organization_id_style_name_size_warehouse_key";
DROP INDEX "finished_goods_stocks_organization_id_warehouse_idx";

ALTER TABLE "inventory_receipts"
  ALTER COLUMN "entity_id" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL,
  DROP COLUMN "warehouse";

ALTER TABLE "raw_material_stocks"
  ALTER COLUMN "entity_id" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL,
  DROP COLUMN "warehouse";

ALTER TABLE "finished_goods_stocks"
  ALTER COLUMN "entity_id" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL,
  DROP COLUMN "warehouse";

ALTER TABLE "raw_material_stocks"
  ADD CONSTRAINT "raw_material_stocks_organization_id_entity_id_location_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id", "location_id")
    REFERENCES "master_locations"("organization_id", "entity_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_goods_stocks"
  ADD CONSTRAINT "finished_goods_stocks_organization_id_entity_id_location_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id", "location_id")
    REFERENCES "master_locations"("organization_id", "entity_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_goods_sku_stocks"
  ADD CONSTRAINT "finished_goods_sku_stocks_organization_id_entity_id_location_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id", "location_id")
    REFERENCES "master_locations"("organization_id", "entity_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "raw_material_stocks_organization_id_raw_material_location_id_key"
  ON "raw_material_stocks"("organization_id", "raw_material", "location_id");
CREATE INDEX "raw_material_stocks_organization_id_location_id_idx"
  ON "raw_material_stocks"("organization_id", "location_id");
CREATE UNIQUE INDEX "finished_goods_stocks_organization_id_style_name_size_location_id_key"
  ON "finished_goods_stocks"("organization_id", "style_name", "size", "location_id");
CREATE INDEX "finished_goods_stocks_organization_id_location_id_idx"
  ON "finished_goods_stocks"("organization_id", "location_id");
CREATE INDEX "finished_goods_sku_stocks_organization_id_location_id_idx"
  ON "finished_goods_sku_stocks"("organization_id", "location_id");