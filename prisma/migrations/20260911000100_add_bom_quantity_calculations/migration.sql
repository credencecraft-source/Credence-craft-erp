ALTER TABLE "bill_of_material_items"
  ADD COLUMN "orderQty" DECIMAL(12, 2),
  ADD COLUMN "itemWiseExcessPercentage" DECIMAL(12, 2),
  ADD COLUMN "itemWiseExcessQty" DECIMAL(12, 2),
  ADD COLUMN "totalRequiredQty" DECIMAL(12, 2);