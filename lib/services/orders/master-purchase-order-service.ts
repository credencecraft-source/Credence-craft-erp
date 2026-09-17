import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";

const MASTER_GROUPED_STATUS = "MASTER_GROUPED";

const masterPurchaseOrderInclude = {
  vendor: { select: { id: true, vendor: true } },
  sourceRecords: { select: { grouped_purchase_order_id: true, groupedPurchaseOrder: { select: { grouped_po_no: true, display_no: true, vendor_price_inr: true, vendor_price: true, gst: true, hsn_code: true, buying_uom: true } } } },
  lines: { orderBy: { created_at: "asc" as const } },
  purchaseOrderSources: { select: { purchase_order_id: true } },
} as const;

const numberValue = (value: Prisma.Decimal | number | string | null | undefined) => value === null || value === undefined ? null : Number(value);

function serializeMaster(order: Prisma.MasterPurchaseOrderGetPayload<{ include: typeof masterPurchaseOrderInclude }>) {
  const groupedNoByInternalNo = new Map(order.sourceRecords.map((source) => [source.groupedPurchaseOrder.grouped_po_no, source.groupedPurchaseOrder.display_no ? `GP-${source.groupedPurchaseOrder.display_no}` : source.groupedPurchaseOrder.grouped_po_no]));
  return {
    id: order.id,
    masterPoNo: order.display_no ? `MGP-${order.display_no}` : order.master_po_no,
    masterPoInternalNo: order.master_po_no,
    status: order.status,
    createdAt: order.created_at,
    rawMaterial: order.raw_material,
    category: order.category,
    subCategory: order.sub_category,
    totalRequiredQty: numberValue(order.total_required_qty),
    totalGroupedQty: numberValue(order.total_grouped_qty),
    noOfStyles: order.no_of_styles,
    vendor: { id: order.vendor.id, name: order.vendor.vendor },
    sourceGroupedPoIds: order.sourceRecords.map((source) => source.grouped_purchase_order_id),
    purchaseOrderCreated: order.purchaseOrderSources.length > 0,
    price: [...new Set(order.sourceRecords.map((source) => numberValue(source.groupedPurchaseOrder.vendor_price_inr ?? source.groupedPurchaseOrder.vendor_price)).filter((value): value is number => value !== null))].join(", "),
    gst: [...new Set(order.sourceRecords.map((source) => numberValue(source.groupedPurchaseOrder.gst)).filter((value): value is number => value !== null))].join(", "),
    hsnCode: [...new Set(order.sourceRecords.map((source) => source.groupedPurchaseOrder.hsn_code).filter(Boolean))].join(", "),
    buyingUom: [...new Set(order.sourceRecords.map((source) => source.groupedPurchaseOrder.buying_uom).filter(Boolean))].join(", "),
    total: order.lines.reduce((sum, line) => sum + Number(line.total_spend ?? (Number(line.grouped_qty) * Number(line.vendor_price ?? 0))), 0),
    lines: order.lines.map((line) => ({
      id: line.id,
      sourceGroupedPoNo: groupedNoByInternalNo.get(line.source_grouped_po_no ?? "") ?? line.source_grouped_po_no,
      sourceOrderId: line.source_order_id,
      sourceOrderNo: line.source_order_no,
      styleName: line.style_name,
      brand: line.brand,
      rawMaterial: line.raw_material,
      category: line.category,
      subCategory: line.sub_category,
      requiredQty: numberValue(line.required_qty),
      groupedQty: numberValue(line.grouped_qty),
      vendorPrice: numberValue(line.vendor_price),
      totalSpend: numberValue(line.total_spend),
         stockUom: line.stock_uom,
    })),
  };
}

