ALTER TABLE "master_import_job_rows"
  ADD COLUMN "plan_number" INTEGER,
  ADD CONSTRAINT "master_import_job_rows_plan_number_check"
    CHECK ("plan_number" IS NULL OR "plan_number" > 0);

UPDATE "master_import_job_rows"
SET "plan_number" = FLOOR(("row_number" - 1) / 100.0)::INTEGER + 1
WHERE "status" IN ('VALIDATED', 'IMPORTED');

ALTER TABLE "master_import_jobs"
  ADD COLUMN "next_plan_number" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "master_import_jobs_next_plan_number_check"
    CHECK ("next_plan_number" > 0);

UPDATE "master_import_jobs" AS jobs
SET "next_plan_number" = COALESCE((
  SELECT MAX(rows."plan_number") + 1
  FROM "master_import_job_rows" AS rows
  WHERE rows."organization_id" = jobs."organization_id"
    AND rows."job_id" = jobs."id"
), 1);

CREATE INDEX "master_import_job_rows_organization_id_job_id_plan_number_status_row_number_idx"
  ON "master_import_job_rows"("organization_id", "job_id", "plan_number", "status", "row_number");
