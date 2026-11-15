ALTER TABLE "pos_sales_invoices"
ADD COLUMN "store_credit_applied_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "pos_sales_invoices"
ADD CONSTRAINT "pos_sales_invoices_store_credit_applied_amount_check"
CHECK ("store_credit_applied_amount" >= 0 AND "store_credit_applied_amount" <= "total_amount");

ALTER TABLE "pos_sales_returns"
ADD COLUMN "settlement_type" VARCHAR(20),
ADD COLUMN "refund_method" VARCHAR(30),
ADD COLUMN "refund_status" VARCHAR(20),
ADD COLUMN "refund_reference" VARCHAR(100),
ADD COLUMN "refunded_by" VARCHAR(255),
ADD COLUMN "refunded_at" TIMESTAMP(3),
ADD COLUMN "store_credit_balance_amount" DECIMAL(14,2);

ALTER TABLE "pos_sales_returns"
ADD CONSTRAINT "pos_sales_returns_settlement_check"
CHECK (
  (
    "settlement_type" IS NULL
    AND "refund_method" IS NULL
    AND "refund_status" IS NULL
    AND "refund_reference" IS NULL
    AND "refunded_by" IS NULL
    AND "refunded_at" IS NULL
    AND "store_credit_balance_amount" IS NULL
  )
  OR (
    "settlement_type" = 'STORE_CREDIT'
    AND "refund_method" IS NULL
    AND "refund_status" IS NULL
    AND "refund_reference" IS NULL
    AND "refunded_by" IS NULL
    AND "refunded_at" IS NULL
    AND "store_credit_balance_amount" IS NOT NULL
    AND "store_credit_balance_amount" >= 0
    AND "store_credit_balance_amount" <= "total_credit_amount"
  )
  OR (
    "settlement_type" = 'REFUND'
    AND "refund_method" IS NOT NULL
    AND "refund_method" IN ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER')
    AND "refund_status" IS NOT NULL
    AND "store_credit_balance_amount" IS NOT NULL
    AND "store_credit_balance_amount" = 0
    AND (
      ("refund_status" = 'PENDING' AND "refunded_by" IS NULL AND "refunded_at" IS NULL)
      OR ("refund_status" = 'REFUNDED' AND "refunded_by" IS NOT NULL AND "refunded_at" IS NOT NULL)
    )
  )
);

CREATE TABLE "pos_sales_return_credit_applications" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "return_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "applied_by" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_sales_return_credit_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_sales_return_credit_applications_amount_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "pos_sales_return_credit_applications_organization_id_key"
ON "pos_sales_return_credit_applications"("organization_id", "id");
CREATE UNIQUE INDEX "pos_sales_return_credit_applications_return_invoice_key"
ON "pos_sales_return_credit_applications"("organization_id", "return_id", "invoice_id");
CREATE INDEX "pos_sales_return_credit_applications_invoice_created_idx"
ON "pos_sales_return_credit_applications"("organization_id", "invoice_id", "created_at");
CREATE INDEX "pos_sales_return_credit_applications_return_created_idx"
ON "pos_sales_return_credit_applications"("organization_id", "return_id", "created_at");

ALTER TABLE "pos_sales_return_credit_applications"
ADD CONSTRAINT "pos_sales_return_credit_applications_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sales_return_credit_applications"
ADD CONSTRAINT "pos_sales_return_credit_applications_organization_return_fkey"
FOREIGN KEY ("organization_id", "return_id")
REFERENCES "pos_sales_returns"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sales_return_credit_applications"
ADD CONSTRAINT "pos_sales_return_credit_applications_organization_invoice_fkey"
FOREIGN KEY ("organization_id", "invoice_id")
REFERENCES "pos_sales_invoices"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
