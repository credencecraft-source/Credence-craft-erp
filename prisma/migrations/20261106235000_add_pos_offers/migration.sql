CREATE TYPE "PosOfferType" AS ENUM (
    'FLAT_AMOUNT',
    'PERCENTAGE',
    'BUY_ONE_GET_ONE',
    'COMBO'
);

CREATE TYPE "PosOfferScope" AS ENUM (
    'CATEGORY',
    'COLOUR',
    'SIZE',
    'ALL'
);

CREATE TYPE "PosOfferStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'INACTIVE'
);

CREATE TABLE "pos_offers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "request_key" VARCHAR(100) NOT NULL,
    "offer_code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "offer_type" "PosOfferType" NOT NULL,
    "scope" "PosOfferScope" NOT NULL,
    "status" "PosOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "discount_amount" DECIMAL(14,2),
    "discount_percentage" DECIMAL(5,2),
    "buy_quantity" INTEGER,
    "get_quantity" INTEGER,
    "get_discount_percentage" DECIMAL(5,2),
    "combo_price" DECIMAL(14,2),
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_offers_validity_dates_check"
        CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
    CONSTRAINT "pos_offers_type_values_check"
        CHECK (
            (
                "offer_type" = 'FLAT_AMOUNT'
                AND "discount_amount" IS NOT NULL
                AND "discount_amount" > 0
                AND "discount_percentage" IS NULL
                AND "buy_quantity" IS NULL
                AND "get_quantity" IS NULL
                AND "get_discount_percentage" IS NULL
                AND "combo_price" IS NULL
            )
            OR (
                "offer_type" = 'PERCENTAGE'
                AND "discount_amount" IS NULL
                AND "discount_percentage" IS NOT NULL
                AND "discount_percentage" > 0
                AND "discount_percentage" <= 100
                AND "buy_quantity" IS NULL
                AND "get_quantity" IS NULL
                AND "get_discount_percentage" IS NULL
                AND "combo_price" IS NULL
            )
            OR (
                "offer_type" = 'BUY_ONE_GET_ONE'
                AND "discount_amount" IS NULL
                AND "discount_percentage" IS NULL
                AND "buy_quantity" IS NOT NULL
                AND "buy_quantity" > 0
                AND "get_quantity" IS NOT NULL
                AND "get_quantity" > 0
                AND "get_discount_percentage" IS NOT NULL
                AND "get_discount_percentage" >= 0
                AND "get_discount_percentage" <= 100
                AND "combo_price" IS NULL
            )
            OR (
                "offer_type" = 'COMBO'
                AND "discount_amount" IS NULL
                AND "discount_percentage" IS NULL
                AND "buy_quantity" IS NULL
                AND "get_quantity" IS NULL
                AND "get_discount_percentage" IS NULL
                AND "combo_price" IS NOT NULL
                AND "combo_price" >= 0
            )
        )
);

CREATE TABLE "pos_offer_targets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "category_id" TEXT,
    "color_id" TEXT,
    "size_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_offer_targets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_offer_targets_single_target_check"
        CHECK (num_nonnulls("category_id", "color_id", "size_id") = 1)
);

CREATE UNIQUE INDEX "pos_offers_organization_id_id_key"
    ON "pos_offers"("organization_id", "id");
CREATE UNIQUE INDEX "pos_offers_request_key"
    ON "pos_offers"("organization_id", "request_key");
CREATE UNIQUE INDEX "pos_offers_org_offer_code"
    ON "pos_offers"("organization_id", "offer_code");
CREATE INDEX "pos_offers_organization_id_status_starts_at_id_idx"
    ON "pos_offers"("organization_id", "status", "starts_at", "id");
CREATE INDEX "pos_offers_organization_id_offer_type_scope_idx"
    ON "pos_offers"("organization_id", "offer_type", "scope");

CREATE UNIQUE INDEX "pos_offer_targets_organization_id_id_key"
    ON "pos_offer_targets"("organization_id", "id");
CREATE UNIQUE INDEX "pos_offer_targets_organization_id_offer_id_category_id_key"
    ON "pos_offer_targets"("organization_id", "offer_id", "category_id");
CREATE UNIQUE INDEX "pos_offer_targets_organization_id_offer_id_color_id_key"
    ON "pos_offer_targets"("organization_id", "offer_id", "color_id");
CREATE UNIQUE INDEX "pos_offer_targets_organization_id_offer_id_size_id_key"
    ON "pos_offer_targets"("organization_id", "offer_id", "size_id");
CREATE INDEX "pos_offer_targets_organization_id_offer_id_idx"
    ON "pos_offer_targets"("organization_id", "offer_id");

CREATE UNIQUE INDEX "master_categories_organization_id_id_key"
    ON "master_categories"("organization_id", "id");
CREATE UNIQUE INDEX "master_colors_organization_id_id_key"
    ON "master_colors"("organization_id", "id");
CREATE UNIQUE INDEX "master_sizes_organization_id_id_key"
    ON "master_sizes"("organization_id", "id");

ALTER TABLE "pos_offers"
    ADD CONSTRAINT "pos_offers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_offer_targets"
    ADD CONSTRAINT "pos_offer_targets_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_offer_targets"
    ADD CONSTRAINT "pos_offer_targets_organization_id_offer_id_fkey"
    FOREIGN KEY ("organization_id", "offer_id")
    REFERENCES "pos_offers"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_offer_targets"
    ADD CONSTRAINT "pos_offer_targets_organization_id_category_id_fkey"
    FOREIGN KEY ("organization_id", "category_id")
    REFERENCES "master_categories"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_offer_targets"
    ADD CONSTRAINT "pos_offer_targets_organization_id_color_id_fkey"
    FOREIGN KEY ("organization_id", "color_id")
    REFERENCES "master_colors"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_offer_targets"
    ADD CONSTRAINT "pos_offer_targets_organization_id_size_id_fkey"
    FOREIGN KEY ("organization_id", "size_id")
    REFERENCES "master_sizes"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
