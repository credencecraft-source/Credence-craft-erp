-- CreateEnum
CREATE TYPE "PosCounterShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "pos_counter_shifts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "counter_id" TEXT NOT NULL,
    "salesperson_user_id" VARCHAR(255) NOT NULL,
    "salesperson_name_snapshot" VARCHAR(255) NOT NULL,
    "active_counter_id" TEXT,
    "active_salesperson_id" VARCHAR(255),
    "status" "PosCounterShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "closing_balance" DECIMAL(14,2),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_by" VARCHAR(255) NOT NULL,
    "closed_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_counter_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_counter_shifts_org_counter_opened_idx" ON "pos_counter_shifts"("organization_id", "counter_id", "opened_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "pos_counter_shifts_org_salesperson_opened_idx" ON "pos_counter_shifts"("organization_id", "salesperson_user_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "pos_counter_shifts_organization_id_id_key" ON "pos_counter_shifts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_counter_shifts_org_active_counter_key" ON "pos_counter_shifts"("organization_id", "active_counter_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_counter_shifts_org_active_salesperson_key" ON "pos_counter_shifts"("organization_id", "active_salesperson_id");

ALTER TABLE "pos_sales_invoices"
    ADD COLUMN "sales_channel" VARCHAR(20) NOT NULL DEFAULT 'COUNTER',
    ADD CONSTRAINT "pos_sales_invoices_sales_channel_check"
        CHECK ("sales_channel" IN ('COUNTER', 'ONLINE_STORE'));

-- CreateIndex
CREATE INDEX "pos_sales_invoices_org_actor_posted_idx" ON "pos_sales_invoices"("organization_id", "created_by", "posted_at");

-- AddForeignKey
ALTER TABLE "pos_counter_shifts" ADD CONSTRAINT "pos_counter_shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_counter_shifts" ADD CONSTRAINT "pos_counter_shifts_organization_id_counter_id_fkey" FOREIGN KEY ("organization_id", "counter_id") REFERENCES "pos_counters"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_counter_shifts"
    ADD CONSTRAINT "pos_counter_shifts_balance_nonnegative_check"
        CHECK ("opening_balance" >= 0 AND ("closing_balance" IS NULL OR "closing_balance" >= 0)),
    ADD CONSTRAINT "pos_counter_shifts_state_check"
        CHECK (
            ("status" = 'OPEN'
                AND "closed_at" IS NULL
                AND "closing_balance" IS NULL
                AND "active_counter_id" = "counter_id"
                AND "active_salesperson_id" = "salesperson_user_id")
            OR
            ("status" = 'CLOSED'
                AND "closed_at" IS NOT NULL
                AND "closing_balance" IS NOT NULL
                AND "active_counter_id" IS NULL
                AND "active_salesperson_id" IS NULL)
        ),
    ADD CONSTRAINT "pos_counter_shifts_closed_after_open_check"
        CHECK ("closed_at" IS NULL OR "closed_at" >= "opened_at");
