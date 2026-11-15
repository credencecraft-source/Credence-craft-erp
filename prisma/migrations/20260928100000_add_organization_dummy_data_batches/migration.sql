CREATE TABLE "organization_dummy_data_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
    "sample_order_id" TEXT,
    "master_record_ids" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_dummy_data_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_dummy_data_batches_organization_id_key"
ON "organization_dummy_data_batches"("organization_id");

CREATE UNIQUE INDEX "organization_dummy_data_batches_sample_order_id_key"
ON "organization_dummy_data_batches"("sample_order_id");

CREATE INDEX "organization_dummy_data_batches_organization_id_status_idx"
ON "organization_dummy_data_batches"("organization_id", "status");

ALTER TABLE "organization_dummy_data_batches"
ADD CONSTRAINT "organization_dummy_data_batches_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;