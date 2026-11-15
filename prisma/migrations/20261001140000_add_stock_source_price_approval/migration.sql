ALTER TABLE "grouped_purchase_orders"
  ADD COLUMN "source_type" VARCHAR(20) NOT NULL DEFAULT 'VENDOR';

ALTER TABLE "grouped_purchase_orders"
  ADD CONSTRAINT "grouped_purchase_orders_source_type_check"
  CHECK ("source_type" IN ('VENDOR', 'STOCK'));

CREATE UNIQUE INDEX "grouped_purchase_orders_organization_id_id_key"
  ON "grouped_purchase_orders"("organization_id", "id");

ALTER TABLE "raw_material_stock_bookings"
  ADD COLUMN "grouped_purchase_order_id" TEXT;

CREATE INDEX "raw_material_stock_bookings_organization_id_grouped_purchase_order_id_idx"
  ON "raw_material_stock_bookings"("organization_id", "grouped_purchase_order_id");

ALTER TABLE "raw_material_stock_bookings"
  ADD CONSTRAINT "raw_material_stock_bookings_organization_id_grouped_purchase_order_id_fkey"
  FOREIGN KEY ("organization_id", "grouped_purchase_order_id")
  REFERENCES "grouped_purchase_orders"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TEMP TABLE "stock_booking_approval_sources" AS
SELECT
  booking."id" AS booking_id,
  booking."organization_id",
  booking."current_store_vendor_id" AS vendor_id,
  order_record."entity_id",
  booking."source_bom_item_id",
  booking."booked_quantity",
  booking."booked_by",
  booking."created_at",
  bom."orderId" AS order_id,
  order_record."orderNo" AS order_no,
  order_record."styleName" AS style_name,
  order_record."brand",
  bom."rawMaterialName" AS raw_material,
  bom."categoryType" AS category_type,
  bom."category",
  bom."subCategory" AS sub_category,
  bom."stockUom" AS stock_uom,
  bom."internalConsumption" AS internal_consumption,
  bom."internalPrice" AS internal_price_bom,
  COALESCE(bom."totalRequiredQty", bom."requiredQty") AS required_qty,
  md5(jsonb_build_array(
    booking."organization_id",
    COALESCE(order_record."entity_id", ''),
    booking."current_store_vendor_id",
    lower(trim(COALESCE(bom."rawMaterialName", ''))),
    lower(trim(COALESCE(bom."category", ''))),
    lower(trim(COALESCE(bom."subCategory", ''))),
    lower(trim(COALESCE(bom."stockUom", '')))
  )::text) AS group_key
FROM "raw_material_stock_bookings" booking
JOIN "bill_of_material_items" bom ON bom."id" = booking."source_bom_item_id"
JOIN "merchandising_orders" order_record
  ON order_record."id" = bom."orderId"
 AND order_record."organization_id" = booking."organization_id"
WHERE booking."status" = 'BOOKED'
  AND booking."grouped_purchase_order_id" IS NULL;

CREATE TEMP TABLE "stock_booking_approval_groups" AS
SELECT
  source."organization_id",
  source.group_key,
  min(source."entity_id") AS entity_id,
  min(source.vendor_id) AS vendor_id,
  min(source.raw_material) AS raw_material,
  min(source.category_type) AS category_type,
  min(source.category) AS category,
  min(source.sub_category) AS sub_category,
  min(source.stock_uom) AS stock_uom,
  'stock-' || md5(source."organization_id" || '|' || source.group_key) AS grouped_purchase_order_id,
  'GPO-STOCK-' || md5(source."organization_id" || '|' || source.group_key) AS grouped_po_no,
  NULL::INTEGER AS display_no,
  row_number() OVER (PARTITION BY source."organization_id" ORDER BY source.group_key)::INTEGER AS organization_sequence,
  count(*) OVER (PARTITION BY source."organization_id")::INTEGER AS organization_group_count
FROM "stock_booking_approval_sources" source
GROUP BY source."organization_id", source.group_key;

