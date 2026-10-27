CREATE TYPE "OrderQrTemplateType" AS ENUM ('ORDER_TAGS');

CREATE TABLE "merchandising_order_qr_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "OrderQrTemplateType" NOT NULL DEFAULT 'ORDER_TAGS',
    "field_keys" JSONB NOT NULL,
    "qr_size" INTEGER NOT NULL DEFAULT 256,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchandising_order_qr_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchandising_order_qr_templates_organization_id_name_key"
ON "merchandising_order_qr_templates"("organization_id", "name");

CREATE INDEX "merchandising_order_qr_templates_organization_id_updated_at_idx"
ON "merchandising_order_qr_templates"("organization_id", "updated_at");

ALTER TABLE "merchandising_order_qr_templates"
ADD CONSTRAINT "merchandising_order_qr_templates_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER "audit_merchandising_order_qr_templates"
AFTER INSERT OR UPDATE OR DELETE ON "merchandising_order_qr_templates"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
