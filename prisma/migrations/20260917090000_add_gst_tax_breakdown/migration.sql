ALTER TABLE "master_vendors"
ADD COLUMN "gst_number" VARCHAR(50),
ADD COLUMN "registered_state" VARCHAR(100);

ALTER TABLE "master_gsts"
ADD COLUMN "cgst_rate" DECIMAL(10,2),
ADD COLUMN "sgst_rate" DECIMAL(10,2),
ADD COLUMN "igst_rate" DECIMAL(10,2);

ALTER TABLE "purchase_order_lines"
ADD COLUMN "tax_type" VARCHAR(20),
ADD COLUMN "cgst_rate" DECIMAL(10,2),
ADD COLUMN "sgst_rate" DECIMAL(10,2),
ADD COLUMN "igst_rate" DECIMAL(10,2),
ADD COLUMN "cgst_amount" DECIMAL(12,4),
ADD COLUMN "sgst_amount" DECIMAL(12,4),
ADD COLUMN "igst_amount" DECIMAL(12,4);