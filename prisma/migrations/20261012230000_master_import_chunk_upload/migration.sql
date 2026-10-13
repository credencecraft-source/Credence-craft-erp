ALTER TYPE "MasterImportJobStatus" ADD VALUE 'UPLOADING' BEFORE 'UPLOADED';

ALTER TABLE "master_import_jobs"
  ADD COLUMN "file_chunk_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "uploaded_file_chunks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "source_sha256" VARCHAR(64);

UPDATE "master_import_jobs"
SET "source_sha256" = repeat('0', 64)
WHERE "source_sha256" IS NULL;

ALTER TABLE "master_import_jobs"
  ALTER COLUMN "source_sha256" SET NOT NULL,
  ADD CONSTRAINT "master_import_jobs_file_chunk_count_check"
    CHECK ("file_chunk_count" >= 0),
  ADD CONSTRAINT "master_import_jobs_uploaded_file_chunks_check"
    CHECK ("uploaded_file_chunks" >= 0 AND "uploaded_file_chunks" <= "file_chunk_count");

CREATE TABLE "master_import_job_file_chunks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "encrypted_data" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "master_import_job_file_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "master_import_job_file_chunks_chunk_index_check" CHECK ("chunk_index" >= 0),
  CONSTRAINT "master_import_job_file_chunks_byte_size_check" CHECK ("byte_size" BETWEEN 1 AND 1048576),
  CONSTRAINT "master_import_job_file_chunks_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "master_import_job_file_chunks_organization_id_job_id_chunk_index_key"
    UNIQUE ("organization_id", "job_id", "chunk_index")
);

ALTER TABLE "master_import_job_file_chunks"
  ADD CONSTRAINT "master_import_job_file_chunks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "master_import_job_file_chunks_organization_id_job_id_fkey"
    FOREIGN KEY ("organization_id", "job_id")
    REFERENCES "master_import_jobs"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
