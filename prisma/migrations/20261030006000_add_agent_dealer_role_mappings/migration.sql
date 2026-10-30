CREATE TABLE "contact_role_mappings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "parent_role_code" VARCHAR(40) NOT NULL,
    "parent_contact_id" TEXT NOT NULL,
    "mapped_contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_role_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_role_mappings_unique_mapping"
ON "contact_role_mappings"("organization_id", "parent_role_code", "parent_contact_id", "mapped_contact_id");

CREATE UNIQUE INDEX "contact_role_mappings_unique_mapped_contact"
ON "contact_role_mappings"("organization_id", "parent_role_code", "mapped_contact_id");

CREATE INDEX "contact_role_mappings_parent_idx"
ON "contact_role_mappings"("organization_id", "parent_role_code", "parent_contact_id", "created_at");

ALTER TABLE "contact_role_mappings"
ADD CONSTRAINT "contact_role_mappings_organization_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_role_mappings"
ADD CONSTRAINT "contact_role_mappings_parent_contact_fkey"
FOREIGN KEY ("organization_id", "parent_contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_role_mappings"
ADD CONSTRAINT "contact_role_mappings_mapped_contact_fkey"
FOREIGN KEY ("organization_id", "mapped_contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
