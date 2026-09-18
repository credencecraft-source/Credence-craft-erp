ALTER TABLE "finished_goods_sku_stocks" ADD COLUMN "sku_code" VARCHAR(50);

WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organization_id" ORDER BY "added_time" ASC, "id" ASC) AS row_number
    FROM "finished_goods_sku_stocks"
)
UPDATE "finished_goods_sku_stocks" AS stock
SET "sku_code" = 'SKU' || numbered.row_number
FROM numbered
WHERE stock."id" = numbered."id";

CREATE UNIQUE INDEX "finished_goods_sku_stocks_organization_id_sku_code_key"
ON "finished_goods_sku_stocks"("organization_id", "sku_code");