WITH group_counts AS (
  SELECT "organization_id", max(organization_group_count) AS group_count
  FROM "stock_booking_approval_groups"
  GROUP BY "organization_id"
), updated_counters AS (
  INSERT INTO "procurement_document_counters" (
    "id", "organization_id", "document_type", "current_value", "updated_at"
  )
  SELECT gen_random_uuid()::text, "organization_id", 'GROUPED_PO', group_count, CURRENT_TIMESTAMP
  FROM group_counts
  ON CONFLICT ("organization_id", "document_type")
  DO UPDATE SET
    "current_value" = "procurement_document_counters"."current_value" + EXCLUDED."current_value",
    "updated_at" = CURRENT_TIMESTAMP
  RETURNING "organization_id", "current_value"
)
UPDATE "stock_booking_approval_groups" approval_group
SET display_no = updated_counters."current_value" - group_counts.group_count + approval_group.organization_sequence
FROM updated_counters
JOIN group_counts USING ("organization_id")
WHERE updated_counters."organization_id" = approval_group."organization_id";

INSERT INTO "grouped_purchase_orders" (
  "id",
  "organization_id",
  "entity_id",
  "source_type",
  "vendor_id",
  "grouped_po_no",
  "display_no",
  "status",
  "submitted_by",
  "submitted_at",
  "raw_material",
  "category_type",
  "category",
  "sub_category",
  "brand",
  "total_required_qty",
  "total_grouped_qty",
  "no_of_styles",
  "stock_uom",
  "created_at",
  "updated_at"
)
SELECT
  approval_group.grouped_purchase_order_id,
  approval_group."organization_id",
  approval_group.entity_id,
  'STOCK',
  approval_group.vendor_id,
  approval_group.grouped_po_no,
  approval_group.display_no,
  'PENDING_PRICE_APPROVAL',
  max(source.booked_by),
  min(source.created_at),
  approval_group.raw_material,
  approval_group.category_type,
  approval_group.category,
  approval_group.sub_category,
  min(source.brand),
  sum(source.booked_quantity),
  sum(source.booked_quantity),
  count(DISTINCT source.style_name)::INTEGER,
  approval_group.stock_uom,
  min(source.created_at),
  CURRENT_TIMESTAMP
FROM "stock_booking_approval_groups" approval_group
JOIN "stock_booking_approval_sources" source
  ON source."organization_id" = approval_group."organization_id"
 AND source.group_key = approval_group.group_key
GROUP BY
  approval_group.grouped_purchase_order_id,
  approval_group."organization_id",
  approval_group.entity_id,
  approval_group.vendor_id,
  approval_group.grouped_po_no,
  approval_group.display_no,
  approval_group.raw_material,
  approval_group.category_type,
  approval_group.category,
  approval_group.sub_category,
  approval_group.stock_uom;

INSERT INTO "grouped_purchase_order_lines" (
  "id",
  "grouped_purchase_order_id",
  "source_bom_item_id",
  "source_order_id",
  "order_no",
  "style_name",
  "brand",
  "category",
  "sub_category",
  "item_name",
  "stock_uom",
  "category_type",
  "internal_price_bom",
  "internal_consumption",
  "required_qty",
  "grouped_qty",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  approval_group.grouped_purchase_order_id,
  source."source_bom_item_id",
  source."order_id",
  max(source.order_no),
  max(source.style_name),
  max(source.brand),
  max(source.category),
  max(source.sub_category),
  max(source.raw_material),
  max(source.stock_uom),
  max(source.category_type),
  max(source.internal_price_bom),
  max(source.internal_consumption),
  max(source.required_qty),
  sum(source.booked_quantity),
  min(source.created_at),
  CURRENT_TIMESTAMP
FROM "stock_booking_approval_groups" approval_group
JOIN "stock_booking_approval_sources" source
  ON source."organization_id" = approval_group."organization_id"
 AND source.group_key = approval_group.group_key
GROUP BY approval_group.grouped_purchase_order_id, source."source_bom_item_id", source."order_id";

UPDATE "raw_material_stock_bookings" booking
SET "grouped_purchase_order_id" = approval_group.grouped_purchase_order_id
FROM "stock_booking_approval_sources" source
JOIN "stock_booking_approval_groups" approval_group
  ON approval_group."organization_id" = source."organization_id"
 AND approval_group.group_key = source.group_key
WHERE booking."id" = source.booking_id;
