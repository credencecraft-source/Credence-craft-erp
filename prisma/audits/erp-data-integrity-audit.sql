-- ERP data-integrity audit (PostgreSQL / Prisma)
--
-- This file is intentionally not a Prisma migration. Run it from a read replica or
-- a low-traffic session with a read-only role. It does not modify persistent data,
-- schema, indexes, or materialized views. It creates only a transaction-local temp table.
--
-- Usage:
--   1. Set the organization_id in each scope row, or leave it NULL for all tenants.
--   2. Set an independent batch_size and keyset cursor for each scope.
--   3. Run one scope at a time and use the cursor checkpoint returned at the end.
--   4. Repeat a scope until its checkpoint returns zero rows.
--
-- psql example after the temp table is created:
--   UPDATE audit_parameters
--   SET organization_id = 'org_cuid', batch_size = 5000,
--       last_created_at = '1970-01-01T00:00:00Z', last_id = ''
--   WHERE scope = 'orders';
--
-- For a psql session, update the temporary table after connecting. The defaults below
-- audit every organization from the beginning of each dataset.

BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

CREATE TEMP TABLE audit_parameters (
  scope text PRIMARY KEY,
  organization_id text,
  batch_size integer NOT NULL CHECK (batch_size BETWEEN 100 AND 10000),
  last_created_at timestamptz NOT NULL,
  last_id text NOT NULL
) ON COMMIT DROP;

INSERT INTO audit_parameters (scope, organization_id, batch_size, last_created_at, last_id)
VALUES
  ('orders', NULL, 5000, '1970-01-01T00:00:00Z', ''),
  ('bom', NULL, 5000, '1970-01-01T00:00:00Z', ''),
  ('purchase_orders', NULL, 5000, '1970-01-01T00:00:00Z', ''),
  ('raw_materials', NULL, 5000, '1970-01-01T00:00:00Z', '');

-- 1. Orders: duplicate business keys and temporary/stub records.
-- The unique index should make the first result empty; this also detects duplicate
-- values with whitespace/case differences that the exact constraint permits.
SELECT
  'order_duplicate_business_key' AS issue,
  o.organization_id,
  lower(btrim(o."orderNo")) AS normalized_order_no,
  count(*) AS row_count,
  array_agg(o.id ORDER BY o.id) AS row_ids
FROM merchandising_orders o
JOIN (
  SELECT o.*
  FROM merchandising_orders o
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'orders'
    AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
    AND (o.created_at, o.id) > (p.last_created_at, p.last_id)
  ORDER BY o.created_at, o.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'orders')
) candidate ON candidate.organization_id = o.organization_id
  AND lower(btrim(candidate."orderNo")) = lower(btrim(o."orderNo"))
GROUP BY o.organization_id, lower(btrim(o."orderNo"))
HAVING count(*) > 1
ORDER BY o.organization_id, normalized_order_no;

SELECT
  'order_stub_or_malformed_business_data' AS issue,
  o.organization_id,
  o.id,
  o."orderNo",
  o.finalStatus,
  o.created_at,
  CASE
    WHEN lower(btrim(o."orderNo")) ~ '^(test|demo|tmp|temp|stub)([-_ ]|$)' THEN 'temporary order number'
    WHEN lower(btrim(coalesce(o.styleName, ''))) IN ('test', 'demo', 'sample', 'placeholder') THEN 'temporary style name'
    WHEN o.orderQty IS NOT NULL AND o.orderQty < 0 THEN 'negative order quantity'
    WHEN o.deliveryDate IS NOT NULL AND o.deliveryDate < o.created_at::date THEN 'delivery before creation'
  END AS reason
FROM merchandising_orders o
CROSS JOIN audit_parameters p
WHERE p.scope = 'orders'
  AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
  AND (o.created_at, o.id) > (p.last_created_at, p.last_id)
  AND (
    lower(btrim(o."orderNo")) ~ '^(test|demo|tmp|temp|stub)([-_ ]|$)'
    OR lower(btrim(coalesce(o.styleName, ''))) IN ('test', 'demo', 'sample', 'placeholder')
    OR (o.orderQty IS NOT NULL AND o.orderQty < 0)
    OR (o.deliveryDate IS NOT NULL AND o.deliveryDate < o.created_at::date)
  )
ORDER BY o.created_at, o.id
LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'orders');

