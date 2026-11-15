ALTER TABLE "platform_leads"
ADD COLUMN "nature_of_business" VARCHAR(2000);

ALTER TABLE "support_tickets"
ALTER COLUMN "organization_id" DROP NOT NULL,
ALTER COLUMN "submitted_by_user_id" DROP NOT NULL,
ADD COLUMN "platform_lead_id" TEXT;

CREATE INDEX "support_tickets_platform_lead_id_status_created_at_idx"
ON "support_tickets"("platform_lead_id", "status", "created_at");

ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_platform_lead_id_fkey"
FOREIGN KEY ("platform_lead_id") REFERENCES "platform_leads"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
ADD CONSTRAINT "support_tickets_owner_check"
CHECK (
  (
    "organization_id" IS NOT NULL
    AND "submitted_by_user_id" IS NOT NULL
    AND "platform_lead_id" IS NULL
  )
  OR (
    "organization_id" IS NULL
    AND "submitted_by_user_id" IS NULL
    AND "platform_lead_id" IS NOT NULL
  )
);
