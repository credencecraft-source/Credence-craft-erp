-- Forward-only baseline compatibility for fresh disposable databases.
-- No historical migration files are changed or rewritten.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plans'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plans'
      AND column_name = 'business_type_id'
  ) THEN
    ALTER TABLE "plans" ADD COLUMN "business_type_id" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchandising_orders'
      AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "merchandising_orders" RENAME COLUMN "createdAt" TO "created_at";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'merchandising_orders'
      AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "merchandising_orders" RENAME COLUMN "updatedAt" TO "updated_at";
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "organization_name" TEXT,
  "business_type_id" TEXT,
  "plan_id" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "end_date" TIMESTAMP(3),
  "payment_status" VARCHAR(50) NOT NULL DEFAULT 'PAID',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "plan_restrictions" (
  "restriction_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "master_module" TEXT NOT NULL,
  "main_module" TEXT NOT NULL,
  "sub_module" TEXT NOT NULL,
  "action_level" TEXT,
  "url_pattern" TEXT,
  "restriction_type" TEXT NOT NULL DEFAULT 'block',
  "custom_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_restrictions_pkey" PRIMARY KEY ("restriction_id")
);
