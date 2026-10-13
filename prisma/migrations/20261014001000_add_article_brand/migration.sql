ALTER TABLE "master_articles"
ADD COLUMN "brand_id" TEXT;

CREATE INDEX "master_articles_organization_id_brand_id_idx"
ON "master_articles"("organization_id", "brand_id");

ALTER TABLE "master_articles"
ADD CONSTRAINT "master_articles_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "master_brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
