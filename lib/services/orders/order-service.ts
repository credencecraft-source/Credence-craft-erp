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
  const db = prisma as any;
  const bomItemClient = db.bomItem || db.bom_item;
  return bomItemClient.findMany({
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
  const ratioQty = input.ratioOrderQty !== undefined && input.ratioOrderQty !== null && input.ratioOrderQty !== "" ? Number(input.ratioOrderQty) : null;
  const ordQty = input.orderQty !== undefined && input.orderQty !== null && input.orderQty !== "" ? Number(input.orderQty) : null;

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
      ratioOrderQty: ratioQty !== null && !isNaN(ratioQty) ? ratioQty : null,
      orderQty: ordQty !== null && !isNaN(ordQty) ? ordQty : null,
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
  const ratioQty = input.ratioOrderQty !== undefined && input.ratioOrderQty !== null && input.ratioOrderQty !== "" ? Number(input.ratioOrderQty) : undefined;
  const ordQty = input.orderQty !== undefined && input.orderQty !== null && input.orderQty !== "" ? Number(input.orderQty) : undefined;

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
      ...(ratioQty !== undefined && {
        ratioOrderQty: !isNaN(ratioQty) ? ratioQty : null,
      }),
      ...(ordQty !== undefined && {
        orderQty: !isNaN(ordQty) ? ordQty : null,
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

  const db = prisma as any;
  const bomItemClient = db.bomItem || db.bom_item;

  await bomItemClient.deleteMany({
    where: { merchandising_order_id: orderId },
  });

  if (bomRows && bomRows.length > 0) {
    await bomItemClient.createMany({
      data: bomRows.map((row) => {
        const consumptionVal = row.consumption !== undefined && row.consumption !== null && row.consumption !== "" ? Number(row.consumption) : null;
        const requiredVal = row.requiredQty !== undefined && row.requiredQty !== null && row.requiredQty !== "" ? Number(row.requiredQty) : null;
        return {
          merchandising_order_id: orderId,
          categoryType: row.categoryType ?? null,
          category: row.category ?? null,
          subCategory: row.subCategory ?? null,
          rawMaterialName: row.rawMaterialName ?? null,
          size: row.size ?? null,
          consumption: consumptionVal !== null && !isNaN(consumptionVal) ? consumptionVal : null,
          requiredQty: requiredVal !== null && !isNaN(requiredVal) ? requiredVal : null,
        };
      }),
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

  const db = prisma as any;
  const finishedGoodClient = db.finishedGood || db.finished_good;

  await finishedGoodClient.deleteMany({
    where: { merchandising_order_id: orderId },
  });

  if (rows && rows.length > 0) {
    await finishedGoodClient.createMany({
      data: rows.map((row) => {
        const parseNum = (val: any) => {
          if (val === undefined || val === null || val === "") return null;
          const num = Number(val);
          return isNaN(num) ? null : num;
        };
        return {
          merchandising_order_id: orderId,
          buyerSize: row.buyerSize ?? null,
          size: row.size ?? null,
          beforeExcessQty: parseNum(row.beforeExcessQty),
          excess: parseNum(row.excess),
          excessQty: parseNum(row.excessQty),
          totalQty: parseNum(row.totalQty),
          buyerPoPrice: parseNum(row.buyerPoPrice),
          exchangePrice: parseNum(row.exchangePrice),
          priceInInr: parseNum(row.priceInInr),
        };
      }),
    });
  }
}