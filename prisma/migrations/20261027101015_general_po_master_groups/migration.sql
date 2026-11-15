ALTER TABLE "general_purchase_order_requests"
ADD COLUMN "entity_id" TEXT,
ADD COLUMN "general_purchase_order_group_id" TEXT;

ALTER TABLE "purchase_orders"
ADD COLUMN "procurement_type" VARCHAR(30) NOT NULL DEFAULT 'STYLE_WISE';

ALTER TABLE "purchase_order_lines"
ADD COLUMN "general_purchase_order_group_id" TEXT;

CREATE TABLE "general_purchase_order_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "display_no" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'MASTER_GROUPED',
    "raw_material" VARCHAR(255) NOT NULL,
    "category" VARCHAR(255),
    "sub_category" VARCHAR(255),
    "stock_uom" VARCHAR(100) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "vendor_price" DECIMAL(12,4) NOT NULL,
    "gst" DECIMAL(10,2) NOT NULL,
    "hsn_code" VARCHAR(100) NOT NULL,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "general_purchase_order_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "general_purchase_order_groups_organization_id_display_no_key"
ON "general_purchase_order_groups"("organization_id", "display_no");

CREATE INDEX "general_purchase_order_groups_organization_id_status_create_idx"
ON "general_purchase_order_groups"("organization_id", "status", "created_at");

CREATE INDEX "general_purchase_order_groups_organization_id_entity_id_ven_idx"
ON "general_purchase_order_groups"("organization_id", "entity_id", "vendor_id");

CREATE INDEX "general_purchase_order_groups_organization_id_raw_material__idx"
ON "general_purchase_order_groups"("organization_id", "raw_material_id");

CREATE INDEX "general_purchase_order_requests_organization_id_entity_id_idx"
ON "general_purchase_order_requests"("organization_id", "entity_id");

CREATE INDEX "general_purchase_order_requests_organization_id_general_pur_idx"
ON "general_purchase_order_requests"("organization_id", "general_purchase_order_group_id");

CREATE UNIQUE INDEX "purchase_order_lines_general_purchase_order_group_id_key"
ON "purchase_order_lines"("general_purchase_order_group_id");

ALTER TABLE "general_purchase_order_requests"
ADD CONSTRAINT "general_purchase_order_requests_organization_id_entity_id_fkey"
FOREIGN KEY ("organization_id", "entity_id")
REFERENCES "master_entities"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "general_purchase_order_requests"
ADD CONSTRAINT "general_purchase_order_requests_general_purchase_order_gro_fkey"
FOREIGN KEY ("general_purchase_order_group_id")
REFERENCES "general_purchase_order_groups"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
ADD CONSTRAINT "purchase_order_lines_general_purchase_order_group_id_fkey"
FOREIGN KEY ("general_purchase_order_group_id")
REFERENCES "general_purchase_order_groups"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "general_purchase_order_groups"
ADD CONSTRAINT "general_purchase_order_groups_organization_id_fkey"
FOREIGN KEY ("organization_id")
REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "general_purchase_order_groups"
ADD CONSTRAINT "general_purchase_order_groups_organization_id_entity_id_fkey"
FOREIGN KEY ("organization_id", "entity_id")
REFERENCES "master_entities"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "general_purchase_order_groups"
ADD CONSTRAINT "general_purchase_order_groups_vendor_id_fkey"
FOREIGN KEY ("vendor_id")
REFERENCES "master_vendors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "general_purchase_order_groups"
ADD CONSTRAINT "general_purchase_order_groups_raw_material_id_fkey"
FOREIGN KEY ("raw_material_id")
REFERENCES "master_raw_materials"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
