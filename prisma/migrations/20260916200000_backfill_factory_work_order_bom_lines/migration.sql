INSERT INTO "factory_work_order_bom_lines" (
    "id",
    "work_order_id",
    "source_bom_item_id",
    "category_type",
    "category",
    "sub_category",
    "raw_material_name",
    "size",
    "work_order_qty",
    "internal_consumption",
    "internal_price",
    "required_qty",
    "item_wise_excess_percentage",
    "item_wise_excess_qty",
    "total_required_qty",
    "updated_at"
)
SELECT
    'c' || md5(wo.id || ':' || bom.id),
    wo.id,
    bom.id,
    bom."categoryType",
    bom.category,
    bom."subCategory",
    bom."rawMaterialName",
    bom.size,
    CASE
        WHEN NULLIF(trim(COALESCE(bom.size, '')), '') IS NULL THEN wo.total_qty::numeric
        ELSE COALESCE((
            SELECT SUM(size_line.quantity)::numeric
            FROM factory_work_order_size_lines size_line
            WHERE size_line.work_order_id = wo.id
              AND trim(COALESCE(size_line.size, '')) = trim(bom.size)
        ), 0)
    END,
    COALESCE(bom."internalConsumption", bom.consumption, 0),
    bom."internalPrice",
    COALESCE(bom."internalConsumption", bom.consumption, 0) * CASE
        WHEN NULLIF(trim(COALESCE(bom.size, '')), '') IS NULL THEN wo.total_qty::numeric
        ELSE COALESCE((
            SELECT SUM(size_line.quantity)::numeric
            FROM factory_work_order_size_lines size_line
            WHERE size_line.work_order_id = wo.id
              AND trim(COALESCE(size_line.size, '')) = trim(bom.size)
        ), 0)
    END,
    COALESCE(bom."itemWiseExcessPercentage", 0),
    (COALESCE(bom."internalConsumption", bom.consumption, 0) * CASE
        WHEN NULLIF(trim(COALESCE(bom.size, '')), '') IS NULL THEN wo.total_qty::numeric
        ELSE COALESCE((
            SELECT SUM(size_line.quantity)::numeric
            FROM factory_work_order_size_lines size_line
            WHERE size_line.work_order_id = wo.id
              AND trim(COALESCE(size_line.size, '')) = trim(bom.size)
        ), 0)
    END) * COALESCE(bom."itemWiseExcessPercentage", 0) / 100,
    (COALESCE(bom."internalConsumption", bom.consumption, 0) * CASE
        WHEN NULLIF(trim(COALESCE(bom.size, '')), '') IS NULL THEN wo.total_qty::numeric
        ELSE COALESCE((
            SELECT SUM(size_line.quantity)::numeric
            FROM factory_work_order_size_lines size_line
            WHERE size_line.work_order_id = wo.id
              AND trim(COALESCE(size_line.size, '')) = trim(bom.size)
        ), 0)
    END) * (1 + COALESCE(bom."itemWiseExcessPercentage", 0) / 100),
    CURRENT_TIMESTAMP
FROM factory_work_orders wo
JOIN bill_of_material_items bom ON bom."orderId" = wo.order_id
WHERE NOT EXISTS (
    SELECT 1
    FROM factory_work_order_bom_lines existing
    WHERE existing.work_order_id = wo.id
      AND existing.source_bom_item_id = bom.id
);
