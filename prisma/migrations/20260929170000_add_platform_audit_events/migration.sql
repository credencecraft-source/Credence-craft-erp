CREATE TABLE "platform_audit_events" (
  "id" TEXT NOT NULL,
  "platform_admin_id" TEXT,
  "action" VARCHAR(100) NOT NULL,
  "entity_type" VARCHAR(150) NOT NULL,
  "entity_id" VARCHAR(255) NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_events_platform_admin_id_created_at_idx"
ON "platform_audit_events"("platform_admin_id", "created_at");

CREATE INDEX "platform_audit_events_entity_type_entity_id_created_at_idx"
ON "platform_audit_events"("entity_type", "entity_id", "created_at");

ALTER TABLE "platform_audit_events"
ADD CONSTRAINT "platform_audit_events_platform_admin_id_fkey"
FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;