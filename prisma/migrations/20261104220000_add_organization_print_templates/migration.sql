CREATE TYPE "OrganizationPrintDocumentType" AS ENUM ('SALES_ORDER', 'QUOTATION');

CREATE TABLE "organization_print_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "document_type" "OrganizationPrintDocumentType" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "design_config" JSONB NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_print_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_print_templates_active_default_check" CHECK (NOT "is_default" OR "is_active"),
    CONSTRAINT "organization_print_templates_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_print_templates_org_id_key"
ON "organization_print_templates"("organization_id", "id");

CREATE UNIQUE INDEX "organization_print_templates_org_type_name_key"
ON "organization_print_templates"("organization_id", "document_type", "name");

CREATE UNIQUE INDEX "organization_print_templates_one_default_per_type_key"
ON "organization_print_templates"("organization_id", "document_type")
WHERE "is_default" = true;

CREATE INDEX "organization_print_templates_org_type_active_updated_idx"
ON "organization_print_templates"("organization_id", "document_type", "is_active", "updated_at" DESC);

CREATE TRIGGER "audit_organization_print_templates"
AFTER INSERT OR UPDATE OR DELETE ON "organization_print_templates"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
