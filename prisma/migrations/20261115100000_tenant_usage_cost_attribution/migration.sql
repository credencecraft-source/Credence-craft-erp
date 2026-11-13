CREATE TABLE "tenant_usage_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "endpoint" VARCHAR(255) NOT NULL,
  "http_method" VARCHAR(10) NOT NULL,
  "execution_ms" INTEGER NOT NULL,
  "egress_bytes" BIGINT,
  "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_usage_logs_tenant_id_timestamp_idx"
  ON "tenant_usage_logs"("tenant_id", "timestamp");

CREATE TABLE "tenant_usage_daily" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "total_requests" INTEGER NOT NULL DEFAULT 0,
  "total_execution_ms" BIGINT NOT NULL DEFAULT 0,
  "total_egress_bytes" BIGINT NOT NULL DEFAULT 0,
  "db_storage_bytes" BIGINT NOT NULL DEFAULT 0,
  "media_storage_bytes" BIGINT NOT NULL DEFAULT 0,
  "neon_compute_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "db_storage_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "vercel_invocation_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "egress_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "media_storage_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "estimated_cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "tenant_usage_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_usage_daily_tenant_id_date_key"
  ON "tenant_usage_daily"("tenant_id", "date");
