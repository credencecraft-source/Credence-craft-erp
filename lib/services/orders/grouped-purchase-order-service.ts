import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireSameOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";

const PRICE_APPROVAL_STATUS = "PENDING_PRICE_APPROVAL";
const APPROVED_STATUS = "PRICE_APPROVED";
const REJECTED_STATUS = "REJECTED";

export type GroupedPurchaseOrderLineInput = {
  bomItemId: string;
  groupedQty: number | string;
};

export type CreateGroupedPurchaseOrderInput = {
  organizationId: string;
  vendorId: string;
  submittedBy?: string | null;
  lines: GroupedPurchaseOrderLineInput[];
};

function positiveNumber(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
  return parsed;
}

function decimalValue(value: Prisma.Decimal | number | string | null | undefined) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeLine(line: {
  id: string;
  source_bom_item_id: string;
  order_no: string | null;
  style_name: string | null;
  brand: string | null;
  category: string | null;
  sub_category: string | null;
  item_name: string | null;
  stock_uom?: string | null;
  category_type: string | null;
  internal_price_bom: Prisma.Decimal | null;
  other_charges_per_item: Prisma.Decimal | null;
  total_extra: Prisma.Decimal | null;
  total_spend: Prisma.Decimal | null;
  internal_consumption: Prisma.Decimal | null;
  required_qty: Prisma.Decimal;
  grouped_qty: Prisma.Decimal;
  vendor_price: Prisma.Decimal | null;
}) {
  return {
    id: line.id,
    bomItemId: line.source_bom_item_id,
    orderNo: line.order_no,
    styleName: line.style_name,
    brand: line.brand,
    category: line.category,
    subCategory: line.sub_category,
    itemName: line.item_name,
    stockUom: line.stock_uom,
    categoryType: line.category_type,
    internalPriceBom: decimalValue(line.internal_price_bom),
    otherChargesPerItem: decimalValue(line.other_charges_per_item),
    totalExtra: decimalValue(line.total_extra),
    totalSpend: decimalValue(line.total_spend),
    total: decimalValue(line.total_spend) ?? Number(line.grouped_qty) * Number(line.vendor_price ?? 0),
    internalConsumption: decimalValue(line.internal_consumption),
    requiredQty: decimalValue(line.required_qty),
    groupedQty: decimalValue(line.grouped_qty),
    vendorPrice: decimalValue(line.vendor_price),
  };
}

