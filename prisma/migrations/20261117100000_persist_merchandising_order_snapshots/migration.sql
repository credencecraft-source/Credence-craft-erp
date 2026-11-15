ALTER TABLE "merchandising_orders"
RENAME COLUMN "variantCode" TO "variant_code";

ALTER TABLE "merchandising_orders"
ADD COLUMN "article_code" VARCHAR(100),
ADD COLUMN "master_article_id" TEXT,
ADD COLUMN "master_variant_id" TEXT;

CREATE INDEX "merch_orders_article_code_trgm_idx"
ON "merchandising_orders" USING GIN ("article_code" gin_trgm_ops);

CREATE INDEX "merch_orders_org_master_article_idx"
ON "merchandising_orders" ("organization_id", "master_article_id");

CREATE INDEX "merch_orders_org_master_variant_idx"
ON "merchandising_orders" ("organization_id", "master_variant_id");

ALTER TABLE "master_article_variants"
ADD CONSTRAINT "master_article_variants_org_article_id_id_key"
UNIQUE ("organization_id", "article_id", "id");

ALTER TABLE "merchandising_orders"
ADD CONSTRAINT "merch_orders_org_master_article_fkey"
FOREIGN KEY ("organization_id", "master_article_id")
REFERENCES "master_articles" ("organization_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "merchandising_orders"
ADD CONSTRAINT "merch_orders_org_master_variant_fkey"
FOREIGN KEY ("organization_id", "master_article_id", "master_variant_id")
REFERENCES "master_article_variants" ("organization_id", "article_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
