ALTER TABLE "master_raw_material_categories"
ADD COLUMN "is_asset" BOOLEAN DEFAULT FALSE;

UPDATE "master_raw_material_categories" AS category
SET "is_asset" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "master_raw_materials" AS material
    WHERE material.organization_id = category.organization_id
      AND material.raw_material_category_id = category.id
      AND material.is_asset = TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM "master_raw_materials" AS material
    WHERE material.organization_id = category.organization_id
      AND material.raw_material_category_id = category.id
      AND material.is_asset = FALSE
  ) THEN NULL
  WHEN EXISTS (
    SELECT 1
    FROM "master_raw_materials" AS material
    WHERE material.organization_id = category.organization_id
      AND material.raw_material_category_id = category.id
      AND material.is_asset = TRUE
  ) THEN TRUE
  ELSE FALSE
END;

ALTER TABLE "master_raw_materials"
ADD COLUMN "asset_class" VARCHAR(255),
ADD COLUMN "manufacturer" VARCHAR(255),
ADD COLUMN "model_number" VARCHAR(255),
ADD COLUMN "useful_life_months" INTEGER,
ADD COLUMN "warranty_expiry" DATE;
