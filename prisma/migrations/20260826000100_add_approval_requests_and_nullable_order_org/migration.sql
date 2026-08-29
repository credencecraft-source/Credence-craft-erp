-- Existing orders are preserved. Legacy rows without ownership remain unreadable
-- until an operator performs an explicit, verified organization backfill.
ALTER TABLE "merchandising_orders"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "merchandising_orders"
  ALTER COLUMN "organizationId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "merchandising_orders_organizationId_idx"
  ON "merchandising_orders"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchandising_orders_organizationId_fkey'
  ) THEN
    ALTER TABLE "merchandising_orders"
      ADD CONSTRAINT "merchandising_orders_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE "approval_requests" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "module_key" VARCHAR(100) NOT NULL,
  "module_name" VARCHAR(255) NOT NULL,
  "entity_type" VARCHAR(100) NOT NULL,
  "entity_key" VARCHAR(255) NOT NULL,
  "entity_label" VARCHAR(255) NOT NULL,
  "entity_ref_id" TEXT,
  "requested_by" TEXT,
  "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_requests_request_id_key" UNIQUE ("request_id"),
  CONSTRAINT "approval_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "approval_requests_organization_id_status_idx"
  ON "approval_requests"("organization_id", "status");
CREATE INDEX "approval_requests_organization_id_entity_ref_id_idx"
  ON "approval_requests"("organization_id", "entity_ref_id");
