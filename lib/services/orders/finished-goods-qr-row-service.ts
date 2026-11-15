import { prisma } from "@/lib/database/prisma-client";
import {
  MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS,
} from "./order-qr-print-request-contract";

export async function listFinishedGoodsQrRows(organizationId: string, orderIds: string[]) {
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId, id: { in: orderIds } },
    orderBy: [{ orderNo: "asc" }, { id: "asc" }],
    select: { id: true, orderNo: true, styleName: true },
  });
  if (orders.length !== orderIds.length) {
    return { success: false as const, reason: "ORDER_NOT_FOUND" as const };
  }

  const rows = await prisma.finishedGoodsSizeWise.findMany({
    where: { order_id: { in: orderIds } },
    orderBy: [{ order_id: "asc" }, { id: "asc" }],
    take: MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS + 1,
    select: {
      id: true,
      order_id: true,
      size: true,
      buyerSize: true,
      sku_code: true,
      barcode: true,
      totalQty: true,
    },
  });
  if (rows.length > MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS) {
    return { success: false as const, reason: "TOO_MANY_VARIANTS" as const };
  }

  const rowsByOrderId = new Map<string, typeof rows>();
  for (const row of rows) {
    const orderRows = rowsByOrderId.get(row.order_id) ?? [];
    orderRows.push(row);
    rowsByOrderId.set(row.order_id, orderRows);
  }
  return {
    success: true as const,
    orders: orders.map((order) => ({
      orderId: order.id,
      orderNo: order.orderNo,
      styleName: order.styleName,
      finishedGoodsRows: (rowsByOrderId.get(order.id) ?? []).map((row) => ({
        finishedGoodsId: row.id,
        size: row.size,
        buyerSize: row.buyerSize,
        skuCode: row.sku_code,
        barcode: row.barcode,
        totalQty: row.totalQty,
      })),
    })),
  };
}