export async function createMasterPurchaseOrder(
  organizationId: string,
  groupedPurchaseOrderIds: string[],
  createdBy?: string | null,
) {
  const uniqueIds = [...new Set(groupedPurchaseOrderIds.filter(Boolean))];
  if (uniqueIds.length < 1) throw new Error("Select at least one grouped purchase order to master group.");

  const created = await prisma.$transaction(async (transaction) => {
    const orders = await transaction.groupedPurchaseOrder.findMany({
      where: { id: { in: uniqueIds }, organization_id: organizationId, status: "PRICE_APPROVED" },
      include: { vendor: { select: { id: true, vendor: true } }, lines: true, masterGroupSource: { select: { id: true } } },
    });
    if (orders.length !== uniqueIds.length) throw new Error("One or more grouped purchase orders are unavailable for master grouping.");
    if (orders.some((order) => order.masterGroupSource)) throw new Error("One or more grouped purchase orders are already master grouped.");

    const keyFor = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
    const first = orders[0];
    const signature = `${keyFor(first.vendor_id)}|${keyFor(first.raw_material)}|${keyFor(first.category)}|${keyFor(first.sub_category)}`;
    if (orders.some((order) => `${keyFor(order.vendor_id)}|${keyFor(order.raw_material)}|${keyFor(order.category)}|${keyFor(order.sub_category)}` !== signature)) {
      throw new Error("Master grouping requires identical raw material, category, subcategory, and vendor.");
    }

    const lines = orders.flatMap((order) => order.lines.map((line) => ({
      source_grouped_line_id: line.id,
      source_grouped_po_no: order.grouped_po_no,
      source_order_id: line.source_order_id,
      source_order_no: line.order_no,
      style_name: line.style_name,
      brand: line.brand,
      raw_material: line.item_name,
      category: line.category,
      sub_category: line.sub_category,
      required_qty: line.required_qty,
      grouped_qty: line.grouped_qty,
      vendor_price: line.vendor_price,
      total_spend: line.total_spend,
         stock_uom: line.stock_uom,
    })));
    const displayNumber = await reserveProcurementDocumentNumber(organizationId, "MASTER_GROUP", transaction);
    const displayNo = Number(displayNumber.replace("MGP-", ""));
    const master = await transaction.masterPurchaseOrder.create({
      data: {
        organization_id: organizationId,
        vendor_id: first.vendor_id,
        master_po_no: `MPO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        status: MASTER_GROUPED_STATUS,
        created_by: createdBy ?? null,
        raw_material: first.raw_material,
        category: first.category,
        sub_category: first.sub_category,
        total_required_qty: orders.reduce((sum, order) => sum + Number(order.total_required_qty ?? 0), 0),
        total_grouped_qty: orders.reduce((sum, order) => sum + Number(order.total_grouped_qty ?? 0), 0),
        no_of_styles: new Set(lines.map((line) => line.style_name).filter(Boolean)).size,
        sourceRecords: { create: orders.map((order) => ({ grouped_purchase_order_id: order.id })) },
        lines: { create: lines },
      },
      include: masterPurchaseOrderInclude,
    });
    await transaction.groupedPurchaseOrder.updateMany({ where: { id: { in: uniqueIds }, organization_id: organizationId }, data: { status: MASTER_GROUPED_STATUS } });
    return master;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return serializeMaster(created);
}

export async function listMasterPurchaseOrders(organizationId: string) {
  const orders = await prisma.masterPurchaseOrder.findMany({ where: { organization_id: organizationId }, include: masterPurchaseOrderInclude, orderBy: { created_at: "desc" } });
  return orders.map(serializeMaster);
}

export async function deleteMasterPurchaseOrder(organizationId: string, id: string) {
  await prisma.$transaction(async (transaction) => {
    const master = await transaction.masterPurchaseOrder.findFirst({
      where: { id, organization_id: organizationId },
      select: { id: true, sourceRecords: { select: { grouped_purchase_order_id: true } } },
    });
    if (!master) throw new Error("Master Group not found.");

    await transaction.groupedPurchaseOrder.updateMany({
      where: { id: { in: master.sourceRecords.map((source) => source.grouped_purchase_order_id) }, organization_id: organizationId },
      data: { status: "PRICE_APPROVED" },
    });
    await transaction.masterPurchaseOrder.delete({ where: { id: master.id } });
  });
}

export const MASTER_PURCHASE_ORDER_STATUS = MASTER_GROUPED_STATUS;