function serializePurchaseOrder(order: {
  id: string;
  entity_id: string | null;
  entity: { id: string; entity_name: string } | null;
  source_type: string;
  grouped_po_no: string;
  display_no: number | null;
  status: string;
  submitted_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  vendor: { id: string; vendor: string; gst_number: string | null; registered_state: string | null; registeredState: { state: string } | null };
  note: string | null;
  raw_material: string | null;
  category_type: string | null;
  category: string | null;
  sub_category: string | null;
  brand: string | null;
  total_required_qty: Prisma.Decimal | null;
  total_grouped_qty: Prisma.Decimal | null;
  no_of_styles: number | null;
  stock_uom: string | null;
  buying_uom: string | null;
  convert_value: Prisma.Decimal | null;
  round_of: boolean;
  buying_qty: Prisma.Decimal | null;
  buying_qty_round: Prisma.Decimal | null;
  difference_round: Prisma.Decimal | null;
  moq_stock_uom: Prisma.Decimal | null;
  moq_buying: Prisma.Decimal | null;
  extra_buying_uom: Prisma.Decimal | null;
  buying_qty_total: Prisma.Decimal | null;
  vendor_price: Prisma.Decimal | null;
  vendor_price_inr: Prisma.Decimal | null;
  gst: Prisma.Decimal | null;
  hsn_code: string | null;
  other_charges: Prisma.Decimal | null;
  other_charges_inr: Prisma.Decimal | null;
  currency: string | null;
  exchange_price: Prisma.Decimal | null;
  lines: Array<Parameters<typeof serializeLine>[0]>;
}) {
  return {
    id: order.id,
    entityId: order.entity?.id ?? order.entity_id,
    entityName: order.entity?.entity_name ?? "Missing Entity",
    sourceType: order.source_type,
    groupedPoNo: order.display_no ? `GP-${order.display_no}` : order.grouped_po_no,
    groupedPoInternalNo: order.grouped_po_no,
    status: order.status,
    submittedAt: order.submitted_at,
    approvedBy: order.approved_by,
    approvedAt: order.approved_at,
    rejectionReason: order.rejection_reason,
    note: order.note,
    rawMaterial: order.raw_material,
    categoryType: order.category_type,
    category: order.category,
    subCategory: order.sub_category,
    brand: order.brand,
    totalRequiredQty: decimalValue(order.total_required_qty),
    totalGroupedQty: decimalValue(order.total_grouped_qty),
    noOfStyles: order.no_of_styles,
    stockUom: order.stock_uom,
    buyingUom: order.buying_uom,
    convertValue: decimalValue(order.convert_value),
    roundOf: order.round_of,
    buyingQty: decimalValue(order.buying_qty),
    buyingQtyRound: decimalValue(order.buying_qty_round),
    differenceRound: decimalValue(order.difference_round),
    moqStockUom: decimalValue(order.moq_stock_uom),
    moqBuying: decimalValue(order.moq_buying),
    extraBuyingUom: decimalValue(order.extra_buying_uom),
    buyingQtyTotal: decimalValue(order.buying_qty_total),
    vendorPrice: decimalValue(order.vendor_price),
    vendorPriceInr: decimalValue(order.vendor_price_inr),
    gst: decimalValue(order.gst),
    hsnCode: order.hsn_code,
    otherCharges: decimalValue(order.other_charges),
    otherChargesInr: decimalValue(order.other_charges_inr),
    currency: order.currency,
    exchangePrice: decimalValue(order.exchange_price),
    vendor: { id: order.vendor.id, name: order.vendor.vendor, gstin: order.vendor.gst_number, registeredState: order.vendor.registered_state ?? order.vendor.registeredState?.state ?? null },
    lines: order.lines.map(serializeLine),
  };
}

async function enrichPurchaseOrderTaxFields<T extends ReturnType<typeof serializePurchaseOrder>>(organizationId: string, orders: T[]) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { state: true, gst_number: true } });
  const ordersWithTaxContext = orders.map((order) => ({ ...order, organizationState: organization?.state ?? null, organizationGstin: organization?.gst_number ?? null }));
  const rawMaterialNames = [...new Set(orders.flatMap((order) => order.lines.map((line) => line.itemName).filter((name): name is string => Boolean(name))))];
  if (rawMaterialNames.length === 0) return ordersWithTaxContext;

  const rawMaterials = await prisma.masterRawMaterial.findMany({
    where: { organization_id: organizationId, raw_material_name: { in: rawMaterialNames } },
    select: { raw_material_name: true, legacy_metadata: true },
  });
  const taxByMaterial = new Map(rawMaterials.map((material) => {
    const metadata = material.legacy_metadata && typeof material.legacy_metadata === "object" && !Array.isArray(material.legacy_metadata) ? material.legacy_metadata as Record<string, unknown> : {};
    return [material.raw_material_name, { gst: metadata.gst ?? metadata.Gst ?? metadata.GST ?? null, hsnCode: metadata.hsnCode ?? metadata.hsn_code ?? metadata.Hsn_Code ?? metadata.HSN ?? null }];
  }));

  return ordersWithTaxContext.map((order) => ({
    ...order,
    lines: order.lines.map((line) => ({ ...line, ...(taxByMaterial.get(line.itemName ?? "") ?? { gst: null, hsnCode: null }) })),
  }));
}

