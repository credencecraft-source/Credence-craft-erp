ALTER TABLE "finished_goods_sku_stocks" ADD COLUMN "barcode" VARCHAR(150);

CREATE UNIQUE INDEX "finished_goods_sku_stocks_organization_id_barcode_key"
ON "finished_goods_sku_stocks"("organization_id", "barcode");