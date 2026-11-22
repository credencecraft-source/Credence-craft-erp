-- Stage 1: idempotent LIVE_RECONCILIATION ledger baselines.
-- Each row is represented once by an organization-scoped idempotency key.
INSERT INTO "stock_movements" (
  "id","organization_id","stock_class","stock_record_id","storage_node_id",
  "movement_type","quantity_delta","before_qty","after_qty","uom",
  "source_doc_type","source_doc_id","source_line_id","idempotency_key","reason","actor_id","created_at"
)
SELECT
  'live-rm-' || s."id", s."organization_id", 'RAW_MATERIAL', s."id", s."storage_node_id",
  'ADJUSTMENT', GREATEST(s."quantity_on_hand", 0), 0, GREATEST(s."quantity_on_hand", 0), 'UNIT',
  'LIVE_RECONCILIATION', s."id", NULL,
  s."organization_id" || '|RAW_MATERIAL|' || s."id" || '|LIVE_RECONCILIATION',
  'Stage 1 live balance baseline', 'SYSTEM', CURRENT_TIMESTAMP
FROM "raw_material_stocks" s
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."organization_id" = s."organization_id"
    AND m."idempotency_key" = s."organization_id" || '|RAW_MATERIAL|' || s."id" || '|LIVE_RECONCILIATION'
);

INSERT INTO "stock_movements" (
  "id","organization_id","stock_class","stock_record_id",
  "movement_type","quantity_delta","before_qty","after_qty","uom",
  "source_doc_type","source_doc_id","source_line_id","idempotency_key","reason","actor_id","created_at"
)
SELECT
  'live-fg-' || s."id", s."organization_id", 'FINISHED_GOODS', s."id",
  'ADJUSTMENT', GREATEST(s."quantity_on_hand", 0), 0, GREATEST(s."quantity_on_hand", 0), 'UNIT',
  'LIVE_RECONCILIATION', s."id", NULL,
  s."organization_id" || '|FINISHED_GOODS|' || s."id" || '|LIVE_RECONCILIATION',
  'Stage 1 live balance baseline', 'SYSTEM', CURRENT_TIMESTAMP
FROM "finished_goods_stocks" s
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."organization_id" = s."organization_id"
    AND m."idempotency_key" = s."organization_id" || '|FINISHED_GOODS|' || s."id" || '|LIVE_RECONCILIATION'
);

INSERT INTO "stock_movements" (
  "id","organization_id","stock_class","stock_record_id","variant_id","sku_id","storage_node_id",
  "movement_type","quantity_delta","before_qty","after_qty","uom",
  "source_doc_type","source_doc_id","source_line_id","idempotency_key","reason","actor_id","created_at"
)
SELECT
  'live-sku-' || s."id", s."organization_id", 'FG_SKU', s."id", NULL, s."id", s."storage_node_id",
  'ADJUSTMENT', GREATEST(s."current_stock", 0), 0, GREATEST(s."current_stock", 0), 'UNIT',
  'LIVE_RECONCILIATION', s."id", NULL,
  s."organization_id" || '|FG_SKU|' || s."id" || '|LIVE_RECONCILIATION',
  'Stage 1 live balance baseline', 'SYSTEM', CURRENT_TIMESTAMP
FROM "finished_goods_sku_stocks" s
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."organization_id" = s."organization_id"
    AND m."idempotency_key" = s."organization_id" || '|FG_SKU|' || s."id" || '|LIVE_RECONCILIATION'
);
