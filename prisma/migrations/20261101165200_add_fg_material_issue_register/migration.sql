-- CreateEnum
CREATE TYPE "FGMaterialIssueSource" AS ENUM ('PACKING_LIST', 'POS_INVOICE', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FGMaterialIssueMovement" AS ENUM ('ISSUE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FGMaterialIssueStockType" AS ENUM ('SKU', 'GENERAL', 'ALLOCATED');

-- CreateTable
CREATE TABLE "fg_material_issues" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "issue_no" VARCHAR(100) NOT NULL,
    "source_type" "FGMaterialIssueSource" NOT NULL,
    "movement" "FGMaterialIssueMovement" NOT NULL,
    "packing_list_id" TEXT,
    "pos_invoice_id" TEXT,
    "reversal_of_id" TEXT,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "source_reference" VARCHAR(255),
    "issued_by" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_material_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fg_material_issue_lines" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "stock_type" "FGMaterialIssueStockType" NOT NULL,
    "sku_stock_id" TEXT,
    "general_receipt_id" TEXT,
    "allocated_receipt_id" TEXT,
    "shipment_box_line_id" TEXT,
    "pos_invoice_line_id" TEXT,
    "reversal_of_line_id" TEXT,
    "item_code" VARCHAR(100),
    "style_name" VARCHAR(255) NOT NULL,
    "article_no" VARCHAR(255),
    "size" VARCHAR(100),
    "colour" VARCHAR(150),
    "quantity" DECIMAL(14,2) NOT NULL,
    "uom_code" VARCHAR(50) NOT NULL,
    "stock_before" DECIMAL(14,2) NOT NULL,
    "stock_after" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_material_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fg_material_issues_organization_id_issued_at_id_idx" ON "fg_material_issues"("organization_id", "issued_at", "id");

-- CreateIndex
CREATE INDEX "fg_material_issues_organization_id_source_type_issued_at_idx" ON "fg_material_issues"("organization_id", "source_type", "issued_at");

-- CreateIndex
CREATE INDEX "fg_material_issues_organization_id_packing_list_id_idx" ON "fg_material_issues"("organization_id", "packing_list_id");

-- CreateIndex
CREATE INDEX "fg_material_issues_organization_id_pos_invoice_id_idx" ON "fg_material_issues"("organization_id", "pos_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fg_material_issues_organization_id_id_key" ON "fg_material_issues"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fg_material_issues_organization_id_issue_no_key" ON "fg_material_issues"("organization_id", "issue_no");

-- CreateIndex
CREATE UNIQUE INDEX "fg_material_issues_organization_id_idempotency_key_key" ON "fg_material_issues"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_general_receipt_id__idx" ON "fg_material_issue_lines"("organization_id", "general_receipt_id", "issue_id");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_allocated_receipt_i_idx" ON "fg_material_issue_lines"("organization_id", "allocated_receipt_id", "issue_id");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_sku_stock_id_issue__idx" ON "fg_material_issue_lines"("organization_id", "sku_stock_id", "issue_id");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_shipment_box_line_i_idx" ON "fg_material_issue_lines"("organization_id", "shipment_box_line_id");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_pos_invoice_line_id_idx" ON "fg_material_issue_lines"("organization_id", "pos_invoice_line_id");

-- CreateIndex
CREATE INDEX "fg_material_issue_lines_organization_id_reversal_of_line_id_idx" ON "fg_material_issue_lines"("organization_id", "reversal_of_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "fg_material_issue_lines_organization_id_id_key" ON "fg_material_issue_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fg_material_issue_lines_organization_id_issue_id_line_no_key" ON "fg_material_issue_lines"("organization_id", "issue_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "finished_goods_sku_stocks_organization_id_id_key" ON "finished_goods_sku_stocks"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "fg_material_issues" ADD CONSTRAINT "fg_material_issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issues" ADD CONSTRAINT "fg_material_issues_organization_id_packing_list_id_fkey" FOREIGN KEY ("organization_id", "packing_list_id") REFERENCES "finished_goods_outward_shipments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issues" ADD CONSTRAINT "fg_material_issues_organization_id_pos_invoice_id_fkey" FOREIGN KEY ("organization_id", "pos_invoice_id") REFERENCES "pos_sales_invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issues" ADD CONSTRAINT "fg_material_issues_organization_id_reversal_of_id_fkey" FOREIGN KEY ("organization_id", "reversal_of_id") REFERENCES "fg_material_issues"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_issue_id_fkey" FOREIGN KEY ("organization_id", "issue_id") REFERENCES "fg_material_issues"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_sku_stock_id_fkey" FOREIGN KEY ("organization_id", "sku_stock_id") REFERENCES "finished_goods_sku_stocks"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_general_receipt_id_fkey" FOREIGN KEY ("organization_id", "general_receipt_id") REFERENCES "finished_goods_general_stock_receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_allocated_receipt__fkey" FOREIGN KEY ("organization_id", "allocated_receipt_id") REFERENCES "finished_goods_allocated_stock_receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_shipment_box_line__fkey" FOREIGN KEY ("organization_id", "shipment_box_line_id") REFERENCES "finished_goods_outward_box_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_material_issue_lines" ADD CONSTRAINT "fg_material_issue_lines_organization_id_reversal_of_line_i_fkey" FOREIGN KEY ("organization_id", "reversal_of_line_id") REFERENCES "fg_material_issue_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