const groupedPurchaseOrderInclude = {
  entity: { select: { id: true, entity_name: true } },
  vendor: { select: { id: true, vendor: true, gst_number: true, registered_state: true, registeredState: { select: { state: true } } } },
  lines: {
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      source_bom_item_id: true,
      order_no: true,
      style_name: true,
      brand: true,
      category: true,
      sub_category: true,
      item_name: true,
      category_type: true,
      internal_price_bom: true,
      other_charges_per_item: true,
      total_extra: true,
      total_spend: true,
      internal_consumption: true,
      required_qty: true,
      grouped_qty: true,
      stock_uom: true,
      vendor_price: true,
    },
  },
} satisfies Prisma.GroupedPurchaseOrderInclude;

const allocatableBomItemSelect = {
  id: true,
  order_id: true,
  categoryType: true,
  category: true,
  subCategory: true,
  rawMaterialName: true,
  stockUom: true,
  internalConsumption: true,
  internalPrice: true,
  requiredQty: true,
  totalRequiredQty: true,
  order: {
    select: {
      orderNo: true,
      styleName: true,
      brand: true,
      entity_id: true,
      entityName: true,
      entity: { select: { id: true, entity_name: true, is_active: true } },
    },
  },
} satisfies Prisma.BillOfMaterialItemSelect;

type AllocatableBomItem = Prisma.BillOfMaterialItemGetPayload<{ select: typeof allocatableBomItemSelect }>;

type AllocationQuantityTotals = {
  groupedByBomId: Map<string, Prisma.Decimal>;
  bookedByBomId: Map<string, Prisma.Decimal>;
  fulfilledByBomId: Map<string, Prisma.Decimal>;
};

async function loadAllocationQuantityTotals(organizationId: string, sourceBomItemIds?: string[]): Promise<AllocationQuantityTotals> {
  if (sourceBomItemIds && sourceBomItemIds.length === 0) {
    return { groupedByBomId: new Map(), bookedByBomId: new Map(), fulfilledByBomId: new Map() };
  }
  const [groupedQuantities, bookingQuantities] = await Promise.all([
    prisma.groupedPurchaseOrderLine.groupBy({
      by: ["source_bom_item_id"],
      where: {
        ...(sourceBomItemIds ? { source_bom_item_id: { in: sourceBomItemIds } } : {}),
        groupedPurchaseOrder: { organization_id: organizationId, source_type: "VENDOR" },
      },
      _sum: { grouped_qty: true },
    }),
    prisma.rawMaterialStockBooking.groupBy({
      by: ["source_bom_item_id", "status"],
      where: {
        organization_id: organizationId,
        status: { in: ["BOOKED", "FULFILLED"] },
        ...(sourceBomItemIds ? { source_bom_item_id: { in: sourceBomItemIds } } : {}),
      },
      _sum: { booked_quantity: true, fulfilled_quantity: true },
    }),
  ]);
  const groupedByBomId = new Map(groupedQuantities.map((group) => [
    group.source_bom_item_id,
    group._sum.grouped_qty ?? new Prisma.Decimal(0),
  ]));
  const bookedByBomId = new Map<string, Prisma.Decimal>();
  const fulfilledByBomId = new Map<string, Prisma.Decimal>();
  for (const booking of bookingQuantities) {
    if (booking.status === "BOOKED") {
      bookedByBomId.set(booking.source_bom_item_id, booking._sum.booked_quantity ?? new Prisma.Decimal(0));
    } else if (booking.status === "FULFILLED") {
      fulfilledByBomId.set(booking.source_bom_item_id, booking._sum.fulfilled_quantity ?? new Prisma.Decimal(0));
    }
  }

  return { groupedByBomId, bookedByBomId, fulfilledByBomId };
}

function remainingBomQuantity(
  row: { id: string; totalRequiredQty: Prisma.Decimal | null; requiredQty: Prisma.Decimal | null },
  totals: AllocationQuantityTotals,
) {
  const requiredQty = new Prisma.Decimal(row.totalRequiredQty ?? row.requiredQty ?? 0);
  const remainingQty = requiredQty
    .minus(totals.groupedByBomId.get(row.id) ?? 0)
    .minus(totals.bookedByBomId.get(row.id) ?? 0)
    .minus(totals.fulfilledByBomId.get(row.id) ?? 0);
  return remainingQty.gt(0) ? remainingQty : new Prisma.Decimal(0);
}

