ALTER TABLE "subscriptions"
ADD COLUMN "service_status" VARCHAR(50) NOT NULL DEFAULT 'active',
ADD COLUMN "billing_months" INTEGER,
ADD COLUMN "subtotal_amount" DECIMAL(12, 2),
ADD COLUMN "gst_amount" DECIMAL(12, 2),
ADD COLUMN "total_amount" DECIMAL(12, 2);

CREATE INDEX "subscriptions_organization_id_business_type_id_payment_status_service_status_idx"
ON "subscriptions"("organization_id", "business_type_id", "payment_status", "service_status");
