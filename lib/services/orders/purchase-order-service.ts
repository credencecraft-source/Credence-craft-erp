import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";

const purchaseOrderInclude = {
  vendor: { select: { id: true, vendor: true, legacy_metadata: true } },
  sources: { select: { master_purchase_order_id: true } },
  lines: { orderBy: { source_order_no: "asc" as const }, include: { masterPurchaseOrder: { select: { display_no: true, master_po_no: true } } } },
} as const;

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
      quantity: numberValue(line.quantity),
      price: numberValue(line.price),
      gst: numberValue(line.gst),
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
        vendor: { select: { id: true } },
        lines: true,
        sourceRecords: { include: { groupedPurchaseOrder: { select: { gst: true, hsn_code: true } } } },
        purchaseOrderSources: { select: { purchase_order_id: true } },
      },
    });
    if (masters.length !== uniqueIds.length) throw new Error("One or more Master Groups are unavailable.");
    const existingSource = masters.flatMap((master) => master.purchaseOrderSources);
    if (existingSource.length > 0) throw new Error("One or more selected Master Groups already have a Purchase Order.");
    const vendorId = masters[0].vendor_id;
    if (masters.some((master) => master.vendor_id !== vendorId)) throw new Error("Select Master Groups from the same vendor.");
    const displayNumber = await reserveProcurementDocumentNumber(organizationId, "PURCHASE_ORDER", transaction);
    const displayNo = Number(displayNumber.replace("PO-", ""));
    const lines = masters.map((master) => {
      const sourceValues = master.sourceRecords.flatMap((source) => [source.groupedPurchaseOrder.gst, source.groupedPurchaseOrder.hsn_code]);
      const gst = sourceValues.find((value) => value !== null && typeof value !== "string") as Prisma.Decimal | null | undefined;
      const hsnCode = sourceValues.find((value) => typeof value === "string") as string | undefined;
      const price = master.lines.find((line) => line.vendor_price !== null)?.vendor_price ?? null;
      const quantity = master.lines.reduce((sum, line) => sum + Number(line.grouped_qty), 0);
      const total = master.lines.reduce((sum, line) => sum + Number(line.total_spend ?? (Number(line.grouped_qty) * Number(line.vendor_price ?? 0))), 0);
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
        hsn_code: hsnCode,
        total: new Prisma.Decimal(total),
      };
    });
    return transaction.purchaseOrder.create({
      data: {
        organization_id: organizationId,
        vendor_id: vendorId,
        purchase_order_no: `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        created_by: createdBy ?? null,
        po_date: parsedPoDate,
        delivery_date: parsedDeliveryDate,
        sources: { create: masters.map((master) => ({ master_purchase_order_id: master.id })) },
        lines: { create: lines },
      },
      include: purchaseOrderInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return serializePurchaseOrder(order);
}

export async function listPurchaseOrders(organizationId: string) {
  const orders = await prisma.purchaseOrder.findMany({ where: { organization_id: organizationId }, include: purchaseOrderInclude, orderBy: { created_at: "desc" } });
  return orders.map(serializePurchaseOrder);
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, organization_id: organizationId }, include: purchaseOrderInclude });
  if (!order) throw new Error("Purchase Order not found.");
  return serializePurchaseOrder(order);
}

export async function deletePurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, organization_id: organizationId },
    select: { id: true },
  });
  if (!order) throw new Error("Purchase Order not found.");

  await prisma.purchaseOrder.delete({ where: { id: order.id } });
}

export async function submitPurchaseOrderForApproval(organizationId: string, id: string, requestedBy: string) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, organization_id: organizationId, status: { in: ["DRAFT", "OPEN", "REJECTED"] } }, select: { id: true, purchase_order_no: true } });
  if (!order) throw new Error("Only draft or rejected Purchase Orders can be submitted for approval.");
  await prisma.$transaction(async (transaction) => {
    await transaction.purchaseOrder.update({ where: { id: order.id }, data: { status: "PENDING_APPROVAL", rejection_reason: null } });
    await transaction.approvalRequest.deleteMany({ where: { organization_id: organizationId, entity_type: "purchase-order", entity_ref_id: order.id, status: "pending" } });
    await transaction.approvalRequest.create({ data: { organization_id: organizationId, module_key: "purchase-order", module_name: "Purchase Order Approval", entity_type: "purchase-order", entity_key: order.purchase_order_no, entity_label: order.purchase_order_no, entity_ref_id: order.id, requested_by: requestedBy, status: "pending", notes: `Purchase Order ${order.purchase_order_no} is waiting for approval.` } });
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