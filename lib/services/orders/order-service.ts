import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { calculateBomRows, calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";

export type OrderStatus =
  | "Draft"
  | "Work Order"
  | "Shipped"
  | "Closed"
  | "Waiting For Approval"
  | "Approved";

export type OrderRow = {
  buyerSize?: string | null;
  size?: string | null;
  beforeExcessQty?: number | string | null;
  excess?: number | string | null;
  excessQty?: number | string | null;
  totalQty?: number | string | null;
  buyerPoPrice?: number | string | null;
  exchangePrice?: number | string | null;
  priceInInr?: number | string | null;
};

export type BomRow = {
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  size?: string | null;
  orderQty?: number | string;
  buyerConsumption?: number | string | null;
  buyerPrice?: number | string | null;
  internalConsumption?: number | string | null;
  internalPrice?: number | string | null;
  valuePerGarmentRm?: number | string | null;
  consumption?: number | string;
  requiredQty?: number | string;
  itemWiseExcessPercentage?: number | string;
  itemWiseExcessQty?: number | string;
  totalRequiredQty?: number | string;
};

export type CreateOrderInput = {
  orderNo?: string;
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

export type OrderPageCursor = {
  createdAt: string;
  id: string;
};

function decodeOrderCursor(cursor?: string): OrderPageCursor | null {
  if (!cursor) return null;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as OrderPageCursor;
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function encodeOrderCursor(cursor: OrderPageCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export async function listOrders(organizationId: string, limit = 100) {
  const page = await listOrdersPage(organizationId, { limit });
  return page.orders;
}

export async function listOrdersPage(
  organizationId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const cursor = decodeOrderCursor(options.cursor);
  const take = Math.min(Math.max(options.limit ?? 100, 1), 100);

  const orders = await prisma.merchandisingOrder.findMany({
    where: {
      organization_id: organizationId,
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: new Date(cursor.createdAt) } },
              { created_at: new Date(cursor.createdAt), id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    include: { finishedGoods: true, bomItems: true },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasNextPage = orders.length > take;
  const pageOrders = hasNextPage ? orders.slice(0, take) : orders;
  const lastOrder = pageOrders.at(-1);

  return {
    orders: pageOrders,
    nextCursor: hasNextPage && lastOrder
      ? encodeOrderCursor({ createdAt: lastOrder.created_at.toISOString(), id: lastOrder.id })
      : null,
  };
}

/*
 * Keep the legacy array-returning helper for existing report callers.
 */
export async function listOrdersLegacy(organizationId: string) {
  return prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId },
    include: { finishedGoods: true, bomItems: true },
    orderBy: { created_at: "desc" },
    take: 100,
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

export async function deleteOrders(orderIds: string[], organizationId: string) {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return { deletedCount: 0 };

  const result = await prisma.merchandisingOrder.deleteMany({
    where: {
      id: { in: ids },
      organization_id: organizationId,
    },
  });

  return { deletedCount: result.count };
}

export async function listBomItemsForOrganization(organizationId: string) {
  const bomItems = await prisma.billOfMaterialItem.findMany({
    where: {
      order: {
        organization_id: organizationId,
      },
    },
    include: {
      order: true,
    },
  });

  return bomItems.map((item) => ({
    id: item.id,
    orderId: item.order_id,
    orderNo: item.order.orderNo,
    orderQty: item.orderQty,
    styleName: item.order.styleName,
    brand: item.order.brand,
    buyer: item.order.buyer,
    categoryType: item.categoryType,
    category: item.category,
    subCategory: item.subCategory,
    rawMaterialName: item.rawMaterialName,
    size: item.size,
    consumption: item.consumption,
    buyerConsumption: item.buyerConsumption,
    buyerPrice: item.buyerPrice,
    internalConsumption: item.internalConsumption,
    internalPrice: item.internalPrice,
    valuePerGarmentRm: item.valuePerGarmentRm,
    requiredQty: item.requiredQty,
    itemWiseExcessPercentage: item.itemWiseExcessPercentage,
    itemWiseExcessQty: item.itemWiseExcessQty,
    totalRequiredQty: item.totalRequiredQty,
  }));
}

export async function createOrder(organizationId: string, input: CreateOrderInput) {
  if (!organizationId) {
    throw new Error("Organization is required to create an order.");
  }

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merchandising-order:${organizationId}`}))`;

    const existingOrders = await transaction.merchandisingOrder.findMany({
      where: { organization_id: organizationId },
      select: { orderNo: true },
    });
    const highestNumber = existingOrders.reduce((highest, order) => {
      const match = /^OD[- ]?(\d+)$/i.exec(order.orderNo.trim());
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);

    const createdOrder = await transaction.merchandisingOrder.create({
      data: {
        organization: { connect: { id: organizationId } },
        orderNo: `OD-${highestNumber + 1}`,
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
        deliveryDate,
        finalStatus: input.finalStatus ?? "Draft",
        processStatus: input.processStatus ?? null,
      },
    });

    if (Array.isArray(input.rows)) {
      const calculatedFinishedGoods = calculateFinishedGoodsRows(input.rows);
      await transaction.merchandisingOrder.update({
        where: { id: createdOrder.id },
        data: { orderQty: calculatedFinishedGoods.orderQty },
      });
      await updateFinishedGoodsForOrder(createdOrder.id, organizationId, input.rows, transaction);
      if (Array.isArray(input.bomRows)) {
        await updateBomItemsForOrder(createdOrder.id, organizationId, input.bomRows, calculatedFinishedGoods.rows, calculatedFinishedGoods.orderQty, transaction);
      }
    } else if (Array.isArray(input.bomRows)) {
      await updateBomItemsForOrder(createdOrder.id, organizationId, input.bomRows, [], Number(createdOrder.orderQty ?? 0), transaction);
    }

    return createdOrder;
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
  bomRows: BomRow[],
  finishedGoodsRows: OrderRow[] = [],
  orderQty = 0,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const order = await database.merchandisingOrder.findFirst({ where: { id: orderId, organization_id: organizationId } });
  if (!order) {
    throw new Error("Order not found");
  }

  await database.billOfMaterialItem.deleteMany({
    where: { order_id: orderId },
  });

  if (bomRows && bomRows.length > 0) {
    const calculatedRows = calculateBomRows(bomRows, calculateFinishedGoodsRows(finishedGoodsRows).rows, orderQty);
    await database.billOfMaterialItem.createMany({
      data: calculatedRows.map((row) => ({
        order_id: orderId,
        categoryType: row.categoryType ?? null,
        category: row.category ?? null,
        subCategory: row.subCategory ?? null,
        rawMaterialName: row.rawMaterialName ?? null,
        size: row.size ?? null,
        orderQty: String(row.orderQty),
        buyerConsumption: row.buyerConsumption ? String(row.buyerConsumption) : null,
        buyerPrice: row.buyerPrice ? String(row.buyerPrice) : null,
        internalConsumption: row.internalConsumption ? String(row.internalConsumption) : null,
        internalPrice: row.internalPrice ? String(row.internalPrice) : null,
        valuePerGarmentRm: row.valuePerGarmentRm ? String(row.valuePerGarmentRm) : null,
        consumption: row.consumption ? String(row.consumption) : null,
        requiredQty: String(row.requiredQty),
        itemWiseExcessPercentage: String(row.itemWiseExcessPercentage),
        itemWiseExcessQty: String(row.itemWiseExcessQty),
        totalRequiredQty: String(row.totalRequiredQty),
      })),
    });
  }
}

export async function updateFinishedGoodsForOrder(
  orderId: string,
  organizationId: string,
  rows: OrderRow[],
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const order = await database.merchandisingOrder.findFirst({ where: { id: orderId, organization_id: organizationId } });
  if (!order) {
    throw new Error("Order not found");
  }

  await database.finishedGoodsSizeWise.deleteMany({
    where: { order_id: orderId },
  });

  if (rows && rows.length > 0) {
    const calculatedRows = calculateFinishedGoodsRows(rows).rows;
    await database.finishedGoodsSizeWise.createMany({
      data: calculatedRows.map((row) => ({
        order_id: orderId,
        buyerSize: row.buyerSize ?? null,
        size: row.size ?? null,
        beforeExcessQty: row.beforeExcessQty !== undefined && row.beforeExcessQty !== null ? Number(row.beforeExcessQty) : null,
        excess: row.excess ? String(row.excess) : null,
        excessQty: Number(row.excessQty),
        totalQty: Number(row.totalQty),
        buyerPoPrice: row.buyerPoPrice ? String(row.buyerPoPrice) : null,
        exchangePrice: row.exchangePrice ? String(row.exchangePrice) : null,
        priceInInr: row.priceInInr ? String(row.priceInInr) : null,
      })),
    });
  }
}

export async function updateOrderWithDetails(
  orderId: string,
  organizationId: string,
  input: Partial<CreateOrderInput>,
) {
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.merchandisingOrder.findFirst({
      where: { id: orderId, organization_id: organizationId },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : undefined;
    const calculatedFinishedGoods = input.rows ? calculateFinishedGoodsRows(input.rows) : null;
    const updatedOrder = await transaction.merchandisingOrder.update({
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
        ...(input.ratioOrderQty !== undefined && { ratioOrderQty: input.ratioOrderQty === null ? null : Number(input.ratioOrderQty) }),
        ...(calculatedFinishedGoods
          ? { orderQty: calculatedFinishedGoods.orderQty }
          : input.orderQty !== undefined
            ? { orderQty: input.orderQty === null ? null : Number(input.orderQty) }
            : {}),
        ...(deliveryDate !== undefined && { deliveryDate }),
        ...(input.finalStatus !== undefined && { finalStatus: input.finalStatus }),
        ...(input.processStatus !== undefined && { processStatus: input.processStatus ?? null }),
      },
    });

    if (Array.isArray(input.rows)) {
      await updateFinishedGoodsForOrder(orderId, organizationId, input.rows, transaction);
    }
    if (Array.isArray(input.bomRows)) {
      await updateBomItemsForOrder(
        orderId,
        organizationId,
        input.bomRows,
        calculatedFinishedGoods?.rows ?? [],
        calculatedFinishedGoods?.orderQty ?? Number(updatedOrder.orderQty ?? 0),
        transaction,
      );
    }

    return updatedOrder;
  });
}

export async function getArticleOrderSummaries(organizationId: string) {
  return listOrders(organizationId);
}