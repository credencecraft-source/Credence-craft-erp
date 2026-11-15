ALTER TABLE "grouped_purchase_orders"
ADD COLUMN "entity_name_snapshot" VARCHAR(255);

ALTER TABLE "master_purchase_orders"
ADD COLUMN "entity_name_snapshot" VARCHAR(255);

ALTER TABLE "purchase_orders"
ADD COLUMN "entity_name_snapshot" VARCHAR(255),
ADD COLUMN "grand_total" DECIMAL(14, 2);

ALTER TABLE "pos_sales_invoices"
ADD COLUMN "entity_name_snapshot" VARCHAR(255);

ALTER TABLE "pos_sales_returns"
ADD COLUMN "entity_name_snapshot" VARCHAR(255);

ALTER TABLE "pos_purchase_bills"
ADD COLUMN "entity_name_snapshot" VARCHAR(255);

ALTER TABLE "inventory_receipts"
ADD COLUMN "entity_name_snapshot" VARCHAR(255),
ADD COLUMN "location_name_snapshot" VARCHAR(255);
