ALTER TABLE "bill_of_material_items"
  ADD COLUMN "buyerConsumption" DECIMAL(12, 4),
  ADD COLUMN "buyerPrice" DECIMAL(12, 4),
  ADD COLUMN "internalConsumption" DECIMAL(12, 4),
  ADD COLUMN "internalPrice" DECIMAL(12, 4),
  ADD COLUMN "valuePerGarmentRm" DECIMAL(12, 4);