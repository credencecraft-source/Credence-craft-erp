CREATE TABLE "factory_work_order_bom_lines" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "source_bom_item_id" TEXT NOT NULL,
    "category_type" VARCHAR(255),
    "category" VARCHAR(255),
    "sub_category" VARCHAR(255),
    "raw_material_name" VARCHAR(255),
    "size" VARCHAR(100),
    "work_order_qty" DECIMAL(12,2) NOT NULL,
    "internal_consumption" DECIMAL(12,4),
    "internal_price" DECIMAL(12,4),
    "required_qty" DECIMAL(12,2) NOT NULL,
    "item_wise_excess_percentage" DECIMAL(12,2),
    "item_wise_excess_qty" DECIMAL(12,2) NOT NULL,
    "total_required_qty" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "factory_work_order_bom_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "factory_work_order_bom_lines_work_order_id_source_bom_item_id_key" ON "factory_work_order_bom_lines"("work_order_id", "source_bom_item_id");
CREATE INDEX "factory_work_order_bom_lines_work_order_id_idx" ON "factory_work_order_bom_lines"("work_order_id");
CREATE INDEX "factory_work_order_bom_lines_source_bom_item_id_idx" ON "factory_work_order_bom_lines"("source_bom_item_id");

ALTER TABLE "factory_work_order_bom_lines" ADD CONSTRAINT "factory_work_order_bom_lines_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "factory_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "factory_work_order_bom_lines" ADD CONSTRAINT "factory_work_order_bom_lines_source_bom_item_id_fkey" FOREIGN KEY ("source_bom_item_id") REFERENCES "bill_of_material_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
