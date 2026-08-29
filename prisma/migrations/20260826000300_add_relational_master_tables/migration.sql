-- Relational master tables generated from prisma/schema.prisma.
-- Existing tables, rows, and legacy columns are preserved.

CREATE TABLE IF NOT EXISTS "master_modules" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "module_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "description" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_modules_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_module_values" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "code" VARCHAR(100),
    "description" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_module_values_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_entities" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "entity_name" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_entities_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_category_types" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "category_type" VARCHAR(255) NOT NULL, "books_item_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_category_types_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_categories" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "category_type_id" TEXT, "category_name" VARCHAR(255) NOT NULL,
    "maximum_excess_allowed" DECIMAL(10,2), "create_cost_center" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(50), "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_sub_categories" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "category_id" TEXT, "sub_category" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_sub_categories_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_brands" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "brand" VARCHAR(255) NOT NULL, "maximum_allowed_excess" DECIMAL(10,2),
    "auto_add_excess_to_rm" BOOLEAN NOT NULL DEFAULT false, "pre_order_checklist_id" TEXT,
    "status" VARCHAR(50), "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_brands_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_pre_order_checklists" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "pre_order_checklist" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_pre_order_checklists_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_currency_types" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "currency_type" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_currency_types_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_buyers" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "buyer_name" VARCHAR(255) NOT NULL, "currency_type_id" TEXT, "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_buyers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_seasons" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "season" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_seasons_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_articles" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "article" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_articles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_colors" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "colors" VARCHAR(255) NOT NULL, "status" VARCHAR(50), "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_colors_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_size_groups" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "brand_id" TEXT NOT NULL,
    "size_group" VARCHAR(255) NOT NULL, "measurement_chart_id" TEXT, "size_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_size_groups_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_sizes" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "size" VARCHAR(255) NOT NULL, "size_group_id" TEXT, "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_sizes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_uoms" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "uom" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_uoms_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_vendors" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "vendor" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_vendors_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_gst_types" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "gst_type" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_gst_types_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_gsts" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "name" VARCHAR(255) NOT NULL,
    "gst" DECIMAL(10,2), "gst_type_id" TEXT, "zoho_books_tax_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_gsts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_hsns" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "hsn_code" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_hsns_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_measurement_charts" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "measurement_chart" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_measurement_charts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_size_wise_consumptions" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "bom_template_name" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_size_wise_consumptions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_products" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "product_master_name" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_products_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_process_templates" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_process_templates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_merchandisers" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "merchandiser" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_merchandisers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_statuses" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "status" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "master_statuses_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_order_volumes" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "order_volume" VARCHAR(255) NOT NULL, "from_value" INTEGER, "to_value" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_order_volumes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "master_raw_materials" (
    "id" TEXT NOT NULL, "value_id" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
    "raw_material_name" VARCHAR(255) NOT NULL, "category_id" TEXT NOT NULL, "subcategory_id" TEXT NOT NULL,
    "stock_uom_id" TEXT NOT NULL, "category_type_id" TEXT, "is_specific_for_brand" BOOLEAN NOT NULL DEFAULT false,
    "size_wise_consumption" BOOLEAN NOT NULL DEFAULT false, "size_wise_consumption_id" TEXT, "brand_id" TEXT,
    "show_all" BOOLEAN NOT NULL DEFAULT false, "workdrive_image_id" TEXT, "buyer_item_code" TEXT,
    "image_url" TEXT, "item_code" TEXT, "colour_id" TEXT, "create_open_stock" TEXT,
    "open_stock" DECIMAL(12,2), "open_stock_price" DECIMAL(12,2), "vendor_wise_price_list" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0, "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_raw_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "master_modules_module_id_key" ON "master_modules"("module_id");
CREATE INDEX IF NOT EXISTS "master_modules_organization_id_idx" ON "master_modules"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "master_modules_organization_id_module_key_key" ON "master_modules"("organization_id", "module_key");
CREATE UNIQUE INDEX IF NOT EXISTS "master_module_values_value_id_key" ON "master_module_values"("value_id");
CREATE INDEX IF NOT EXISTS "master_module_values_module_id_is_active_idx" ON "master_module_values"("module_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_entities_value_id_key" ON "master_entities"("value_id");
CREATE INDEX IF NOT EXISTS "master_entities_organization_id_is_active_idx" ON "master_entities"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_entities_organization_id_entity_name_key" ON "master_entities"("organization_id", "entity_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_category_types_value_id_key" ON "master_category_types"("value_id");
CREATE INDEX IF NOT EXISTS "master_category_types_organization_id_is_active_idx" ON "master_category_types"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_category_types_organization_id_category_type_key" ON "master_category_types"("organization_id", "category_type");
CREATE UNIQUE INDEX IF NOT EXISTS "master_categories_value_id_key" ON "master_categories"("value_id");
CREATE INDEX IF NOT EXISTS "master_categories_organization_id_is_active_idx" ON "master_categories"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_categories_organization_id_category_name_key" ON "master_categories"("organization_id", "category_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_sub_categories_value_id_key" ON "master_sub_categories"("value_id");
CREATE INDEX IF NOT EXISTS "master_sub_categories_organization_id_is_active_idx" ON "master_sub_categories"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_sub_categories_organization_id_sub_category_key" ON "master_sub_categories"("organization_id", "sub_category");
CREATE UNIQUE INDEX IF NOT EXISTS "master_brands_value_id_key" ON "master_brands"("value_id");
CREATE INDEX IF NOT EXISTS "master_brands_organization_id_is_active_idx" ON "master_brands"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_brands_organization_id_brand_key" ON "master_brands"("organization_id", "brand");
CREATE UNIQUE INDEX IF NOT EXISTS "master_pre_order_checklists_value_id_key" ON "master_pre_order_checklists"("value_id");
CREATE INDEX IF NOT EXISTS "master_pre_order_checklists_organization_id_is_active_idx" ON "master_pre_order_checklists"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_pre_order_checklists_organization_id_pre_order_check_key" ON "master_pre_order_checklists"("organization_id", "pre_order_checklist");
CREATE UNIQUE INDEX IF NOT EXISTS "master_currency_types_value_id_key" ON "master_currency_types"("value_id");
CREATE INDEX IF NOT EXISTS "master_currency_types_organization_id_is_active_idx" ON "master_currency_types"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_currency_types_organization_id_currency_type_key" ON "master_currency_types"("organization_id", "currency_type");
CREATE UNIQUE INDEX IF NOT EXISTS "master_buyers_value_id_key" ON "master_buyers"("value_id");
CREATE INDEX IF NOT EXISTS "master_buyers_organization_id_is_active_idx" ON "master_buyers"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_buyers_organization_id_buyer_name_key" ON "master_buyers"("organization_id", "buyer_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_seasons_value_id_key" ON "master_seasons"("value_id");
CREATE INDEX IF NOT EXISTS "master_seasons_organization_id_is_active_idx" ON "master_seasons"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_seasons_organization_id_season_key" ON "master_seasons"("organization_id", "season");
CREATE UNIQUE INDEX IF NOT EXISTS "master_articles_value_id_key" ON "master_articles"("value_id");
CREATE INDEX IF NOT EXISTS "master_articles_organization_id_is_active_idx" ON "master_articles"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_articles_organization_id_article_key" ON "master_articles"("organization_id", "article");
CREATE UNIQUE INDEX IF NOT EXISTS "master_colors_value_id_key" ON "master_colors"("value_id");
CREATE INDEX IF NOT EXISTS "master_colors_organization_id_is_active_idx" ON "master_colors"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_colors_organization_id_colors_key" ON "master_colors"("organization_id", "colors");
CREATE UNIQUE INDEX IF NOT EXISTS "master_size_groups_value_id_key" ON "master_size_groups"("value_id");
CREATE INDEX IF NOT EXISTS "master_size_groups_organization_id_is_active_idx" ON "master_size_groups"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_size_groups_organization_id_size_group_key" ON "master_size_groups"("organization_id", "size_group");
CREATE UNIQUE INDEX IF NOT EXISTS "master_sizes_value_id_key" ON "master_sizes"("value_id");
CREATE INDEX IF NOT EXISTS "master_sizes_organization_id_is_active_idx" ON "master_sizes"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_sizes_organization_id_size_key" ON "master_sizes"("organization_id", "size");
CREATE UNIQUE INDEX IF NOT EXISTS "master_uoms_value_id_key" ON "master_uoms"("value_id");
CREATE INDEX IF NOT EXISTS "master_uoms_organization_id_is_active_idx" ON "master_uoms"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_uoms_organization_id_uom_key" ON "master_uoms"("organization_id", "uom");
CREATE UNIQUE INDEX IF NOT EXISTS "master_vendors_value_id_key" ON "master_vendors"("value_id");
CREATE INDEX IF NOT EXISTS "master_vendors_organization_id_is_active_idx" ON "master_vendors"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_gst_types_value_id_key" ON "master_gst_types"("value_id");
CREATE INDEX IF NOT EXISTS "master_gst_types_organization_id_is_active_idx" ON "master_gst_types"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_gst_types_organization_id_gst_type_key" ON "master_gst_types"("organization_id", "gst_type");
CREATE UNIQUE INDEX IF NOT EXISTS "master_gsts_value_id_key" ON "master_gsts"("value_id");
CREATE INDEX IF NOT EXISTS "master_gsts_organization_id_is_active_idx" ON "master_gsts"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_hsns_value_id_key" ON "master_hsns"("value_id");
CREATE INDEX IF NOT EXISTS "master_hsns_organization_id_is_active_idx" ON "master_hsns"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_measurement_charts_value_id_key" ON "master_measurement_charts"("value_id");
CREATE INDEX IF NOT EXISTS "master_measurement_charts_organization_id_is_active_idx" ON "master_measurement_charts"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_measurement_charts_organization_id_measurement_chart_key" ON "master_measurement_charts"("organization_id", "measurement_chart");
CREATE UNIQUE INDEX IF NOT EXISTS "master_size_wise_consumptions_value_id_key" ON "master_size_wise_consumptions"("value_id");
CREATE INDEX IF NOT EXISTS "master_size_wise_consumptions_organization_id_is_active_idx" ON "master_size_wise_consumptions"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_size_wise_consumptions_organization_id_bom_template__key" ON "master_size_wise_consumptions"("organization_id", "bom_template_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_products_value_id_key" ON "master_products"("value_id");
CREATE INDEX IF NOT EXISTS "master_products_organization_id_is_active_idx" ON "master_products"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_products_organization_id_product_master_name_key" ON "master_products"("organization_id", "product_master_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_process_templates_value_id_key" ON "master_process_templates"("value_id");
CREATE INDEX IF NOT EXISTS "master_process_templates_organization_id_is_active_idx" ON "master_process_templates"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_process_templates_organization_id_process_name_key" ON "master_process_templates"("organization_id", "process_name");
CREATE UNIQUE INDEX IF NOT EXISTS "master_merchandisers_value_id_key" ON "master_merchandisers"("value_id");
CREATE INDEX IF NOT EXISTS "master_merchandisers_organization_id_is_active_idx" ON "master_merchandisers"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_statuses_value_id_key" ON "master_statuses"("value_id");
CREATE INDEX IF NOT EXISTS "master_statuses_organization_id_is_active_idx" ON "master_statuses"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_order_volumes_value_id_key" ON "master_order_volumes"("value_id");
CREATE INDEX IF NOT EXISTS "master_order_volumes_organization_id_is_active_idx" ON "master_order_volumes"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_raw_materials_value_id_key" ON "master_raw_materials"("value_id");
CREATE INDEX IF NOT EXISTS "master_raw_materials_organization_id_is_active_idx" ON "master_raw_materials"("organization_id", "is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "master_raw_materials_organization_id_raw_material_name_key" ON "master_raw_materials"("organization_id", "raw_material_name");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_modules_organization_id_fkey') THEN ALTER TABLE "master_modules" ADD CONSTRAINT "master_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_module_values_module_id_fkey') THEN ALTER TABLE "master_module_values" ADD CONSTRAINT "master_module_values_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "master_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_entities_organization_id_fkey') THEN ALTER TABLE "master_entities" ADD CONSTRAINT "master_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_category_types_organization_id_fkey') THEN ALTER TABLE "master_category_types" ADD CONSTRAINT "master_category_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_categories_organization_id_fkey') THEN ALTER TABLE "master_categories" ADD CONSTRAINT "master_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_categories_category_type_id_fkey') THEN ALTER TABLE "master_categories" ADD CONSTRAINT "master_categories_category_type_id_fkey" FOREIGN KEY ("category_type_id") REFERENCES "master_category_types"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_sub_categories_organization_id_fkey') THEN ALTER TABLE "master_sub_categories" ADD CONSTRAINT "master_sub_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_sub_categories_category_id_fkey') THEN ALTER TABLE "master_sub_categories" ADD CONSTRAINT "master_sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_brands_organization_id_fkey') THEN ALTER TABLE "master_brands" ADD CONSTRAINT "master_brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_brands_pre_order_checklist_id_fkey') THEN ALTER TABLE "master_brands" ADD CONSTRAINT "master_brands_pre_order_checklist_id_fkey" FOREIGN KEY ("pre_order_checklist_id") REFERENCES "master_pre_order_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_pre_order_checklists_organization_id_fkey') THEN ALTER TABLE "master_pre_order_checklists" ADD CONSTRAINT "master_pre_order_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_currency_types_organization_id_fkey') THEN ALTER TABLE "master_currency_types" ADD CONSTRAINT "master_currency_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_buyers_organization_id_fkey') THEN ALTER TABLE "master_buyers" ADD CONSTRAINT "master_buyers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_buyers_currency_type_id_fkey') THEN ALTER TABLE "master_buyers" ADD CONSTRAINT "master_buyers_currency_type_id_fkey" FOREIGN KEY ("currency_type_id") REFERENCES "master_currency_types"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_seasons_organization_id_fkey') THEN ALTER TABLE "master_seasons" ADD CONSTRAINT "master_seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_articles_organization_id_fkey') THEN ALTER TABLE "master_articles" ADD CONSTRAINT "master_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_colors_organization_id_fkey') THEN ALTER TABLE "master_colors" ADD CONSTRAINT "master_colors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_size_groups_organization_id_fkey') THEN ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_size_groups_brand_id_fkey') THEN ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_size_groups_measurement_chart_id_fkey') THEN ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_measurement_chart_id_fkey" FOREIGN KEY ("measurement_chart_id") REFERENCES "master_measurement_charts"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_sizes_organization_id_fkey') THEN ALTER TABLE "master_sizes" ADD CONSTRAINT "master_sizes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_sizes_size_group_id_fkey') THEN ALTER TABLE "master_sizes" ADD CONSTRAINT "master_sizes_size_group_id_fkey" FOREIGN KEY ("size_group_id") REFERENCES "master_size_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_uoms_organization_id_fkey') THEN ALTER TABLE "master_uoms" ADD CONSTRAINT "master_uoms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_vendors_organization_id_fkey') THEN ALTER TABLE "master_vendors" ADD CONSTRAINT "master_vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_gst_types_organization_id_fkey') THEN ALTER TABLE "master_gst_types" ADD CONSTRAINT "master_gst_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_gsts_organization_id_fkey') THEN ALTER TABLE "master_gsts" ADD CONSTRAINT "master_gsts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_gsts_gst_type_id_fkey') THEN ALTER TABLE "master_gsts" ADD CONSTRAINT "master_gsts_gst_type_id_fkey" FOREIGN KEY ("gst_type_id") REFERENCES "master_gst_types"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_hsns_organization_id_fkey') THEN ALTER TABLE "master_hsns" ADD CONSTRAINT "master_hsns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_measurement_charts_organization_id_fkey') THEN ALTER TABLE "master_measurement_charts" ADD CONSTRAINT "master_measurement_charts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_size_wise_consumptions_organization_id_fkey') THEN ALTER TABLE "master_size_wise_consumptions" ADD CONSTRAINT "master_size_wise_consumptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_organization_id_fkey') THEN ALTER TABLE "master_products" ADD CONSTRAINT "master_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_process_templates_organization_id_fkey') THEN ALTER TABLE "master_process_templates" ADD CONSTRAINT "master_process_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_merchandisers_organization_id_fkey') THEN ALTER TABLE "master_merchandisers" ADD CONSTRAINT "master_merchandisers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_statuses_organization_id_fkey') THEN ALTER TABLE "master_statuses" ADD CONSTRAINT "master_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_order_volumes_organization_id_fkey') THEN ALTER TABLE "master_order_volumes" ADD CONSTRAINT "master_order_volumes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_organization_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_category_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_subcategory_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "master_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_stock_uom_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_stock_uom_id_fkey" FOREIGN KEY ("stock_uom_id") REFERENCES "master_uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_category_type_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_category_type_id_fkey" FOREIGN KEY ("category_type_id") REFERENCES "master_category_types"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_brand_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_colour_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_colour_id_fkey" FOREIGN KEY ("colour_id") REFERENCES "master_colors"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_raw_materials_size_wise_consumption_id_fkey') THEN ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_size_wise_consumption_id_fkey" FOREIGN KEY ("size_wise_consumption_id") REFERENCES "master_size_wise_consumptions"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF;
END $$;