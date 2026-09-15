import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";

export type WorkOrderQuantityInput = {
  sourceFinishedGoodsId?: string;
  quantity?: number | string;
};

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function listOrdersByArticle(organizationId: string, article: string) {
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId, article: { equals: article.trim(), mode: "insensitive" } },
    select: { id: true, orderNo: true, article: true, styleName: true, orderQty: true },
    orderBy: [{ created_at: "desc" }, { orderNo: "asc" }],
    take: 100,
  });

  return orders;
}

export async function getWorkOrderAllocation(organizationId: string, orderNo: string) {
  const order = await prisma.merchandisingOrder.findFirst({
    where: { organization_id: organizationId, orderNo: orderNo.trim() },
    include: {
      finishedGoods: true,
      workOrders: { include: { sizeLines: true }, orderBy: { created_at: "desc" } },
    },
  });

  if (!order) return null;

  const allocated = new Map<string, number>();
  for (const workOrder of order.workOrders) {
    for (const line of workOrder.sizeLines) {
      allocated.set(line.source_finished_goods_id, (allocated.get(line.source_finished_goods_id) ?? 0) + line.quantity);
    }
  }

  return {
    order: { id: order.id, orderNo: order.orderNo, styleName: order.styleName, buyer: order.buyer, brand: order.brand, orderQty: order.orderQty },
    sizes: order.finishedGoods.map((row) => ({ id: row.id, size: row.size, buyerSize: row.buyerSize, orderedQty: row.totalQty ?? 0, allocatedQty: allocated.get(row.id) ?? 0, remainingQty: Math.max((row.totalQty ?? 0) - (allocated.get(row.id) ?? 0), 0) })),
    workOrders: order.workOrders.map((workOrder) => ({ id: workOrder.id, workOrderNo: workOrder.work_order_no, totalQty: workOrder.total_qty, status: workOrder.status, createdAt: workOrder.created_at, sizeLines: workOrder.sizeLines })),
  };
}

export async function createWorkOrder(organizationId: string, orderNo: string, lines: WorkOrderQuantityInput[]) {
  const normalizedLines = lines
    .map((line) => ({ sourceFinishedGoodsId: String(line.sourceFinishedGoodsId ?? ""), quantity: positiveInteger(line.quantity) }))
    .filter((line) => line.sourceFinishedGoodsId && line.quantity > 0);

  if (normalizedLines.length === 0) throw new Error("Enter a quantity for at least one size.");

  const duplicateIds = new Set<string>();
  for (const line of normalizedLines) {
    if (duplicateIds.has(line.sourceFinishedGoodsId)) throw new Error("Each size can only appear once in a work order.");
    duplicateIds.add(line.sourceFinishedGoodsId);
  }

  return prisma.$transaction(async (transaction) => {
    const order = await transaction.merchandisingOrder.findFirst({ where: { organization_id: organizationId, orderNo: orderNo.trim() }, include: { finishedGoods: true, workOrders: { include: { sizeLines: true } } } });
    if (!order) throw new Error("Order number was not found in this organization.");
    if (order.finishedGoods.length === 0) throw new Error("This order has no size-wise quantities configured.");

    const sourceRows = new Map(order.finishedGoods.map((row) => [row.id, row]));
    const allocated = new Map<string, number>();
    for (const workOrder of order.workOrders) {
      for (const line of workOrder.sizeLines) allocated.set(line.source_finished_goods_id, (allocated.get(line.source_finished_goods_id) ?? 0) + line.quantity);
    }

    const totalQty = normalizedLines.reduce((total, line) => {
      const sourceRow = sourceRows.get(line.sourceFinishedGoodsId);
      const alreadyAllocated = allocated.get(line.sourceFinishedGoodsId) ?? 0;
      if (!sourceRow) throw new Error("One or more selected sizes do not belong to this order.");
      if (line.quantity > Math.max((sourceRow.totalQty ?? 0) - alreadyAllocated, 0)) throw new Error(`The quantity for size ${sourceRow.size || sourceRow.buyerSize || "selected"} exceeds the remaining order quantity.`);
      return total + line.quantity;
    }, 0);

    return transaction.factoryWorkOrder.create({
      data: {
        organization_id: organizationId,
        order_id: order.id,
        order_no: order.orderNo,
        work_order_no: `WO-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
        total_qty: totalQty,
        sizeLines: { create: normalizedLines.map((line) => { const sourceRow = sourceRows.get(line.sourceFinishedGoodsId)!; return { source_finished_goods_id: sourceRow.id, size: sourceRow.size, buyer_size: sourceRow.buyerSize, quantity: line.quantity }; }) },
      },
      include: { sizeLines: true },
    });
  }, { isolationLevel: "Serializable" });
}

export async function listWorkOrders(organizationId: string) {
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: { organization_id: organizationId },
    include: { order: { select: { orderNo: true, article: true, styleName: true } }, sizeLines: true },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
    take: 100,
  });

  return workOrders.map((workOrder) => ({
    id: workOrder.id,
    workOrderNo: workOrder.work_order_no,
    orderNo: workOrder.order.orderNo,
    article: workOrder.order.article,
    styleName: workOrder.order.styleName,
    totalQty: workOrder.total_qty,
    status: workOrder.status,
    createdAt: workOrder.created_at,
    sizeLines: workOrder.sizeLines.map((line) => ({ size: line.size || line.buyer_size || "Unspecified", quantity: line.quantity })),
  }));
}