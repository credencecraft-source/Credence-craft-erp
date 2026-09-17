ALTER TABLE "master_articles"
ADD COLUMN "article_code" VARCHAR(100),
ADD COLUMN "design_by" VARCHAR(255),
ADD COLUMN "designed_date" TIMESTAMP(3);

CREATE UNIQUE INDEX "master_articles_organization_id_article_code_key"
ON "master_articles"("organization_id", "article_code");
