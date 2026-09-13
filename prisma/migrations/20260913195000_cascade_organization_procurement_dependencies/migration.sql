ALTER TABLE "grouped_purchase_order_lines"
  DROP CONSTRAINT "grouped_purchase_order_lines_source_bom_item_id_fkey",
  DROP CONSTRAINT "grouped_purchase_order_lines_source_order_id_fkey";

ALTER TABLE "grouped_purchase_order_lines"
  ADD CONSTRAINT "grouped_purchase_order_lines_source_bom_item_id_fkey"
  FOREIGN KEY ("source_bom_item_id") REFERENCES "bill_of_material_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "grouped_purchase_order_lines_source_order_id_fkey"
  FOREIGN KEY ("source_order_id") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_purchase_order_sources"
  DROP CONSTRAINT "master_purchase_order_sources_grouped_purchase_order_id_fkey";

ALTER TABLE "master_purchase_order_sources"
  ADD CONSTRAINT "master_purchase_order_sources_grouped_purchase_order_id_fkey"
  FOREIGN KEY ("grouped_purchase_order_id") REFERENCES "grouped_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_order_sources"
  DROP CONSTRAINT "purchase_order_sources_master_purchase_order_id_fkey";

ALTER TABLE "purchase_order_sources"
  ADD CONSTRAINT "purchase_order_sources_master_purchase_order_id_fkey"
  FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
  DROP CONSTRAINT "purchase_order_lines_master_purchase_order_id_fkey";

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_master_purchase_order_id_fkey"
  FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