function serializeAllocatableBomRows(rows: AllocatableBomItem[], totals: AllocationQuantityTotals) {
  return rows.flatMap((row) => {
    const requiredQty = new Prisma.Decimal(row.totalRequiredQty ?? row.requiredQty ?? 0);
    const remainingQty = remainingBomQuantity(row, totals);
    if (!remainingQty.gt(0)) return [];
    return [{
      id: row.id,
      orderId: row.order_id,
      orderNo: row.order.orderNo,
      entityId: row.order.entity?.id ?? row.order.entity_id,
      entityName: row.order.entity?.entity_name ?? row.order.entityName ?? "Missing Entity",
      styleName: row.order.styleName,
      brand: row.order.brand,
      category: row.category,
      categoryType: row.categoryType,
      subCategory: row.subCategory,
      itemName: row.rawMaterialName,
      stockUom: row.stockUom,
      internalConsumption: decimalValue(row.internalConsumption),
      internalPriceBom: decimalValue(row.internalPrice),
      requiredQty: decimalValue(requiredQty),
      remainingQty: decimalValue(remainingQty),
    }];
  });
}

export async function listAllocatableBomRows(organizationId: string) {
  const [rows, totals] = await Promise.all([
    prisma.billOfMaterialItem.findMany({
      where: { order: { organization_id: organizationId } },
      select: allocatableBomItemSelect,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }),
    loadAllocationQuantityTotals(organizationId),
  ]);
  return serializeAllocatableBomRows(rows, totals);
}

