ALTER TABLE "master_raw_materials"
ADD COLUMN "is_asset" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "general_purchase_order_groups"
ADD COLUMN "is_asset" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "purchase_orders"
ADD COLUMN "is_asset_purchase" BOOLEAN NOT NULL DEFAULT false;
