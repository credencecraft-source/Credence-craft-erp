ALTER TABLE "master_articles"
ADD COLUMN "product_master_id" TEXT,
ADD COLUMN "category_id" TEXT,
ADD COLUMN "sub_category_id" TEXT,
ADD COLUMN "size_group_id" TEXT,
ADD COLUMN "default_price" DECIMAL(18,4);

CREATE TABLE "master_article_variants" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "color_id" TEXT NOT NULL,
    "variant" VARCHAR(255) NOT NULL,
    "variant_code" VARCHAR(100),
    "sku" VARCHAR(100),
    "price_override" DECIMAL(18,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_article_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_article_variants_value_id_key"
ON "master_article_variants"("value_id");

CREATE UNIQUE INDEX "master_article_variants_organization_id_article_id_color_id_key"
ON "master_article_variants"("organization_id", "article_id", "color_id");

CREATE UNIQUE INDEX "master_article_variants_organization_id_variant_code_key"
ON "master_article_variants"("organization_id", "variant_code");

CREATE UNIQUE INDEX "master_article_variants_organization_id_sku_key"
ON "master_article_variants"("organization_id", "sku");

CREATE INDEX "master_article_variants_organization_id_article_id_is_active_idx"
ON "master_article_variants"("organization_id", "article_id", "is_active");

CREATE INDEX "master_articles_organization_id_product_master_id_idx"
ON "master_articles"("organization_id", "product_master_id");

CREATE INDEX "master_articles_organization_id_category_id_idx"
ON "master_articles"("organization_id", "category_id");

CREATE INDEX "master_articles_organization_id_sub_category_id_idx"
ON "master_articles"("organization_id", "sub_category_id");

CREATE INDEX "master_articles_organization_id_size_group_id_idx"
ON "master_articles"("organization_id", "size_group_id");

ALTER TABLE "master_articles"
ADD CONSTRAINT "master_articles_product_master_id_fkey"
FOREIGN KEY ("product_master_id") REFERENCES "master_products"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "master_articles_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "master_categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "master_articles_sub_category_id_fkey"
FOREIGN KEY ("sub_category_id") REFERENCES "master_sub_categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "master_articles_size_group_id_fkey"
FOREIGN KEY ("size_group_id") REFERENCES "master_size_groups"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "master_article_variants"
ADD CONSTRAINT "master_article_variants_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_article_variants_article_id_fkey"
FOREIGN KEY ("article_id") REFERENCES "master_articles"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_article_variants_color_id_fkey"
FOREIGN KEY ("color_id") REFERENCES "master_colors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "master_article_sizes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_article_sizes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_article_sizes_organization_id_article_id_size_id_key"
ON "master_article_sizes"("organization_id", "article_id", "size_id");

CREATE INDEX "master_article_sizes_organization_id_article_id_idx"
ON "master_article_sizes"("organization_id", "article_id");

ALTER TABLE "master_article_sizes"
ADD CONSTRAINT "master_article_sizes_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_article_sizes_article_id_fkey"
FOREIGN KEY ("article_id") REFERENCES "master_articles"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "master_article_sizes_size_id_fkey"
FOREIGN KEY ("size_id") REFERENCES "master_sizes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "audit_master_article_variants"
AFTER INSERT OR UPDATE OR DELETE ON "master_article_variants"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();

CREATE TRIGGER "audit_master_article_sizes"
AFTER INSERT OR UPDATE OR DELETE ON "master_article_sizes"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
