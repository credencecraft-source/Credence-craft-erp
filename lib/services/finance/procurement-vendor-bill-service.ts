import { FinanceDocumentStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { ingestProcurementVendorBill } from "@/lib/services/finance/finance-ingestion-service";
import {
  validateProcurementVendorBillSources,
  type ProcurementVendorBillLineInput,
} from "@/lib/services/finance/procurement-vendor-bill-validation";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type ProcurementVendorBillCreateInput = {
  purchaseOrderId: string;
  vendorInvoiceNumber: string;
  billDate: Date;
  lines: ProcurementVendorBillLineInput[];
};

function snapshot(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const normalized = normalizeUppercase(value.trim());
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function actorDetails(tx: Prisma.TransactionClient, actorUserId: string) {
  const actor = await tx.workspaceUser.findUnique({
    where: { id: actorUserId },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("The acting user is not a valid workspace user.");
  return { id: actor.id, email: snapshot(actor.email, 255) };
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    actorUserId: string;
    action: string;
    billId: string;
    details: Prisma.InputJsonObject;
  },
) {
  await tx.auditEvent.create({
    data: {
      organization_id: input.organizationId,
      user_id: input.actorUserId,
      module: "FINANCE_MANAGEMENT",
      action: input.action,
      entity_type: "procurement_vendor_bill",
      entity_id: input.billId,
      details: input.details,
    },
  });
}

async function validateExistingBill(tx: Prisma.TransactionClient, organizationId: string, billId: string) {
  const bill = await tx.procurementVendorBill.findFirst({
    where: { id: billId, organization_id: organizationId },
    include: { lines: { orderBy: { line_number: "asc" } } },
  });
  if (!bill) throw new Error("Procurement vendor bill was not found in this organization.");
  const validated = await validateProcurementVendorBillSources(tx, {
    organizationId,
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
  return { bill, validated };
}

export async function createProcurementVendorBill(
  organizationId: string,
  actorUserId: string,
  input: ProcurementVendorBillCreateInput,
) {
  await requireOrganizationPermission(actorUserId, organizationId, "CREATE_PROCUREMENT_VENDOR_BILL");
  if (!input.purchaseOrderId.trim()) throw new Error("A Purchase Order is required.");
  if (!input.vendorInvoiceNumber.trim() || input.vendorInvoiceNumber.trim().length > 120) {
    throw new Error("Vendor invoice number is required and must be 120 characters or fewer.");
  }
  if (!(input.billDate instanceof Date) || Number.isNaN(input.billDate.getTime())) {
    throw new Error("Bill date is invalid.");
  }

  return prisma.$transaction(async (tx) => {
    const actor = await actorDetails(tx, actorUserId);
    const purchaseOrder = await tx.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organization_id: organizationId },
      select: { id: true, entity_id: true, vendor_id: true },
    });
    if (!purchaseOrder?.entity_id) {
      throw new Error("The selected Purchase Order must belong to this organization and an Entity.");
    }
    const validated = await validateProcurementVendorBillSources(tx, {
      organizationId,
      entityId: purchaseOrder.entity_id,
      vendorId: purchaseOrder.vendor_id,
      purchaseOrderId: purchaseOrder.id,
      billDate: input.billDate,
      lines: input.lines,
    });
    const duplicateInvoice = await tx.procurementVendorBill.findFirst({
      where: {
        organization_id: organizationId,
        vendor_id: purchaseOrder.vendor_id,
        vendor_invoice_number: normalizeUppercase(input.vendorInvoiceNumber.trim()),
      },
      select: { id: true },
    });
    if (duplicateInvoice) throw new Error("This Vendor invoice number has already been recorded.");

    const documentNumber = await reserveProcurementDocumentNumber(
      organizationId,
      "PROCUREMENT_VENDOR_BILL",
      tx,
    );
    const bill = await tx.procurementVendorBill.create({
      data: {
        organization_id: organizationId,
        entity_id: purchaseOrder.entity_id,
        vendor_id: purchaseOrder.vendor_id,
        purchase_order_id: purchaseOrder.id,
        document_number: documentNumber,
        vendor_invoice_number: normalizeUppercase(input.vendorInvoiceNumber.trim()).slice(0, 120),
        bill_date: input.billDate,
        status: FinanceDocumentStatus.DRAFT,
        entity_name_snapshot: validated.purchaseOrder.entity!.entity_name,
        entity_gstin_snapshot: snapshot(validated.entityGstin, 15),
        vendor_name_snapshot: validated.vendor.vendor,
        vendor_gstin_snapshot: snapshot(validated.partyGstin, 15),
        place_of_supply_state_code: validated.tax.placeOfSupplyStateCode,
        subtotal: validated.tax.taxableAmount,
        cgst_amount: validated.tax.cgstAmount,
        sgst_amount: validated.tax.sgstAmount,
        igst_amount: validated.tax.igstAmount,
        total_amount: validated.tax.totalAmount,
        created_by_user_id: actor.id,
        created_by_email: actor.email,
        lines: {
          create: validated.lines.map((line, index) => ({
            organization_id: organizationId,
            line_number: index + 1,
            purchase_order_id: purchaseOrder.id,
            purchase_order_line_id: line.purchaseOrderLineId,
            inventory_receipt_id: line.inventoryReceiptId,
            inventory_receipt_line_id: line.inventoryReceiptLineId,
            description: line.description,
            unit_of_measure: line.unitOfMeasure,
            quantity: line.quantity,
            unit_rate: line.unitRate,
            taxable_amount: line.taxableAmount,
            hsn_code: line.hsnCode,
            gst_rate: line.gstRate,
            cgst_amount: line.cgstAmount,
            sgst_amount: line.sgstAmount,
            igst_amount: line.igstAmount,
            total_amount: line.totalAmount,
          })),
        },
      },
      select: { id: true, document_number: true, status: true },
    });
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      action: "PROCUREMENT_VENDOR_BILL_CREATED",
      billId: bill.id,
      details: {
        documentNumber: bill.document_number,
        purchaseOrderId: purchaseOrder.id,
        vendorInvoiceNumber: normalizeUppercase(input.vendorInvoiceNumber.trim()).slice(0, 120),
        totalAmount: validated.tax.totalAmount.toFixed(2),
      },
    });
    return { id: bill.id, documentNumber: bill.document_number, status: bill.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function transitionProcurementVendorBill(
  organizationId: string,
  actorUserId: string,
  billId: string,
  action: "SUBMIT" | "APPROVE" | "POST" | "CANCEL",
) {
  const permission = action === "SUBMIT"
    ? "SUBMIT_PROCUREMENT_VENDOR_BILL"
    : action === "APPROVE"
      ? "APPROVE_PROCUREMENT_VENDOR_BILL"
      : action === "POST"
        ? "POST_PROCUREMENT_VENDOR_BILL"
        : "CANCEL_FINANCE_DOCUMENT";
  await requireOrganizationPermission(actorUserId, organizationId, permission);

  return prisma.$transaction(async (tx) => {
    const actor = await actorDetails(tx, actorUserId);
    const bill = action === "CANCEL"
      ? await tx.procurementVendorBill.findFirst({
          where: { id: billId, organization_id: organizationId },
          include: { lines: { orderBy: { line_number: "asc" } } },
        })
      : (await validateExistingBill(tx, organizationId, billId)).bill;
    if (!bill) throw new Error("Procurement vendor bill was not found in this organization.");
    if (action === "SUBMIT") {
      if (bill.status !== FinanceDocumentStatus.DRAFT) throw new Error("Only draft vendor bills can be submitted.");
      const updated = await tx.procurementVendorBill.updateMany({
        where: { id: bill.id, organization_id: organizationId, status: FinanceDocumentStatus.DRAFT },
        data: { status: FinanceDocumentStatus.SUBMITTED },
      });
      if (updated.count !== 1) throw new Error("The vendor bill changed concurrently. Reload and retry.");
    } else if (action === "APPROVE") {
      if (bill.status !== FinanceDocumentStatus.SUBMITTED) throw new Error("Only submitted vendor bills can be approved.");
      if (bill.created_by_user_id === actorUserId) throw new Error("The bill creator cannot approve their own vendor bill.");
      const updated = await tx.procurementVendorBill.updateMany({
        where: { id: bill.id, organization_id: organizationId, status: FinanceDocumentStatus.SUBMITTED },
        data: {
          status: FinanceDocumentStatus.APPROVED,
          approved_by_user_id: actor.id,
          approved_by_email: actor.email,
        },
      });
      if (updated.count !== 1) throw new Error("The vendor bill changed concurrently. Reload and retry.");
    } else if (action === "POST") {
      if (bill.status !== FinanceDocumentStatus.APPROVED) throw new Error("Only approved vendor bills can be posted.");
      await ingestProcurementVendorBill(tx, { organizationId, billId: bill.id });
      const updated = await tx.procurementVendorBill.updateMany({
        where: { id: bill.id, organization_id: organizationId, status: FinanceDocumentStatus.APPROVED },
        data: { status: FinanceDocumentStatus.POSTED, posted_at: new Date() },
      });
      if (updated.count !== 1) throw new Error("The vendor bill changed concurrently. Reload and retry.");
    } else {
      if (
        bill.status !== FinanceDocumentStatus.DRAFT
        && bill.status !== FinanceDocumentStatus.SUBMITTED
        && bill.status !== FinanceDocumentStatus.APPROVED
      ) {
        throw new Error("Only unposted vendor bills can be cancelled.");
      }
      const updated = await tx.procurementVendorBill.updateMany({
        where: {
          id: bill.id,
          organization_id: organizationId,
          status: { in: [FinanceDocumentStatus.DRAFT, FinanceDocumentStatus.SUBMITTED, FinanceDocumentStatus.APPROVED] },
        },
        data: { status: FinanceDocumentStatus.CANCELLED },
      });
      if (updated.count !== 1) throw new Error("The vendor bill changed concurrently. Reload and retry.");
    }

    const nextStatus = action === "SUBMIT"
      ? FinanceDocumentStatus.SUBMITTED
      : action === "APPROVE"
        ? FinanceDocumentStatus.APPROVED
        : action === "POST"
          ? FinanceDocumentStatus.POSTED
          : FinanceDocumentStatus.CANCELLED;
    const auditAction = action === "SUBMIT"
      ? "SUBMITTED"
      : action === "APPROVE"
        ? "APPROVED"
        : action === "POST"
          ? "POSTED"
          : "CANCELLED";
    await writeAudit(tx, {
      organizationId,
      actorUserId,
      action: `PROCUREMENT_VENDOR_BILL_${auditAction}`,
      billId: bill.id,
      details: {
        documentNumber: bill.document_number,
        fromStatus: bill.status,
        toStatus: nextStatus,
      },
    });
    return { id: bill.id, status: nextStatus };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listProcurementVendorBills(organizationId: string) {
  const bills = await prisma.procurementVendorBill.findMany({
    where: { organization_id: organizationId },
    orderBy: [{ bill_date: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      document_number: true,
      vendor_invoice_number: true,
      bill_date: true,
      status: true,
      vendor_name_snapshot: true,
      entity_name_snapshot: true,
      purchase_order_id: true,
      subtotal: true,
      cgst_amount: true,
      sgst_amount: true,
      igst_amount: true,
      total_amount: true,
      created_by_user_id: true,
      approved_by_user_id: true,
      lines: { select: { id: true } },
    },
  });
  return bills.map((bill) => ({
    id: bill.id,
    documentNumber: bill.document_number,
    vendorInvoiceNumber: bill.vendor_invoice_number,
    billDate: bill.bill_date.toISOString().slice(0, 10),
    status: bill.status,
    vendorName: bill.vendor_name_snapshot,
    entityName: bill.entity_name_snapshot,
    purchaseOrderId: bill.purchase_order_id,
    subtotal: bill.subtotal.toFixed(2),
    cgstAmount: bill.cgst_amount.toFixed(2),
    sgstAmount: bill.sgst_amount.toFixed(2),
    igstAmount: bill.igst_amount.toFixed(2),
    totalAmount: bill.total_amount.toFixed(2),
    createdByUserId: bill.created_by_user_id,
    approvedByUserId: bill.approved_by_user_id,
    lineCount: bill.lines.length,
  }));
}

export async function listEligibleVendorBillPurchaseOrders(organizationId: string) {
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      organization_id: organizationId,
      status: { in: ["APPROVED", "SHARED"] },
      entity_id: { not: null },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      purchase_order_no: true,
      entity_id: true,
      vendor_id: true,
      entity: { select: { entity_name: true } },
    },
  });
  const vendorIds = [...new Set(purchaseOrders.map((order) => order.vendor_id))];
  const vendors = await prisma.masterVendor.findMany({
    where: { organization_id: organizationId, id: { in: vendorIds }, is_active: true },
    select: { id: true, vendor: true },
  });
  const vendorNames = new Map(vendors.map((vendor) => [vendor.id, vendor.vendor]));
  return purchaseOrders.flatMap((order) => {
    const vendorName = vendorNames.get(order.vendor_id);
    if (!vendorName) return [];
    return [{
      id: order.id,
      purchaseOrderNumber: order.purchase_order_no,
      entityId: order.entity_id!,
      entityName: order.entity?.entity_name ?? "",
      vendorId: order.vendor_id,
      vendorName,
    }];
  });
}

export async function listEligibleVendorBillReceiptLines(organizationId: string, purchaseOrderId: string) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: {
      id: purchaseOrderId,
      organization_id: organizationId,
      status: { in: ["APPROVED", "SHARED"] },
    },
    select: {
      id: true,
      lines: { select: { id: true, raw_material: true, style_name: true, category: true, quantity: true, price: true, stock_uom: true } },
    },
  });
  if (!purchaseOrder) throw new Error("Approved Purchase Order was not found in this organization.");
  const orderLines = new Map(purchaseOrder.lines.map((line) => [line.id, line]));
  const receiptLines = await prisma.inventoryReceiptLine.findMany({
    where: {
      purchase_order_line_id: { in: purchaseOrder.lines.map((line) => line.id) },
      accepted_quantity: { gt: 0 },
      receipt: {
        organization_id: organizationId,
        purchase_order_id: purchaseOrderId,
        status: "POSTED",
      },
    },
    orderBy: [{ receipt: { received_date: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      receipt_id: true,
      purchase_order_line_id: true,
      accepted_quantity: true,
      receipt: { select: { receipt_no: true } },
    },
  });
  const priorBills = receiptLines.length
    ? await prisma.procurementVendorBillLine.findMany({
        where: {
          organization_id: organizationId,
          inventory_receipt_line_id: { in: receiptLines.map((line) => line.id) },
          bill: {
            organization_id: organizationId,
            status: { notIn: [FinanceDocumentStatus.CANCELLED, FinanceDocumentStatus.REVERSED] },
          },
        },
        select: { inventory_receipt_line_id: true, quantity: true },
      })
    : [];
  const billed = new Map<string, Prisma.Decimal>();
  for (const line of priorBills) {
    billed.set(
      line.inventory_receipt_line_id,
      (billed.get(line.inventory_receipt_line_id) ?? new Prisma.Decimal(0)).plus(line.quantity),
    );
  }
  return receiptLines.flatMap((receiptLine) => {
    const orderLine = orderLines.get(receiptLine.purchase_order_line_id);
    const availableQuantity = receiptLine.accepted_quantity.minus(
      billed.get(receiptLine.id) ?? new Prisma.Decimal(0),
    );
    if (!orderLine || availableQuantity.lte(0)) return [];
    return [{
      purchaseOrderLineId: orderLine.id,
      inventoryReceiptLineId: receiptLine.id,
      inventoryReceiptId: receiptLine.receipt_id,
      receiptNumber: receiptLine.receipt.receipt_no,
      description: orderLine.raw_material ?? orderLine.style_name ?? orderLine.category ?? "Purchase Order item",
      orderedQuantity: orderLine.quantity.toFixed(2),
      acceptedQuantity: receiptLine.accepted_quantity.toFixed(2),
      availableQuantity: availableQuantity.toFixed(2),
      unitRate: orderLine.price?.toFixed(4) ?? null,
      unitOfMeasure: orderLine.stock_uom,
    }];
  });
}
