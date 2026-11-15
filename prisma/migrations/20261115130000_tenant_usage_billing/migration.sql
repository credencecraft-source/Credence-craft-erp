CREATE TABLE "tenant_usage_bills" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "billing_month" DATE NOT NULL,
  "bill_name" VARCHAR(100) NOT NULL,
  "organization_name" VARCHAR(255) NOT NULL,
  "total_requests" INTEGER NOT NULL,
  "total_execution_ms" BIGINT NOT NULL,
  "total_egress_bytes" BIGINT NOT NULL,
  "db_storage_bytes" BIGINT NOT NULL,
  "media_storage_bytes" BIGINT NOT NULL,
  "neon_compute_cost_usd" DECIMAL(14,8) NOT NULL,
  "db_storage_cost_usd" DECIMAL(14,8) NOT NULL,
  "vercel_invocation_cost_usd" DECIMAL(14,8) NOT NULL,
  "egress_cost_usd" DECIMAL(14,8) NOT NULL,
  "media_storage_cost_usd" DECIMAL(14,8) NOT NULL,
  "estimated_cost_usd" DECIMAL(14,8) NOT NULL,
  "billed_by_id" TEXT,
  "billed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_usage_bills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_usage_bills_tenant_id_billing_month_key"
  ON "tenant_usage_bills"("tenant_id", "billing_month");
CREATE INDEX "tenant_usage_bills_billing_month_idx"
  ON "tenant_usage_bills"("billing_month");

ALTER TABLE "tenant_usage_bills"
  ADD CONSTRAINT "tenant_usage_bills_tenant_id_fkey"
  FOREIGN KEY ("tenant_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_usage_bills"
  ADD CONSTRAINT "tenant_usage_bills_billed_by_id_fkey"
  FOREIGN KEY ("billed_by_id")
  REFERENCES "workspace_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
