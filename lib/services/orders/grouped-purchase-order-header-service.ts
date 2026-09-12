import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { listGroupedPurchaseOrders } from "./grouped-purchase-order-service";

export type GroupedPurchaseOrderHeaderInput = {
  note?: string | null;
  vendorPriceInr?: number | string | null;
  vendorPrice?: number | string | null;
  otherChargesInr?: number | string | null;
  convertValue?: number | string | null;
  roundOf?: boolean;
  moqStockUom?: number | string | null;
  buyingUom?: string | null;
};

const pendingStatus = "PENDING_PRICE_APPROVAL";
const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function updateGroupedPurchaseOrderHeader(
  organizationId: string,
  groupedPurchaseOrderId: string,
  input: GroupedPurchaseOrderHeaderInput,
) {
  const order = await prisma.groupedPurchaseOrder.findFirst({
    where: { id: groupedPurchaseOrderId, organization_id: organizationId, status: { in: [pendingStatus, "PRICE_APPROVED"] } },
    include: { lines: true },
  });
  if (!order) throw new Error("Grouped PO is not pending price approval.");

  const vendorPriceInr = input.vendorPriceInr === null || input.vendorPriceInr === undefined ? null : numberValue(input.vendorPriceInr);
  const otherChargesInr = numberValue(input.otherChargesInr, numberValue(order.other_charges_inr));
  const convertValue = numberValue(input.convertValue, numberValue(order.convert_value));
  const moqStockUom = numberValue(input.moqStockUom, numberValue(order.moq_stock_uom));
  const roundOf = input.roundOf ?? order.round_of;
  if (vendorPriceInr !== null && vendorPriceInr < 0) throw new Error("Vendor price must be zero or greater.");
  if (otherChargesInr < 0 || convertValue < 0 || moqStockUom < 0) throw new Error("Costing values must be zero or greater.");

  const totalGroupedQty = numberValue(order.total_grouped_qty, order.lines.reduce((total, line) => total + Number(line.grouped_qty), 0));
  const buyingQty = convertValue > 0 ? totalGroupedQty / convertValue : 0;
  const buyingQtyRound = roundOf ? Math.ceil(buyingQty) : buyingQty;
  const differenceRound = buyingQtyRound - buyingQty;
  const moqBuying = convertValue > 0 ? moqStockUom / convertValue : 0;
  const extraBuyingUom = moqBuying + differenceRound;
  const buyingQtyTotal = buyingQty + extraBuyingUom;
  const groupCount = order.lines.length || 1;
  const totalExtra = extraBuyingUom * convertValue / groupCount;
  const otherChargesPerItem = otherChargesInr / groupCount;

  const updated = await prisma.$transaction(async (transaction) => {
    for (const line of order.lines) {
      const linePrice = vendorPriceInr ?? Number(line.vendor_price ?? 0);
      await transaction.groupedPurchaseOrderLine.update({
        where: { id: line.id },
        data: {
          ...(vendorPriceInr !== null && { vendor_price: vendorPriceInr }),
          other_charges_per_item: otherChargesPerItem,
          total_extra: totalExtra,
          total_spend: Number(line.grouped_qty) * linePrice,
        },
      });
    }

    return transaction.groupedPurchaseOrder.update({
      where: { id: order.id },
      data: {
        ...(input.note !== undefined && { note: input.note?.trim() || null }),
        ...(input.buyingUom !== undefined && { buying_uom: input.buyingUom || null }),
        ...(vendorPriceInr !== null && { vendor_price_inr: vendorPriceInr, vendor_price: input.vendorPrice ?? vendorPriceInr }),
        other_charges_inr: otherChargesInr,
        convert_value: convertValue,
        round_of: roundOf,
        moq_stock_uom: moqStockUom,
        buying_qty: buyingQty,
        buying_qty_round: buyingQtyRound,
        difference_round: differenceRound,
        moq_buying: moqBuying,
        extra_buying_uom: extraBuyingUom,
        buying_qty_total: buyingQtyTotal,
      },
      include: {
        vendor: { select: { id: true, vendor: true } },
        lines: { orderBy: { created_at: "asc" }, select: { id: true, source_bom_item_id: true, order_no: true, style_name: true, brand: true, category: true, sub_category: true, item_name: true, category_type: true, internal_price_bom: true, other_charges_per_item: true, total_extra: true, total_spend: true, internal_consumption: true, required_qty: true, grouped_qty: true, vendor_price: true } },
      },
    });
  });

  return listGroupedPurchaseOrders(organizationId, [pendingStatus, "PRICE_APPROVED"]).then((orders) => orders.find((item) => item.id === updated.id) ?? updated);
}
