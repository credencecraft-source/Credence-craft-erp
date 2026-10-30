CREATE TABLE "sales_channel_contact_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sales_channel_value_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_channel_contact_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scca_organization_channel_contact_key"
ON "sales_channel_contact_assignments"("organization_id", "sales_channel_value_id", "contact_id");

CREATE INDEX "scca_organization_channel_created_idx"
ON "sales_channel_contact_assignments"("organization_id", "sales_channel_value_id", "created_at");

CREATE INDEX "scca_organization_contact_idx"
ON "sales_channel_contact_assignments"("organization_id", "contact_id");

ALTER TABLE "sales_channel_contact_assignments"
ADD CONSTRAINT "scca_organization_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_channel_contact_assignments"
ADD CONSTRAINT "scca_sales_channel_value_fkey"
FOREIGN KEY ("sales_channel_value_id") REFERENCES "master_module_values"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales_channel_contact_assignments"
ADD CONSTRAINT "scca_organization_contact_fkey"
FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
