-- CreateTable
CREATE TABLE "workspace_users" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "profile_name" VARCHAR(100) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "workspace_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "workspace_user_id" TEXT NOT NULL,
    "organization_name" VARCHAR(255) NOT NULL,
    "gst_number" VARCHAR(50) NOT NULL,
    "address_line_1" VARCHAR(255),
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "country" VARCHAR(100),
    "pin_code" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_software" (
    "id" TEXT NOT NULL,
    "software_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "software_name" VARCHAR(255) NOT NULL DEFAULT 'ERP Software',
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_modules" (
    "id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "software_id" TEXT NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "module_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'enabled',
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_module_data" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "record_key" VARCHAR(255) NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_module_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_modules" (
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

-- CreateTable
CREATE TABLE "master_module_values" (
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

-- CreateTable
CREATE TABLE "master_entities" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_category_types" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_type" VARCHAR(255) NOT NULL,
    "books_item_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_category_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_categories" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_type_id" TEXT,
    "category_name" VARCHAR(255) NOT NULL,
    "maximum_excess_allowed" DECIMAL(10,2),
    "create_cost_center" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_sub_categories" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "category_id" TEXT,
    "sub_category" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_brands" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "brand" VARCHAR(255) NOT NULL,
    "maximum_allowed_excess" DECIMAL(10,2),
    "auto_add_excess_to_rm" BOOLEAN NOT NULL DEFAULT false,
    "pre_order_checklist_id" TEXT,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_pre_order_checklists" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "pre_order_checklist" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_pre_order_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_currency_types" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "currency_type" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_currency_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_buyers" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "buyer_name" VARCHAR(255) NOT NULL,
    "currency_type_id" TEXT,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_seasons" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "season" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_articles" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "article" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_colors" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "colors" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_size_groups" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "size_group" VARCHAR(255) NOT NULL,
    "measurement_chart_id" TEXT,
    "size_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_size_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_sizes" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "size" VARCHAR(255) NOT NULL,
    "size_group_id" TEXT,
    "status" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_uoms" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "uom" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_uoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_vendors" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vendor" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_gst_types" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "gst_type" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_gst_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_gsts" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "gst" DECIMAL(10,2),
    "gst_type_id" TEXT,
    "zoho_books_tax_id" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_gsts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_hsns" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "hsn_code" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_hsns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_measurement_charts" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "measurement_chart" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_measurement_charts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_size_wise_consumptions" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bom_template_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_size_wise_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_products" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "product_master_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_process_templates" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "process_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_process_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_merchandisers" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "merchandiser" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_merchandisers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_statuses" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_order_volumes" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_volume" VARCHAR(255) NOT NULL,
    "from_value" INTEGER,
    "to_value" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_order_volumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_raw_materials" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "raw_material_name" VARCHAR(255) NOT NULL,
    "category_id" TEXT NOT NULL,
    "subcategory_id" TEXT NOT NULL,
    "stock_uom_id" TEXT NOT NULL,
    "category_type_id" TEXT,
    "is_specific_for_brand" BOOLEAN NOT NULL DEFAULT false,
    "size_wise_consumption" BOOLEAN NOT NULL DEFAULT false,
    "size_wise_consumption_id" TEXT,
    "brand_id" TEXT,
    "show_all" BOOLEAN NOT NULL DEFAULT false,
    "workdrive_image_id" TEXT,
    "buyer_item_code" TEXT,
    "image_url" TEXT,
    "item_code" TEXT,
    "colour_id" TEXT,
    "create_open_stock" TEXT,
    "open_stock" DECIMAL(12,2),
    "open_stock_price" DECIMAL(12,2),
    "vendor_wise_price_list" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "module_name" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_key" VARCHAR(255) NOT NULL,
    "entity_label" VARCHAR(255) NOT NULL,
    "entity_ref_id" TEXT,
    "requested_by" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchandising_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "orderNo" VARCHAR(100) NOT NULL,
    "entityName" VARCHAR(255),
    "category" VARCHAR(255),
    "subCategory" VARCHAR(255),
    "season" VARCHAR(255),
    "article" VARCHAR(255),
    "styleName" VARCHAR(255),
    "colors" VARCHAR(255),
    "buyer" VARCHAR(255),
    "brand" VARCHAR(255),
    "sizeGroup" VARCHAR(255),
    "haveSizeRatio" BOOLEAN,
    "ratioOrderQty" INTEGER,
    "orderQty" INTEGER,
    "deliveryDate" TIMESTAMP(3),
    "finalStatus" VARCHAR(100) NOT NULL DEFAULT 'Draft',
    "processStatus" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchandising_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_goods_size_wise" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerSize" VARCHAR(100),
    "size" VARCHAR(100),
    "beforeExcessQty" INTEGER,
    "excess" DECIMAL(10,2),
    "excessQty" INTEGER,
    "totalQty" INTEGER,
    "buyerPoPrice" DECIMAL(12,2),
    "exchangePrice" DECIMAL(12,2),
    "priceInInr" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_goods_size_wise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_workspace_id_key" ON "workspace_users"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_profile_name_key" ON "workspace_users"("profile_name");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_email_key" ON "workspace_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_organization_id_key" ON "organizations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_gst_number_key" ON "organizations"("gst_number");

-- CreateIndex
CREATE INDEX "organizations_workspace_user_id_idx" ON "organizations"("workspace_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "erp_software_software_id_key" ON "erp_software"("software_id");

-- CreateIndex
CREATE INDEX "erp_software_organization_id_idx" ON "erp_software"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "erp_modules_module_id_key" ON "erp_modules"("module_id");

-- CreateIndex
CREATE INDEX "erp_modules_software_id_idx" ON "erp_modules"("software_id");

-- CreateIndex
CREATE UNIQUE INDEX "erp_modules_software_id_module_key_key" ON "erp_modules"("software_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "erp_module_data_record_id_key" ON "erp_module_data"("record_id");

-- CreateIndex
CREATE INDEX "erp_module_data_module_id_record_key_idx" ON "erp_module_data"("module_id", "record_key");

-- CreateIndex
CREATE UNIQUE INDEX "master_modules_module_id_key" ON "master_modules"("module_id");

-- CreateIndex
CREATE INDEX "master_modules_organization_id_idx" ON "master_modules"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_modules_organization_id_module_key_key" ON "master_modules"("organization_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "master_module_values_value_id_key" ON "master_module_values"("value_id");

-- CreateIndex
CREATE INDEX "master_module_values_module_id_is_active_idx" ON "master_module_values"("module_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_entities_value_id_key" ON "master_entities"("value_id");

-- CreateIndex
CREATE INDEX "master_entities_organization_id_is_active_idx" ON "master_entities"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_entities_organization_id_entity_name_key" ON "master_entities"("organization_id", "entity_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_category_types_value_id_key" ON "master_category_types"("value_id");

-- CreateIndex
CREATE INDEX "master_category_types_organization_id_is_active_idx" ON "master_category_types"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_category_types_organization_id_category_type_key" ON "master_category_types"("organization_id", "category_type");

-- CreateIndex
CREATE UNIQUE INDEX "master_categories_value_id_key" ON "master_categories"("value_id");

-- CreateIndex
CREATE INDEX "master_categories_organization_id_is_active_idx" ON "master_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_categories_organization_id_category_name_key" ON "master_categories"("organization_id", "category_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_sub_categories_value_id_key" ON "master_sub_categories"("value_id");

-- CreateIndex
CREATE INDEX "master_sub_categories_organization_id_is_active_idx" ON "master_sub_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_sub_categories_organization_id_sub_category_key" ON "master_sub_categories"("organization_id", "sub_category");

-- CreateIndex
CREATE UNIQUE INDEX "master_brands_value_id_key" ON "master_brands"("value_id");

-- CreateIndex
CREATE INDEX "master_brands_organization_id_is_active_idx" ON "master_brands"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_brands_organization_id_brand_key" ON "master_brands"("organization_id", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "master_pre_order_checklists_value_id_key" ON "master_pre_order_checklists"("value_id");

-- CreateIndex
CREATE INDEX "master_pre_order_checklists_organization_id_is_active_idx" ON "master_pre_order_checklists"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_pre_order_checklists_organization_id_pre_order_check_key" ON "master_pre_order_checklists"("organization_id", "pre_order_checklist");

-- CreateIndex
CREATE UNIQUE INDEX "master_currency_types_value_id_key" ON "master_currency_types"("value_id");

-- CreateIndex
CREATE INDEX "master_currency_types_organization_id_is_active_idx" ON "master_currency_types"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_currency_types_organization_id_currency_type_key" ON "master_currency_types"("organization_id", "currency_type");

-- CreateIndex
CREATE UNIQUE INDEX "master_buyers_value_id_key" ON "master_buyers"("value_id");

-- CreateIndex
CREATE INDEX "master_buyers_organization_id_is_active_idx" ON "master_buyers"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_buyers_organization_id_buyer_name_key" ON "master_buyers"("organization_id", "buyer_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_seasons_value_id_key" ON "master_seasons"("value_id");

-- CreateIndex
CREATE INDEX "master_seasons_organization_id_is_active_idx" ON "master_seasons"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_seasons_organization_id_season_key" ON "master_seasons"("organization_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "master_articles_value_id_key" ON "master_articles"("value_id");

-- CreateIndex
CREATE INDEX "master_articles_organization_id_is_active_idx" ON "master_articles"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_articles_organization_id_article_key" ON "master_articles"("organization_id", "article");

-- CreateIndex
CREATE UNIQUE INDEX "master_colors_value_id_key" ON "master_colors"("value_id");

-- CreateIndex
CREATE INDEX "master_colors_organization_id_is_active_idx" ON "master_colors"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_colors_organization_id_colors_key" ON "master_colors"("organization_id", "colors");

-- CreateIndex
CREATE UNIQUE INDEX "master_size_groups_value_id_key" ON "master_size_groups"("value_id");

-- CreateIndex
CREATE INDEX "master_size_groups_organization_id_is_active_idx" ON "master_size_groups"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_size_groups_organization_id_size_group_key" ON "master_size_groups"("organization_id", "size_group");

-- CreateIndex
CREATE UNIQUE INDEX "master_sizes_value_id_key" ON "master_sizes"("value_id");

-- CreateIndex
CREATE INDEX "master_sizes_organization_id_is_active_idx" ON "master_sizes"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_sizes_organization_id_size_key" ON "master_sizes"("organization_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "master_uoms_value_id_key" ON "master_uoms"("value_id");

-- CreateIndex
CREATE INDEX "master_uoms_organization_id_is_active_idx" ON "master_uoms"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_uoms_organization_id_uom_key" ON "master_uoms"("organization_id", "uom");

-- CreateIndex
CREATE UNIQUE INDEX "master_vendors_value_id_key" ON "master_vendors"("value_id");

-- CreateIndex
CREATE INDEX "master_vendors_organization_id_is_active_idx" ON "master_vendors"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_gst_types_value_id_key" ON "master_gst_types"("value_id");

-- CreateIndex
CREATE INDEX "master_gst_types_organization_id_is_active_idx" ON "master_gst_types"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_gst_types_organization_id_gst_type_key" ON "master_gst_types"("organization_id", "gst_type");

-- CreateIndex
CREATE UNIQUE INDEX "master_gsts_value_id_key" ON "master_gsts"("value_id");

-- CreateIndex
CREATE INDEX "master_gsts_organization_id_is_active_idx" ON "master_gsts"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_hsns_value_id_key" ON "master_hsns"("value_id");

-- CreateIndex
CREATE INDEX "master_hsns_organization_id_is_active_idx" ON "master_hsns"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_charts_value_id_key" ON "master_measurement_charts"("value_id");

-- CreateIndex
CREATE INDEX "master_measurement_charts_organization_id_is_active_idx" ON "master_measurement_charts"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_measurement_charts_organization_id_measurement_chart_key" ON "master_measurement_charts"("organization_id", "measurement_chart");

-- CreateIndex
CREATE UNIQUE INDEX "master_size_wise_consumptions_value_id_key" ON "master_size_wise_consumptions"("value_id");

-- CreateIndex
CREATE INDEX "master_size_wise_consumptions_organization_id_is_active_idx" ON "master_size_wise_consumptions"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_size_wise_consumptions_organization_id_bom_template__key" ON "master_size_wise_consumptions"("organization_id", "bom_template_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_products_value_id_key" ON "master_products"("value_id");

-- CreateIndex
CREATE INDEX "master_products_organization_id_is_active_idx" ON "master_products"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_products_organization_id_product_master_name_key" ON "master_products"("organization_id", "product_master_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_process_templates_value_id_key" ON "master_process_templates"("value_id");

-- CreateIndex
CREATE INDEX "master_process_templates_organization_id_is_active_idx" ON "master_process_templates"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_process_templates_organization_id_process_name_key" ON "master_process_templates"("organization_id", "process_name");

-- CreateIndex
CREATE UNIQUE INDEX "master_merchandisers_value_id_key" ON "master_merchandisers"("value_id");

-- CreateIndex
CREATE INDEX "master_merchandisers_organization_id_is_active_idx" ON "master_merchandisers"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_statuses_value_id_key" ON "master_statuses"("value_id");

-- CreateIndex
CREATE INDEX "master_statuses_organization_id_is_active_idx" ON "master_statuses"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_order_volumes_value_id_key" ON "master_order_volumes"("value_id");

-- CreateIndex
CREATE INDEX "master_order_volumes_organization_id_is_active_idx" ON "master_order_volumes"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_materials_value_id_key" ON "master_raw_materials"("value_id");

-- CreateIndex
CREATE INDEX "master_raw_materials_organization_id_is_active_idx" ON "master_raw_materials"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "master_raw_materials_organization_id_raw_material_name_key" ON "master_raw_materials"("organization_id", "raw_material_name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_request_id_key" ON "approval_requests"("request_id");

-- CreateIndex
CREATE INDEX "approval_requests_organization_id_status_idx" ON "approval_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "approval_requests_organization_id_entity_ref_id_idx" ON "approval_requests"("organization_id", "entity_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchandising_orders_orderNo_key" ON "merchandising_orders"("orderNo");

-- CreateIndex
CREATE INDEX "merchandising_orders_organizationId_idx" ON "merchandising_orders"("organizationId");

-- CreateIndex
CREATE INDEX "finished_goods_size_wise_orderId_idx" ON "finished_goods_size_wise"("orderId");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workspace_user_id_fkey" FOREIGN KEY ("workspace_user_id") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_software" ADD CONSTRAINT "erp_software_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_modules" ADD CONSTRAINT "erp_modules_software_id_fkey" FOREIGN KEY ("software_id") REFERENCES "erp_software"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_module_data" ADD CONSTRAINT "erp_module_data_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "erp_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_modules" ADD CONSTRAINT "master_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_module_values" ADD CONSTRAINT "master_module_values_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "master_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_entities" ADD CONSTRAINT "master_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_category_types" ADD CONSTRAINT "master_category_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_categories" ADD CONSTRAINT "master_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_categories" ADD CONSTRAINT "master_categories_category_type_id_fkey" FOREIGN KEY ("category_type_id") REFERENCES "master_category_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_sub_categories" ADD CONSTRAINT "master_sub_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_sub_categories" ADD CONSTRAINT "master_sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_brands" ADD CONSTRAINT "master_brands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_brands" ADD CONSTRAINT "master_brands_pre_order_checklist_id_fkey" FOREIGN KEY ("pre_order_checklist_id") REFERENCES "master_pre_order_checklists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_pre_order_checklists" ADD CONSTRAINT "master_pre_order_checklists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_currency_types" ADD CONSTRAINT "master_currency_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_buyers" ADD CONSTRAINT "master_buyers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_buyers" ADD CONSTRAINT "master_buyers_currency_type_id_fkey" FOREIGN KEY ("currency_type_id") REFERENCES "master_currency_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_seasons" ADD CONSTRAINT "master_seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_articles" ADD CONSTRAINT "master_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_colors" ADD CONSTRAINT "master_colors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_size_groups" ADD CONSTRAINT "master_size_groups_measurement_chart_id_fkey" FOREIGN KEY ("measurement_chart_id") REFERENCES "master_measurement_charts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_sizes" ADD CONSTRAINT "master_sizes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_sizes" ADD CONSTRAINT "master_sizes_size_group_id_fkey" FOREIGN KEY ("size_group_id") REFERENCES "master_size_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_uoms" ADD CONSTRAINT "master_uoms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_vendors" ADD CONSTRAINT "master_vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_gst_types" ADD CONSTRAINT "master_gst_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_gsts" ADD CONSTRAINT "master_gsts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_gsts" ADD CONSTRAINT "master_gsts_gst_type_id_fkey" FOREIGN KEY ("gst_type_id") REFERENCES "master_gst_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_hsns" ADD CONSTRAINT "master_hsns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_measurement_charts" ADD CONSTRAINT "master_measurement_charts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_size_wise_consumptions" ADD CONSTRAINT "master_size_wise_consumptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_products" ADD CONSTRAINT "master_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_process_templates" ADD CONSTRAINT "master_process_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_merchandisers" ADD CONSTRAINT "master_merchandisers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_statuses" ADD CONSTRAINT "master_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_order_volumes" ADD CONSTRAINT "master_order_volumes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "master_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "master_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_stock_uom_id_fkey" FOREIGN KEY ("stock_uom_id") REFERENCES "master_uoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_category_type_id_fkey" FOREIGN KEY ("category_type_id") REFERENCES "master_category_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_colour_id_fkey" FOREIGN KEY ("colour_id") REFERENCES "master_colors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_raw_materials" ADD CONSTRAINT "master_raw_materials_size_wise_consumption_id_fkey" FOREIGN KEY ("size_wise_consumption_id") REFERENCES "master_size_wise_consumptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchandising_orders" ADD CONSTRAINT "merchandising_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_size_wise" ADD CONSTRAINT "finished_goods_size_wise_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "merchandising_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