-- 2. BOM: duplicate semantic lines, quantity anomalies, and orphan checks.
-- A BOM has no unique business key in the current schema, so identical material,
-- category, subcategory, and size within one order are reported rather than deleted.
SELECT
  'bom_duplicate_semantic_line' AS issue,
  o.organization_id,
  b.order_id,
  lower(btrim(coalesce(b."categoryType", ''))) AS category_type,
  lower(btrim(coalesce(b.category, ''))) AS category,
  lower(btrim(coalesce(b."subCategory", ''))) AS sub_category,
  lower(btrim(coalesce(b."rawMaterialName", ''))) AS raw_material,
  lower(btrim(coalesce(b.size, ''))) AS size,
  count(*) AS row_count,
  array_agg(b.id ORDER BY b.id) AS row_ids
FROM bill_of_material_items b
JOIN merchandising_orders o ON o.id = b.order_id
JOIN (
  SELECT b.id, b.order_id, b."categoryType", b.category, b."subCategory", b."rawMaterialName", b.size,
         o.organization_id
  FROM bill_of_material_items b
  JOIN merchandising_orders o ON o.id = b.order_id
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'bom'
    AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
    AND (b.created_at, b.id) > (p.last_created_at, p.last_id)
  ORDER BY b.created_at, b.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'bom')
) candidate ON candidate.order_id = b.order_id
  AND lower(btrim(coalesce(candidate."categoryType", ''))) = lower(btrim(coalesce(b."categoryType", '')))
  AND lower(btrim(coalesce(candidate.category, ''))) = lower(btrim(coalesce(b.category, '')))
  AND lower(btrim(coalesce(candidate."subCategory", ''))) = lower(btrim(coalesce(b."subCategory", '')))
  AND lower(btrim(coalesce(candidate."rawMaterialName", ''))) = lower(btrim(coalesce(b."rawMaterialName", '')))
  AND lower(btrim(coalesce(candidate.size, ''))) = lower(btrim(coalesce(b.size, '')))
GROUP BY o.organization_id, b.order_id, category_type, category, sub_category, raw_material, size
HAVING count(*) > 1
ORDER BY o.organization_id, b.order_id, raw_material, size;

SELECT
  'bom_invalid_quantity' AS issue,
  o.organization_id,
  b.id,
  b.order_id,
  b."rawMaterialName",
  CASE
    WHEN coalesce(b."internalConsumption", b.consumption, 0) < 0 THEN 'negative consumption'
    WHEN coalesce(b."itemWiseExcessPercentage", 0) < 0 THEN 'negative excess percentage'
    WHEN coalesce(b."requiredQty", 0) < 0 OR coalesce(b."totalRequiredQty", 0) < 0 THEN 'negative required quantity'
    WHEN b."rawMaterialName" IS NULL OR btrim(b."rawMaterialName") = '' THEN 'missing raw material'
  END AS reason
FROM bill_of_material_items b
JOIN merchandising_orders o ON o.id = b.order_id
CROSS JOIN audit_parameters p
WHERE p.scope = 'bom'
  AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
  AND (b.created_at, b.id) > (p.last_created_at, p.last_id)
  AND (
    coalesce(b."internalConsumption", b.consumption, 0) < 0
    OR coalesce(b."itemWiseExcessPercentage", 0) < 0
    OR coalesce(b."requiredQty", 0) < 0
    OR coalesce(b."totalRequiredQty", 0) < 0
    OR b."rawMaterialName" IS NULL
    OR btrim(b."rawMaterialName") = ''
  )
ORDER BY b.created_at, b.id
LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'bom');

-- 3. Grouped/master/purchase orders: duplicate business keys and inconsistent links.
SELECT
  'purchase_order_duplicate_business_key' AS issue,
  po.organization_id,
  lower(btrim(po.purchase_order_no)) AS normalized_po_no,
  count(*) AS row_count,
  array_agg(po.id ORDER BY po.id) AS row_ids
FROM purchase_orders po
JOIN (
  SELECT po.*
  FROM purchase_orders po
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'purchase_orders'
    AND (p.organization_id IS NULL OR po.organization_id = p.organization_id)
    AND (po.created_at, po.id) > (p.last_created_at, p.last_id)
  ORDER BY po.created_at, po.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'purchase_orders')
) candidate ON candidate.organization_id = po.organization_id
  AND lower(btrim(candidate.purchase_order_no)) = lower(btrim(po.purchase_order_no))
GROUP BY po.organization_id, lower(btrim(po.purchase_order_no))
HAVING count(*) > 1
ORDER BY po.organization_id, normalized_po_no;

SELECT
  'purchase_order_stub_or_malformed_data' AS issue,
  po.organization_id,
  po.id,
  po.purchase_order_no,
  po.status,
  po.created_at,
  CASE
    WHEN lower(btrim(po.purchase_order_no)) ~ '^(test|demo|tmp|temp|stub)([-_ ]|$)' THEN 'temporary PO number'
    WHEN po.delivery_date IS NOT NULL AND po.delivery_date < po.po_date THEN 'delivery before PO date'
    WHEN lower(btrim(po.status)) NOT IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'closed') THEN 'unexpected PO status'
  END AS reason
