-- This migration was already applied to the shared database. The SQL is restored
-- locally so Prisma can validate and replay the migration history on a fresh database.
ALTER TABLE "factory_work_orders"
ADD COLUMN "vendor_name" VARCHAR(255),
ADD COLUMN "payment_type" VARCHAR(100),
ADD COLUMN "fob" DECIMAL(12,2),
ADD COLUMN "job_work" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "delivery_date" TIMESTAMP(3),
ADD COLUMN "payment_terms" VARCHAR(500);
