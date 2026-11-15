CREATE TABLE "platform_pricing_settings" (
    "id" VARCHAR(50) NOT NULL DEFAULT 'global',
    "module_based_active" BOOLEAN NOT NULL DEFAULT true,
    "user_based_active" BOOLEAN NOT NULL DEFAULT false,
    "user_monthly_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_by_platform_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_pricing_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_pricing_settings" ("id", "updated_at")
VALUES ('global', CURRENT_TIMESTAMP);

ALTER TABLE "organizations"
ADD COLUMN "pricing_mode" VARCHAR(30) NOT NULL DEFAULT 'MODULE_BASED';

ALTER TABLE "subscriptions"
ADD COLUMN "billed_user_count" INTEGER;
