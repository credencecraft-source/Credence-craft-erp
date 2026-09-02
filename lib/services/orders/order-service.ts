import { prisma } from "@/lib/database/prisma-client";

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

export type BomRow = {
  categoryType?: string;
  category?: string;
  subCategory?: string;
  rawMaterialName?: string;
  size?: string;
  consumption?: number | string;
  requiredQty?: number | string;
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
  bomRows?: BomRow[];
};

export async function listOrders(organizationId: string) {
  return prisma.merchandisingOrder.findMany({
    where: { organizationId },
    include: { finishedGoods: true, bomItems: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrderById(id: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { id, organizationId },
    include: { finishedGoods: true, bomItems: true },
  });
}

export async function getOrderByOrderNo(orderNo: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { orderNo, organizationId },
    include: { finishedGoods: true, bomItems: true },
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
      bomItems: {
        create: (input.bomRows ?? []).map((row) => ({
          categoryType: row.categoryType ?? null,
          category: row.category ?? null,
          subCategory: row.subCategory ?? null,
          rawMaterialName: row.rawMaterialName ?? null,
          size: row.size ?? null,
          consumption: row.consumption !== undefined && row.consumption !== "" ? Number(row.consumption) : null,
          requiredQty: row.requiredQty !== undefined && row.requiredQty !== "" ? Number(row.requiredQty) : null,
        })),
      },
    },
    include: { finishedGoods: true, bomItems: true },
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
    include: { finishedGoods: true, bomItems: true },
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

export async function updateBomItemsForOrder(orderId: string, organizationId: string, rows: BomRow[]) {
  const order = await prisma.merchandisingOrder.findFirst({ where: { id: orderId, organizationId }, select: { id: true } });
  if (!order) {
    throw new Error("Order not found for this organization.");
  }

  await prisma.billOfMaterialItem.deleteMany({ where: { orderId } });

  return prisma.billOfMaterialItem.createMany({
    data: rows.map((row) => ({
      orderId,
      categoryType: row.categoryType ?? null,
      category: row.category ?? null,
      subCategory: row.subCategory ?? null,
      rawMaterialName: row.rawMaterialName ?? null,
      size: row.size ?? null,
      consumption: row.consumption !== undefined && row.consumption !== "" ? Number(row.consumption) : null,
      requiredQty: row.requiredQty !== undefined && row.requiredQty !== "" ? Number(row.requiredQty) : null,
    })),
  });
}

export async function listBomItemsForOrganization(organizationId: string) {
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organizationId },
    select: { id: true, orderNo: true, styleName: true, brand: true, buyer: true, bomItems: true },
    orderBy: { createdAt: "desc" },
  });

  return orders.flatMap((order) =>
    order.bomItems.map((item) => ({
      id: item.id,
      orderId: order.id,
      orderNo: order.orderNo,
      styleName: order.styleName,
      brand: order.brand,
      buyer: order.buyer,
      categoryType: item.categoryType,
      category: item.category,
      subCategory: item.subCategory,
      rawMaterialName: item.rawMaterialName,
      size: item.size,
      consumption: item.consumption,
      requiredQty: item.requiredQty,
    })),
  );
}
