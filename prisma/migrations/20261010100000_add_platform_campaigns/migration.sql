CREATE TABLE "platform_campaigns" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "campaign_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_campaign_leads" (
    "campaign_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_campaign_leads_pkey" PRIMARY KEY ("campaign_id", "lead_id")
);

CREATE INDEX "platform_campaigns_campaign_date_idx"
ON "platform_campaigns"("campaign_date");

CREATE INDEX "platform_campaign_leads_lead_id_added_at_idx"
ON "platform_campaign_leads"("lead_id", "added_at");

ALTER TABLE "platform_campaign_leads"
ADD CONSTRAINT "platform_campaign_leads_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "platform_campaigns"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_campaign_leads"
ADD CONSTRAINT "platform_campaign_leads_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "platform_leads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