export async function listAllocatableBomRowsPage(
  organizationId: string,
  input: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const rows = await prisma.billOfMaterialItem.findMany({
    where: { order: { organization_id: organizationId } },
    select: allocatableBomItemSelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const totals = await loadAllocationQuantityTotals(organizationId, pageRows.map((row) => row.id));
  return {
    bomRows: serializeAllocatableBomRows(pageRows, totals),
    nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

async function countAllocatableBomRows(organizationId: string) {
  const [rows, totals] = await Promise.all([
    prisma.billOfMaterialItem.findMany({
      where: { order: { organization_id: organizationId } },
      select: { id: true, requiredQty: true, totalRequiredQty: true },
    }),
    loadAllocationQuantityTotals(organizationId),
  ]);
  return rows.reduce((count, row) => count + (remainingBomQuantity(row, totals).gt(0) ? 1 : 0), 0);
}

export async function getProcurementSummary(organizationId: string) {
  const [pendingVendorAllocation, pendingPriceApproval, readyForPo] = await Promise.all([
    countAllocatableBomRows(organizationId),
    prisma.groupedPurchaseOrder.count({
      where: { organization_id: organizationId, status: PRICE_APPROVAL_STATUS },
    }),
    prisma.groupedPurchaseOrder.count({
      where: { organization_id: organizationId, source_type: "VENDOR", status: APPROVED_STATUS },
    }),
  ]);

  return {
    pendingVendorAllocation,
    pendingPriceApproval,
    readyForPo,
    totalOpen: pendingVendorAllocation + pendingPriceApproval + readyForPo,
  };
}

export async function createGroupedPurchaseOrder(input: CreateGroupedPurchaseOrderInput) {
  const uniqueLines = new Map(input.lines.map((line) => [String(line.bomItemId), line]));
  if (!input.vendorId) throw new Error("Vendor is required.");
  if (uniqueLines.size === 0) throw new Error("Select at least one raw-material row.");
  if (uniqueLines.size !== input.lines.length) throw new Error("A raw-material row cannot be selected more than once.");

  const created = await prisma.$transaction(async (transaction) => {
    const vendor = await transaction.masterVendor.findFirst({
      where: { id: input.vendorId, organization_id: input.organizationId, is_active: true },
      select: { id: true },
    });
    if (!vendor) throw new Error("The selected vendor was not found in this organization.");

    const bomItems = await transaction.billOfMaterialItem.findMany({
      where: {
        id: { in: [...uniqueLines.keys()] },
        order: { organization_id: input.organizationId },
      },
      select: {
        id: true,
        order_id: true,
        category: true,
        categoryType: true,
        subCategory: true,
        rawMaterialName: true,
        stockUom: true,
        internalConsumption: true,
        internalPrice: true,
        requiredQty: true,
        totalRequiredQty: true,
        order: {
          select: {
            orderNo: true,
            styleName: true,
            brand: true,
            entity_id: true,
            entity: { select: { id: true, entity_name: true, is_active: true } },
          },
        },
      },
    });

    if (bomItems.length !== uniqueLines.size) {
      throw new Error("One or more selected raw-material rows are no longer available.");
    }

    const groupingKey = (item: {
      rawMaterialName: string | null;
      category: string | null;
      subCategory: string | null;
      stockUom: string | null;
    }) => [item.rawMaterialName, item.category, item.subCategory, item.stockUom]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("|");
    const firstGroupingKey = groupingKey(bomItems[0]);
    if (bomItems.some((item) => groupingKey(item) !== firstGroupingKey)) {
      throw new Error("Select BOM rows for one raw material, category, subcategory, and stock UOM per grouped PO.");
    }

    const entityId = requireSameOrganizationEntity(
      bomItems.map((item) => item.order.entity_id),
      "Select BOM rows from one active Entity. Orders without an active Entity cannot be procured.",
    );
    if (bomItems.some((item) => !item.order.entity?.is_active)) {
      throw new Error("Select BOM rows from one active Entity. Orders without an active Entity cannot be procured.");
    }

    const itemIds = [...uniqueLines.keys()];
    const [bookedQuantities, fulfilledQuantities, groupedQuantities] = await Promise.all([
      transaction.rawMaterialStockBooking.groupBy({
        by: ["source_bom_item_id"],
        where: { organization_id: input.organizationId, status: "BOOKED", source_bom_item_id: { in: itemIds } },
        _sum: { booked_quantity: true },
      }),
      transaction.rawMaterialStockBooking.groupBy({
        by: ["source_bom_item_id"],
        where: { organization_id: input.organizationId, status: "FULFILLED", source_bom_item_id: { in: itemIds } },
        _sum: { fulfilled_quantity: true },
      }),
      transaction.groupedPurchaseOrderLine.groupBy({
        by: ["source_bom_item_id"],
        where: { source_bom_item_id: { in: itemIds }, groupedPurchaseOrder: { organization_id: input.organizationId, source_type: "VENDOR" } },
        _sum: { grouped_qty: true },
      }),
    ]);
    const bookedByBomId = new Map(bookedQuantities.map((row) => [row.source_bom_item_id, row._sum.booked_quantity ?? new Prisma.Decimal(0)]));
    const fulfilledByBomId = new Map(fulfilledQuantities.map((row) => [row.source_bom_item_id, row._sum.fulfilled_quantity ?? new Prisma.Decimal(0)]));
    const groupedByBomId = new Map(groupedQuantities.map((row) => [row.source_bom_item_id, row._sum.grouped_qty ?? new Prisma.Decimal(0)]));

    const rawMaterialNames = [...new Set(bomItems.map((item) => item.rawMaterialName).filter((name): name is string => Boolean(name)))];
    const rawMaterialMasters = await transaction.masterRawMaterial.findMany({
      where: { organization_id: input.organizationId, raw_material_name: { in: rawMaterialNames } },
      select: { raw_material_name: true, stock_uom: { select: { uom: true } } },
    });
    const stockUomByRawMaterial = new Map(rawMaterialMasters.map((material) => [material.raw_material_name.trim().toLowerCase(), material.stock_uom.uom]));

    const lines = bomItems.map((item) => {
      const requiredQty = positiveNumber(item.totalRequiredQty ?? item.requiredQty, "Required Qty");
      const groupedQty = positiveNumber(uniqueLines.get(item.id)?.groupedQty, "Grouped Qty");
      const remainingQty = new Prisma.Decimal(requiredQty)
        .minus(bookedByBomId.get(item.id) ?? 0)
        .minus(fulfilledByBomId.get(item.id) ?? 0)
        .minus(groupedByBomId.get(item.id) ?? 0);
      if (new Prisma.Decimal(groupedQty).gt(remainingQty)) {
        throw new Error(`Grouped Qty cannot exceed the remaining requirement for ${item.order.orderNo}.`);
      }
      const stockUom = stockUomByRawMaterial.get(String(item.rawMaterialName ?? "").trim().toLowerCase()) ?? item.stockUom;
      return {
        source_bom_item_id: item.id,
        source_order_id: item.order_id,
        order_no: item.order.orderNo,
        style_name: item.order.styleName,
        brand: item.order.brand,
        category: item.category,
        category_type: item.categoryType,
        sub_category: item.subCategory,
        item_name: item.rawMaterialName,
        stock_uom: stockUom,
        internal_consumption: item.internalConsumption,
        internal_price_bom: item.internalPrice,
        required_qty: remainingQty,
        grouped_qty: new Prisma.Decimal(groupedQty),
      };
    });

    const totalRequiredQty = lines.reduce((total, line) => total + Number(line.required_qty), 0);
    const totalGroupedQty = lines.reduce((total, line) => total + Number(line.grouped_qty), 0);
    const rawMaterials = [...new Set(lines.map((line) => line.item_name).filter(Boolean))];
    const categories = [...new Set(lines.map((line) => line.category).filter(Boolean))];
    const subCategories = [...new Set(lines.map((line) => line.sub_category).filter(Boolean))];
    const brands = [...new Set(lines.map((line) => line.brand).filter(Boolean))];
    const stockUoms = [...new Set(lines.map((line) => line.stock_uom).filter(Boolean))];
    const displayNumber = await reserveProcurementDocumentNumber(input.organizationId, "GROUPED_PO", transaction);
    const displayNo = Number(displayNumber.replace("GP-", ""));

    const order = await transaction.groupedPurchaseOrder.create({
      data: {
        organization_id: input.organizationId,
        entity_id: entityId,
        vendor_id: vendor.id,
        grouped_po_no: `GPO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        status: PRICE_APPROVAL_STATUS,
        submitted_by: input.submittedBy ?? null,
        raw_material: rawMaterials.join(", ") || null,
        category: categories.join(", ") || null,
        sub_category: subCategories.join(", ") || null,
        brand: brands.join(", ") || null,
        total_required_qty: totalRequiredQty,
        total_grouped_qty: totalGroupedQty,
        no_of_styles: new Set(lines.map((line) => line.style_name).filter(Boolean)).size,
        stock_uom: stockUoms.join(", ") || null,
        lines: { create: lines },
      },
      include: groupedPurchaseOrderInclude,
    });

    return serializePurchaseOrder(order);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return created;
}

export async function listGroupedPurchaseOrders(organizationId: string, status?: string | string[]) {
  const orders = await prisma.groupedPurchaseOrder.findMany({
    where: { organization_id: organizationId, ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}) },
    include: groupedPurchaseOrderInclude,
    orderBy: { created_at: "desc" },
  });
  return enrichPurchaseOrderTaxFields(organizationId, orders.map(serializePurchaseOrder));
}

export async function listGroupedPurchaseOrdersPage(
  organizationId: string,
  status: string | string[] | undefined,
  input: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const rows = await prisma.groupedPurchaseOrder.findMany({
    where: { organization_id: organizationId, ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}) },
    include: groupedPurchaseOrderInclude,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  return {
    groupedPurchaseOrders: await enrichPurchaseOrderTaxFields(organizationId, pageRows.map(serializePurchaseOrder)),
    nextCursor: hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

export async function getGroupedPurchaseOrder(organizationId: string, id: string) {
  const order = await prisma.groupedPurchaseOrder.findFirst({
    where: { id, organization_id: organizationId },
    include: groupedPurchaseOrderInclude,
  });
  if (!order) throw new Error("Grouped PO not found.");
  const [enriched] = await enrichPurchaseOrderTaxFields(organizationId, [serializePurchaseOrder(order)]);
  return enriched;
}

export async function deleteGroupedPurchaseOrder(organizationId: string, id: string, actorId: string) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.groupedPurchaseOrder.findFirst({
      where: { id, organization_id: organizationId },
      select: {
        id: true,
        grouped_po_no: true,
        display_no: true,
        source_type: true,
        status: true,
        total_grouped_qty: true,
        masterGroupSource: { select: { id: true } },
      },
    });
    if (!order) throw new Error("Grouped PO not found.");
    if (order.masterGroupSource) throw new Error("Delete the Master Group before deleting this Grouped PO.");
    if (![PRICE_APPROVAL_STATUS, APPROVED_STATUS].includes(order.status)) {
      throw new Error("Only pending or approved price-approval records can be deleted.");
    }

    let releasedStockBookingCount = 0;
    if (order.source_type === "STOCK") {
      const bookings = await transaction.rawMaterialStockBooking.findMany({
        where: { organization_id: organizationId, grouped_purchase_order_id: order.id, status: "BOOKED" },
        select: { id: true, take_from_stock_id: true, booked_quantity: true },
      });
      const bookedTotal = bookings.reduce((total, booking) => total.plus(booking.booked_quantity), new Prisma.Decimal(0));
      if (bookings.length === 0 || !order.total_grouped_qty || !bookedTotal.equals(order.total_grouped_qty)) {
        throw new Error("Stock reservations do not match this Grouped PO quantity. Resolve the reservation discrepancy before deleting it.");
      }

      const bookedByStockId = new Map<string, Prisma.Decimal>();
      for (const booking of bookings) {
        bookedByStockId.set(
          booking.take_from_stock_id,
          (bookedByStockId.get(booking.take_from_stock_id) ?? new Prisma.Decimal(0)).plus(booking.booked_quantity),
        );
      }

      for (const [stockId, quantity] of bookedByStockId) {
        const released = await transaction.rawMaterialStock.updateMany({
          where: { id: stockId, organization_id: organizationId, quantity_reserved: { gte: quantity } },
          data: { quantity_reserved: { decrement: quantity } },
        });
        if (released.count !== 1) {
          throw new Error("Unable to release the reserved stock quantity safely. Reload and try again.");
        }
      }

      const deletedBookings = await transaction.rawMaterialStockBooking.deleteMany({
        where: {
          organization_id: organizationId,
          id: { in: bookings.map((booking) => booking.id) },
          status: "BOOKED",
          grouped_purchase_order_id: order.id,
        },
      });
      if (deletedBookings.count !== bookings.length) {
        throw new Error("Stock reservations changed while deleting this Grouped PO. Reload and try again.");
      }
      releasedStockBookingCount = bookings.length;
    }

    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: order.source_type === "STOCK" ? "Inventory Management" : "Procurement",
      action: "DELETE",
      entityType: "GroupedPurchaseOrder",
      entityId: order.id,
      details: {
        grouped_po_no: order.display_no ? `GP-${order.display_no}` : order.grouped_po_no,
        source_type: order.source_type,
        previous_status: order.status,
        released_stock_booking_count: releasedStockBookingCount,
      },
    }, transaction);

    const deleted = await transaction.groupedPurchaseOrder.deleteMany({
      where: { id: order.id, organization_id: organizationId, status: order.status },
    });
    if (deleted.count !== 1) throw new Error("Grouped PO changed while it was being deleted. Reload and try again.");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
}

export async function updateGroupedPurchaseOrderPrices(
  organizationId: string,
  groupedPurchaseOrderId: string,
  prices: Array<{ lineId: string; vendorPrice: number | string }>,
) {
  if (prices.length === 0) throw new Error("At least one vendor price is required.");

  const order = await prisma.groupedPurchaseOrder.findFirst({
    where: { id: groupedPurchaseOrderId, organization_id: organizationId, status: { in: [PRICE_APPROVAL_STATUS, APPROVED_STATUS] } },
    include: { lines: true },
  });
  if (!order) throw new Error("Grouped PO is not pending price approval.");

  const priceByLineId = new Map(prices.map((price) => [price.lineId, price.vendorPrice]));
  for (const line of order.lines) {
    if (!priceByLineId.has(line.id)) throw new Error("Enter a price for every grouped-PO line.");
    const price = Number(priceByLineId.get(line.id));
    if (!Number.isFinite(price) || price < 0) throw new Error("Vendor prices must be zero or greater.");
  }

  return prisma.$transaction(async (transaction) => {
    for (const line of order.lines) {
      await transaction.groupedPurchaseOrderLine.update({
        where: { id: line.id },
        data: { vendor_price: Number(priceByLineId.get(line.id)) },
      });
    }
    return transaction.groupedPurchaseOrder.findUniqueOrThrow({ include: groupedPurchaseOrderInclude, where: { id: order.id } });
  }).then(serializePurchaseOrder);
}

export async function approveGroupedPurchaseOrder(organizationId: string, groupedPurchaseOrderId: string, reviewer: string) {
  const order = await prisma.groupedPurchaseOrder.findFirst({
    where: { id: groupedPurchaseOrderId, organization_id: organizationId, status: PRICE_APPROVAL_STATUS },
    include: { lines: true },
  });
  if (!order || order.lines.some((line) => line.vendor_price === null)) {
    throw new Error("Save a valid price for every line before approval.");
  }

  const updated = await prisma.groupedPurchaseOrder.update({
    where: { id: order.id },
    data: { status: APPROVED_STATUS, approved_by: reviewer, approved_at: new Date(), rejection_reason: null },
    include: groupedPurchaseOrderInclude,
  });
  return serializePurchaseOrder(updated);
}

export async function rejectGroupedPurchaseOrder(organizationId: string, groupedPurchaseOrderId: string, reason: string) {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("A rejection reason is required.");
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.groupedPurchaseOrder.findFirst({
      where: { id: groupedPurchaseOrderId, organization_id: organizationId, status: PRICE_APPROVAL_STATUS },
      select: { id: true, source_type: true },
    });
    if (!order) throw new Error("Grouped PO is not pending price approval.");

    if (order.source_type === "STOCK") {
      const bookings = await transaction.rawMaterialStockBooking.groupBy({
        by: ["take_from_stock_id"],
        where: { organization_id: organizationId, grouped_purchase_order_id: order.id, status: "BOOKED" },
        _sum: { booked_quantity: true },
      });
      if (bookings.length === 0) throw new Error("No active stock reservations are linked to this approval record.");

      for (const booking of bookings) {
        const quantity = booking._sum.booked_quantity ?? new Prisma.Decimal(0);
        const released = await transaction.rawMaterialStock.updateMany({
          where: { id: booking.take_from_stock_id, organization_id: organizationId, quantity_reserved: { gte: quantity } },
          data: { quantity_reserved: { decrement: quantity } },
        });
        if (released.count !== 1) throw new Error("Unable to release the reserved stock quantity safely.");
      }

      await transaction.rawMaterialStockBooking.updateMany({
        where: { organization_id: organizationId, grouped_purchase_order_id: order.id, status: "BOOKED" },
        data: { status: "REJECTED" },
      });
    }

    await transaction.groupedPurchaseOrder.update({
      where: { id: order.id, organization_id: organizationId },
      data: { status: REJECTED_STATUS, rejection_reason: cleanReason },
    });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const GROUPED_PURCHASE_ORDER_STATUSES = {
  PRICE_APPROVAL_STATUS,
  APPROVED_STATUS,
  REJECTED_STATUS,
} as const;
