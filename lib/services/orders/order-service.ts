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
  ratioOrderQty?: number | string;
  orderQty?: number | string;
  deliveryDate?: string;
  finalStatus?: OrderStatus;
  processStatus?: string;
  rows?: OrderRow[];
  bomRows?: BomRow[];
};

export async function listOrders(organizationId: string) {
  return prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId },
    include: { finishedGoods: true, bomItems: true },
    orderBy: { created_at: "desc" },
  });
}

export async function getOrderById(id: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { id, organization_id: organizationId },
    include: { finishedGoods: true, bomItems: true },
  });
}

export async function getOrderByOrderNo(orderNo: string, organizationId: string) {
  return prisma.merchandisingOrder.findFirst({
    where: { orderNo, organization_id: organizationId },
    include: { finishedGoods: true, bomItems: true },
  });
}

export async function listBomItemsForOrganization(organizationId: string) {
  return (prisma as any).bomItem.findMany({
    where: {
      merchandisingOrder: {
        organization_id: organizationId,
      },
    },
    include: {
      merchandisingOrder: true,
    },
  });
}

export async function createOrder(organizationId: string, input: CreateOrderInput) {
  if (!organizationId) {
    throw new Error("Organization is required to create an order.");
  }

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;

  return prisma.merchandisingOrder.create({
    data: {
      organization: {
        connect: { id: organizationId },
      },
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
      haveSizeRatio: input.haveSizeRatio ?? false,
      ratioOrderQty: input.ratioOrderQty !== undefined && input.ratioOrderQty !== null ? Number(input.ratioOrderQty) : null,
      orderQty: input.orderQty !== undefined && input.orderQty !== null ? Number(input.orderQty) : null,
      deliveryDate: deliveryDate,
      finalStatus: input.finalStatus ?? "Draft",
      processStatus: input.processStatus ?? null,
    },
  });
}

export async function updateOrder(
  orderId: string,
  organizationId: string,
  input: Partial<CreateOrderInput>
) {
  const order = await getOrderById(orderId, organizationId);
  if (!order) {
    throw new Error("Order not found");
  }

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : undefined;

  return prisma.merchandisingOrder.update({
    where: { id: orderId },
    data: {
      ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
      ...(input.entityName !== undefined && { entityName: input.entityName ?? null }),
      ...(input.category !== undefined && { category: input.category ?? null }),
      ...(input.subCategory !== undefined && { subCategory: input.subCategory ?? null }),
      ...(input.season !== undefined && { season: input.season ?? null }),
      ...(input.article !== undefined && { article: input.article ?? null }),
      ...(input.styleName !== undefined && { styleName: input.styleName ?? null }),
      ...(input.colors !== undefined && { colors: input.colors ?? null }),
      ...(input.buyer !== undefined && { buyer: input.buyer ?? null }),
      ...(input.brand !== undefined && { brand: input.brand ?? null }),
      ...(input.sizeGroup !== undefined && { sizeGroup: input.sizeGroup ?? null }),
      ...(input.haveSizeRatio !== undefined && { haveSizeRatio: input.haveSizeRatio }),
      ...(input.ratioOrderQty !== undefined && {
        ratioOrderQty: input.ratioOrderQty !== null ? Number(input.ratioOrderQty) : null,
      }),
      ...(input.orderQty !== undefined && {
        orderQty: input.orderQty !== null ? Number(input.orderQty) : null,
      }),
      ...(deliveryDate !== undefined && { deliveryDate }),
      ...(input.finalStatus !== undefined && { finalStatus: input.finalStatus }),
      ...(input.processStatus !== undefined && { processStatus: input.processStatus ?? null }),
    },
  });
}

export async function updateBomItemsForOrder(
  orderId: string,
  organizationId: string,
  bomRows: BomRow[]
) {
  const order = await getOrderById(orderId, organizationId);
  if (!order) {
    throw new Error("Order not found");
  }

  await (prisma as any).bomItem.deleteMany({
    where: { merchandising_order_id: orderId },
  });

  if (bomRows && bomRows.length > 0) {
    await (prisma as any).bomItem.createMany({
      data: bomRows.map((row) => ({
        merchandising_order_id: orderId,
        categoryType: row.categoryType ?? null,
        category: row.category ?? null,
        subCategory: row.subCategory ?? null,
        rawMaterialName: row.rawMaterialName ?? null,
        size: row.size ?? null,
        consumption: row.consumption ? String(row.consumption) : null,
        requiredQty: row.requiredQty ? String(row.requiredQty) : null,
      })),
    });
  }
}

export async function updateFinishedGoodsForOrder(
  orderId: string,
  organizationId: string,
  rows: OrderRow[]
) {
  const order = await getOrderById(orderId, organizationId);
  if (!order) {
    throw new Error("Order not found");
  }

  await (prisma as any).finishedGood.deleteMany({
    where: { merchandising_order_id: orderId },
  });

  if (rows && rows.length > 0) {
    await (prisma as any).finishedGood.createMany({
      data: rows.map((row) => ({
        merchandising_order_id: orderId,
        buyerSize: row.buyerSize ?? null,
        size: row.size ?? null,
        beforeExcessQty: row.beforeExcessQty ? String(row.beforeExcessQty) : null,
        excess: row.excess ? String(row.excess) : null,
        excessQty: row.excessQty ? String(row.excessQty) : null,
        totalQty: row.totalQty ? String(row.totalQty) : null,
        buyerPoPrice: row.buyerPoPrice ? String(row.buyerPoPrice) : null,
        exchangePrice: row.exchangePrice ? String(row.exchangePrice) : null,
        priceInInr: row.priceInInr ? String(row.priceInInr) : null,
      })),
    });
  }
}

export async function getArticleOrderSummaries(organizationId: string) {
  return listOrders(organizationId);
}