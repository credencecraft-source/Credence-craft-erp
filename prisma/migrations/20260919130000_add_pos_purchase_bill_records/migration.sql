CREATE TABLE "pos_purchase_bills" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "bill_number" VARCHAR(100) NOT NULL,
    "bill_date" TIMESTAMP(3) NOT NULL,
    "tax_mode" VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
    "status" VARCHAR(30) NOT NULL DEFAULT 'POSTED',
    "total_quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255),
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_purchase_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_purchase_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "item_type" VARCHAR(30) NOT NULL,
    "style_name" VARCHAR(255),
    "brand_id" TEXT,
    "size_group_id" TEXT,
    "color_id" TEXT,
    "category_id" TEXT,
    "sub_category_id" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'SAVED',
    "purchase_bill_id" TEXT,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_purchase_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_purchase_record_lines" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "item_name" VARCHAR(255),
    "size" VARCHAR(100),
    "quantity" DECIMAL(14,2) NOT NULL,
    "purchase_price" DECIMAL(14,4),
    "sales_price" DECIMAL(14,4),
    "gst_id" TEXT,
    "hsn_code" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_purchase_record_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_purchase_bill_lines" (
    "id" TEXT NOT NULL,
    "purchase_bill_id" TEXT NOT NULL,
    "source_record_id" TEXT,
    "item_name" VARCHAR(255),
    "size" VARCHAR(100),
    "quantity" DECIMAL(14,2) NOT NULL,
    "purchase_price" DECIMAL(14,4),
    "sales_price" DECIMAL(14,4),
    "gst_id" TEXT,
    "gst_rate" DECIMAL(10,2),
    "hsn_code" VARCHAR(100),
    "tax_amount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_purchase_bill_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_purchase_bills_organization_id_bill_number_key" ON "pos_purchase_bills"("organization_id", "bill_number");
CREATE INDEX "pos_purchase_bills_organization_id_status_bill_date_idx" ON "pos_purchase_bills"("organization_id", "status", "bill_date");
CREATE INDEX "pos_purchase_bills_organization_id_vendor_id_idx" ON "pos_purchase_bills"("organization_id", "vendor_id");
CREATE INDEX "pos_purchase_records_organization_id_status_created_at_idx" ON "pos_purchase_records"("organization_id", "status", "created_at");
CREATE INDEX "pos_purchase_records_organization_id_purchase_bill_id_idx" ON "pos_purchase_records"("organization_id", "purchase_bill_id");
CREATE INDEX "pos_purchase_record_lines_record_id_idx" ON "pos_purchase_record_lines"("record_id");
CREATE INDEX "pos_purchase_bill_lines_purchase_bill_id_idx" ON "pos_purchase_bill_lines"("purchase_bill_id");
CREATE INDEX "pos_purchase_bill_lines_source_record_id_idx" ON "pos_purchase_bill_lines"("source_record_id");

ALTER TABLE "pos_purchase_bills" ADD CONSTRAINT "pos_purchase_bills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_purchase_records" ADD CONSTRAINT "pos_purchase_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_purchase_records" ADD CONSTRAINT "pos_purchase_records_purchase_bill_id_fkey" FOREIGN KEY ("purchase_bill_id") REFERENCES "pos_purchase_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_purchase_record_lines" ADD CONSTRAINT "pos_purchase_record_lines_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "pos_purchase_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_purchase_bill_lines" ADD CONSTRAINT "pos_purchase_bill_lines_purchase_bill_id_fkey" FOREIGN KEY ("purchase_bill_id") REFERENCES "pos_purchase_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;