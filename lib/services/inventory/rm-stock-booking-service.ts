import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireSameOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type StockBookingLineInput = {
  bomItemId: string;
  takeFromStockId: string;
  bookedQuantity: number | string;
};

function positiveQuantity(value: unknown) {
  let quantity: Prisma.Decimal;
  try {
    quantity = new Prisma.Decimal(String(value));
  } catch {
    throw new Error("Booked quantity must be a valid positive number.");
  }
  if (!quantity.isFinite() || !quantity.gt(0)) {
    throw new Error("Booked quantity must be greater than zero.");
  }
  return quantity;
}

export async function listRawMaterialStockBookings(organizationId: string) {
  const rows = await prisma.rawMaterialStockBooking.findMany({
    where: { organization_id: organizationId },
    include: {
      takeFromStock: {
        select: {
          raw_material: true,
          location: {
            select: {
              location_name: true,
              entity: { select: { entity_name: true } },
            },
          },
        },
      },
      currentStoreVendor: { select: { vendor: true } },
      sourceBomItem: {
        select: {
          order: { select: { orderNo: true, styleName: true } },
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    takeFromStockId: row.take_from_stock_id,
    currentStoreVendor: row.currentStoreVendor.vendor,
    rawMaterial: row.takeFromStock.raw_material,
    location: row.takeFromStock.location.location_name,
    entity: row.takeFromStock.location.entity.entity_name,
    orderNo: row.sourceBomItem.order.orderNo,
    styleName: row.sourceBomItem.order.styleName,
    bookedQuantity: Number(row.booked_quantity),
    fulfilledQuantity: Number(row.fulfilled_quantity),
    status: row.status,
    bookedBy: row.booked_by,
    bookedAt: row.created_at,
  }));
}

export async function createRawMaterialStockBookings(input: {
  organizationId: string;
  bookedBy: string;
  currentStoreVendorId: string;
  lines: StockBookingLineInput[];
}) {
  const uniqueLines = new Map(input.lines.map((line) => [line.bomItemId, line]));
  if (uniqueLines.size === 0) throw new Error("Select at least one raw-material row.");
  if (uniqueLines.size !== input.lines.length) throw new Error("A BOM row cannot be booked more than once in one submission.");
  if ([...uniqueLines.keys()].some((id) => !id.trim()) || [...uniqueLines.values()].some((line) => !line.takeFromStockId.trim())) {
    throw new Error("Select a BOM row and stock source for every booking.");
  }

  const quantities = new Map([...uniqueLines].map(([id, line]) => [id, positiveQuantity(line.bookedQuantity)]));

  return prisma.$transaction(async (transaction) => {
    const currentStoreVendor = await transaction.masterVendor.findFirst({
      where: {
        id: input.currentStoreVendorId,
        organization_id: input.organizationId,
        is_current_store: true,
        is_active: true,
      },
      select: { id: true },
    });
    if (!currentStoreVendor) throw new Error("Select an active Vendor Master record marked as the current store.");

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
            entity: { select: { is_active: true } },
          },
        },
      },
    });
    if (bomItems.length !== uniqueLines.size) throw new Error("One or more BOM rows are no longer available in this organization.");

    const entityId = requireSameOrganizationEntity(
      bomItems.map((item) => item.order.entity_id),
      "Select BOM rows from one active Entity.",
    );
    if (bomItems.some((item) => !item.order.entity?.is_active)) throw new Error("Select BOM rows from one active Entity.");

    const firstItem = bomItems[0];
    const groupingKey = (item: typeof firstItem) => [item.rawMaterialName, item.category, item.subCategory, item.stockUom]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("|");
    if (bomItems.some((item) => groupingKey(item) !== groupingKey(firstItem))) {
      throw new Error("Select BOM rows for one raw material, category, subcategory, and stock UOM per stock booking.");
    }

    const itemIds = [...uniqueLines.keys()];
    const [priorBookings, fulfilledBookings, priorGroupedLines] = await Promise.all([
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
    const bookedByBomId = new Map(priorBookings.map((row) => [row.source_bom_item_id, row._sum.booked_quantity ?? new Prisma.Decimal(0)]));
    const fulfilledByBomId = new Map(fulfilledBookings.map((row) => [row.source_bom_item_id, row._sum.fulfilled_quantity ?? new Prisma.Decimal(0)]));
    const groupedByBomId = new Map(priorGroupedLines.map((row) => [row.source_bom_item_id, row._sum.grouped_qty ?? new Prisma.Decimal(0)]));

    const stockIds = [...new Set([...uniqueLines.values()].map((line) => line.takeFromStockId))];
    const stockRows = await transaction.rawMaterialStock.findMany({
      where: { id: { in: stockIds }, organization_id: input.organizationId, entity_id: entityId },
      select: { id: true, raw_material: true, quantity_on_hand: true, quantity_reserved: true },
    });
    const stockById = new Map(stockRows.map((stock) => [stock.id, stock]));
    if (stockById.size !== stockIds.length) throw new Error("One or more stock sources are not available in this organization and Entity.");

    const stockQuantities = new Map<string, Prisma.Decimal>();
    const createdRows = bomItems.map((item) => {
      const stockId = uniqueLines.get(item.id)!.takeFromStockId;
      const stock = stockById.get(stockId)!;
      if (stock.raw_material.trim().toLowerCase() !== String(item.rawMaterialName ?? "").trim().toLowerCase()) {
        throw new Error(`Selected stock does not match ${item.rawMaterialName ?? "the BOM raw material"}.`);
      }

      const required = new Prisma.Decimal(item.totalRequiredQty ?? item.requiredQty ?? 0);
      const remaining = required
        .minus(bookedByBomId.get(item.id) ?? 0)
        .minus(fulfilledByBomId.get(item.id) ?? 0)
        .minus(groupedByBomId.get(item.id) ?? 0);
      const quantity = quantities.get(item.id)!;
      if (quantity.gt(remaining)) throw new Error(`Booked quantity exceeds the remaining requirement for ${item.order.orderNo}.`);

      stockQuantities.set(stockId, (stockQuantities.get(stockId) ?? new Prisma.Decimal(0)).plus(quantity));
      return {
        organization_id: input.organizationId,
        take_from_stock_id: stockId,
        current_store_vendor_id: currentStoreVendor.id,
        source_bom_item_id: item.id,
        booked_quantity: quantity,
        status: "BOOKED",
        booked_by: input.bookedBy,
      };
    });

    for (const [stockId, quantity] of stockQuantities) {
      const stock = stockById.get(stockId)!;
      const available = stock.quantity_on_hand.minus(stock.quantity_reserved);
      if (quantity.gt(available)) throw new Error(`Booked quantity exceeds available stock for ${stock.raw_material}.`);

      await transaction.rawMaterialStock.update({
        where: { id: stockId, organization_id: input.organizationId },
        data: { quantity_reserved: { increment: quantity } },
      });
    }

    const groupedLines = bomItems.map((item) => {
      const required = new Prisma.Decimal(item.totalRequiredQty ?? item.requiredQty ?? 0);
      const remaining = required
        .minus(bookedByBomId.get(item.id) ?? 0)
        .minus(fulfilledByBomId.get(item.id) ?? 0)
        .minus(groupedByBomId.get(item.id) ?? 0);
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
        stock_uom: item.stockUom,
        internal_consumption: item.internalConsumption,
        internal_price_bom: item.internalPrice,
        required_qty: remaining,
        grouped_qty: quantities.get(item.id)!,
      };
    });
    const displayNumber = await reserveProcurementDocumentNumber(input.organizationId, "GROUPED_PO", transaction);
    const displayNo = Number(displayNumber.replace("GP-", ""));
    const totalRequiredQty = groupedLines.reduce((total, line) => total.plus(line.required_qty), new Prisma.Decimal(0));
    const totalGroupedQty = groupedLines.reduce((total, line) => total.plus(line.grouped_qty), new Prisma.Decimal(0));
    const groupedPurchaseOrder = await transaction.groupedPurchaseOrder.create({
      data: {
        organization_id: input.organizationId,
        entity_id: entityId,
        source_type: "STOCK",
        vendor_id: currentStoreVendor.id,
        grouped_po_no: `GPO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        status: "PENDING_PRICE_APPROVAL",
        submitted_by: input.bookedBy,
        raw_material: firstItem.rawMaterialName,
        category_type: firstItem.categoryType,
        category: firstItem.category,
        sub_category: firstItem.subCategory,
        brand: [...new Set(groupedLines.map((line) => line.brand).filter(Boolean))].join(", ") || null,
        total_required_qty: totalRequiredQty,
        total_grouped_qty: totalGroupedQty,
        no_of_styles: new Set(groupedLines.map((line) => line.style_name).filter(Boolean)).size,
        stock_uom: firstItem.stockUom,
        lines: { create: groupedLines },
      },
      select: { id: true },
    });

    const result = await transaction.rawMaterialStockBooking.createMany({
      data: createdRows.map((row) => ({ ...row, grouped_purchase_order_id: groupedPurchaseOrder.id })),
    });
    return { bookedLines: result.count, groupedPurchaseOrderId: groupedPurchaseOrder.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}