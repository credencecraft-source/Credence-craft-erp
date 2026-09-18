CREATE TABLE "master_gold_seals" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "gold_seal" VARCHAR(255) NOT NULL,
    "gold_seal_code" VARCHAR(100),
    "design_by" VARCHAR(255),
    "designed_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_gold_seals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "master_gold_seal_variants" (
    "id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "gold_seal_id" TEXT NOT NULL,
    "variant" VARCHAR(255) NOT NULL,
    "variant_code" VARCHAR(100),
    "color" VARCHAR(150),
    "size" VARCHAR(100),
    "sku" VARCHAR(150),
    "barcode" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "legacy_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "master_gold_seal_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_gold_seals_value_id_key" ON "master_gold_seals"("value_id");
CREATE UNIQUE INDEX "master_gold_seals_organization_id_gold_seal_key" ON "master_gold_seals"("organization_id", "gold_seal");
CREATE UNIQUE INDEX "master_gold_seals_organization_id_gold_seal_code_key" ON "master_gold_seals"("organization_id", "gold_seal_code");
CREATE INDEX "master_gold_seals_organization_id_is_active_idx" ON "master_gold_seals"("organization_id", "is_active");

CREATE UNIQUE INDEX "master_gold_seal_variants_value_id_key" ON "master_gold_seal_variants"("value_id");
CREATE UNIQUE INDEX "master_gold_seal_variants_organization_id_gold_seal_id_variant_key" ON "master_gold_seal_variants"("organization_id", "gold_seal_id", "variant");
CREATE UNIQUE INDEX "master_gold_seal_variants_organization_id_variant_code_key" ON "master_gold_seal_variants"("organization_id", "variant_code");
CREATE UNIQUE INDEX "master_gold_seal_variants_organization_id_sku_key" ON "master_gold_seal_variants"("organization_id", "sku");
CREATE UNIQUE INDEX "master_gold_seal_variants_organization_id_barcode_key" ON "master_gold_seal_variants"("organization_id", "barcode");
CREATE INDEX "master_gold_seal_variants_organization_id_gold_seal_id_is_active_idx" ON "master_gold_seal_variants"("organization_id", "gold_seal_id", "is_active");

ALTER TABLE "master_gold_seals" ADD CONSTRAINT "master_gold_seals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_gold_seal_variants" ADD CONSTRAINT "master_gold_seal_variants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "master_gold_seal_variants" ADD CONSTRAINT "master_gold_seal_variants_gold_seal_id_fkey" FOREIGN KEY ("gold_seal_id") REFERENCES "master_gold_seals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
