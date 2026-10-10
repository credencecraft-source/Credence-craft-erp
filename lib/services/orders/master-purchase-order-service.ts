import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireSameOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";

const MASTER_GROUPED_STATUS = "MASTER_GROUPED";

const masterPurchaseOrderInclude = {
  entity: { select: { id: true, entity_name: true } },
  vendor: { select: { id: true, vendor: true } },
  sourceRecords: { select: { grouped_purchase_order_id: true, groupedPurchaseOrder: { select: { source_type: true, grouped_po_no: true, display_no: true, vendor_price_inr: true, vendor_price: true, gst: true, hsn_code: true, buying_uom: true } } } },
  lines: { orderBy: { created_at: "asc" as const } },
  purchaseOrderSources: { select: { purchase_order_id: true } },
} as const;

const numberValue = (value: Prisma.Decimal | number | string | null | undefined) => value === null || value === undefined ? null : Number(value);

function serializeMaster(order: Prisma.MasterPurchaseOrderGetPayload<{ include: typeof masterPurchaseOrderInclude }>) {
  const groupedNoByInternalNo = new Map(order.sourceRecords.map((source) => [source.groupedPurchaseOrder.grouped_po_no, source.groupedPurchaseOrder.display_no ? `GP-${source.groupedPurchaseOrder.display_no}` : source.groupedPurchaseOrder.grouped_po_no]));
  return {
    id: order.id,
    entityId: order.entity?.id ?? order.entity_id,
    entityName: order.entity?.entity_name ?? "Missing Entity",
    masterPoNo: order.display_no ? `MGP-${order.display_no}` : order.master_po_no,
    masterPoInternalNo: order.master_po_no,
    status: order.status,
    sourceType: order.sourceRecords[0]?.groupedPurchaseOrder.source_type ?? "VENDOR",
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
      where: { id: { in: uniqueIds }, organization_id: organizationId, source_type: { in: ["VENDOR", "STOCK"] }, status: "PRICE_APPROVED" },
      include: { entity: { select: { id: true, is_active: true } }, vendor: { select: { id: true, vendor: true } }, lines: true, masterGroupSource: { select: { id: true } } },
    });
    if (orders.length !== uniqueIds.length) throw new Error("One or more grouped purchase orders are unavailable for master grouping.");
    if (orders.some((order) => order.masterGroupSource)) throw new Error("One or more grouped purchase orders are already master grouped.");

    const keyFor = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
    const first = orders[0];
    if (orders.some((order) => order.source_type !== first.source_type)) {
      throw new Error("A Master Group cannot mix vendor and stock source records.");
    }
    const entityId = requireSameOrganizationEntity(
      orders.map((order) => order.entity_id),
      "Master grouping requires grouped purchase orders from the same Entity.",
    );
    if (orders.some((order) => !order.entity?.is_active)) {
      throw new Error("Master grouping requires grouped purchase orders from the same Entity.");
    }
    const signature = `${keyFor(entityId)}|${keyFor(first.vendor_id)}|${keyFor(first.raw_material)}|${keyFor(first.category)}|${keyFor(first.sub_category)}`;
    if (orders.some((order) => `${keyFor(order.entity_id)}|${keyFor(order.vendor_id)}|${keyFor(order.raw_material)}|${keyFor(order.category)}|${keyFor(order.sub_category)}` !== signature)) {
      throw new Error("Master grouping requires identical raw material, category, subcategory, and vendor.");
    }

    const priceValues = orders.flatMap((order) => order.lines.length
      ? order.lines.map((line) => line.vendor_price?.toString() ?? null)
      : [order.vendor_price_inr?.toString() ?? order.vendor_price?.toString() ?? null]);
    const gstValues = orders.map((order) => order.gst?.toString() ?? null);
    const hsnValues = orders.map((order) => order.hsn_code?.trim().toUpperCase() ?? null);
    if ([priceValues, gstValues, hsnValues].some((values) => new Set(values).size > 1)) {
      throw new Error("Master Group sources must have identical price, GST, and HSN.");
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
        entity_id: entityId,
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });

  return serializeMaster(created);
}

