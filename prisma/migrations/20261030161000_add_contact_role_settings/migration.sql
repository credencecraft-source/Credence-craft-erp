CREATE TYPE "ContactRoleCommissionType" AS ENUM ('PERCENTAGE', 'FLAT_PER_PIECE');

CREATE TABLE "contact_role_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role_code" VARCHAR(40) NOT NULL,
    "mapped_contact_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "block_billing" BOOLEAN NOT NULL DEFAULT false,
    "always_bill_to_distributor" BOOLEAN NOT NULL DEFAULT false,
    "allow_orders" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "commission_type" "ContactRoleCommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "use_common_settings" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_role_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_role_settings_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_role_settings_owner_fkey"
        FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_role_settings_mapped_contact_fkey"
        FOREIGN KEY ("organization_id", "mapped_contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contact_role_settings_target_key"
    ON "contact_role_settings"("organization_id", "contact_id", "role_code", "mapped_contact_id");

CREATE UNIQUE INDEX "contact_role_settings_common_target_key"
    ON "contact_role_settings"("organization_id", "contact_id", "role_code")
    WHERE "mapped_contact_id" IS NULL;

CREATE INDEX "contact_role_settings_scope_idx"
    ON "contact_role_settings"("organization_id", "contact_id", "role_code");
