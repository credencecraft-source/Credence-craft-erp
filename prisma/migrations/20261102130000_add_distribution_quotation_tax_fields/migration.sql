ALTER TABLE "distribution_quotations"
ADD COLUMN "contact_id" TEXT,
ADD COLUMN "delivery_charge" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "delivery_tax_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "sales_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "grand_total" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "distribution_quotation_lines"
ADD COLUMN "tax_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "tax_type" VARCHAR(20) NOT NULL DEFAULT 'NONE',
ADD COLUMN "cgst_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "igst_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "vat_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "sales_tax_rate" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "cgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "sgst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "igst_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "sales_tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;

UPDATE "distribution_quotations"
SET "grand_total" = "subtotal";

UPDATE "distribution_quotation_lines"
SET "total_amount" = "line_total";

ALTER TABLE "distribution_quotations"
ADD CONSTRAINT "distribution_quotations_organization_id_contact_id_fkey"
FOREIGN KEY ("organization_id", "contact_id")
REFERENCES "contacts"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
