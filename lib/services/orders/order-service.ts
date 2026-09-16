import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { calculateBomRows, calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";

async function validateOrderQuantityLimit(organizationId: string, orderQty: number) {
  const effectivePlans = await getEffectivePlansForOrganization(organizationId);
  const orderManagementPlan = effectivePlans.find(({ businessType }) => businessType.name.trim().toLowerCase() === "order management");
  const maxOrderQty = orderManagementPlan?.plan?.max_order_qty;

  if (maxOrderQty !== null && maxOrderQty !== undefined && orderQty > maxOrderQty) {
    throw new Error(`Your current ${orderManagementPlan?.plan?.plan_name || "plan"} allows up to ${maxOrderQty.toLocaleString("en-IN")} order quantity. Please upgrade your plan.`);
  }
}

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

export type ProcessRow = {
  processId?: string;
  processName?: string;
  slNo?: number | string;
  operationTemplateId?: string;
  operationTemplateName?: string;
  cost?: number | string | null;
  operations?: ProcessOperationRow[];
};

export type ProcessOperationRow = {
  id?: string;
  sourceOperationId?: string;
  operation?: string;
  slNo?: number | string;
  price?: number | string | null;
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
  processTemplateId?: string | null;
  processRows?: ProcessRow[];
  rows?: OrderRow[];
  bomRows?: BomRow[];
};

export type OrderPageCursor = {
  createdAt: string;
  id: string;
};

export function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

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

export async function reserveNextOrderNumber(
  organizationId: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const counter = await database.organizationOrderCounter.upsert({
    where: { organization_id: organizationId },
    create: { organization_id: organizationId, current_value: 1 },
    update: { current_value: { increment: 1 } },
    select: { current_value: true },
  });

  return `OD-${counter.current_value}`;
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
    orders: pageOrders.map((order) => ({
      ...order,
      deliveryDate: toDateOnly(order.deliveryDate),
    })),
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
    include: {
      finishedGoods: true,
      bomItems: true,
      processTemplate: { select: { id: true, value_id: true, process_name: true } },
      processSteps: {
        orderBy: { sl_no: "asc" },
        include: {
          process: { select: { id: true, value_id: true, process_name: true } },
          operations: { orderBy: { sl_no: "asc" } },
        },
      },
    },
  });
}

