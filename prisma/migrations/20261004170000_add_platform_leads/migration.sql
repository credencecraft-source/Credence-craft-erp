CREATE TABLE "platform_leads" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "mobile" VARCHAR(20),
    "company_name" VARCHAR(255),
    "city" VARCHAR(120),
    "source" VARCHAR(120),
    "stage" VARCHAR(80) NOT NULL DEFAULT '1-new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_leads_updated_at_idx" ON "platform_leads"("updated_at");
