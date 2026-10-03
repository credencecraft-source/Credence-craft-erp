import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireSameOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";
import { calculateTax } from "./gst-calculation-service";

const purchaseOrderInclude = {
  entity: { select: { id: true, entity_name: true } },
  vendor: { select: { id: true, vendor: true, legacy_metadata: true, gst_number: true, registered_state: true, registeredState: { select: { state: true } } } },
  sources: { select: { master_purchase_order_id: true } },
  lines: { orderBy: { source_order_no: "asc" as const }, include: { masterPurchaseOrder: { select: { display_no: true, master_po_no: true, lines: { select: { stock_uom: true } }, sourceRecords: { select: { groupedPurchaseOrder: { select: { buying_uom: true } } } } } } } },
} as const;

const purchaseOrderReportSelect = {
  id: true,
  entity_id: true,
  entity: { select: { id: true, entity_name: true } },
  display_no: true,
  purchase_order_no: true,
  status: true,
  po_date: true,
  delivery_date: true,
  created_at: true,
  vendor: { select: { id: true, vendor: true, legacy_metadata: true } },
  lines: {
    select: {
      total: true,
      quantity: true,
      price: true,
      gst: true,
      hsn_code: true,
      masterPurchaseOrder: {
        select: {
          lines: { take: 1, select: { stock_uom: true } },
          sourceRecords: { take: 1, select: { groupedPurchaseOrder: { select: { buying_uom: true } } } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

const numberValue = (value: Prisma.Decimal | number | string | null | undefined) => value == null ? null : Number(value);
const vendorEmail = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const values = metadata as Record<string, unknown>;
  const email = values.email ?? values.Email ?? values.vendorEmail ?? values.vendor_email ?? values.Vendor_Email;
  return typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
};

function serializePurchaseOrder(order: Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>) {
  const total = order.lines.reduce((sum, line) => sum + Number(line.total ?? (Number(line.quantity) * Number(line.price ?? 0))), 0);
  return {
    id: order.id,
    entityId: order.entity?.id ?? order.entity_id,
    entityName: order.entity?.entity_name ?? "Missing Entity",
    purchaseOrderNo: order.display_no ? `PO-${order.display_no}` : order.purchase_order_no,
    purchaseOrderInternalNo: order.purchase_order_no,
    status: order.status,
    poDate: order.po_date,
    deliveryDate: order.delivery_date,
    createdAt: order.created_at,
    vendor: { id: order.vendor.id, name: order.vendor.vendor, email: vendorEmail(order.vendor.legacy_metadata) },
    sourceMasterPurchaseOrderIds: order.sources.map((source) => source.master_purchase_order_id),
    total,
    lines: order.lines.map((line) => ({
      id: line.id,
      rawMaterial: line.raw_material,
      category: line.category,
      subCategory: line.sub_category,
      sourceOrderNo: line.source_order_no,
      styleName: line.style_name,
      stockUom: line.masterPurchaseOrder?.lines[0]?.stock_uom ?? null,
      buyingUom: line.masterPurchaseOrder?.sourceRecords[0]?.groupedPurchaseOrder.buying_uom ?? null,
      quantity: numberValue(line.quantity),
      price: numberValue(line.price),
      gst: numberValue(line.gst),
      taxType: line.tax_type,
      cgstRate: numberValue(line.cgst_rate),
      sgstRate: numberValue(line.sgst_rate),
      igstRate: numberValue(line.igst_rate),
      cgstAmount: numberValue(line.cgst_amount),
      sgstAmount: numberValue(line.sgst_amount),
      igstAmount: numberValue(line.igst_amount),
      hsnCode: line.hsn_code,
      total: numberValue(line.total),
      masterGroupId: line.masterPurchaseOrder?.display_no ? `MGP-${line.masterPurchaseOrder.display_no}` : line.master_purchase_order_id,
    })),
  };
}

export async function generatePurchaseOrders(organizationId: string, masterPurchaseOrderIds: string[], createdBy?: string | null, poDate?: string | null, deliveryDate?: string | null) {
  const uniqueIds = [...new Set(masterPurchaseOrderIds.filter(Boolean))];
  if (!uniqueIds.length) throw new Error("Select at least one Master Group.");
  const parsedPoDate = poDate ? new Date(poDate) : new Date();
  const parsedDeliveryDate = deliveryDate ? new Date(deliveryDate) : null;
  if (Number.isNaN(parsedPoDate.getTime())) throw new Error("PO date is invalid.");
  if (parsedDeliveryDate && Number.isNaN(parsedDeliveryDate.getTime())) throw new Error("Delivery date is invalid.");
  if (parsedDeliveryDate && parsedDeliveryDate < parsedPoDate) throw new Error("Delivery date cannot be before the PO date.");

  const order = await prisma.$transaction(async (transaction) => {
    const masters = await transaction.masterPurchaseOrder.findMany({
      where: { id: { in: uniqueIds }, organization_id: organizationId },
      include: {
        entity: { select: { id: true, is_active: true } },
        vendor: { select: { id: true, gst_number: true, registered_state: true, registeredState: { select: { state: true } } } },
        lines: true,
        sourceRecords: { include: { groupedPurchaseOrder: { select: { source_type: true, gst: true, hsn_code: true } } } },
        purchaseOrderSources: { select: { purchase_order_id: true } },
      },
    });
    if (masters.length !== uniqueIds.length) throw new Error("One or more Master Groups are unavailable.");
    if (masters.some((master) => master.sourceRecords.some((source) => source.groupedPurchaseOrder.source_type === "STOCK"))) {
      throw new Error("Stock Master Groups must be completed through store verification, not vendor Purchase Order generation.");
    }
    const existingSource = masters.flatMap((master) => master.purchaseOrderSources);
    if (existingSource.length > 0) throw new Error("One or more selected Master Groups already have a Purchase Order.");
    const entityId = requireSameOrganizationEntity(
      masters.map((master) => master.entity_id),
      "Select Master Groups belonging to the same Entity.",
    );
    if (masters.some((master) => !master.entity?.is_active)) {
      throw new Error("Select Master Groups belonging to an active Entity.");
    }
    const vendorId = masters[0].vendor_id;
    if (masters.some((master) => master.vendor_id !== vendorId)) throw new Error("Select Master Groups from the same vendor.");
    const organization = await transaction.organization.findUnique({ where: { id: organizationId }, select: { gst_number: true, state: true, country: true } });
    if (!organization) throw new Error("Organization not found.");
    const vendor = masters[0].vendor;
    let defaultTaxProfile: { tax_regime: string; cgst_rate: Prisma.Decimal | null; sgst_rate: Prisma.Decimal | null; igst_rate: Prisma.Decimal | null; vat_rate: Prisma.Decimal | null; sales_tax_rate: Prisma.Decimal | null; } | null = null;
    try {
      defaultTaxProfile = await transaction.organizationTaxProfile.findFirst({
        where: { organization_id: organizationId, is_active: true, is_default: true },
        orderBy: { updated_at: "desc" },
      });
    } catch (error) {
      if (!(error instanceof Error) || (!error.message.includes("does not exist") && !error.message.includes("P2021") && !(error.message.includes("table") && error.message.includes("public")))) {
        throw error;
      }
    }
    const taxRegime = defaultTaxProfile?.tax_regime ?? "GST";
    const gstRates = await transaction.masterGst.findMany({
      where: { organization_id: organizationId },
      select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
    });
    const displayNumber = await reserveProcurementDocumentNumber(organizationId, "PURCHASE_ORDER", transaction);
    const displayNo = Number(displayNumber.replace("PO-", ""));
    const lines = masters.map((master) => {
      const sourceValues = master.sourceRecords.flatMap((source) => [source.groupedPurchaseOrder.gst, source.groupedPurchaseOrder.hsn_code]);
      const gst = sourceValues.find((value) => value !== null && typeof value !== "string") as Prisma.Decimal | null | undefined;
      const hsnCode = sourceValues.find((value) => typeof value === "string") as string | undefined;
      const price = master.lines.find((line) => line.vendor_price !== null)?.vendor_price ?? null;
      const quantity = master.lines.reduce((sum, line) => sum + Number(line.grouped_qty), 0);
      const total = master.lines.reduce((sum, line) => sum + Number(line.total_spend ?? (Number(line.grouped_qty) * Number(line.vendor_price ?? 0))), 0);
      const totalRate = Number(sourceValues.find((value) => value !== null && typeof value !== "string") ?? 0);
      const configuredRate = gstRates.find((rate) => Number(rate.gst) === totalRate);
      const tax = calculateTax({
        taxableAmount: total,
        totalRate,
        taxRegime,
        country: organization.country ?? "IN",
        cgstRate: numberValue(configuredRate?.cgst_rate) ?? numberValue(defaultTaxProfile?.cgst_rate),
        sgstRate: numberValue(configuredRate?.sgst_rate) ?? numberValue(defaultTaxProfile?.sgst_rate),
        igstRate: numberValue(configuredRate?.igst_rate) ?? numberValue(defaultTaxProfile?.igst_rate),
        vatRate: numberValue(defaultTaxProfile?.vat_rate),
        salesTaxRate: numberValue(defaultTaxProfile?.sales_tax_rate),
        organizationState: organization.state,
        organizationGstin: organization.gst_number,
        vendorState: vendor.registeredState?.state ?? vendor.registered_state,
        vendorGstin: vendor.gst_number,
      });
      return {
        source_master_line_id: master.lines[0]?.id ?? master.id,
        master_purchase_order_id: master.id,
        raw_material: master.raw_material,
        category: master.category,
        sub_category: master.sub_category,
        source_order_no: null,
        style_name: null,
        quantity: new Prisma.Decimal(quantity),
        price,
        gst,
        tax_type: tax.taxType,
        cgst_rate: new Prisma.Decimal(tax.cgstRate),
        sgst_rate: new Prisma.Decimal(tax.sgstRate),
        igst_rate: new Prisma.Decimal(tax.igstRate),
        cgst_amount: new Prisma.Decimal(tax.cgstAmount),
        sgst_amount: new Prisma.Decimal(tax.sgstAmount),
        igst_amount: new Prisma.Decimal(tax.igstAmount),
        hsn_code: hsnCode,
        total: new Prisma.Decimal(total),
      };
    });
    return transaction.purchaseOrder.create({
      data: {
        organization_id: organizationId,
        entity_id: entityId,
        vendor_id: vendorId,
        purchase_order_no: `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        created_by: createdBy ?? null,
        po_date: parsedPoDate,
        delivery_date: parsedDeliveryDate,
        sources: { create: masters.map((master) => ({ master_purchase_order_id: master.id })) },
        lines: { create: lines },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const createdOrder = await prisma.purchaseOrder.findUnique({
    where: { id: order.id },
    include: purchaseOrderInclude,
  });
  if (!createdOrder) throw new Error("Purchase Order was created but could not be loaded.");

  return serializePurchaseOrder(createdOrder);
}

export async function listPurchaseOrders(organizationId: string) {
  const orders = await prisma.purchaseOrder.findMany({ where: { organization_id: organizationId }, include: purchaseOrderInclude, orderBy: { created_at: "desc" } });
  return orders.map(serializePurchaseOrder);
}

export async function listPurchaseOrderReportPage(
  organizationId: string,
  input: { cursor?: string; limit?: number; search?: string } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const search = String(input.search ?? "").trim().slice(0, 100);
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      organization_id: organizationId,
      ...(search ? {
        OR: [
          { purchase_order_no: { contains: search, mode: "insensitive" } },
          { status: { contains: search, mode: "insensitive" } },
          { vendor: { vendor: { contains: search, mode: "insensitive" } } },
          { entity: { entity_name: { contains: search, mode: "insensitive" } } },
          { lines: { some: { hsn_code: { contains: search, mode: "insensitive" } } } },
        ],
      } : {}),
    },
    select: purchaseOrderReportSelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const purchaseOrders = pageRows.map((order) => ({
    id: order.id,
    entityId: order.entity?.id ?? order.entity_id,
    entityName: order.entity?.entity_name ?? "Missing Entity",
    purchaseOrderNo: order.display_no ? `PO-${order.display_no}` : order.purchase_order_no,
    status: order.status,
    poDate: order.po_date,
    deliveryDate: order.delivery_date,
    createdAt: order.created_at,
    vendor: { id: order.vendor.id, name: order.vendor.vendor, email: vendorEmail(order.vendor.legacy_metadata) },
    total: order.lines.reduce((sum, line) => sum + Number(line.total ?? (Number(line.quantity) * Number(line.price ?? 0))), 0),
    lines: order.lines.map((line) => ({
      gst: numberValue(line.gst),
      hsnCode: line.hsn_code,
      buyingUom: line.masterPurchaseOrder?.sourceRecords[0]?.groupedPurchaseOrder.buying_uom ?? null,
      stockUom: line.masterPurchaseOrder?.lines[0]?.stock_uom ?? null,
    })),
  }));

  return {
    purchaseOrders,
    nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, organization_id: organizationId }, include: purchaseOrderInclude });
  if (!order) throw new Error("Purchase Order not found.");
  return serializePurchaseOrder(order);
}

export async function deletePurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, organization_id: organizationId },
    select: {
      id: true,
      inventoryReceipts: { select: { id: true, receipt_no: true } },
      gateEntries: { select: { id: true, entry_no: true } },
    },
  });
  if (!order) throw new Error("Purchase Order not found.");
  if (order.inventoryReceipts.length > 0) {
    const linkedReceipts = order.inventoryReceipts.map((receipt) => ({ id: receipt.id, receiptNo: receipt.receipt_no }));
    const detail = linkedReceipts.map((receipt) => receipt.receiptNo).join(", ");
    throw Object.assign(new Error(`This Purchase Order cannot be deleted because it has linked inventory receipt records: ${detail}.`), {
      linkedReceipts,
    });
  }
  if (order.gateEntries.length > 0) {
    const linkedGateEntries = order.gateEntries.map((entry) => ({ id: entry.id, entryNo: entry.entry_no }));
    const detail = linkedGateEntries.map((entry) => entry.entryNo).join(", ");
    throw Object.assign(new Error(`This Purchase Order cannot be deleted because it is linked to gate entry records: ${detail}.`), {
      linkedGateEntries,
    });
  }

  await prisma.purchaseOrder.delete({ where: { id: order.id } });
}

export async function submitPurchaseOrderForApproval(
  organizationId: string,
  id: string,
  requestedBy: string,
  requestedByUserId?: string,
) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.purchaseOrder.findFirst({
      where: { id, organization_id: organizationId, status: { in: ["DRAFT", "OPEN", "REJECTED"] } },
      select: { id: true, display_no: true, purchase_order_no: true },
    });
    if (!order) throw new Error("Only draft or rejected Purchase Orders can be submitted for approval.");

    const transitioned = await transaction.purchaseOrder.updateMany({
      where: { id: order.id, organization_id: organizationId, status: { in: ["DRAFT", "OPEN", "REJECTED"] } },
      data: { status: "PENDING_APPROVAL", rejection_reason: null },
    });
    if (transitioned.count !== 1) throw new Error("Purchase Order changed before it could be submitted.");

    await transaction.approvalRequest.deleteMany({
      where: { organization_id: organizationId, entity_type: "purchase-order", entity_ref_id: order.id, status: "pending" },
    });
    await transaction.approvalRequest.create({
      data: {
        organization_id: organizationId,
        module_key: "purchase-order",
        module_name: "Purchase Order Approval",
        entity_type: "purchase-order",
        entity_key: order.purchase_order_no,
        entity_label: order.display_no ? `PO-${order.display_no}` : order.purchase_order_no,
        entity_ref_id: order.id,
        requested_by: requestedBy,
        requested_by_user_id: requestedByUserId ?? null,
        status: "pending",
        notes: `Purchase Order ${order.purchase_order_no} is waiting for approval.`,
      },
    });
  });
}

export async function reviewPurchaseOrderApprovalRequest(
  organizationId: string,
  requestId: string,
  status: "approved" | "rejected",
  reviewer: string,
  reviewerUserId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.approvalRequest.findFirst({
      where: {
        organization_id: organizationId,
        entity_type: "purchase-order",
        status: "pending",
        OR: [{ id: requestId }, { request_id: requestId }],
      },
    });
    if (!request || !request.entity_ref_id) throw new Error("Pending Purchase Order approval request not found.");

    const reviewedAt = new Date();
    const requestUpdate = await transaction.approvalRequest.updateMany({
      where: { id: request.id, organization_id: organizationId, status: "pending" },
      data: { status, reviewed_by: reviewer, reviewed_by_user_id: reviewerUserId, reviewed_at: reviewedAt },
    });
    if (requestUpdate.count !== 1) throw new Error("Purchase Order approval request was already reviewed.");

    const purchaseOrderUpdate = await transaction.purchaseOrder.updateMany({
      where: { id: request.entity_ref_id, organization_id: organizationId, status: "PENDING_APPROVAL" },
      data: {
        status: status === "approved" ? "APPROVED" : "REJECTED",
        approved_by: reviewer,
        approved_at: reviewedAt,
        rejection_reason: status === "rejected" ? "Purchase Order approval was rejected." : null,
      },
    });
    if (purchaseOrderUpdate.count !== 1) throw new Error("Purchase Order is no longer pending approval.");

    await createAuditEvent({
      organizationId,
      userId: reviewerUserId,
      module: "Procurement",
      action: status === "approved" ? "APPROVE_PURCHASE_ORDER" : "REJECT_PURCHASE_ORDER",
      entityType: "PurchaseOrder",
      entityId: request.entity_ref_id,
      details: { approval_request_id: request.id, reviewer },
    }, transaction);
    return { status, purchaseOrderId: request.entity_ref_id };
  });
}

export async function sharePurchaseOrderByEmail(organizationId: string, id: string, email: string) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, organization_id: organizationId, status: "APPROVED" }, include: purchaseOrderInclude });
  if (!order) throw new Error("Only approved Purchase Orders can be shared.");
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("A valid vendor email is required.");
  const { sendPurchaseOrderEmail } = await import("@/lib/services/platform/platform-email-configuration-service");
  await sendPurchaseOrderEmail({ recipient: normalizedEmail, purchaseOrder: serializePurchaseOrder(order) });
  await prisma.purchaseOrder.update({ where: { id: order.id }, data: { shared_at: new Date() } });
}