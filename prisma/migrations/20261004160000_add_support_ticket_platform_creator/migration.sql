ALTER TABLE "support_tickets"
ADD COLUMN "created_by_platform_admin_id" TEXT;

CREATE INDEX "support_tickets_created_by_platform_admin_id_idx"
ON "support_tickets"("created_by_platform_admin_id");

ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_created_by_platform_admin_id_fkey"
FOREIGN KEY ("created_by_platform_admin_id") REFERENCES "platform_admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
