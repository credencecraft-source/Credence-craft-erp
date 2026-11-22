-- Stage 2.3: replace critical cascading deletes with controlled restrict rules.
ALTER TABLE "factory_work_order_size_lines"
  DROP CONSTRAINT IF EXISTS "factory_work_order_size_lines_work_order_id_fkey";
ALTER TABLE "factory_work_order_bom_lines"
  DROP CONSTRAINT IF EXISTS "factory_work_order_bom_lines_work_order_id_fkey";
