ALTER TABLE "purchase_orders"
  ADD COLUMN "po_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "delivery_date" TIMESTAMP(3);

DROP INDEX "purchase_order_sources_purchase_order_id_key";
