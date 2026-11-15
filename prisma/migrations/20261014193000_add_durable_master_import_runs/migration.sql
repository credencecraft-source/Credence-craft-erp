CREATE TYPE "MasterImportRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "master_import_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "operation" VARCHAR(40) NOT NULL,
  "status" "MasterImportRunStatus" NOT NULL DEFAULT 'QUEUED',
  "input" JSONB NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMP(3),
  "last_error" VARCHAR(1000),
  "requested_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "master_import_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "master_import_runs_progress_check" CHECK ("progress" >= 0),
  CONSTRAINT "master_import_runs_total_check" CHECK ("total" >= 0),
  CONSTRAINT "master_import_runs_attempt_count_check" CHECK ("attempt_count" >= 0),
  CONSTRAINT "master_import_runs_organization_id_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "master_import_runs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "master_import_runs_organization_id_job_id_fkey"
    FOREIGN KEY ("organization_id", "job_id")
    REFERENCES "master_import_jobs"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "master_import_runs_status_lease_expires_at_created_at_idx"
  ON "master_import_runs"("status", "lease_expires_at", "created_at");
CREATE INDEX "master_import_runs_organization_id_job_id_created_at_idx"
  ON "master_import_runs"("organization_id", "job_id", "created_at");
