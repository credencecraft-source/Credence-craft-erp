ALTER TABLE "master_categories"
ADD COLUMN "product_master_id" TEXT;

CREATE INDEX "master_categories_organization_id_product_master_id_idx"
ON "master_categories"("organization_id", "product_master_id");

ALTER TABLE "master_categories"
ADD CONSTRAINT "master_categories_product_master_id_fkey"
FOREIGN KEY ("product_master_id") REFERENCES "master_products"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
