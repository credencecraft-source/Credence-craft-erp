CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "merch_orders_order_no_trgm_idx"
  ON "merchandising_orders" USING GIN ("orderNo" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "merch_orders_article_trgm_idx"
  ON "merchandising_orders" USING GIN ("article" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "merch_orders_style_name_trgm_idx"
  ON "merchandising_orders" USING GIN ("styleName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "master_articles_article_code_trgm_idx"
  ON "master_articles" USING GIN ("article_code" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "master_article_variants_variant_code_trgm_idx"
  ON "master_article_variants" USING GIN ("variant_code" gin_trgm_ops);
