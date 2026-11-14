import {
  FinanceDocumentStatus,
  FinanceDocumentType,
  FinanceExternalProvider,
  FinanceSourceModule,
  FinanceSourceType,
  FinanceSyncStatus,
  Prisma,
} from "@prisma/client";

import { evaluateOrganizationPermission } from "@/lib/services/organizations/organization-permission-evaluator";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import { validateProcurementVendorBillSources } from "@/lib/services/finance/procurement-vendor-bill-validation";

export type FinanceIngestionLine = {
  sourceLineId?: string | null;
  itemCode?: string | null;
  description: string;
  quantity: Prisma.Decimal | string;
  unitOfMeasure?: string | null;
  unitRate: Prisma.Decimal | string;
  discountAmount?: Prisma.Decimal | string;
  taxableAmount: Prisma.Decimal | string;
  hsnCode?: string | null;
  gstRate: Prisma.Decimal | string;
  cgstAmount: Prisma.Decimal | string;
  sgstAmount: Prisma.Decimal | string;
  igstAmount: Prisma.Decimal | string;
  otherTaxAmount?: Prisma.Decimal | string;
  totalAmount: Prisma.Decimal | string;
};

export type FinanceIngestionInput = {
  organizationId: string;
  documentNumber: string;
  documentDate: Date;
  sourceId: string;
  sourceDocumentNumber: string;
  subSource: string;
  entityId?: string | null;
  entityName?: string | null;
  entityGstin?: string | null;
  partyId?: string | null;
  partyName: string;
  partyGstin?: string | null;
  placeOfSupplyStateCode?: string | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  subtotal: Prisma.Decimal | string;
  taxableAmount: Prisma.Decimal | string;
  cgstAmount: Prisma.Decimal | string;
  sgstAmount: Prisma.Decimal | string;
  igstAmount: Prisma.Decimal | string;
  otherTaxAmount?: Prisma.Decimal | string;
  totalAmount: Prisma.Decimal | string;
  lines: FinanceIngestionLine[];
};

type IngestionResult = { id: string; duplicate: boolean };

