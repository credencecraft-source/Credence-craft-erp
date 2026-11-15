CREATE TABLE "distribution_order_forms" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "contact_id" TEXT,
    "quotation_id" TEXT,
    "order_form_no" VARCHAR(100) NOT NULL,
    "order_form_date" DATE NOT NULL,
    "customer" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "total_quantity" INTEGER NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_order_forms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "distribution_order_forms_organization_id_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "distribution_order_forms_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "distribution_order_forms_quotation_fkey"
        FOREIGN KEY ("organization_id", "quotation_id") REFERENCES "distribution_quotations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "distribution_order_form_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "order_form_id" TEXT NOT NULL,
    "source_booking_id" TEXT NOT NULL,
    "booking_no" VARCHAR(100) NOT NULL,
    "order_no" VARCHAR(100) NOT NULL,
    "brand" VARCHAR(255),
    "style_name" VARCHAR(255),
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_order_form_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "distribution_order_form_lines_organization_id_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "distribution_order_form_lines_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "distribution_order_form_lines_order_form_fkey"
        FOREIGN KEY ("organization_id", "order_form_id") REFERENCES "distribution_order_forms"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "distribution_order_form_lines_booking_fkey"
        FOREIGN KEY ("organization_id", "source_booking_id") REFERENCES "advance_bookings"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "distribution_order_forms_organization_id_order_form_no_key" ON "distribution_order_forms"("organization_id", "order_form_no");
CREATE INDEX "distribution_order_forms_organization_id_order_form_date_created_at_idx" ON "distribution_order_forms"("organization_id", "order_form_date", "created_at");
CREATE INDEX "distribution_order_forms_organization_id_quotation_id_idx" ON "distribution_order_forms"("organization_id", "quotation_id");

CREATE UNIQUE INDEX "distribution_order_form_lines_organization_id_source_booking_id_key" ON "distribution_order_form_lines"("organization_id", "source_booking_id");
CREATE INDEX "distribution_order_form_lines_organization_id_order_form_id_idx" ON "distribution_order_form_lines"("organization_id", "order_form_id");
