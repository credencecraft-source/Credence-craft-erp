CREATE TYPE "PosCouponType" AS ENUM ('GENERAL', 'PURCHASE_REWARD');
CREATE TYPE "PosCouponStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PosCouponDiscountType" AS ENUM ('FLAT_AMOUNT', 'PERCENTAGE');
CREATE TYPE "PosCouponIssueStatus" AS ENUM ('AVAILABLE', 'REDEEMED', 'CANCELLED');

ALTER TABLE "pos_purchase_bills"
    ADD COLUMN "entity_id" TEXT;

ALTER TABLE "pos_sales_invoices"
    ADD COLUMN "entity_id" TEXT,
    ADD COLUMN "coupon_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX "pos_purchase_bills_organization_id_entity_id_bill_date_idx"
    ON "pos_purchase_bills"("organization_id", "entity_id", "bill_date");
CREATE INDEX "pos_sales_invoices_organization_id_entity_id_invoice_date_idx"
    ON "pos_sales_invoices"("organization_id", "entity_id", "invoice_date");

CREATE TABLE "pos_coupons" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "coupon_code" VARCHAR(60),
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "coupon_type" "PosCouponType" NOT NULL,
    "status" "PosCouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "discount_type" "PosCouponDiscountType" NOT NULL,
    "discount_value" DECIMAL(14,2) NOT NULL,
    "minimum_purchase" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "max_redemptions" INTEGER,
    "validity_days" INTEGER,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_coupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_coupons_validity_dates_check"
        CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
    CONSTRAINT "pos_coupons_amounts_check"
        CHECK ("discount_value" > 0 AND "minimum_purchase" >= 0),
    CONSTRAINT "pos_coupons_discount_value_check"
        CHECK ("discount_type" <> 'PERCENTAGE' OR "discount_value" <= 100),
    CONSTRAINT "pos_coupons_redemption_limit_check"
        CHECK ("max_redemptions" IS NULL OR "max_redemptions" > 0),
    CONSTRAINT "pos_coupons_type_fields_check"
        CHECK (
            ("coupon_type" = 'GENERAL' AND "coupon_code" IS NOT NULL AND "validity_days" IS NULL)
            OR
            ("coupon_type" = 'PURCHASE_REWARD' AND "coupon_code" IS NULL AND "validity_days" IS NOT NULL AND "validity_days" > 0)
        )
);

CREATE TABLE "pos_coupon_issues" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "customer_contact_id" TEXT NOT NULL,
    "issued_invoice_id" TEXT NOT NULL,
    "redeemed_invoice_id" TEXT,
    "coupon_code" VARCHAR(60) NOT NULL,
    "status" "PosCouponIssueStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expires_at" DATE,
    "redeemed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_coupon_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_coupon_redemptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "coupon_issue_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "coupon_code" VARCHAR(60) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_coupon_redemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_coupon_redemptions_discount_check"
        CHECK ("discount_amount" > 0)
);

CREATE UNIQUE INDEX "pos_coupons_organization_id_id_key"
    ON "pos_coupons"("organization_id", "id");
CREATE UNIQUE INDEX "pos_coupons_organization_id_coupon_code_key"
    ON "pos_coupons"("organization_id", "coupon_code");
CREATE INDEX "pos_coupons_organization_id_coupon_type_status_starts_at_id_idx"
    ON "pos_coupons"("organization_id", "coupon_type", "status", "starts_at", "id");

CREATE UNIQUE INDEX "pos_coupon_issues_organization_id_id_key"
    ON "pos_coupon_issues"("organization_id", "id");
CREATE UNIQUE INDEX "pos_coupon_issues_organization_id_coupon_code_key"
    ON "pos_coupon_issues"("organization_id", "coupon_code");
CREATE UNIQUE INDEX "pos_coupon_issues_organization_id_issued_invoice_id_key"
    ON "pos_coupon_issues"("organization_id", "issued_invoice_id");
CREATE UNIQUE INDEX "pos_coupon_issues_organization_id_redeemed_invoice_id_key"
    ON "pos_coupon_issues"("organization_id", "redeemed_invoice_id");
CREATE INDEX "pos_coupon_issues_organization_id_customer_contact_id_status_expires_at_idx"
    ON "pos_coupon_issues"("organization_id", "customer_contact_id", "status", "expires_at");

CREATE UNIQUE INDEX "pos_coupon_redemptions_organization_id_id_key"
    ON "pos_coupon_redemptions"("organization_id", "id");
CREATE UNIQUE INDEX "pos_coupon_redemptions_organization_id_coupon_issue_id_key"
    ON "pos_coupon_redemptions"("organization_id", "coupon_issue_id");
CREATE UNIQUE INDEX "pos_coupon_redemptions_organization_id_invoice_id_key"
    ON "pos_coupon_redemptions"("organization_id", "invoice_id");
CREATE INDEX "pos_coupon_redemptions_organization_id_coupon_id_created_at_idx"
    ON "pos_coupon_redemptions"("organization_id", "coupon_id", "created_at");

ALTER TABLE "pos_purchase_bills"
    ADD CONSTRAINT "pos_purchase_bills_organization_id_entity_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id")
    REFERENCES "master_entities"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sales_invoices"
    ADD CONSTRAINT "pos_sales_invoices_organization_id_entity_id_fkey"
    FOREIGN KEY ("organization_id", "entity_id")
    REFERENCES "master_entities"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_coupons"
    ADD CONSTRAINT "pos_coupons_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_coupon_issues"
    ADD CONSTRAINT "pos_coupon_issues_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_issues"
    ADD CONSTRAINT "pos_coupon_issues_organization_id_coupon_id_fkey"
    FOREIGN KEY ("organization_id", "coupon_id")
    REFERENCES "pos_coupons"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_issues"
    ADD CONSTRAINT "pos_coupon_issues_organization_id_customer_contact_id_fkey"
    FOREIGN KEY ("organization_id", "customer_contact_id")
    REFERENCES "contacts"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_issues"
    ADD CONSTRAINT "pos_coupon_issues_organization_id_issued_invoice_id_fkey"
    FOREIGN KEY ("organization_id", "issued_invoice_id")
    REFERENCES "pos_sales_invoices"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_issues"
    ADD CONSTRAINT "pos_coupon_issues_organization_id_redeemed_invoice_id_fkey"
    FOREIGN KEY ("organization_id", "redeemed_invoice_id")
    REFERENCES "pos_sales_invoices"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_coupon_redemptions"
    ADD CONSTRAINT "pos_coupon_redemptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_redemptions"
    ADD CONSTRAINT "pos_coupon_redemptions_organization_id_coupon_id_fkey"
    FOREIGN KEY ("organization_id", "coupon_id")
    REFERENCES "pos_coupons"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_redemptions"
    ADD CONSTRAINT "pos_coupon_redemptions_organization_id_coupon_issue_id_fkey"
    FOREIGN KEY ("organization_id", "coupon_issue_id")
    REFERENCES "pos_coupon_issues"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_coupon_redemptions"
    ADD CONSTRAINT "pos_coupon_redemptions_organization_id_invoice_id_fkey"
    FOREIGN KEY ("organization_id", "invoice_id")
    REFERENCES "pos_sales_invoices"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
