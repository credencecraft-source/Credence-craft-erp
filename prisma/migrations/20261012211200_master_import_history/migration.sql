CREATE TYPE "MasterImportJobStatus" AS ENUM (
  'UPLOADED',
  'STAGED',
  'VALIDATED',
  'IMPORTING',
  'PARTIAL',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "MasterImportJobRowStatus" AS ENUM (
  'PENDING',
  'STAGED',
  'VALIDATED',
  'INVALID',
  'CORRECTED',
  'IMPORTING',
  'IMPORTED',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "master_import_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "module_key" VARCHAR(100) NOT NULL,
  "status" "MasterImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
  "uploaded_file_name" VARCHAR(255) NOT NULL,
  "uploaded_file_size" INTEGER NOT NULL,
  "encrypted_source_file" BYTEA NOT NULL,
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "successful_rows" INTEGER NOT NULL DEFAULT 0,
  "failed_rows" INTEGER NOT NULL DEFAULT 0,
  "checkpoint" VARCHAR(120),
  "created_by_user_id" TEXT NOT NULL,
  "updated_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "staged_at" TIMESTAMP(3),
  "validated_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "master_import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "master_import_jobs_uploaded_file_size_check" CHECK ("uploaded_file_size" BETWEEN 1 AND 52428800),
  CONSTRAINT "master_import_jobs_total_rows_check" CHECK ("total_rows" >= 0),
  CONSTRAINT "master_import_jobs_processed_rows_check" CHECK ("processed_rows" >= 0),
  CONSTRAINT "master_import_jobs_successful_rows_check" CHECK ("successful_rows" >= 0),
  CONSTRAINT "master_import_jobs_failed_rows_check" CHECK ("failed_rows" >= 0),
  CONSTRAINT "master_import_jobs_organization_id_id_key" UNIQUE ("organization_id", "id")
);

CREATE TABLE "master_import_job_rows" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "row_number" INTEGER NOT NULL,
  "status" "MasterImportJobRowStatus" NOT NULL DEFAULT 'PENDING',
  "checkpoint" VARCHAR(120),
  "encrypted_payload" BYTEA NOT NULL,
  "updated_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "master_import_job_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "master_import_job_rows_row_number_check" CHECK ("row_number" > 0),
  CONSTRAINT "master_import_job_rows_organization_id_job_id_row_number_key"
    UNIQUE ("organization_id", "job_id", "row_number")
);

CREATE INDEX "master_import_jobs_organization_id_created_at_idx"
  ON "master_import_jobs"("organization_id", "created_at");
CREATE INDEX "master_import_jobs_organization_id_status_created_at_idx"
  ON "master_import_jobs"("organization_id", "status", "created_at");
CREATE INDEX "master_import_jobs_organization_id_expires_at_idx"
  ON "master_import_jobs"("organization_id", "expires_at");
CREATE INDEX "master_import_job_rows_organization_id_job_id_status_row_number_idx"
  ON "master_import_job_rows"("organization_id", "job_id", "status", "row_number");

ALTER TABLE "master_import_jobs"
  ADD CONSTRAINT "master_import_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_import_job_rows"
  ADD CONSTRAINT "master_import_job_rows_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "master_import_job_rows_organization_id_job_id_fkey"
  FOREIGN KEY ("organization_id", "job_id")
  REFERENCES "master_import_jobs"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
