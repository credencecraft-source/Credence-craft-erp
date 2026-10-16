ALTER TABLE "master_import_job_rows"
ADD COLUMN "article_group_key" VARCHAR(64);

CREATE INDEX "master_import_rows_article_group_idx"
ON "master_import_job_rows" (
  "organization_id",
  "job_id",
  "article_group_key",
  "status",
  "row_number"
);
