ALTER TABLE "plans"
  ADD COLUMN "tier_key" VARCHAR(30),
  ADD COLUMN "is_system_plan" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "display_color" VARCHAR(30),
  ADD COLUMN "max_order_qty" INTEGER;

CREATE INDEX "plans_business_type_id_tier_key_idx"
  ON "plans"("business_type_id", "tier_key");