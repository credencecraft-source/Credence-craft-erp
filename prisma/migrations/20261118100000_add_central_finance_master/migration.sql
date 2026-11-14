CREATE TYPE "FinanceDocumentType" AS ENUM ('SALES_INVOICE', 'PURCHASE_INVOICE', 'PURCHASE_BILL', 'CREDIT_NOTE', 'DEBIT_NOTE', 'DELIVERY_CHALLAN');
CREATE TYPE "FinanceDocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'LOCKED', 'CANCELLED', 'REVERSED');
CREATE TYPE "FinanceSourceModule" AS ENUM ('POS', 'PROCUREMENT', 'INVENTORY', 'ORDER_MANAGEMENT', 'FINANCE_DIRECT');
CREATE TYPE "FinanceSourceType" AS ENUM ('POS_SALES_INVOICE', 'POS_PURCHASE_BILL', 'POS_SALES_RETURN', 'PROCUREMENT_VENDOR_BILL', 'LOGISTICS_CHALLAN');
CREATE TYPE "FinanceSyncStatus" AS ENUM ('PENDING', 'QUEUED', 'SYNCED', 'FAILED', 'SKIPPED');
CREATE TYPE "FinanceExternalProvider" AS ENUM ('TALLY', 'ZOHO_BOOKS', 'NONE');

CREATE TABLE "central_finance_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "document_type" "FinanceDocumentType" NOT NULL,
    "document_number" VARCHAR(120) NOT NULL,
    "document_date" DATE NOT NULL,
    "status" "FinanceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "source_module" "FinanceSourceModule" NOT NULL,
    "source_type" "FinanceSourceType" NOT NULL,
    "sub_source" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(255) NOT NULL,
    "source_document_number" VARCHAR(120) NOT NULL,
    "entity_id" TEXT,
    "entity_name_snapshot" VARCHAR(255),
    "entity_gstin" VARCHAR(15),
    "party_id" VARCHAR(255),
    "party_name" VARCHAR(255) NOT NULL,
    "party_gstin" VARCHAR(15),
    "place_of_supply_state_code" VARCHAR(2),
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by_user_id" VARCHAR(255),
    "created_by_email" VARCHAR(255),
    "approved_by_user_id" VARCHAR(255),
    "approved_by_email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "reversed_at" TIMESTAMP(3),
    "reversal_of_id" TEXT,
    "sync_status" "FinanceSyncStatus" NOT NULL DEFAULT 'PENDING',
    "external_provider" "FinanceExternalProvider" NOT NULL DEFAULT 'NONE',
    "external_system_id" VARCHAR(255),
    "external_voucher_number" VARCHAR(120),
    "last_synced_at" TIMESTAMP(3),
    "sync_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "sync_error_payload" JSONB,
    CONSTRAINT "central_finance_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "central_finance_transaction_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "source_line_id" VARCHAR(255),
    "line_number" INTEGER NOT NULL,
    "item_code" VARCHAR(100),
    "description" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit_of_measure" VARCHAR(30),
    "unit_rate" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "hsn_code" VARCHAR(100),
    "gst_rate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "central_finance_transaction_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_sync_outbox_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "provider" "FinanceExternalProvider" NOT NULL,
    "status" "FinanceSyncStatus" NOT NULL DEFAULT 'PENDING',
    "event_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "error_payload" JSONB,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_sync_outbox_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "central_finance_transactions_organization_id_id_key" ON "central_finance_transactions"("organization_id", "id");
CREATE UNIQUE INDEX "central_finance_transactions_organization_id_source_type_so_key" ON "central_finance_transactions"("organization_id", "source_type", "source_id");
CREATE UNIQUE INDEX "central_finance_transactions_organization_id_document_numbe_key" ON "central_finance_transactions"("organization_id", "document_number");
CREATE INDEX "central_finance_transactions_organization_id_document_date_idx" ON "central_finance_transactions"("organization_id", "document_date");
CREATE INDEX "central_finance_transactions_organization_id_document_type__idx" ON "central_finance_transactions"("organization_id", "document_type", "status");
CREATE INDEX "central_finance_transactions_organization_id_sync_status_idx" ON "central_finance_transactions"("organization_id", "sync_status");
CREATE INDEX "central_finance_transactions_organization_id_party_id_idx" ON "central_finance_transactions"("organization_id", "party_id");
CREATE INDEX "central_finance_transactions_organization_id_source_module__idx" ON "central_finance_transactions"("organization_id", "source_module", "document_date");
CREATE INDEX "central_finance_transactions_organization_id_reversal_of_id_idx" ON "central_finance_transactions"("organization_id", "reversal_of_id");
CREATE UNIQUE INDEX "central_finance_transaction_lines_organization_id_transacti_key" ON "central_finance_transaction_lines"("organization_id", "transaction_id", "line_number");
CREATE INDEX "central_finance_transaction_lines_organization_id_transacti_idx" ON "central_finance_transaction_lines"("organization_id", "transaction_id");
CREATE INDEX "central_finance_transaction_lines_organization_id_source_li_idx" ON "central_finance_transaction_lines"("organization_id", "source_line_id");
CREATE UNIQUE INDEX "finance_sync_outbox_logs_organization_id_transaction_id_pro_key" ON "finance_sync_outbox_logs"("organization_id", "transaction_id", "provider", "event_type");
CREATE INDEX "finance_sync_outbox_logs_organization_id_status_available_a_idx" ON "finance_sync_outbox_logs"("organization_id", "status", "available_at");
CREATE INDEX "finance_sync_outbox_logs_organization_id_transaction_id_cre_idx" ON "finance_sync_outbox_logs"("organization_id", "transaction_id", "created_at");

ALTER TABLE "central_finance_transactions" ADD CONSTRAINT "central_finance_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "central_finance_transactions" ADD CONSTRAINT "central_finance_transactions_organization_id_entity_id_fkey" FOREIGN KEY ("organization_id", "entity_id") REFERENCES "master_entities"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "central_finance_transactions" ADD CONSTRAINT "central_finance_transactions_organization_id_reversal_of_i_fkey" FOREIGN KEY ("organization_id", "reversal_of_id") REFERENCES "central_finance_transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "central_finance_transaction_lines" ADD CONSTRAINT "central_finance_transaction_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "central_finance_transaction_lines" ADD CONSTRAINT "central_finance_transaction_lines_organization_id_transact_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "central_finance_transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance_sync_outbox_logs" ADD CONSTRAINT "finance_sync_outbox_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_sync_outbox_logs" ADD CONSTRAINT "finance_sync_outbox_logs_organization_id_transaction_id_fkey" FOREIGN KEY ("organization_id", "transaction_id") REFERENCES "central_finance_transactions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
