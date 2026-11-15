import { FinanceDocumentStatus, Prisma } from "@prisma/client";

import { assertCentralTaxMasters, calculateCentralTax, type CentralTaxMode } from "@/lib/services/finance/central-tax-engine";
import { getEntityGstRegistrationForDate } from "@/lib/services/organizations/entity-gst-registration-resolver";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type ProcurementVendorBillLineInput = {
  purchaseOrderLineId: string;
  inventoryReceiptLineId: string;
  quantity: Prisma.Decimal | string;
};

function decimal(value: Prisma.Decimal | string, field: string, allowZero = false) {
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value);
  } catch {
    throw new Error(`${field} must be a valid decimal value.`);
  }
  if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero())) {
    throw new Error(`${field} must be a finite ${allowZero ? "non-negative" : "positive"} value.`);
  }
  return parsed;
}

function roundMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function lineFallbackMode(value: string | null | undefined): CentralTaxMode | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "LOCAL" || normalized === "INTRASTATE" || normalized === "INTRA_STATE") return "LOCAL";
  if (normalized === "INTERSTATE" || normalized === "INTER_STATE") return "INTERSTATE";
  return undefined;
}

export async function validateProcurementVendorBillSources(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    entityId: string;
    vendorId: string;
    purchaseOrderId: string;
    billDate: Date;
    lines: ProcurementVendorBillLineInput[];
    billIdToExclude?: string;
  },
) {
  const organizationId = input.organizationId;
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1000) {
    throw new Error("A vendor bill must contain between 1 and 1,000 receipt lines.");
  }
  if (new Set(input.lines.map((line) => line.inventoryReceiptLineId)).size !== input.lines.length) {
    throw new Error("A GRN line can only appear once on a vendor bill.");
  }

  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: {
      id: input.purchaseOrderId,
      organization_id: organizationId,
      vendor_id: input.vendorId,
      entity_id: input.entityId,
    },
    include: {
      lines: true,
      entity: { select: { id: true, entity_name: true, is_active: true } },
    },
  });
  if (!purchaseOrder || !["APPROVED", "SHARED"].includes(purchaseOrder.status)) {
    throw new Error("Vendor bills require an approved Purchase Order in this organization.");
  }
  const vendor = await tx.masterVendor.findFirst({
    where: { id: purchaseOrder.vendor_id, organization_id: organizationId },
    select: { id: true, vendor: true, gst_number: true, contact_id: true, is_active: true },
  });
  if (!vendor || !purchaseOrder.entity?.is_active || !vendor.is_active) {
    throw new Error("The Purchase Order Entity and Vendor must both be active.");
  }
  const orderLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
  const purchaseOrderLineIds = [...new Set(input.lines.map((line) => line.purchaseOrderLineId))];
  if (purchaseOrderLineIds.some((id) => !orderLines.has(id))) {
    throw new Error("A billed line does not belong to the selected Purchase Order.");
  }

  const requestedReceiptIds = input.lines.map((line) => line.inventoryReceiptLineId);
  const receiptLines = await tx.inventoryReceiptLine.findMany({
    where: {
      id: { in: requestedReceiptIds },
      purchase_order_line_id: { in: purchaseOrderLineIds },
      receipt: {
        organization_id: organizationId,
        purchase_order_id: input.purchaseOrderId,
        status: "POSTED",
      },
    },
    include: {
      receipt: { select: { id: true, receipt_no: true, received_date: true } },
    },
  });
  const receiptById = new Map(receiptLines.map((line) => [line.id, line]));
  if (receiptById.size !== requestedReceiptIds.length) {
    throw new Error("Every billed quantity must reference an accepted, posted GRN line for this Purchase Order.");
  }
  for (const line of input.lines) {
    if (receiptById.get(line.inventoryReceiptLineId)?.purchase_order_line_id !== line.purchaseOrderLineId) {
      throw new Error("The selected GRN line does not match its Purchase Order line.");
    }
  }

  const acceptedOrderLines = await tx.inventoryReceiptLine.findMany({
    where: {
      purchase_order_line_id: { in: purchaseOrderLineIds },
      accepted_quantity: { gt: 0 },
      receipt: {
        organization_id: organizationId,
        purchase_order_id: input.purchaseOrderId,
        status: "POSTED",
      },
    },
    select: { id: true, purchase_order_line_id: true, accepted_quantity: true },
  });
  const acceptedReceiptIds = acceptedOrderLines.map((line) => line.id);
  const priorBillLines = acceptedReceiptIds.length
    ? await tx.procurementVendorBillLine.findMany({
        where: {
          organization_id: organizationId,
          inventory_receipt_line_id: { in: acceptedReceiptIds },
          ...(input.billIdToExclude ? { bill_id: { not: input.billIdToExclude } } : {}),
          bill: {
            organization_id: organizationId,
            status: { notIn: [FinanceDocumentStatus.CANCELLED, FinanceDocumentStatus.REVERSED] },
          },
        },
        select: { inventory_receipt_line_id: true, purchase_order_line_id: true, quantity: true },
      })
    : [];
  const billedByReceipt = new Map<string, Prisma.Decimal>();
  const billedByOrderLine = new Map<string, Prisma.Decimal>();
  for (const line of priorBillLines) {
    billedByReceipt.set(
      line.inventory_receipt_line_id,
      (billedByReceipt.get(line.inventory_receipt_line_id) ?? new Prisma.Decimal(0)).plus(line.quantity),
    );
    billedByOrderLine.set(
      line.purchase_order_line_id,
      (billedByOrderLine.get(line.purchase_order_line_id) ?? new Prisma.Decimal(0)).plus(line.quantity),
    );
  }

  const requestedByOrderLine = new Map<string, Prisma.Decimal>();
  const requestedByReceipt = new Map<string, Prisma.Decimal>();
  const normalizedLines = input.lines.map((line) => {
    const quantity = decimal(line.quantity, "Billed quantity");
    const orderLine = orderLines.get(line.purchaseOrderLineId)!;
    const receiptLine = receiptById.get(line.inventoryReceiptLineId)!;
    requestedByOrderLine.set(
      orderLine.id,
      (requestedByOrderLine.get(orderLine.id) ?? new Prisma.Decimal(0)).plus(quantity),
    );
    requestedByReceipt.set(
      receiptLine.id,
      (requestedByReceipt.get(receiptLine.id) ?? new Prisma.Decimal(0)).plus(quantity),
    );
    return { input: line, quantity, orderLine, receiptLine };
  });

  for (const [receiptId, requested] of requestedByReceipt) {
    const accepted = receiptById.get(receiptId)!.accepted_quantity;
    const remaining = accepted.minus(billedByReceipt.get(receiptId) ?? new Prisma.Decimal(0));
    if (requested.gt(remaining)) {
      throw new Error(`Billed quantity exceeds the accepted GRN balance for receipt line ${receiptId}.`);
    }
  }
  for (const [orderLineId, requested] of requestedByOrderLine) {
    const orderLine = orderLines.get(orderLineId)!;
    const remaining = orderLine.quantity.minus(billedByOrderLine.get(orderLineId) ?? new Prisma.Decimal(0));
    if (requested.gt(remaining)) {
      throw new Error(`Billed quantity exceeds the remaining Purchase Order balance for line ${orderLineId}.`);
    }
  }

  const entityRegistration = purchaseOrder.entity_id
    ? await getEntityGstRegistrationForDate(tx, organizationId, purchaseOrder.entity_id, input.billDate)
    : null;
  const vendorContactId = purchaseOrder.contact_id ?? vendor.contact_id;
  const contactRegistration = vendorContactId
    ? await tx.contactTaxRegistration.findFirst({
        where: {
          organization_id: organizationId,
          contact_id: vendorContactId,
          status: "ACTIVE",
        },
        orderBy: [{ verified_at: "desc" }, { created_at: "desc" }],
        select: { gstin: true },
      })
    : null;
  const entityGstin = entityRegistration?.gstin ?? null;
  const partyGstin = vendor.gst_number || contactRegistration?.gstin || null;
  const fallbackModes = [...new Set(normalizedLines
    .map(({ orderLine }) => lineFallbackMode(orderLine.tax_type))
    .filter((mode): mode is CentralTaxMode => Boolean(mode)))];
  if (fallbackModes.length > 1) {
    throw new Error("The Purchase Order has mixed tax jurisdictions and requires valid GSTIN state codes.");
  }
  const sourceLines = normalizedLines.map(({ orderLine, quantity }) => {
    if (!orderLine.price || !orderLine.gst || !orderLine.hsn_code?.trim()) {
      throw new Error("Every billed Purchase Order line must have an approved rate, GST rate, and HSN code.");
    }
    return {
      quantity,
      orderLine,
      unitRate: orderLine.price.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      gstRate: orderLine.gst,
      taxableAmount: roundMoney(quantity.mul(orderLine.price)),
      hsnCode: orderLine.hsn_code.trim(),
    };
  });
  await assertCentralTaxMasters(tx, organizationId, sourceLines.map((line) => ({
    hsnCode: line.hsnCode,
    gstRate: line.gstRate,
  })));
  const tax = calculateCentralTax({
    lines: sourceLines.map((line) => ({ taxableAmount: line.taxableAmount, gstRate: line.gstRate })),
    entityGstin,
    partyGstin,
    fallbackMode: fallbackModes[0],
  });
  const lines = normalizedLines.map((source, index) => {
    const sourceLine = sourceLines[index];
    const taxLine = tax.lines[index];
    return {
      purchaseOrderLineId: source.orderLine.id,
      inventoryReceiptId: source.receiptLine.receipt_id,
      inventoryReceiptLineId: source.receiptLine.id,
      description: normalizeUppercase(
        source.orderLine.raw_material
        ?? source.orderLine.style_name
        ?? source.orderLine.category
        ?? `Purchase Order line ${source.orderLine.id}`,
      ).slice(0, 500),
      unitOfMeasure: source.orderLine.stock_uom,
      quantity: source.quantity.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      unitRate: sourceLine.unitRate,
      taxableAmount: taxLine.taxableAmount,
      hsnCode: sourceLine.hsnCode,
      gstRate: taxLine.gstRate,
      cgstAmount: taxLine.cgstAmount,
      sgstAmount: taxLine.sgstAmount,
      igstAmount: taxLine.igstAmount,
      totalAmount: taxLine.totalAmount,
      sourceLineId: source.orderLine.id,
    };
  });

  return {
    purchaseOrder,
    vendor,
    entityGstin,
    partyGstin,
    tax,
    lines,
  };
}
