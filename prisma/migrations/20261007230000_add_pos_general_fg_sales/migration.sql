CREATE TABLE "pos_sales_invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_no" VARCHAR(100) NOT NULL,
    "request_key" VARCHAR(100) NOT NULL,
    "invoice_date" DATE NOT NULL,
    "customer" VARCHAR(255),
    "tax_mode" VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    "status" VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL,
    "sgst_amount" DECIMAL(14,2) NOT NULL,
    "igst_amount" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_sales_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "general_stock_receipt_id" TEXT NOT NULL,
    "style_name" VARCHAR(255) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "article_no" VARCHAR(255) NOT NULL,
    "size" VARCHAR(100) NOT NULL,
    "colour" VARCHAR(255),
    "quantity" INTEGER NOT NULL,
    "unit_rate" DECIMAL(14,4) NOT NULL,
    "gst_rate" DECIMAL(8,2) NOT NULL,
    "discount_percent" DECIMAL(8,2) NOT NULL,
    "hsn_code" VARCHAR(100),
    "taxable_amount" DECIMAL(14,2) NOT NULL,
    "cgst_amount" DECIMAL(14,2) NOT NULL,
    "sgst_amount" DECIMAL(14,2) NOT NULL,
    "igst_amount" DECIMAL(14,2) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_sales_invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_sales_invoice_lines_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "pos_sales_invoice_lines_rate_check" CHECK ("unit_rate" >= 0 AND "gst_rate" >= 0 AND "discount_percent" >= 0 AND "discount_percent" <= 100)
);

CREATE UNIQUE INDEX "pos_sales_invoices_organization_id_invoice_no_key"
  ON "pos_sales_invoices"("organization_id", "invoice_no");
CREATE UNIQUE INDEX "pos_sales_invoices_organization_id_id_key"
  ON "pos_sales_invoices"("organization_id", "id");
CREATE UNIQUE INDEX "pos_sales_invoice_request_key"
  ON "pos_sales_invoices"("organization_id", "request_key");
CREATE INDEX "pos_sales_invoices_organization_id_invoice_date_status_idx"
  ON "pos_sales_invoices"("organization_id", "invoice_date", "status");

CREATE UNIQUE INDEX "pos_sales_lines_invoice_stock_key"
  ON "pos_sales_invoice_lines"("organization_id", "invoice_id", "general_stock_receipt_id");
CREATE INDEX "pos_sales_invoice_lines_stock_created_idx"
  ON "pos_sales_invoice_lines"("organization_id", "general_stock_receipt_id", "created_at");

ALTER TABLE "pos_sales_invoices"
  ADD CONSTRAINT "pos_sales_invoices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_sales_invoice_lines"
  ADD CONSTRAINT "pos_sales_invoice_lines_invoice_fkey"
  FOREIGN KEY ("organization_id", "invoice_id")
  REFERENCES "pos_sales_invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_sales_invoice_lines"
  ADD CONSTRAINT "pos_sales_invoice_lines_general_stock_fkey"
  FOREIGN KEY ("organization_id", "general_stock_receipt_id")
  REFERENCES "finished_goods_general_stock_receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