FROM purchase_orders po
CROSS JOIN audit_parameters p
WHERE p.scope = 'purchase_orders'
  AND (p.organization_id IS NULL OR po.organization_id = p.organization_id)
  AND (po.created_at, po.id) > (p.last_created_at, p.last_id)
  AND (
    lower(btrim(po.purchase_order_no)) ~ '^(test|demo|tmp|temp|stub)([-_ ]|$)'
    OR (po.delivery_date IS NOT NULL AND po.delivery_date < po.po_date)
    OR lower(btrim(po.status)) NOT IN ('draft', 'open', 'rejected', 'pending_approval', 'approved')
  )
ORDER BY po.created_at, po.id
LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'purchase_orders');

SELECT
  'purchase_order_duplicate_line_signature' AS issue,
  po.organization_id,
  l.purchase_order_id,
  l.source_master_line_id,
  count(*) AS row_count,
  array_agg(l.id ORDER BY l.id) AS row_ids
FROM purchase_order_lines l
JOIN purchase_orders po ON po.id = l.purchase_order_id
JOIN (
  SELECT l.id, l.purchase_order_id, l.source_master_line_id, po.organization_id
  FROM purchase_order_lines l
  JOIN purchase_orders po ON po.id = l.purchase_order_id
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'purchase_orders'
    AND (p.organization_id IS NULL OR po.organization_id = p.organization_id)
    AND (po.created_at, po.id) > (p.last_created_at, p.last_id)
  ORDER BY po.created_at, po.id, l.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'purchase_orders')
) candidate ON candidate.purchase_order_id = l.purchase_order_id
  AND candidate.source_master_line_id = l.source_master_line_id
GROUP BY po.organization_id, l.purchase_order_id, l.source_master_line_id
HAVING count(*) > 1
ORDER BY po.organization_id, l.purchase_order_id, l.source_master_line_id;

-- Purchase-order lines whose quantity/price is a likely temporary or invalid value.
SELECT
  'purchase_order_invalid_line' AS issue,
  po.organization_id,
  l.id,
  l.purchase_order_id,
  l.raw_material,
  CASE
    WHEN l.quantity <= 0 THEN 'non-positive quantity'
    WHEN l.price IS NOT NULL AND l.price < 0 THEN 'negative price'
    WHEN l.total IS NOT NULL AND l.total < 0 THEN 'negative total'
    WHEN l.raw_material IS NULL OR btrim(l.raw_material) = '' THEN 'missing raw material'
  END AS reason
FROM purchase_order_lines l
JOIN purchase_orders po ON po.id = l.purchase_order_id
CROSS JOIN audit_parameters p
WHERE p.scope = 'purchase_orders'
  AND (p.organization_id IS NULL OR po.organization_id = p.organization_id)
  AND (po.created_at, po.id) > (p.last_created_at, p.last_id)
  AND (
    l.quantity <= 0
    OR (l.price IS NOT NULL AND l.price < 0)
    OR (l.total IS NOT NULL AND l.total < 0)
    OR l.raw_material IS NULL
    OR btrim(l.raw_material) = ''
  )
ORDER BY po.created_at, po.id, l.id
LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'purchase_orders');

