import { prisma } from "@/lib/prisma";

export type OrderStatus =
  | "Draft"
  | "Work Order"
  | "Shipped"
  | "Closed"
  | "Waiting For Approval"
  | "Approved";

export type OrderRow = {
  buyerSize?: string;
  size?: string;
  beforeExcessQty?: number | string;
  excess?: number | string;
  excessQty?: number | string;
  totalQty?: number | string;
  buyerPoPrice?: number | string;
  exchangePrice?: number | string;
  priceInInr?: number | string;
};

export type CreateOrderInput = {
  orderNo: string;
  entityName?: string;
  category?: string;
  subCategory?: string;
  season?: string;
  article?: string;
  styleName?: string;
  colors?: string;
  buyer?: string;
  brand?: string;
  sizeGroup?: string;
  haveSizeRatio?: boolean;
  ratioOrderQty?: number;
  orderQty?: number;
  deliveryDate?: string;
  finalStatus?: OrderStatus;
  processStatus?: string;
  rows?: OrderRow[];
};

export async function listOrders(organizationId: string) {
  return prisma.merchandisingOrder.findMany({
    where: { organizationId },
    include: { finishedGoods: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(id: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { id, organizationId },
    include: { finishedGoods: true },
  });
}

export async function getOrderByOrderNo(orderNo: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { orderNo, organizationId },
    include: { finishedGoods: true },
  });
}

export async function createOrder(organizationId: string, input: CreateOrderInput) {
  if (!organizationId) {
    throw new Error("Organization is required to create an order.");
  }

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;

  return prisma.merchandisingOrder.create({
    data: {
      organizationId,
      orderNo: input.orderNo,
      entityName: input.entityName ?? null,
      category: input.category ?? null,
      subCategory: input.subCategory ?? null,
      season: input.season ?? null,
      article: input.article ?? null,
      styleName: input.styleName ?? null,
      colors: input.colors ?? null,
      buyer: input.buyer ?? null,
      brand: input.brand ?? null,
      sizeGroup: input.sizeGroup ?? null,
      haveSizeRatio: input.haveSizeRatio ?? null,
      ratioOrderQty: input.ratioOrderQty ?? null,
      orderQty: input.orderQty ?? null,
      deliveryDate,
      finalStatus: input.finalStatus ?? "Draft",
      processStatus: input.processStatus ?? null,
      finishedGoods: {
        create: (input.rows ?? []).map((row) => ({
          buyerSize: row.buyerSize ?? null,
          size: row.size ?? null,
          beforeExcessQty: row.beforeExcessQty !== undefined && row.beforeExcessQty !== "" ? Number(row.beforeExcessQty) : null,
          excess: row.excess !== undefined && row.excess !== "" ? Number(row.excess) : null,
          excessQty: row.excessQty !== undefined && row.excessQty !== "" ? Number(row.excessQty) : null,
          totalQty: row.totalQty !== undefined && row.totalQty !== "" ? Number(row.totalQty) : null,
          buyerPoPrice: row.buyerPoPrice !== undefined && row.buyerPoPrice !== "" ? Number(row.buyerPoPrice) : null,
          exchangePrice: row.exchangePrice !== undefined && row.exchangePrice !== "" ? Number(row.exchangePrice) : null,
          priceInInr: row.priceInInr !== undefined && row.priceInInr !== "" ? Number(row.priceInInr) : null,
        })),
      },
    },
    include: { finishedGoods: true },
  });
}

export async function updateOrder(id: string, organizationId: string, input: Partial<CreateOrderInput>) {
  const existing = await prisma.merchandisingOrder.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) {
    throw new Error("Order not found for this organization.");
  }

  return prisma.merchandisingOrder.update({
    where: { id: existing.id },
    data: {
      entityName: input.entityName ?? undefined,
      category: input.category ?? undefined,
      subCategory: input.subCategory ?? undefined,
      season: input.season ?? undefined,
      article: input.article ?? undefined,
      styleName: input.styleName ?? undefined,
      colors: input.colors ?? undefined,
      buyer: input.buyer ?? undefined,
      brand: input.brand ?? undefined,
      sizeGroup: input.sizeGroup ?? undefined,
      haveSizeRatio: input.haveSizeRatio ?? undefined,
      ratioOrderQty: input.ratioOrderQty ?? undefined,
      orderQty: input.orderQty ?? undefined,
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
      finalStatus: input.finalStatus ?? undefined,
      processStatus: input.processStatus ?? undefined,
    },
    include: { finishedGoods: true },
  });
}

export async function updateFinishedGoodsForOrder(orderId: string, organizationId: string, rows: OrderRow[]) {
  const order = await prisma.merchandisingOrder.findFirst({ where: { id: orderId, organizationId }, select: { id: true } });
  if (!order) {
    throw new Error("Order not found for this organization.");
  }

  await prisma.finishedGoodsSizeWise.deleteMany({ where: { orderId } });

  return prisma.finishedGoodsSizeWise.createMany({
    data: rows.map((row) => ({
      orderId,
      buyerSize: row.buyerSize ?? null,
      size: row.size ?? null,
      beforeExcessQty: row.beforeExcessQty !== undefined && row.beforeExcessQty !== "" ? Number(row.beforeExcessQty) : null,
      excess: row.excess !== undefined && row.excess !== "" ? Number(row.excess) : null,
      excessQty: row.excessQty !== undefined && row.excessQty !== "" ? Number(row.excessQty) : null,
      totalQty: row.totalQty !== undefined && row.totalQty !== "" ? Number(row.totalQty) : null,
      buyerPoPrice: row.buyerPoPrice !== undefined && row.buyerPoPrice !== "" ? Number(row.buyerPoPrice) : null,
      exchangePrice: row.exchangePrice !== undefined && row.exchangePrice !== "" ? Number(row.exchangePrice) : null,
      priceInInr: row.priceInInr !== undefined && row.priceInInr !== "" ? Number(row.priceInInr) : null,
    })),
  });
}
