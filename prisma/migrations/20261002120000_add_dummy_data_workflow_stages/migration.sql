ALTER TABLE "organization_dummy_data_batches"
  ALTER COLUMN "status" TYPE VARCHAR(40),
  ADD COLUMN "stage" VARCHAR(40) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "checkpoint" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "last_error" VARCHAR(1000);

ALTER TABLE "approval_requests"
  ADD COLUMN "requested_by_user_id" TEXT,
  ADD COLUMN "reviewed_by_user_id" TEXT;

ALTER TABLE "grouped_purchase_orders"
  ADD COLUMN "submitted_by_user_id" TEXT,
  ADD COLUMN "approved_by_user_id" TEXT;