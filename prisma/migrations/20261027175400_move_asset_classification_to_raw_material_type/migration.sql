ALTER TABLE "master_raw_material_types"
ADD COLUMN "is_asset" BOOLEAN;

WITH type_classification AS (
  SELECT
    category.organization_id,
    category.raw_material_type_id,
    COUNT(*) AS category_count,
    COUNT(category.is_asset) AS classified_category_count,
    BOOL_OR(category.is_asset IS TRUE) AS has_asset_category,
    BOOL_OR(category.is_asset IS FALSE) AS has_raw_material_category
  FROM "master_raw_material_categories" AS category
  WHERE category.raw_material_type_id IS NOT NULL
  GROUP BY category.organization_id, category.raw_material_type_id
)
UPDATE "master_raw_material_types" AS raw_material_type
SET "is_asset" = CASE
  WHEN classification.classified_category_count <> classification.category_count THEN NULL
  WHEN classification.has_asset_category AND classification.has_raw_material_category THEN NULL
  WHEN classification.has_asset_category THEN TRUE
  WHEN classification.has_raw_material_category THEN FALSE
  ELSE NULL
END
FROM type_classification AS classification
WHERE classification.organization_id = raw_material_type.organization_id
  AND classification.raw_material_type_id = raw_material_type.id;