-- 4. JSONB audit. JSONB storage cannot contain syntactically malformed JSON;
-- these checks cover every JSONB field in the Prisma schema for wrong top-level
-- types, empty objects, and scalar placeholder values.
WITH json_columns AS (
  SELECT m.id, 'erp_modules.settings' AS column_name, m.settings AS value, 'object' AS expected_type FROM erp_modules m WHERE m.settings IS NOT NULL
  UNION ALL SELECT d.id, 'erp_module_data.payload', d.payload, 'object_or_array' FROM erp_module_data d WHERE d.payload IS NOT NULL
  UNION ALL SELECT v.id, 'master_module_values.metadata', v.metadata, 'object' FROM master_module_values v WHERE v.metadata IS NOT NULL
  UNION ALL SELECT id, 'master_entities.legacy_metadata', legacy_metadata, 'object' FROM master_entities WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_category_types.legacy_metadata', legacy_metadata, 'object' FROM master_category_types WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_categories.legacy_metadata', legacy_metadata, 'object' FROM master_categories WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_sub_categories.legacy_metadata', legacy_metadata, 'object' FROM master_sub_categories WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_brands.legacy_metadata', legacy_metadata, 'object' FROM master_brands WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_pre_order_checklists.legacy_metadata', legacy_metadata, 'object' FROM master_pre_order_checklists WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_currency_types.legacy_metadata', legacy_metadata, 'object' FROM master_currency_types WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_buyers.legacy_metadata', legacy_metadata, 'object' FROM master_buyers WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_seasons.legacy_metadata', legacy_metadata, 'object' FROM master_seasons WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_articles.legacy_metadata', legacy_metadata, 'object' FROM master_articles WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_colors.legacy_metadata', legacy_metadata, 'object' FROM master_colors WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_size_groups.legacy_metadata', legacy_metadata, 'object' FROM master_size_groups WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_sizes.legacy_metadata', legacy_metadata, 'object' FROM master_sizes WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_uoms.legacy_metadata', legacy_metadata, 'object' FROM master_uoms WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_vendors.legacy_metadata', legacy_metadata, 'object' FROM master_vendors WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_gst_types.legacy_metadata', legacy_metadata, 'object' FROM master_gst_types WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_gsts.legacy_metadata', legacy_metadata, 'object' FROM master_gsts WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_hsns.legacy_metadata', legacy_metadata, 'object' FROM master_hsns WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_measurement_charts.legacy_metadata', legacy_metadata, 'object' FROM master_measurement_charts WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_size_wise_consumptions.legacy_metadata', legacy_metadata, 'object' FROM master_size_wise_consumptions WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_products.legacy_metadata', legacy_metadata, 'object' FROM master_products WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_processes.legacy_metadata', legacy_metadata, 'object' FROM master_processes WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_process_templates.legacy_metadata', legacy_metadata, 'object' FROM master_process_templates WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_operation_templates.legacy_metadata', legacy_metadata, 'object' FROM master_operation_templates WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_merchandisers.legacy_metadata', legacy_metadata, 'object' FROM master_merchandisers WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_statuses.legacy_metadata', legacy_metadata, 'object' FROM master_statuses WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_order_volumes.legacy_metadata', legacy_metadata, 'object' FROM master_order_volumes WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_raw_material_types.legacy_metadata', legacy_metadata, 'object' FROM master_raw_material_types WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_raw_material_categories.legacy_metadata', legacy_metadata, 'object' FROM master_raw_material_categories WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_raw_material_sub_categories.legacy_metadata', legacy_metadata, 'object' FROM master_raw_material_sub_categories WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_raw_materials.legacy_metadata', legacy_metadata, 'object' FROM master_raw_materials WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_process_template_steps.legacy_metadata', legacy_metadata, 'object' FROM master_process_template_steps WHERE legacy_metadata IS NOT NULL
  UNION ALL SELECT id, 'master_operation_template_steps.legacy_metadata', legacy_metadata, 'object' FROM master_operation_template_steps WHERE legacy_metadata IS NOT NULL
), json_issues AS (
  SELECT 'json_wrong_top_level_type' AS issue, id, column_name, jsonb_typeof(value) AS detail
  FROM json_columns
  WHERE jsonb_typeof(value) <> expected_type
    AND NOT (expected_type = 'object_or_array' AND jsonb_typeof(value) IN ('object', 'array'))
  UNION ALL
  SELECT 'json_empty_or_placeholder', id, column_name, left(value::text, 200)
  FROM json_columns
  WHERE value IN ('{}'::jsonb, '"test"'::jsonb, '"demo"'::jsonb, '"sample"'::jsonb, '"placeholder"'::jsonb)
)
SELECT issue, id, column_name, detail
FROM json_issues
ORDER BY column_name, id;

-- vendor_wise_price_list is text, so unlike JSONB it can contain malformed JSON.
-- pg_input_is_valid avoids aborting the audit on the first bad value.
SELECT
  'raw_material_malformed_json_text' AS issue,
  r.organization_id,
  r.id,
  r.raw_material_name,
  left(r.vendor_wise_price_list, 200) AS sample_value
FROM master_raw_materials r
CROSS JOIN audit_parameters p
WHERE p.scope = 'raw_materials'
  AND (p.organization_id IS NULL OR r.organization_id = p.organization_id)
  AND nullif(btrim(r.vendor_wise_price_list), '') IS NOT NULL
  AND NOT pg_input_is_valid(r.vendor_wise_price_list, 'jsonb')
ORDER BY r.organization_id, r.id
LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'raw_materials');