function money(value: Prisma.Decimal | string, field: string) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal amount.`);
  }
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`${field} must be a finite non-negative amount.`);
  }
  return parsed.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function measure(value: Prisma.Decimal | string, field: string) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal value.`);
  }
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new Error(`${field} must be a finite non-negative value.`);
  }
  return parsed.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function cleanSnapshot(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = normalizeUppercase(value.trim());
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function ingest(
  tx: Prisma.TransactionClient,
  input: FinanceIngestionInput,
  documentType: FinanceDocumentType,
  sourceType: FinanceSourceType,
  sourceModule: FinanceSourceModule,
): Promise<IngestionResult> {
  const organizationId = input.organizationId.trim();
  const sourceId = input.sourceId.trim();
  const documentNumber = input.documentNumber.trim();
  const sourceDocumentNumber = input.sourceDocumentNumber.trim();
  if (!organizationId || !sourceId || !documentNumber || !sourceDocumentNumber) {
    throw new Error("Finance ingestion requires an organization, source, and document reference.");
  }
  if (!(input.documentDate instanceof Date) || Number.isNaN(input.documentDate.getTime())) {
    throw new Error("Finance document date is invalid.");
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1000) {
    throw new Error("A finance document must contain between 1 and 1,000 lines.");
  }
  if (input.createdByUserId?.trim()) {
    const membership = await tx.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        workspace_user_id: input.createdByUserId.trim(),
        is_active: true,
      },
      select: { role: true },
    });
    if (!membership) throw new Error("Finance ingestion actor is not an active member of this organization.");
    if (membership.role !== "OWNER") {
      const permissions = await tx.organizationRolePermission.findMany({
        where: {
          organization_id: organizationId,
          role: membership.role,
          permission: {
            in: [
              "ACCESS_MODULE_FINANCE_MANAGEMENT",
              "DENY:ACCESS_MODULE_FINANCE_MANAGEMENT",
            ],
          },
        },
        select: { permission: true },
      });
      const access = evaluateOrganizationPermission({
        role: membership.role,
        permission: "ACCESS_MODULE_FINANCE_MANAGEMENT",
        storedPermissions: permissions.map((permission) => permission.permission),
        defaultPermissions: [],
      });
      if (!access.allowed) throw new Error("Access denied: Finance module access is required to ingest financial transactions.");
    }
  }

  const existing = await tx.centralFinanceTransaction.findUnique({
    where: {
      organization_id_source_type_source_id: {
        organization_id: organizationId,
        source_type: sourceType,
        source_id: sourceId,
      },
    },
    select: {
      id: true,
      total_amount: true,
      source_document_number: true,
      status: true,
    },
  });
  const totalAmount = money(input.totalAmount, "Document total");
  if (existing) {
    if (
      !existing.total_amount.eq(totalAmount)
      || existing.source_document_number !== sourceDocumentNumber
      || existing.status !== FinanceDocumentStatus.POSTED
    ) {
      throw new Error("This source document is already ingested with conflicting financial data.");
    }
    return { id: existing.id, duplicate: true };
  }

  const lines = input.lines.map((line, index) => {
    const quantity = measure(line.quantity, "Line quantity");
    const unitRate = measure(line.unitRate, "Line unit rate");
    const taxableAmount = money(line.taxableAmount, "Line taxable amount");
    const cgstAmount = money(line.cgstAmount, "Line CGST");
    const sgstAmount = money(line.sgstAmount, "Line SGST");
    const igstAmount = money(line.igstAmount, "Line IGST");
    const otherTaxAmount = money(line.otherTaxAmount ?? "0", "Line other tax");
    const totalTaxAmount = cgstAmount.plus(sgstAmount).plus(igstAmount).plus(otherTaxAmount);
    const lineTotal = money(line.totalAmount, "Line total");
    if (!taxableAmount.plus(totalTaxAmount).eq(lineTotal)) {
      throw new Error(`Finance line ${index + 1} does not reconcile to its tax and total.`);
    }
    return {
      source_line_id: line.sourceLineId?.trim() || null,
      line_number: index + 1,
      item_code: cleanSnapshot(line.itemCode, 100),
      description: normalizeUppercase(line.description.trim()).slice(0, 500),
      quantity,
      unit_of_measure: cleanSnapshot(line.unitOfMeasure, 30),
      unit_rate: unitRate,
      discount_amount: money(line.discountAmount ?? "0", "Line discount"),
      taxable_amount: taxableAmount,
      hsn_code: cleanSnapshot(line.hsnCode, 100),
      gst_rate: measure(line.gstRate, "GST rate"),
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      other_tax_amount: otherTaxAmount,
      total_tax_amount: totalTaxAmount,
      total_amount: lineTotal,
    };
  });

  const subtotal = money(input.subtotal, "Document subtotal");
  const taxableAmount = money(input.taxableAmount, "Document taxable amount");
  const cgstAmount = money(input.cgstAmount, "Document CGST");
  const sgstAmount = money(input.sgstAmount, "Document SGST");
  const igstAmount = money(input.igstAmount, "Document IGST");
  const otherTaxAmount = money(input.otherTaxAmount ?? "0", "Document other tax");
  const totalTaxAmount = cgstAmount.plus(sgstAmount).plus(igstAmount).plus(otherTaxAmount);
  const lineTotals = lines.reduce((totals, line) => ({
    taxable: totals.taxable.plus(line.taxable_amount),
    cgst: totals.cgst.plus(line.cgst_amount),
    sgst: totals.sgst.plus(line.sgst_amount),
    igst: totals.igst.plus(line.igst_amount),
    otherTax: totals.otherTax.plus(line.other_tax_amount),
    total: totals.total.plus(line.total_amount),
  }), {
    taxable: new Prisma.Decimal(0),
    cgst: new Prisma.Decimal(0),
    sgst: new Prisma.Decimal(0),
    igst: new Prisma.Decimal(0),
    otherTax: new Prisma.Decimal(0),
    total: new Prisma.Decimal(0),
  });
  if (
    !lineTotals.taxable.eq(taxableAmount)
    || !lineTotals.cgst.eq(cgstAmount)
    || !lineTotals.sgst.eq(sgstAmount)
    || !lineTotals.igst.eq(igstAmount)
    || !lineTotals.otherTax.eq(otherTaxAmount)
    || !lineTotals.total.eq(totalAmount)
    || !taxableAmount.plus(totalTaxAmount).eq(totalAmount)
  ) {
    throw new Error("Finance document totals do not reconcile to the source lines.");
  }

  let actorId: string | null = null;
  let actorEmail = cleanSnapshot(input.createdByEmail, 255);
  if (input.createdByUserId?.trim()) {
    const actor = await tx.workspaceUser.findUnique({
      where: { id: input.createdByUserId.trim() },
      select: { id: true, email: true },
    });
    if (!actor) throw new Error("Finance document creator is not a valid workspace user.");
    actorId = actor.id;
    actorEmail ??= cleanSnapshot(actor.email, 255);
  }

  const record = await tx.centralFinanceTransaction.create({
    data: {
      organization_id: organizationId,
      document_type: documentType,
      document_number: documentNumber,
      document_date: input.documentDate,
      status: FinanceDocumentStatus.POSTED,
      source_module: sourceModule,
      source_type: sourceType,
      sub_source: cleanSnapshot(input.subSource, 80) ?? "UNSPECIFIED",
      source_id: sourceId,
      source_document_number: sourceDocumentNumber,
      entity_id: input.entityId?.trim() || null,
      entity_name_snapshot: cleanSnapshot(input.entityName, 255),
      entity_gstin: cleanSnapshot(input.entityGstin, 15),
      party_id: input.partyId?.trim() || null,
      party_name: normalizeUppercase(input.partyName.trim()).slice(0, 255),
      party_gstin: cleanSnapshot(input.partyGstin, 15),
      place_of_supply_state_code: input.placeOfSupplyStateCode?.trim() || null,
      subtotal,
      taxable_amount: taxableAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      other_tax_amount: otherTaxAmount,
      total_tax_amount: totalTaxAmount,
      total_amount: totalAmount,
      created_by_user_id: actorId,
      created_by_email: actorEmail,
      posted_at: new Date(),
      sync_status: FinanceSyncStatus.PENDING,
      external_provider: FinanceExternalProvider.NONE,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.financeSyncOutboxLog.create({
    data: {
      organization_id: organizationId,
      transaction_id: record.id,
      provider: FinanceExternalProvider.NONE,
      status: FinanceSyncStatus.PENDING,
      event_type: "TRANSACTION_POSTED",
      payload: {
        transactionId: record.id,
        sourceModule,
        sourceType,
        sourceId,
        sourceDocumentNumber,
      },
    },
  });
  await tx.auditEvent.create({
    data: {
      organization_id: organizationId,
      user_id: actorId,
      module: "FINANCE_MANAGEMENT",
      action: `INGEST_${sourceType}`,
      entity_type: "central_finance_transaction",
      entity_id: record.id,
      details: {
        fromStatus: null,
        toStatus: FinanceDocumentStatus.POSTED,
        sourceModule,
        sourceType,
        sourceId,
        sourceDocumentNumber,
      },
    },
  });

  return { id: record.id, duplicate: false };
}

export function ingestPosSale(tx: Prisma.TransactionClient, input: FinanceIngestionInput) {
  return ingest(tx, input, FinanceDocumentType.SALES_INVOICE, FinanceSourceType.POS_SALES_INVOICE, FinanceSourceModule.POS);
}

export function ingestPosPurchaseBill(tx: Prisma.TransactionClient, input: FinanceIngestionInput) {
  return ingest(tx, input, FinanceDocumentType.PURCHASE_BILL, FinanceSourceType.POS_PURCHASE_BILL, FinanceSourceModule.POS);
}

export function ingestPosReturn(tx: Prisma.TransactionClient, input: FinanceIngestionInput) {
  return ingest(tx, input, FinanceDocumentType.CREDIT_NOTE, FinanceSourceType.POS_SALES_RETURN, FinanceSourceModule.POS);
}

export async function ingestProcurementVendorBill(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; billId: string },
) {
  const bill = await tx.procurementVendorBill.findFirst({
    where: { id: input.billId, organization_id: input.organizationId },
    include: { lines: { orderBy: { line_number: "asc" } } },
  });
  if (!bill) throw new Error("Procurement vendor bill was not found in this organization.");
  if (bill.status !== FinanceDocumentStatus.APPROVED) {
    throw new Error("Only an approved procurement vendor bill can be posted to Central Finance.");
  }
  const validated = await validateProcurementVendorBillSources(tx, {
    organizationId: input.organizationId,
    entityId: bill.entity_id,
    vendorId: bill.vendor_id,
    purchaseOrderId: bill.purchase_order_id,
    billDate: bill.bill_date,
    billIdToExclude: bill.id,
    lines: bill.lines.map((line) => ({
      purchaseOrderLineId: line.purchase_order_line_id,
      inventoryReceiptLineId: line.inventory_receipt_line_id,
      quantity: line.quantity,
    })),
  });
  const totalsMatch = bill.lines.length === validated.lines.length
    && bill.lines.every((line, index) => {
      const current = validated.lines[index];
      return line.purchase_order_line_id === current.purchaseOrderLineId
        && line.inventory_receipt_line_id === current.inventoryReceiptLineId
        && line.quantity.eq(current.quantity)
        && line.unit_rate.eq(current.unitRate)
        && line.taxable_amount.eq(current.taxableAmount)
        && line.gst_rate.eq(current.gstRate)
        && line.cgst_amount.eq(current.cgstAmount)
        && line.sgst_amount.eq(current.sgstAmount)
        && line.igst_amount.eq(current.igstAmount)
        && line.total_amount.eq(current.totalAmount);
    });
  if (
    !totalsMatch
    || !bill.subtotal.eq(validated.tax.taxableAmount)
    || !bill.cgst_amount.eq(validated.tax.cgstAmount)
    || !bill.sgst_amount.eq(validated.tax.sgstAmount)
    || !bill.igst_amount.eq(validated.tax.igstAmount)
    || !bill.total_amount.eq(validated.tax.totalAmount)
  ) {
    throw new Error("Procurement bill totals or tax snapshots no longer reconcile to the approved Purchase Order and GRN.");
  }
  return ingest(tx, {
    organizationId: input.organizationId,
    documentNumber: bill.document_number,
    documentDate: bill.bill_date,
    sourceId: bill.id,
    sourceDocumentNumber: bill.vendor_invoice_number,
    subSource: "PROCUREMENT_PURCHASE_ORDER",
    entityId: bill.entity_id,
    entityName: bill.entity_name_snapshot,
    entityGstin: bill.entity_gstin_snapshot,
    partyId: bill.vendor_id,
    partyName: bill.vendor_name_snapshot,
    partyGstin: bill.vendor_gstin_snapshot,
    placeOfSupplyStateCode: validated.tax.placeOfSupplyStateCode,
    createdByUserId: bill.created_by_user_id,
    createdByEmail: bill.created_by_email,
    subtotal: validated.tax.taxableAmount,
    taxableAmount: validated.tax.taxableAmount,
    cgstAmount: validated.tax.cgstAmount,
    sgstAmount: validated.tax.sgstAmount,
    igstAmount: validated.tax.igstAmount,
    totalAmount: validated.tax.totalAmount,
    lines: validated.lines.map((line) => ({
      sourceLineId: line.sourceLineId,
      itemCode: line.purchaseOrderLineId,
      description: line.description,
      quantity: line.quantity,
      unitOfMeasure: line.unitOfMeasure,
      unitRate: line.unitRate,
      taxableAmount: line.taxableAmount,
      hsnCode: line.hsnCode,
      gstRate: line.gstRate,
      cgstAmount: line.cgstAmount,
      sgstAmount: line.sgstAmount,
      igstAmount: line.igstAmount,
      totalAmount: line.totalAmount,
    })),
  }, FinanceDocumentType.PURCHASE_INVOICE, FinanceSourceType.PROCUREMENT_VENDOR_BILL, FinanceSourceModule.PROCUREMENT);
}