export async function listMasterPurchaseOrders(organizationId: string) {
  const orders = await prisma.masterPurchaseOrder.findMany({ where: { organization_id: organizationId }, include: masterPurchaseOrderInclude, orderBy: { created_at: "desc" } });
  return orders.map(serializeMaster);
}

export async function listMasterPurchaseOrdersPage(
  organizationId: string,
  input: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const rows = await prisma.masterPurchaseOrder.findMany({
    where: { organization_id: organizationId },
    include: masterPurchaseOrderInclude,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  return {
    masterPurchaseOrders: pageRows.map(serializeMaster),
    nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

export async function getMasterPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.masterPurchaseOrder.findFirst({
    where: { id, organization_id: organizationId },
    include: masterPurchaseOrderInclude,
  });
  if (!order) throw new Error("Master Group not found.");
  return serializeMaster(order);
}

export class MasterPurchaseOrderDeletionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterPurchaseOrderDeletionConflictError";
  }
}

export async function deleteMasterPurchaseOrder(organizationId: string, id: string, actorId: string) {
  await prisma.$transaction(async (transaction) => {
    const master = await transaction.masterPurchaseOrder.findFirst({
      where: { id, organization_id: organizationId },
      select: {
        id: true,
        master_po_no: true,
        display_no: true,
        status: true,
        sourceRecords: {
          select: {
            grouped_purchase_order_id: true,
            groupedPurchaseOrder: {
              select: {
                organization_id: true,
                source_type: true,
                status: true,
                total_grouped_qty: true,
              },
            },
          },
        },
        purchaseOrderSources: { select: { purchase_order_id: true } },
      },
    });
    if (!master) throw new Error("Master Group not found.");
    if (master.purchaseOrderSources.length > 0) {
      throw new Error("A Master Group linked to a Purchase Order cannot be deleted.");
    }

    const sourceGroupIds = master.sourceRecords.map((source) => source.grouped_purchase_order_id);
    if (sourceGroupIds.length === 0 || master.sourceRecords.some(({ groupedPurchaseOrder }) => groupedPurchaseOrder.organization_id !== organizationId)) {
      throw new MasterPurchaseOrderDeletionConflictError("Master Group source records are unavailable in this organization.");
    }
    const sourceTypes = new Set(master.sourceRecords.map(({ groupedPurchaseOrder }) => groupedPurchaseOrder.source_type));
    if (sourceTypes.size !== 1 || !["VENDOR", "STOCK"].includes(master.sourceRecords[0].groupedPurchaseOrder.source_type)) {
      throw new MasterPurchaseOrderDeletionConflictError("Master Group source records have an invalid type.");
    }

    const isStockMaster = sourceTypes.has("STOCK");
    const stockLifecycle = ["MASTER_GROUPED", "STORE_NOTIFIED", "STOCK_ALLOCATED"];
    if (isStockMaster && (!stockLifecycle.includes(master.status) || master.sourceRecords.some(({ groupedPurchaseOrder }) => !stockLifecycle.includes(groupedPurchaseOrder.status)))) {
      throw new MasterPurchaseOrderDeletionConflictError("This stock Master Group is not in a deletable lifecycle state.");
    }
    if (!isStockMaster && master.status !== "MASTER_GROUPED") {
      throw new MasterPurchaseOrderDeletionConflictError("This Master Group is not in a deletable lifecycle state.");
    }

    const verifications = isStockMaster
      ? await transaction.rmGrnVerification.findMany({
        where: { organization_id: organizationId, source_grouped_purchase_order_id: { in: sourceGroupIds } },
        select: { id: true, source_grouped_purchase_order_id: true, master_purchase_order_id: true, approved_quantity: true },
      })
      : [];
    if (verifications.some((verification) => verification.master_purchase_order_id !== master.id)) {
      throw new MasterPurchaseOrderDeletionConflictError("A stock verification is linked to a different Master Group.");
    }

    const fulfilledBookings = isStockMaster
      ? await transaction.rawMaterialStockBooking.findMany({
        where: { organization_id: organizationId, grouped_purchase_order_id: { in: sourceGroupIds }, status: "FULFILLED" },
        select: {
          id: true,
          grouped_purchase_order_id: true,
          take_from_stock_id: true,
          booked_quantity: true,
          fulfilled_quantity: true,
          takeFromStock: {
            select: {
              organization_id: true,
              quantity_on_hand: true,
              quantity_reserved: true,
              quantity_issued: true,
            },
          },
        },
      })
      : [];
    const verificationByGroupId = new Map(verifications.map((verification) => [verification.source_grouped_purchase_order_id, verification]));
    const bookedByGroupId = new Map<string, Prisma.Decimal>();
    const fulfilledByGroupId = new Map<string, Prisma.Decimal>();
    if (fulfilledBookings.some((booking) => !booking.grouped_purchase_order_id || !verificationByGroupId.has(booking.grouped_purchase_order_id))) {
      throw new MasterPurchaseOrderDeletionConflictError("Fulfilled stock reservations have no matching Store verification.");
    }
    if (verifications.some((verification) => !fulfilledBookings.some((booking) => booking.grouped_purchase_order_id === verification.source_grouped_purchase_order_id))) {
      throw new MasterPurchaseOrderDeletionConflictError("Store verification has no fulfilled stock reservations to reverse.");
    }
    for (const booking of fulfilledBookings) {
      const sourceGroupId = booking.grouped_purchase_order_id;
      if (!sourceGroupId) {
        throw new MasterPurchaseOrderDeletionConflictError("A fulfilled stock reservation is missing its source group.");
      }
      bookedByGroupId.set(
        sourceGroupId,
        (bookedByGroupId.get(sourceGroupId) ?? new Prisma.Decimal(0)).plus(booking.booked_quantity),
      );
      fulfilledByGroupId.set(
        sourceGroupId,
        (fulfilledByGroupId.get(sourceGroupId) ?? new Prisma.Decimal(0)).plus(booking.fulfilled_quantity),
      );
    }
    for (const source of master.sourceRecords) {
      const verification = verificationByGroupId.get(source.grouped_purchase_order_id);
      if (!verification) continue;
      const booked = bookedByGroupId.get(source.grouped_purchase_order_id) ?? new Prisma.Decimal(0);
      const fulfilled = fulfilledByGroupId.get(source.grouped_purchase_order_id) ?? new Prisma.Decimal(0);
      if (
        !source.groupedPurchaseOrder.total_grouped_qty
        || !booked.equals(source.groupedPurchaseOrder.total_grouped_qty)
        || !fulfilled.equals(verification.approved_quantity)
      ) {
        throw new MasterPurchaseOrderDeletionConflictError("Store verification quantities do not match the stock reservation ledger.");
      }
    }

    const reversals = new Map<string, {
      quantityOnHand: Prisma.Decimal;
      quantityReserved: Prisma.Decimal;
      quantityIssued: Prisma.Decimal;
      onHandBefore: Prisma.Decimal;
      reservedBefore: Prisma.Decimal;
      issuedBefore: Prisma.Decimal;
    }>();
    for (const booking of fulfilledBookings) {
      if (booking.takeFromStock.organization_id !== organizationId) {
        throw new MasterPurchaseOrderDeletionConflictError("A stock reservation belongs to a different organization.");
      }
      if (booking.fulfilled_quantity.isNegative() || booking.fulfilled_quantity.greaterThan(booking.booked_quantity)) {
        throw new MasterPurchaseOrderDeletionConflictError("Fulfilled stock quantities are inconsistent and cannot be reversed.");
      }
      const change = reversals.get(booking.take_from_stock_id) ?? {
        quantityOnHand: new Prisma.Decimal(0),
        quantityReserved: new Prisma.Decimal(0),
        quantityIssued: new Prisma.Decimal(0),
        onHandBefore: booking.takeFromStock.quantity_on_hand,
        reservedBefore: booking.takeFromStock.quantity_reserved,
        issuedBefore: booking.takeFromStock.quantity_issued,
      };
      change.quantityOnHand = change.quantityOnHand.plus(booking.fulfilled_quantity);
      change.quantityReserved = change.quantityReserved.plus(booking.booked_quantity);
      change.quantityIssued = change.quantityIssued.plus(booking.fulfilled_quantity);
      reversals.set(booking.take_from_stock_id, change);
    }

    for (const [stockId, change] of reversals) {
      if (
        change.issuedBefore.lessThan(change.quantityIssued)
        || change.onHandBefore.plus(change.quantityOnHand).lessThan(change.reservedBefore.plus(change.quantityReserved))
      ) {
        throw new MasterPurchaseOrderDeletionConflictError("Cannot delete this Master Group because its issued stock has since been used or reserved. Reverse that inventory activity first.");
      }
      const updated = await transaction.rawMaterialStock.updateMany({
        where: {
          id: stockId,
          organization_id: organizationId,
          quantity_on_hand: change.onHandBefore,
          quantity_reserved: change.reservedBefore,
          quantity_issued: { gte: change.quantityIssued },
        },
        data: {
          quantity_on_hand: { increment: change.quantityOnHand },
          quantity_reserved: { increment: change.quantityReserved },
          quantity_issued: { decrement: change.quantityIssued },
        },
      });
      if (updated.count !== 1) {
        throw new MasterPurchaseOrderDeletionConflictError("Stock changed while deleting this Master Group. Reload and try again.");
      }
    }

    if (fulfilledBookings.length > 0) {
      const restored = await transaction.rawMaterialStockBooking.updateMany({
        where: { organization_id: organizationId, id: { in: fulfilledBookings.map((booking) => booking.id) }, status: "FULFILLED" },
        data: { status: "BOOKED", fulfilled_quantity: new Prisma.Decimal(0) },
      });
      if (restored.count !== fulfilledBookings.length) {
        throw new MasterPurchaseOrderDeletionConflictError("Stock reservations changed while deleting this Master Group. Reload and try again.");
      }
    }

    if (verifications.length > 0) {
      const deletedVerifications = await transaction.rmGrnVerification.deleteMany({
        where: { organization_id: organizationId, id: { in: verifications.map((verification) => verification.id) } },
      });
      if (deletedVerifications.count !== verifications.length) {
        throw new MasterPurchaseOrderDeletionConflictError("Store verification changed while deleting this Master Group. Reload and try again.");
      }
    }

    const resetGroups = await transaction.groupedPurchaseOrder.updateMany({
      where: { id: { in: sourceGroupIds }, organization_id: organizationId },
      data: { status: "PRICE_APPROVED" },
    });
    if (resetGroups.count !== sourceGroupIds.length) {
      throw new MasterPurchaseOrderDeletionConflictError("Master Group source records changed while being deleted. Reload and try again.");
    }

    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: isStockMaster ? "Inventory Management" : "Procurement",
      action: "DELETE",
      entityType: "MasterPurchaseOrder",
      entityId: master.id,
      details: {
        master_group_no: master.display_no ? `MGP-${master.display_no}` : master.master_po_no,
        previous_status: master.status,
        source_group_ids: sourceGroupIds,
        deleted_verification_ids: verifications.map((verification) => verification.id),
        reversed_stock: [...reversals].map(([stockId, change]) => ({
          stock_id: stockId,
          restored_on_hand: change.quantityOnHand.toString(),
          restored_reserved: change.quantityReserved.toString(),
          reversed_issued: change.quantityIssued.toString(),
        })),
      },
    }, transaction);

    const deletedMaster = await transaction.masterPurchaseOrder.deleteMany({
      where: { id: master.id, organization_id: organizationId },
    });
    if (deletedMaster.count !== 1) {
      throw new MasterPurchaseOrderDeletionConflictError("Master Group changed while it was being deleted. Reload and try again.");
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export const MASTER_PURCHASE_ORDER_STATUS = MASTER_GROUPED_STATUS;