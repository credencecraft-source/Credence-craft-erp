ALTER TABLE "finished_goods_sku_stocks"
ADD COLUMN "purchase_bill_line_id" TEXT;

CREATE UNIQUE INDEX "finished_goods_sku_stocks_purchase_bill_line_id_key"
ON "finished_goods_sku_stocks"("purchase_bill_line_id");

ALTER TABLE "pos_purchase_bill_lines"
ADD CONSTRAINT "pos_purchase_bill_lines_source_record_id_fkey"
FOREIGN KEY ("source_record_id") REFERENCES "pos_purchase_records"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finished_goods_sku_stocks"
ADD CONSTRAINT "finished_goods_sku_stocks_purchase_bill_line_id_fkey"
FOREIGN KEY ("purchase_bill_line_id") REFERENCES "pos_purchase_bill_lines"("id")
ON DELETE SET NULL ON UPDATE CASCADE;