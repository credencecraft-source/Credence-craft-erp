DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'plans'
      AND column_name = 'max_order_qty'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'plans'
      AND column_name = 'legacy_max_order_qty'
  ) THEN
    ALTER TABLE "plans"
      RENAME COLUMN "max_order_qty" TO "legacy_max_order_qty";
  END IF;
END $$;