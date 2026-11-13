CREATE TABLE "platform_migration_audit_logs" (
    "id" TEXT NOT NULL,
    "task_id" VARCHAR(120) NOT NULL,
    "task_name" VARCHAR(200) NOT NULL,
    "organization_id" TEXT NOT NULL,
    "executed_by" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_skipped" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_migration_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_migration_audit_logs_status_check"
      CHECK ("status" IN ('SUCCESS', 'PARTIAL', 'FAILED')),
    CONSTRAINT "platform_migration_audit_logs_records_processed_check"
      CHECK ("records_processed" >= 0),
    CONSTRAINT "platform_migration_audit_logs_records_skipped_check"
      CHECK ("records_skipped" >= 0)
);

CREATE INDEX "platform_migration_audit_logs_org_task_created_idx"
  ON "platform_migration_audit_logs"("organization_id", "task_id", "created_at" DESC);

CREATE INDEX "platform_migration_audit_logs_actor_created_idx"
  ON "platform_migration_audit_logs"("executed_by", "created_at" DESC);

CREATE FUNCTION prevent_platform_migration_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Platform migration audit records are immutable'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "platform_migration_audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "platform_migration_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_platform_migration_audit_log_mutation();
