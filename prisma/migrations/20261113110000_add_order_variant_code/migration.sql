ALTER TABLE "merchandising_orders"
ADD COLUMN "variantCode" VARCHAR(100);

CREATE INDEX "merch_orders_variant_code_trgm_idx"
ON "merchandising_orders" USING GIN ("variantCode" gin_trgm_ops);
