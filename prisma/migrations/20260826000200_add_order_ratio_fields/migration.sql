ALTER TABLE "merchandising_orders"
  ADD COLUMN IF NOT EXISTS "haveSizeRatio" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "ratioOrderQty" INTEGER;