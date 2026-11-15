-- CreateTable
CREATE TABLE "finance_integration_configs" (
    "organization_id" TEXT NOT NULL,
    "active_provider" "FinanceExternalProvider" NOT NULL DEFAULT 'NONE',
    "auto_sync" BOOLEAN NOT NULL DEFAULT false,
    "tally_server_url" VARCHAR(500),
    "tally_company_name" VARCHAR(255),
    "zoho_api_region" VARCHAR(8) NOT NULL DEFAULT 'IN',
    "zoho_organization_id" VARCHAR(100),
    "zoho_client_id_encrypted" TEXT,
    "zoho_client_secret_encrypted" TEXT,
    "zoho_refresh_token_encrypted" TEXT,
    "ledger_mappings" JSONB,
    "updated_by_user_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_integration_configs_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "procurement_vendor_bills" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "document_number" VARCHAR(120) NOT NULL,
    "vendor_invoice_number" VARCHAR(120) NOT NULL,
    "bill_date" DATE NOT NULL,
    "status" "FinanceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "entity_name_snapshot" VARCHAR(255) NOT NULL,
    "entity_gstin_snapshot" VARCHAR(15),
    "vendor_name_snapshot" VARCHAR(255) NOT NULL,
    "vendor_gstin_snapshot" VARCHAR(15),
    "place_of_supply_state_code" VARCHAR(2),
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by_user_id" VARCHAR(255),
    "created_by_email" VARCHAR(255),
    "approved_by_user_id" VARCHAR(255),
    "approved_by_email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "posted_at" TIMESTAMP(3),

    CONSTRAINT "procurement_vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procurement_vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "purchase_order_line_id" TEXT NOT NULL,
    "inventory_receipt_id" TEXT NOT NULL,
    "inventory_receipt_line_id" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "unit_of_measure" VARCHAR(30),
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_rate" DECIMAL(18,4) NOT NULL,
    "taxable_amount" DECIMAL(18,2) NOT NULL,
    "hsn_code" VARCHAR(100),
    "gst_rate" DECIMAL(8,4) NOT NULL,
    "cgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_vendor_bills_organization_id_bill_date_idx"
ON "procurement_vendor_bills"("organization_id", "bill_date");

-- CreateIndex
CREATE INDEX "procurement_vendor_bills_organization_id_status_bill_date_idx"
ON "procurement_vendor_bills"("organization_id", "status", "bill_date");

-- CreateIndex
CREATE INDEX "procurement_vendor_bills_organization_id_purchase_order_id_idx"
ON "procurement_vendor_bills"("organization_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_vendor_bills_organization_id_id_key"
ON "procurement_vendor_bills"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_vendor_bills_organization_id_document_number_key"
ON "procurement_vendor_bills"("organization_id", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_vendor_bills_organization_id_vendor_id_vendor_i_key"
ON "procurement_vendor_bills"("organization_id", "vendor_id", "vendor_invoice_number");

-- CreateIndex
CREATE INDEX "procurement_vendor_bill_lines_organization_id_purchase_orde_idx"
ON "procurement_vendor_bill_lines"("organization_id", "purchase_order_line_id");

-- CreateIndex
CREATE INDEX "procurement_vendor_bill_lines_organization_id_inventory_rec_idx"
ON "procurement_vendor_bill_lines"("organization_id", "inventory_receipt_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "procurement_vendor_bill_lines_organization_id_bill_id_line__key"
ON "procurement_vendor_bill_lines"("organization_id", "bill_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipt_lines_receipt_id_id_key"
ON "inventory_receipt_lines"("receipt_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_id_key"
ON "purchase_order_lines"("purchase_order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_id_key"
ON "purchase_orders"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "finance_integration_configs"
ADD CONSTRAINT "finance_integration_configs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bills"
ADD CONSTRAINT "procurement_vendor_bills_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bills"
ADD CONSTRAINT "procurement_vendor_bills_organization_id_entity_id_fkey"
FOREIGN KEY ("organization_id", "entity_id") REFERENCES "master_entities"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bills"
ADD CONSTRAINT "procurement_vendor_bills_organization_id_vendor_id_fkey"
FOREIGN KEY ("organization_id", "vendor_id") REFERENCES "master_vendors"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bills"
ADD CONSTRAINT "procurement_vendor_bills_organization_id_purchase_order_id_fkey"
FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bill_lines"
ADD CONSTRAINT "procurement_vendor_bill_lines_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bill_lines"
ADD CONSTRAINT "procurement_vendor_bill_lines_organization_id_bill_id_fkey"
FOREIGN KEY ("organization_id", "bill_id") REFERENCES "procurement_vendor_bills"("organization_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bill_lines"
ADD CONSTRAINT "procurement_vendor_bill_lines_purchase_order_id_purchase_o_fkey"
FOREIGN KEY ("purchase_order_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("purchase_order_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_vendor_bill_lines"
ADD CONSTRAINT "procurement_vendor_bill_lines_inventory_receipt_id_invento_fkey"
FOREIGN KEY ("inventory_receipt_id", "inventory_receipt_line_id") REFERENCES "inventory_receipt_lines"("receipt_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
