ALTER TABLE "finished_goods_sku_stocks"
    ADD COLUMN "gst_rate" DECIMAL(8,2),
    ADD COLUMN "hsn_code" VARCHAR(50),
    ADD COLUMN "purchase_price" DECIMAL(14,2),
    ADD COLUMN "sales_price" DECIMAL(14,2),
    ADD COLUMN "mrp" DECIMAL(14,2);
