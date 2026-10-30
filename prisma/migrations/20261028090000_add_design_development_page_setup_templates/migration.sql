CREATE TABLE "design_development_page_setup_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "paper_size" VARCHAR(20) NOT NULL DEFAULT 'A4',
    "orientation" VARCHAR(20) NOT NULL DEFAULT 'PORTRAIT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_development_page_setup_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "design_development_page_setup_templates_organization_id_name_key"
ON "design_development_page_setup_templates"("organization_id", "name");

CREATE INDEX "design_development_page_setup_templates_organization_id_updated_at_idx"
ON "design_development_page_setup_templates"("organization_id", "updated_at");

ALTER TABLE "design_development_page_setup_templates"
ADD CONSTRAINT "design_development_page_setup_templates_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "audit_design_development_page_setup_templates"
AFTER INSERT OR UPDATE OR DELETE ON "design_development_page_setup_templates"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
