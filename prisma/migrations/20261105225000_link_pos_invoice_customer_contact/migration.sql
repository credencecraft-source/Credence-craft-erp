ALTER TABLE "pos_sales_invoices"
ADD COLUMN "customer_contact_id" TEXT;

CREATE INDEX "pos_sales_invoices_organization_id_customer_contact_id_idx"
ON "pos_sales_invoices"("organization_id", "customer_contact_id");

ALTER TABLE "pos_sales_invoices"
ADD CONSTRAINT "pos_sales_invoices_organization_id_customer_contact_id_fkey"
FOREIGN KEY ("organization_id", "customer_contact_id")
REFERENCES "contacts"("organization_id", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
