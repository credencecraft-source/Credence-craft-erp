-- AlterTable
ALTER TABLE "grouped_purchase_order_lines" ADD COLUMN "stock_uom" VARCHAR(100);
ALTER TABLE "master_purchase_order_lines" ADD COLUMN "stock_uom" VARCHAR(100);