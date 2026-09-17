CREATE TABLE "organization_tax_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "country" VARCHAR(10) NOT NULL DEFAULT 'IN',
    "tax_regime" VARCHAR(30) NOT NULL DEFAULT 'GST',
    "gstin" VARCHAR(20),
    "state" VARCHAR(100),
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cgst_rate" DECIMAL(10,2),
    "sgst_rate" DECIMAL(10,2),
    "igst_rate" DECIMAL(10,2),
    "vat_rate" DECIMAL(10,2),
    "sales_tax_rate" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_tax_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_tax_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_tax_profiles_organization_id_country_tax_regime_key"
    ON "organization_tax_profiles"("organization_id", "country", "tax_regime");

CREATE INDEX "organization_tax_profiles_organization_id_is_default_is_active_idx"
    ON "organization_tax_profiles"("organization_id", "is_default", "is_active");