async function findProcessTemplate(organizationId: string, processTemplateId: string | null | undefined, database: Prisma.TransactionClient | typeof prisma) {
  if (!processTemplateId) return null;
  const template = await database.masterProcessTemplate.findFirst({
    where: { organization_id: organizationId, OR: [{ id: processTemplateId }, { value_id: processTemplateId }], is_active: true },
    include: {
      steps: {
        where: { is_active: true },
        orderBy: { sl_no: "asc" },
        include: {
          process: {
            select: {
              id: true,
              process_name: true,
              operationTemplates: {
                where: { organization_id: organizationId, is_active: true },
                orderBy: { sort_order: "asc" },
                include: {
                  operations: { where: { is_active: true }, orderBy: { sl_no: "asc" } },
                },
              },
            },
          },
          operationTemplate: {
            include: {
              operations: { where: { is_active: true }, orderBy: { sl_no: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!template) throw new Error("The selected process template is not active or does not belong to this organization.");
  if (template.steps.length === 0) throw new Error("The selected process template has no process steps.");
  return template;
}

async function replaceOrderProcessSteps(
  orderId: string,
  organizationId: string,
  processTemplateId: string | null | undefined,
  database: Prisma.TransactionClient | typeof prisma,
  inputRows: ProcessRow[] = [],
) {
  await database.merchandisingOrderProcessStep.deleteMany({ where: { order_id: orderId } });
  const template = await findProcessTemplate(organizationId, processTemplateId, database);
  if (!template) return null;

  for (const step of template.steps) {
    const inputRow = inputRows.find((row) =>
      row.processId === step.id
      || row.processId === step.process_id
      || (String(row.processName ?? "").trim() === step.process.process_name && Number(row.slNo ?? 0) === step.sl_no),
    );
    const operationTemplate = step.process.operationTemplates.find((candidate) =>
      candidate.id === inputRow?.operationTemplateId
      || candidate.value_id === inputRow?.operationTemplateId
      || candidate.operation_template_name === inputRow?.operationTemplateName,
    ) ?? step.process.operationTemplates[0] ?? step.operationTemplate;
    const operationRows = (operationTemplate?.operations ?? []).map((operation) => {
      const inputOperation = inputRow?.operations?.find((row) =>
        row.sourceOperationId === operation.id
        || row.id === operation.id
        || (String(row.operation ?? "").trim() === operation.operation && Number(row.slNo ?? 0) === operation.sl_no),
      );
      const rawPrice = inputOperation?.price;
      const price = rawPrice === undefined || rawPrice === null || rawPrice === ""
        ? Number(operation.price)
        : Number(rawPrice);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Operation price must be a valid non-negative number for ${operation.operation}.`);
      }
      return {
        source_operation_template_step_id: operation.id,
        operation: operation.operation,
        sl_no: operation.sl_no,
        price,
      };
    });

    const processStep = await database.merchandisingOrderProcessStep.create({
      data: {
        order_id: orderId,
        source_template_step_id: step.id,
        process_id: step.process_id,
        process_name: step.process.process_name,
        sl_no: step.sl_no,
        cost: operationRows.length > 0 ? operationRows.reduce((total, operation) => total + operation.price, 0) : null,
      },
    });

    if (operationRows.length > 0) {
      await database.merchandisingOrderProcessOperation.createMany({
        data: operationRows.map((operation) => ({
          ...operation,
          order_process_step_id: processStep.id,
        })),
      });
    }
  }
  return template;
}

async function syncOrderProcessController(
  orderId: string,
  processTemplateId: string | null | undefined,
  orderQty: number,
  database: Prisma.TransactionClient,
) {
  const processSteps = await database.merchandisingOrderProcessStep.findMany({
    where: { order_id: orderId },
    orderBy: { sl_no: "asc" },
    include: { operations: { orderBy: { sl_no: "asc" } } },
  });

  if (!processTemplateId || processSteps.length === 0) {
    await database.orderProcessController.deleteMany({ where: { order_id: orderId } });
    return null;
  }

  const controller = await database.orderProcessController.upsert({
    where: { order_id: orderId },
    update: { process_template_id: processTemplateId },
    create: { order_id: orderId, process_template_id: processTemplateId },
  });
  await database.orderProcessControllerProcess.deleteMany({ where: { controller_id: controller.id } });

  for (const step of processSteps) {
    await database.orderProcessControllerProcess.create({
      data: {
        controller_id: controller.id,
        process_id: step.process_id,
        process_name: step.process_name,
        sl_no: step.sl_no,
        order_qty: orderQty,
        operations: {
          create: step.operations.map((operation) => ({
            source_operation_id: operation.source_operation_template_step_id,
            operation: operation.operation,
            sl_no: operation.sl_no,
            budgeted_price: operation.price,
          })),
        },
      },
    });
  }

  return controller;
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

export async function listBomItemsPage(
  organizationId: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 200);
  let cursor: { createdAt: Date; id: string } | null = null;

  if (options.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { createdAt?: string; id?: string };
      if (typeof decoded.createdAt === "string" && typeof decoded.id === "string") {
        cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
      }
    } catch {
      cursor = null;
    }
  }

  const bomItems = await prisma.billOfMaterialItem.findMany({
    where: {
      order: {
        organization_id: organizationId,
      },
      ...(cursor
        ? {
            OR: [
              { created_at: { lt: cursor.createdAt } },
              { created_at: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      order_id: true,
      orderQty: true,
      categoryType: true,
      category: true,
      subCategory: true,
      rawMaterialName: true,
      size: true,
      consumption: true,
      buyerConsumption: true,
      buyerPrice: true,
      internalConsumption: true,
      internalPrice: true,
      valuePerGarmentRm: true,
      requiredQty: true,
      itemWiseExcessPercentage: true,
      itemWiseExcessQty: true,
      totalRequiredQty: true,
      created_at: true,
      order: { select: { orderNo: true, styleName: true, brand: true, buyer: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasNextPage = bomItems.length > take;
  const pageItems = hasNextPage ? bomItems.slice(0, take) : bomItems;
  const lastItem = pageItems.at(-1);

  return {
    bomItems: pageItems.map((item) => ({
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
    })),
    nextCursor: hasNextPage && lastItem
      ? encodeOrderCursor({ createdAt: lastItem.created_at.toISOString(), id: lastItem.id })
      : null,
  };
}

export async function createOrder(organizationId: string, input: CreateOrderInput) {
  if (!organizationId) {
    throw new Error("Organization is required to create an order.");
  }

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;
  const calculatedOrderQty = Array.isArray(input.rows)
    ? calculateFinishedGoodsRows(input.rows).orderQty
    : Number(input.orderQty ?? 0);
  await validateOrderQuantityLimit(organizationId, calculatedOrderQty);

  return prisma.$transaction(async (transaction) => {
    const orderNo = await reserveNextOrderNumber(organizationId, transaction);
    const processTemplate = await findProcessTemplate(organizationId, input.processTemplateId, transaction);

    const createdOrder = await transaction.merchandisingOrder.create({
      data: {
        organization: { connect: { id: organizationId } },
        orderNo,
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
        ...(processTemplate ? { processTemplate: { connect: { id: processTemplate.id } } } : {}),
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

    await replaceOrderProcessSteps(createdOrder.id, organizationId, processTemplate?.id, transaction, input.processRows ?? []);
    await syncOrderProcessController(createdOrder.id, processTemplate?.id, Number(createdOrder.orderQty ?? 0), transaction);

    return createdOrder;
  }, { maxWait: 10000, timeout: 30000 });
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
  if (input.orderQty !== undefined && input.orderQty !== null) {
    await validateOrderQuantityLimit(organizationId, Number(input.orderQty));
  }

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
    await validateOrderQuantityLimit(
      organizationId,
      calculatedFinishedGoods?.orderQty ?? (input.orderQty !== undefined ? Number(input.orderQty) : Number(order.orderQty ?? 0)),
    );
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

    if (input.processTemplateId !== undefined) {
      const processTemplate = await findProcessTemplate(organizationId, input.processTemplateId, transaction);
      await transaction.merchandisingOrder.update({ where: { id: orderId }, data: { process_template_id: processTemplate?.id ?? null } });
      await replaceOrderProcessSteps(orderId, organizationId, processTemplate?.id, transaction, input.processRows ?? []);
      await syncOrderProcessController(orderId, processTemplate?.id, Number(updatedOrder.orderQty ?? 0), transaction);
    }

    return updatedOrder;
  }, { maxWait: 10000, timeout: 30000 });
}

export async function getArticleOrderSummaries(organizationId: string) {
  return listOrders(organizationId);
}
