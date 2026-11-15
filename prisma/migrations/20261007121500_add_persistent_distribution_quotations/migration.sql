CREATE TABLE "distribution_quotations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "parent_quotation_id" TEXT,
    "quotation_no" VARCHAR(100) NOT NULL,
    "quotation_date" DATE NOT NULL,
    "valid_until" DATE,
    "order_no" VARCHAR(1000) NOT NULL,
    "customer" VARCHAR(255) NOT NULL,
    "notes" VARCHAR(2000),
    "mode" VARCHAR(20) NOT NULL DEFAULT 'SINGLE',
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "total_quantity" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "distribution_quotations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "distribution_quotations_mode_check" CHECK ("mode" IN ('SINGLE', 'MULTIPLE', 'MASTER')),
    CONSTRAINT "distribution_quotations_status_check" CHECK ("status" IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT "distribution_quotations_total_quantity_check" CHECK ("total_quantity" >= 0),
    CONSTRAINT "distribution_quotations_subtotal_check" CHECK ("subtotal" >= 0)
);

CREATE TABLE "distribution_quotation_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "quotation_id" TEXT NOT NULL,
    "source_booking_size_id" TEXT NOT NULL,
    "item_description" VARCHAR(500) NOT NULL,
    "booking_no" VARCHAR(100) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "brand" VARCHAR(255),
    "style_name" VARCHAR(255),
    "size" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "distribution_quotation_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "distribution_quotation_lines_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "distribution_quotation_lines_unit_price_check" CHECK ("unit_price" >= 0),
    CONSTRAINT "distribution_quotation_lines_total_check" CHECK ("line_total" >= 0)
);

CREATE UNIQUE INDEX "distribution_quotations_organization_id_id_key"
ON "distribution_quotations"("organization_id", "id");
CREATE UNIQUE INDEX "distribution_quotations_organization_id_quotation_no_key"
ON "distribution_quotations"("organization_id", "quotation_no");
CREATE INDEX "distribution_quotations_organization_id_quotation_date_created_at_idx"
ON "distribution_quotations"("organization_id", "quotation_date", "created_at");
CREATE INDEX "distribution_quotations_organization_id_parent_quotation_id_idx"
ON "distribution_quotations"("organization_id", "parent_quotation_id");
CREATE INDEX "distribution_quotations_organization_id_vendor_id_idx"
ON "distribution_quotations"("organization_id", "vendor_id");

CREATE UNIQUE INDEX "distribution_quotation_lines_organization_id_id_key"
ON "distribution_quotation_lines"("organization_id", "id");
CREATE UNIQUE INDEX "distribution_quotation_lines_organization_id_source_booking_size_id_key"
ON "distribution_quotation_lines"("organization_id", "source_booking_size_id");
CREATE INDEX "distribution_quotation_lines_organization_id_quotation_id_idx"
ON "distribution_quotation_lines"("organization_id", "quotation_id");

ALTER TABLE "distribution_quotations"
ADD CONSTRAINT "distribution_quotations_organization_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distribution_quotations"
ADD CONSTRAINT "distribution_quotations_vendor_fkey"
FOREIGN KEY ("organization_id", "vendor_id")
REFERENCES "master_vendors"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "distribution_quotations"
ADD CONSTRAINT "distribution_quotations_parent_fkey"
FOREIGN KEY ("organization_id", "parent_quotation_id")
REFERENCES "distribution_quotations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distribution_quotation_lines"
ADD CONSTRAINT "distribution_quotation_lines_organization_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distribution_quotation_lines"
ADD CONSTRAINT "distribution_quotation_lines_quotation_fkey"
FOREIGN KEY ("organization_id", "quotation_id")
REFERENCES "distribution_quotations"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distribution_quotation_lines"
ADD CONSTRAINT "distribution_quotation_lines_source_booking_size_fkey"
FOREIGN KEY ("organization_id", "source_booking_size_id")
REFERENCES "advance_booking_size_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TRIGGER IF EXISTS "audit_distribution_quotations" ON "distribution_quotations";
CREATE TRIGGER "audit_distribution_quotations"
AFTER INSERT OR UPDATE OR DELETE ON "distribution_quotations"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();

DROP TRIGGER IF EXISTS "audit_distribution_quotation_lines" ON "distribution_quotation_lines";
CREATE TRIGGER "audit_distribution_quotation_lines"
AFTER INSERT OR UPDATE OR DELETE ON "distribution_quotation_lines"
FOR EACH ROW EXECUTE FUNCTION record_organization_audit_event();
