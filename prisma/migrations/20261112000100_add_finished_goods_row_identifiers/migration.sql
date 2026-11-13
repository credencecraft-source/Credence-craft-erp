ALTER TABLE "finished_goods_size_wise"
  ADD COLUMN "sku_code" VARCHAR(100),
  ADD COLUMN "barcode" VARCHAR(150);

CREATE INDEX "finished_goods_size_wise_sku_code_idx"
  ON "finished_goods_size_wise" ("sku_code");

CREATE INDEX "finished_goods_size_wise_barcode_idx"
  ON "finished_goods_size_wise" ("barcode");
