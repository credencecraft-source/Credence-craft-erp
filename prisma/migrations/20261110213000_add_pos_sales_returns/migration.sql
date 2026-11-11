ALTER TABLE "pos_sales_invoice_lines"
ADD COLUMN "returned_quantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "pos_sales_invoice_lines"
ADD CONSTRAINT "pos_sales_invoice_lines_returned_quantity_check"
CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");

CREATE UNIQUE INDEX "pos_sales_invoice_lines_organization_invoice_id_key"
ON "pos_sales_invoice_lines"("organization_id", "invoice_id", "id");

CREATE TABLE "pos_sales_returns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "return_no" VARCHAR(100) NOT NULL,
    "request_key" VARCHAR(100) NOT NULL,
    "return_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL,
    "sgst_amount" DECIMAL(14,2) NOT NULL,
    "igst_amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_credit_amount" DECIMAL(14,2) NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sales_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sales_returns_positive_amount_check"
      CHECK ("subtotal" >= 0 AND "cgst_amount" >= 0 AND "sgst_amount" >= 0 AND "igst_amount" >= 0
        AND "tax_amount" >= 0 AND "total_credit_amount" >= 0),
    CONSTRAINT "pos_sales_returns_reason_not_empty_check" CHECK (length(trim("reason")) > 0)
);

CREATE TABLE "pos_sales_return_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_line_id" TEXT NOT NULL,
    "stock_issue_line_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL,
    "sgst_amount" DECIMAL(14,2) NOT NULL,
    "igst_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sales_return_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sales_return_lines_positive_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "pos_sales_return_lines_positive_amount_check"
      CHECK ("taxable_amount" >= 0 AND "cgst_amount" >= 0 AND "sgst_amount" >= 0
        AND "igst_amount" >= 0 AND "total_amount" >= 0)
);

CREATE UNIQUE INDEX "pos_sales_returns_organization_id_key"
ON "pos_sales_returns"("organization_id", "id");
CREATE UNIQUE INDEX "pos_sales_returns_organization_return_no_key"
ON "pos_sales_returns"("organization_id", "return_no");
CREATE UNIQUE INDEX "pos_sales_returns_organization_request_key"
ON "pos_sales_returns"("organization_id", "request_key");
CREATE INDEX "pos_sales_returns_organization_invoice_date_idx"
ON "pos_sales_returns"("organization_id", "invoice_id", "return_date");
CREATE INDEX "pos_sales_returns_organization_date_status_idx"
ON "pos_sales_returns"("organization_id", "return_date", "status");

CREATE UNIQUE INDEX "pos_sales_return_lines_organization_id_key"
ON "pos_sales_return_lines"("organization_id", "id");
CREATE UNIQUE INDEX "pos_sales_return_lines_organization_return_invoice_line_key"
ON "pos_sales_return_lines"("organization_id", "return_id", "invoice_line_id");
CREATE UNIQUE INDEX "pos_sales_return_lines_organization_stock_issue_line_key"
ON "pos_sales_return_lines"("organization_id", "stock_issue_line_id");
CREATE INDEX "pos_sales_return_lines_organization_invoice_line_idx"
ON "pos_sales_return_lines"("organization_id", "invoice_id", "invoice_line_id");

ALTER TABLE "pos_sales_returns"
ADD CONSTRAINT "pos_sales_returns_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_sales_returns"
ADD CONSTRAINT "pos_sales_returns_organization_invoice_fkey"
FOREIGN KEY ("organization_id", "invoice_id")
REFERENCES "pos_sales_invoices"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sales_return_lines"
ADD CONSTRAINT "pos_sales_return_lines_organization_return_fkey"
FOREIGN KEY ("organization_id", "return_id")
REFERENCES "pos_sales_returns"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sales_return_lines"
ADD CONSTRAINT "pos_sales_return_lines_organization_invoice_line_fkey"
FOREIGN KEY ("organization_id", "invoice_id", "invoice_line_id")
REFERENCES "pos_sales_invoice_lines"("organization_id", "invoice_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sales_return_lines"
ADD CONSTRAINT "pos_sales_return_lines_organization_stock_issue_line_fkey"
FOREIGN KEY ("organization_id", "stock_issue_line_id")
REFERENCES "fg_material_issue_lines"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
