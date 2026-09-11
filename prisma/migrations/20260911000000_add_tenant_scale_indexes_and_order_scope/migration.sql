-- Replace the global order-number constraint with tenant-scoped uniqueness.
ALTER TABLE "merchandising_orders" RENAME COLUMN "organizationId" TO "organization_id";
DROP INDEX IF EXISTS "merchandising_orders_organizationId_idx";
DROP INDEX IF EXISTS "merchandising_orders_orderNo_key";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "merchandising_orders" WHERE "organization_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot make merchandising_orders.organization_id required: null rows exist';
  END IF;
  IF EXISTS (
    SELECT "organization_id", "orderNo"
    FROM "merchandising_orders"
    GROUP BY "organization_id", "orderNo"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create tenant-scoped order number index: duplicate order numbers exist';
  END IF;
END $$;
ALTER TABLE "merchandising_orders" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE UNIQUE INDEX "merchandising_orders_organization_id_orderNo_key"
  ON "merchandising_orders"("organization_id", "orderNo");

-- Support the primary tenant-scoped list and subscription queries.
CREATE INDEX "merchandising_orders_organization_id_created_at_idx"
  ON "merchandising_orders"("organization_id", "created_at");
CREATE INDEX "subscriptions_organization_id_business_type_id_created_at_idx"
  ON "subscriptions"("organization_id", "business_type_id", "created_at");
CREATE INDEX "plan_restrictions_plan_id_restriction_type_idx"
  ON "plan_restrictions"("plan_id", "restriction_type");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_data_preflight_check"
  CHECK ("organization_id" IS NOT NULL AND "plan_id" IS NOT NULL) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "subscriptions" s
    LEFT JOIN "organizations" o ON o."id" = s."organization_id"
    LEFT JOIN "plans" p ON p."id" = s."plan_id"
    WHERE o."id" IS NULL OR p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add subscription foreign keys: orphan organization or plan references exist';
  END IF;
END $$;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_business_type_id_fkey"
  FOREIGN KEY ("business_type_id") REFERENCES "business_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
