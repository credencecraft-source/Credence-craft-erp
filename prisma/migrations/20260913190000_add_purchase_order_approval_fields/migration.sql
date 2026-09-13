ALTER TABLE "purchase_orders"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD COLUMN "approved_by" VARCHAR(255),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "rejection_reason" VARCHAR(500),
  ADD COLUMN "shared_at" TIMESTAMP(3);