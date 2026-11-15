ALTER TYPE "PlatformTeamRole" ADD VALUE 'SALES_MANAGER';

ALTER TABLE "platform_leads"
ADD COLUMN "assigned_sales_manager_id" TEXT;

CREATE INDEX "platform_leads_assigned_sales_manager_id_created_at_idx"
ON "platform_leads"("assigned_sales_manager_id", "created_at");

ALTER TABLE "platform_leads"
ADD CONSTRAINT "platform_leads_assigned_sales_manager_id_fkey"
FOREIGN KEY ("assigned_sales_manager_id")
REFERENCES "platform_admins"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
