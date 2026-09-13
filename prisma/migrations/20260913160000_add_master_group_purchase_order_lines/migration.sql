ALTER TABLE "purchase_order_lines"
  ADD COLUMN "master_purchase_order_id" TEXT;

CREATE INDEX "purchase_order_lines_master_purchase_order_id_idx"
  ON "purchase_order_lines"("master_purchase_order_id");

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_master_purchase_order_id_fkey"
  FOREIGN KEY ("master_purchase_order_id") REFERENCES "master_purchase_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;