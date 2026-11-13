ALTER TABLE "merchandising_orders"
  ADD COLUMN IF NOT EXISTS "sku_code" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "barcode" VARCHAR(150);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "merchandising_orders"
    WHERE "sku_code" IS NOT NULL
    GROUP BY "organization_id", "sku_code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique order SKU index: duplicate organization-scoped SKU values exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "merchandising_orders"
    WHERE "barcode" IS NOT NULL
    GROUP BY "organization_id", "barcode"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique order barcode index: duplicate organization-scoped barcode values exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "merchandising_orders_organization_id_sku_code_key"
  ON "merchandising_orders"("organization_id", "sku_code");

CREATE UNIQUE INDEX IF NOT EXISTS "merchandising_orders_organization_id_barcode_key"
  ON "merchandising_orders"("organization_id", "barcode");
