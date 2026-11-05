ALTER TABLE "pos_sales_invoice_lines"
  ALTER COLUMN "general_stock_receipt_id" DROP NOT NULL,
  ADD COLUMN "sku_stock_id" TEXT;

ALTER TABLE "pos_sales_invoice_lines"
  ADD CONSTRAINT "pos_sales_invoice_lines_stock_source_check"
  CHECK (("general_stock_receipt_id" IS NOT NULL AND "sku_stock_id" IS NULL)
      OR ("general_stock_receipt_id" IS NULL AND "sku_stock_id" IS NOT NULL));

CREATE UNIQUE INDEX "pos_sales_lines_invoice_sku_stock_key"
  ON "pos_sales_invoice_lines"("organization_id", "invoice_id", "sku_stock_id");
CREATE INDEX "pos_sales_invoice_lines_sku_stock_created_idx"
  ON "pos_sales_invoice_lines"("organization_id", "sku_stock_id", "created_at");

ALTER TABLE "pos_sales_invoice_lines"
  ADD CONSTRAINT "pos_sales_invoice_lines_sku_stock_fkey"
  FOREIGN KEY ("organization_id", "sku_stock_id")
  REFERENCES "finished_goods_sku_stocks"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
