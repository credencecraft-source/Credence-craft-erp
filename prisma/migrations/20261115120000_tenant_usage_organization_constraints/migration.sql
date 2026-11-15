ALTER TABLE "tenant_usage_logs"
  ADD CONSTRAINT "tenant_usage_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tenant_usage_daily"
  ADD CONSTRAINT "tenant_usage_daily_tenant_id_fkey"
  FOREIGN KEY ("tenant_id")
  REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
