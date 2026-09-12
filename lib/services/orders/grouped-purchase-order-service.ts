import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

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
    categoryType: line.category_type,
    internalPriceBom: decimalValue(line.internal_price_bom),
    otherChargesPerItem: decimalValue(line.other_charges_per_item),
    totalExtra: decimalValue(line.total_extra),
    totalSpend: decimalValue(line.total_spend),
    internalConsumption: decimalValue(line.internal_consumption),
    requiredQty: decimalValue(line.required_qty),
    groupedQty: decimalValue(line.grouped_qty),
    vendorPrice: decimalValue(line.vendor_price),
  };
}

function serializePurchaseOrder(order: {
  id: string;
  grouped_po_no: string;
  status: string;
  submitted_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  vendor: { id: string; vendor: string };
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
  other_charges: Prisma.Decimal | null;
  other_charges_inr: Prisma.Decimal | null;
  currency: string | null;
  exchange_price: Prisma.Decimal | null;
  lines: Array<Parameters<typeof serializeLine>[0]>;
}) {
  return {
    id: order.id,
    groupedPoNo: order.grouped_po_no,
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
    otherCharges: decimalValue(order.other_charges),
    otherChargesInr: decimalValue(order.other_charges_inr),
    currency: order.currency,
    exchangePrice: decimalValue(order.exchange_price),
    vendor: { id: order.vendor.id, name: order.vendor.vendor },
    lines: order.lines.map(serializeLine),
  };
}

const groupedPurchaseOrderInclude = {
  vendor: { select: { id: true, vendor: true } },
  lines: {
    orderBy: { created_at: "asc" as const },
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
      vendor_price: true,
    },
  },
} as const;

export async function listAllocatableBomRows(organizationId: string) {
  const rows = await prisma.billOfMaterialItem.findMany({
    where: {
      order: { organization_id: organizationId },
      groupedPurchaseOrderLines: { none: {} },
    },
    select: {
      id: true,
      order_id: true,
      orderQty: true,
      categoryType: true,
      category: true,
      subCategory: true,
      rawMaterialName: true,
      internalConsumption: true,
      internalPrice: true,
      requiredQty: true,
      totalRequiredQty: true,
      order: { select: { orderNo: true, styleName: true, brand: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 500,
  });

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    orderNo: row.order.orderNo,
    styleName: row.order.styleName,
    brand: row.order.brand,
    category: row.category,
    categoryType: row.categoryType,
    subCategory: row.subCategory,
    itemName: row.rawMaterialName,
    internalConsumption: decimalValue(row.internalConsumption),
    internalPriceBom: decimalValue(row.internalPrice),
    requiredQty: decimalValue(row.totalRequiredQty ?? row.requiredQty),
  }));
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
        internalConsumption: true,
        internalPrice: true,
        requiredQty: true,
        totalRequiredQty: true,
        order: { select: { orderNo: true, styleName: true, brand: true } },
        groupedPurchaseOrderLines: { select: { id: true } },
      },
    });

    if (bomItems.length !== uniqueLines.size) {
      throw new Error("One or more selected raw-material rows are no longer available.");
    }

    const allocated = bomItems.find((item) => item.groupedPurchaseOrderLines.length > 0);
    if (allocated) throw new Error(`Raw-material row ${allocated.id} has already been allocated.`);

    const lines = bomItems.map((item) => {
      const requiredQty = positiveNumber(item.totalRequiredQty ?? item.requiredQty, "Required Qty");
      const groupedQty = positiveNumber(uniqueLines.get(item.id)?.groupedQty, "Grouped Qty");
      if (groupedQty > requiredQty) {
        throw new Error(`Grouped Qty cannot exceed Required Qty for ${item.order.orderNo}.`);
      }
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
        internal_consumption: item.internalConsumption,
        internal_price_bom: item.internalPrice,
        required_qty: new Prisma.Decimal(requiredQty),
        grouped_qty: new Prisma.Decimal(groupedQty),
      };
    });

    const totalRequiredQty = lines.reduce((total, line) => total + Number(line.required_qty), 0);
    const totalGroupedQty = lines.reduce((total, line) => total + Number(line.grouped_qty), 0);
    const rawMaterials = [...new Set(lines.map((line) => line.item_name).filter(Boolean))];
    const categories = [...new Set(lines.map((line) => line.category).filter(Boolean))];
    const subCategories = [...new Set(lines.map((line) => line.sub_category).filter(Boolean))];
    const brands = [...new Set(lines.map((line) => line.brand).filter(Boolean))];

    const order = await transaction.groupedPurchaseOrder.create({
      data: {
        organization_id: input.organizationId,
        vendor_id: vendor.id,
        grouped_po_no: `GPO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: PRICE_APPROVAL_STATUS,
        submitted_by: input.submittedBy ?? null,
        raw_material: rawMaterials.join(", ") || null,
        category: categories.join(", ") || null,
        sub_category: subCategories.join(", ") || null,
        brand: brands.join(", ") || null,
        total_required_qty: totalRequiredQty,
        total_grouped_qty: totalGroupedQty,
        no_of_styles: new Set(lines.map((line) => line.style_name).filter(Boolean)).size,
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
  return orders.map(serializePurchaseOrder);
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
  const updated = await prisma.groupedPurchaseOrder.updateMany({
    where: { id: groupedPurchaseOrderId, organization_id: organizationId, status: PRICE_APPROVAL_STATUS },
    data: { status: REJECTED_STATUS, rejection_reason: cleanReason },
  });
  if (updated.count === 0) throw new Error("Grouped PO is not pending price approval.");
  return { ok: true };
}

export const GROUPED_PURCHASE_ORDER_STATUSES = {
  PRICE_APPROVAL_STATUS,
  APPROVED_STATUS,
  REJECTED_STATUS,
} as const;
