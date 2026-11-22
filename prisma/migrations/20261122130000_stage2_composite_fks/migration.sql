-- Stage 2.2: tenant-composite foreign keys.
ALTER TABLE "purchase_order_lines"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "purchase_order_lines_org_po_fkey"
  FOREIGN KEY ("organization_id", "purchase_order_id")
  REFERENCES "purchase_orders"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "grouped_purchase_order_lines"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "grouped_purchase_order_lines_org_gpo_fkey"
  FOREIGN KEY ("organization_id", "grouped_purchase_order_id")
  REFERENCES "grouped_purchase_orders"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "factory_work_order_size_lines"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "factory_work_order_size_lines_org_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id")
  REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "factory_work_order_bom_lines"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "factory_work_order_bom_lines_org_work_order_fkey"
  FOREIGN KEY ("organization_id", "work_order_id")
  REFERENCES "factory_work_orders"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "inventory_receipt_lines"
  ALTER COLUMN "organization_id" SET NOT NULL,
  ADD CONSTRAINT "inventory_receipt_lines_org_receipt_fkey"
  FOREIGN KEY ("organization_id", "receipt_id")
  REFERENCES "inventory_receipts"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "gate_entries"
  ADD CONSTRAINT "gate_entries_org_po_fkey"
  FOREIGN KEY ("organization_id", "purchase_order_id")
  REFERENCES "purchase_orders"("organization_id", "id") ON DELETE SET NULL;

ALTER TABLE "grouped_purchase_orders"
  ADD CONSTRAINT "grouped_purchase_orders_org_vendor_fkey"
  FOREIGN KEY ("organization_id", "vendor_id")
  REFERENCES "master_vendors"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_org_vendor_fkey"
  FOREIGN KEY ("organization_id", "vendor_id")
  REFERENCES "master_vendors"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "factory_work_orders"
  DROP CONSTRAINT IF EXISTS "factory_work_orders_order_id_fkey",
  ADD CONSTRAINT "factory_work_orders_org_order_fkey"
  FOREIGN KEY ("organization_id", "order_id")
  REFERENCES "merchandising_orders"("organization_id", "id") ON DELETE RESTRICT;
