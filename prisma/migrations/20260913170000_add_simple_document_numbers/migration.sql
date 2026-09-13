ALTER TABLE "grouped_purchase_orders" ADD COLUMN "display_no" INTEGER;
ALTER TABLE "master_purchase_orders" ADD COLUMN "display_no" INTEGER;
ALTER TABLE "purchase_orders" ADD COLUMN "display_no" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS display_no
  FROM "grouped_purchase_orders"
)
UPDATE "grouped_purchase_orders" AS target
SET "display_no" = numbered.display_no
FROM numbered
WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS display_no
  FROM "master_purchase_orders"
)
UPDATE "master_purchase_orders" AS target
SET "display_no" = numbered.display_no
FROM numbered
WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS display_no
  FROM "purchase_orders"
)
UPDATE "purchase_orders" AS target
SET "display_no" = numbered.display_no
FROM numbered
WHERE target.id = numbered.id;

CREATE UNIQUE INDEX "grouped_purchase_orders_organization_id_display_no_key"
  ON "grouped_purchase_orders"("organization_id", "display_no");
CREATE UNIQUE INDEX "master_purchase_orders_organization_id_display_no_key"
  ON "master_purchase_orders"("organization_id", "display_no");
CREATE UNIQUE INDEX "purchase_orders_organization_id_display_no_key"
  ON "purchase_orders"("organization_id", "display_no");
