-- Stage 2.1: stock quantity constraints.
ALTER TABLE "raw_material_stocks"
  ADD CONSTRAINT "raw_material_stocks_quantity_on_hand_check" CHECK ("quantity_on_hand" >= 0),
  ADD CONSTRAINT "raw_material_stocks_quantity_reserved_check" CHECK ("quantity_reserved" >= 0),
  ADD CONSTRAINT "raw_material_stocks_reserved_lte_on_hand_check" CHECK ("quantity_reserved" <= "quantity_on_hand");

ALTER TABLE "finished_goods_stocks"
  ADD CONSTRAINT "finished_goods_stocks_quantity_on_hand_check" CHECK ("quantity_on_hand" >= 0),
  ADD CONSTRAINT "finished_goods_stocks_quantity_reserved_check" CHECK ("quantity_reserved" >= 0),
  ADD CONSTRAINT "finished_goods_stocks_reserved_lte_on_hand_check" CHECK ("quantity_reserved" <= "quantity_on_hand");

ALTER TABLE "finished_goods_sku_stocks"
  ADD CONSTRAINT "finished_goods_sku_stocks_current_stock_check" CHECK ("current_stock" >= 0);
