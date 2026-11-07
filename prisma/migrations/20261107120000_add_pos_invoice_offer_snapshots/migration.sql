ALTER TABLE "pos_sales_invoice_lines"
    ADD COLUMN "offer_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "offer_snapshot" JSONB;