-- Cursor checkpoints. Advance only the scope being audited to the returned
-- next_last_created_at/next_last_id pair. No returned row means that scope is complete.
SELECT scope, created_at AS next_last_created_at, id AS next_last_id
FROM (
  SELECT p.scope, o.created_at, o.id
  FROM merchandising_orders o
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'orders'
    AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
    AND (o.created_at, o.id) > (p.last_created_at, p.last_id)
  ORDER BY o.created_at, o.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'orders')
) next_batch
ORDER BY created_at DESC, id DESC
LIMIT 1;

SELECT scope, created_at AS next_last_created_at, id AS next_last_id
FROM (
  SELECT p.scope, b.created_at, b.id
  FROM bill_of_material_items b
  JOIN merchandising_orders o ON o.id = b.order_id
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'bom'
    AND (p.organization_id IS NULL OR o.organization_id = p.organization_id)
    AND (b.created_at, b.id) > (p.last_created_at, p.last_id)
  ORDER BY b.created_at, b.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'bom')
) next_batch
ORDER BY created_at DESC, id DESC
LIMIT 1;

SELECT scope, created_at AS next_last_created_at, id AS next_last_id
FROM (
  SELECT p.scope, po.created_at, po.id
  FROM purchase_orders po
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'purchase_orders'
    AND (p.organization_id IS NULL OR po.organization_id = p.organization_id)
    AND (po.created_at, po.id) > (p.last_created_at, p.last_id)
  ORDER BY po.created_at, po.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'purchase_orders')
) next_batch
ORDER BY created_at DESC, id DESC
LIMIT 1;

SELECT scope, created_at AS next_last_created_at, id AS next_last_id
FROM (
  SELECT p.scope, r.created_at, r.id
  FROM master_raw_materials r
  CROSS JOIN audit_parameters p
  WHERE p.scope = 'raw_materials'
    AND (p.organization_id IS NULL OR r.organization_id = p.organization_id)
    AND (r.created_at, r.id) > (p.last_created_at, p.last_id)
  ORDER BY r.created_at, r.id
  LIMIT (SELECT batch_size FROM audit_parameters WHERE scope = 'raw_materials')
) next_batch
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- 5. Optional no-lock index recommendations. Review with the DBA before applying.
-- These are intentionally comments: CREATE INDEX CONCURRENTLY is schema-changing
-- and must be run outside the read-only transaction.
-- Candidate-key duplicate checks use normalized signatures. Without these
-- expression indexes, large tenants may repeatedly sort or scan source tables.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_audit_normalized_number_idx
--   ON merchandising_orders (organization_id, lower(btrim("orderNo")), created_at, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS bom_audit_signature_idx
--   ON bill_of_material_items (
--     order_id,
--     lower(btrim(coalesce("categoryType", ''))),
--     lower(btrim(coalesce(category, ''))),
--     lower(btrim(coalesce("subCategory", ''))),
--     lower(btrim(coalesce("rawMaterialName", ''))),
--     lower(btrim(coalesce(size, ''))),
--     created_at, id
--   );
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS purchase_orders_audit_normalized_number_idx
--   ON purchase_orders (organization_id, lower(btrim(purchase_order_no)), created_at, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS purchase_order_lines_audit_source_idx
--   ON purchase_order_lines (purchase_order_id, source_master_line_id, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS bom_audit_order_created_id_idx
--   ON bill_of_material_items (order_id, created_at, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS purchase_order_lines_purchase_order_id_id_idx
--   ON purchase_order_lines (purchase_order_id, id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS raw_material_vendor_price_list_present_idx
--   ON master_raw_materials (organization_id, id)
--   WHERE vendor_wise_price_list IS NOT NULL AND btrim(vendor_wise_price_list) <> '';

-- 6. Optional materialized-view strategy for repeated duplicate scans.
-- Run separately in a maintenance window, then refresh concurrently as needed.
-- CREATE MATERIALIZED VIEW IF NOT EXISTS audit_bom_duplicate_signatures AS
-- SELECT order_id, lower(btrim(coalesce("categoryType", ''))) AS category_type,
--        lower(btrim(coalesce(category, ''))) AS category,
--        lower(btrim(coalesce("subCategory", ''))) AS sub_category,
--        lower(btrim(coalesce("rawMaterialName", ''))) AS raw_material,
--        lower(btrim(coalesce(size, ''))) AS size, count(*) AS row_count,
--        max(updated_at) AS last_updated_at
-- FROM bill_of_material_items
-- GROUP BY order_id, category_type, category, sub_category, raw_material, size
-- HAVING count(*) > 1;
-- CREATE UNIQUE INDEX IF NOT EXISTS audit_bom_duplicate_signatures_uq
--   ON audit_bom_duplicate_signatures (order_id, category_type, category, sub_category, raw_material, size);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY audit_bom_duplicate_signatures;

ROLLBACK;
