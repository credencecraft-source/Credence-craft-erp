ALTER TABLE "finished_goods_sku_stocks"
  ADD COLUMN "storage_node_id" TEXT;

ALTER TABLE "finished_goods_general_stock_receipts"
  ADD COLUMN "storage_node_id" TEXT;

CREATE INDEX "finished_goods_sku_stocks_org_storage_node_idx"
  ON "finished_goods_sku_stocks"("organization_id", "storage_node_id");

CREATE INDEX "fg_general_receipt_org_storage_node_idx"
  ON "finished_goods_general_stock_receipts"("organization_id", "storage_node_id");

ALTER TABLE "finished_goods_sku_stocks"
  ADD CONSTRAINT "finished_goods_sku_stocks_storage_node_fkey"
  FOREIGN KEY ("organization_id", "storage_node_id")
  REFERENCES "storage_nodes"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finished_goods_general_stock_receipts"
  ADD CONSTRAINT "finished_goods_general_stock_receipts_storage_node_fkey"
  FOREIGN KEY ("organization_id", "storage_node_id")
  REFERENCES "storage_nodes"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
