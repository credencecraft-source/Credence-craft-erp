import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import {
  calculateBomRows,
  calculateFinishedGoodsRows,
  type CalculatedFinishedGoodsQuantity,
} from "@/lib/services/orders/order-quantity-calculations";
import { findDuplicateBomMaterialNames } from "@/lib/services/orders/bom-row-validation";
import {
  getEffectiveSegmentFormRestriction,
  validateMonthlyFormLimits,
  validateRestrictedFormFields,
} from "@/lib/services/platform/segment-form-restriction-service";
import { lockOrganizationOrderQuantityLimit } from "@/lib/services/platform/order-quantity-limit-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireActiveOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { assertNoDummyMasterReferences, getSizeGroupSizesForOrganization } from "@/lib/master-data/master-data-constants";
import { buildVariantOrderInput, type VariantCreateRequest, type VariantSourceOrder } from "@/lib/services/orders/order-variant-input";
import { createPreparedVariantToken, readPreparedVariantToken } from "@/lib/services/orders/order-variant-preparation";

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
  id?: string;
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  stockUom?: string | null;
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

type CreateOrderOptions = {
  processSnapshot?: VariantSourceOrder["processSteps"];
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
  const upsertArgs = {
    where: { organization_id: organizationId },
    create: { organization_id: organizationId, current_value: 1 },
    update: { current_value: { increment: 1 } },
    select: { current_value: true },
  };
  let counter;

  try {
    counter = await database.organizationOrderCounter.upsert(upsertArgs);
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
    const errorMessage = error instanceof Error ? error.message : "";
    const isClosedTransactionError = errorMessage.includes("Transaction API error: Transaction not found")
      || (errorCode === "P2028" && /transaction.*(?:closed|expired|not found|invalid)/i.test(errorMessage));

    if (database === prisma || !isClosedTransactionError) {
      throw error;
    }

    counter = await prisma.organizationOrderCounter.upsert(upsertArgs);
  }

  return `OD-${counter.current_value}`;
}

export async function reserveNextOrderNumbers(
  organizationId: string,
  count: number,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Order number count must be a positive integer.");
  }

  const counter = await database.organizationOrderCounter.upsert({
    where: { organization_id: organizationId },
    create: { organization_id: organizationId, current_value: count },
    update: { current_value: { increment: count } },
    select: { current_value: true },
  });
  const firstNumber = counter.current_value - count + 1;
  return Array.from({ length: count }, (_, index) => `OD-${firstNumber + index}`);
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
    select: {
      id: true,
      orderNo: true,
      entityName: true,
      entity_id: true,
      category: true,
      subCategory: true,
      season: true,
      article: true,
      styleName: true,
      colors: true,
      buyer: true,
      brand: true,
      sizeGroup: true,
      orderQty: true,
      deliveryDate: true,
      finalStatus: true,
      processStatus: true,
      sourceStatus: true,
      created_at: true,
      finishedGoods: {
        select: {
          size: true,
          buyerSize: true,
        },
      },
    },
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
    select: {
      id: true,
      organization_id: true,
      entity_id: true,
      orderNo: true,
      entityName: true,
      category: true,
      subCategory: true,
      season: true,
      article: true,
      styleName: true,
      colors: true,
      buyer: true,
      brand: true,
      sizeGroup: true,
      haveSizeRatio: true,
      ratioOrderQty: true,
      orderQty: true,
      deliveryDate: true,
      finalStatus: true,
      processStatus: true,
      sourceStatus: true,
      process_template_id: true,
      created_at: true,
      updated_at: true,
      finishedGoods: {
        select: {
          id: true,
          buyerSize: true,
          size: true,
          beforeExcessQty: true,
          excess: true,
          excessQty: true,
          totalQty: true,
          buyerPoPrice: true,
          exchangePrice: true,
          priceInInr: true,
        },
      },
      bomItems: {
        select: {
          id: true,
          categoryType: true,
          category: true,
          subCategory: true,
          rawMaterialName: true,
          stockUom: true,
          size: true,
          orderQty: true,
          buyerConsumption: true,
          buyerPrice: true,
          internalConsumption: true,
          internalPrice: true,
          valuePerGarmentRm: true,
          consumption: true,
          requiredQty: true,
          itemWiseExcessPercentage: true,
          itemWiseExcessQty: true,
          totalRequiredQty: true,
        },
      },
      processTemplate: { select: { id: true, value_id: true, process_name: true } },
      processSteps: {
        orderBy: { sl_no: "asc" },
        select: {
          id: true,
          order_id: true,
          source_template_step_id: true,
          process_id: true,
          process_name: true,
          sl_no: true,
          cost: true,
          process: { select: { id: true, value_id: true, process_name: true } },
          operations: {
            orderBy: { sl_no: "asc" },
            select: {
              id: true,
              order_process_step_id: true,
              source_operation_template_step_id: true,
              operation: true,
              sl_no: true,
              price: true,
            },
          },
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

async function createOrderProcessSteps(
  orderId: string,
  template: NonNullable<Awaited<ReturnType<typeof findProcessTemplate>>>,
  inputRows: ProcessRow[],
  transaction: Prisma.TransactionClient,
) {
  const operationRowsBySlNo = new Map<number, Array<{
    source_operation_template_step_id: string;
    operation: string;
    sl_no: number;
    price: number;
  }>>();
  const stepData = template.steps.map((step) => {
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
    operationRowsBySlNo.set(step.sl_no, operationRows);

    return {
      order_id: orderId,
      source_template_step_id: step.id,
      process_id: step.process_id,
      process_name: step.process.process_name,
      sl_no: step.sl_no,
      cost: operationRows.length > 0 ? operationRows.reduce((total, operation) => total + operation.price, 0) : null,
    };
  });

  const createdSteps = await transaction.merchandisingOrderProcessStep.createManyAndReturn({
    data: stepData,
    select: { id: true, sl_no: true },
  });
  const stepDataBySlNo = new Map(stepData.map((step) => [step.sl_no, step]));
  const operationData = createdSteps.flatMap((step) =>
    (operationRowsBySlNo.get(step.sl_no) ?? []).map((operation) => ({
      ...operation,
      order_process_step_id: step.id,
    })),
  );
  if (operationData.length > 0) {
    await transaction.merchandisingOrderProcessOperation.createMany({ data: operationData });
  }

  return createdSteps.map((step) => ({
    id: step.id,
    sl_no: step.sl_no,
    process_id: stepDataBySlNo.get(step.sl_no)?.process_id ?? "",
    process_name: stepDataBySlNo.get(step.sl_no)?.process_name ?? "",
    operations: operationRowsBySlNo.get(step.sl_no) ?? [],
  }));
}

async function createOrderProcessStepsFromSnapshot(
  orderId: string,
  processSnapshot: VariantSourceOrder["processSteps"],
  transaction: Prisma.TransactionClient,
) {
  const operationRowsBySlNo = new Map<number, Array<{
    source_operation_template_step_id: string | null;
    operation: string;
    sl_no: number;
    price: number;
  }>>();
  const stepData = processSnapshot.map((step) => {
    const operationRows = step.operations.map((operation) => {
      const price = Number(operation.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Operation price must be a valid non-negative number for ${operation.operation}.`);
      }
      return {
        source_operation_template_step_id: operation.source_operation_template_step_id,
        operation: operation.operation,
        sl_no: operation.sl_no,
        price,
      };
    });
    operationRowsBySlNo.set(step.sl_no, operationRows);
    return {
      order_id: orderId,
      source_template_step_id: step.source_template_step_id,
      process_id: step.process_id,
      process_name: step.process_name,
      sl_no: step.sl_no,
      cost: operationRows.length > 0 ? operationRows.reduce((total, operation) => total + operation.price, 0) : null,
    };
  });

  if (stepData.length === 0) return [];
  const createdSteps = await transaction.merchandisingOrderProcessStep.createManyAndReturn({
    data: stepData,
    select: { id: true, process_id: true, process_name: true, sl_no: true },
  });
  const operationData = createdSteps.flatMap((step) =>
    (operationRowsBySlNo.get(step.sl_no) ?? []).map((operation) => ({
      ...operation,
      order_process_step_id: step.id,
    })),
  );
  if (operationData.length > 0) {
    await transaction.merchandisingOrderProcessOperation.createMany({ data: operationData });
  }

  return createdSteps.map((step) => ({
    ...step,
    operations: operationRowsBySlNo.get(step.sl_no) ?? [],
  }));
}

async function createOrderProcessController(
  orderId: string,
  processTemplateId: string | null | undefined,
  processSteps: Array<{
    process_id: string;
    process_name: string;
    sl_no: number;
    operations: Array<{
      source_operation_template_step_id: string | null;
      operation: string;
      sl_no: number;
      price: number;
    }>;
  }>,
  orderQty: number,
  transaction: Prisma.TransactionClient,
) {
  if (!processTemplateId || processSteps.length === 0) return null;

  const controller = await transaction.orderProcessController.create({
    data: { order_id: orderId, process_template_id: processTemplateId },
  });
  const createdProcesses = await transaction.orderProcessControllerProcess.createManyAndReturn({
    data: processSteps.map((step) => ({
      controller_id: controller.id,
      process_id: step.process_id,
      process_name: step.process_name,
      sl_no: step.sl_no,
      order_qty: orderQty,
    })),
    select: { id: true, sl_no: true },
  });
  const processStepsBySlNo = new Map(processSteps.map((step) => [step.sl_no, step]));
  const operationData = createdProcesses.flatMap((process) =>
    (processStepsBySlNo.get(process.sl_no)?.operations ?? []).map((operation) => ({
      process_id: process.id,
      source_operation_id: operation.source_operation_template_step_id,
      operation: operation.operation,
      sl_no: operation.sl_no,
      budgeted_price: operation.price,
    })),
  );
  if (operationData.length > 0) {
    await transaction.orderProcessControllerOperation.createMany({ data: operationData });
  }
  return controller;
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
    const existingController = await database.orderProcessController.findUnique({
      where: { order_id: orderId },
      include: { workOrderControllers: { select: { id: true } } },
    });
    if (existingController && existingController.workOrderControllers.length === 0) {
      await database.orderProcessController.delete({ where: { id: existingController.id } });
    }
    return null;
  }

  const controller = await database.orderProcessController.upsert({
    where: { order_id: orderId },
    update: { process_template_id: processTemplateId },
    create: { order_id: orderId, process_template_id: processTemplateId },
  });
  const existingProcesses = await database.orderProcessControllerProcess.findMany({
    where: { controller_id: controller.id },
    select: { id: true, sl_no: true, workOrderProcesses: { select: { id: true } } },
  });
  const existingBySlNo = new Map(existingProcesses.map((process) => [process.sl_no, process]));
  const retainedProcessIds = new Set<string>();

  for (const step of processSteps) {
    const existingProcess = existingBySlNo.get(step.sl_no);
    const process = existingProcess
      ? await database.orderProcessControllerProcess.update({
        where: { id: existingProcess.id },
        data: {
          process_id: step.process_id,
          process_name: step.process_name,
          order_qty: orderQty,
        },
      })
      : await database.orderProcessControllerProcess.create({
        data: {
          controller_id: controller.id,
          process_id: step.process_id,
          process_name: step.process_name,
          sl_no: step.sl_no,
          order_qty: orderQty,
        },
      });
    retainedProcessIds.add(process.id);

    await database.orderProcessControllerOperation.deleteMany({ where: { process_id: process.id } });
    if (step.operations.length > 0) {
      await database.orderProcessControllerOperation.createMany({
        data: step.operations.map((operation) => ({
          process_id: process.id,
          source_operation_id: operation.source_operation_template_step_id,
          operation: operation.operation,
          sl_no: operation.sl_no,
          budgeted_price: operation.price,
        })),
      });
    }
  }

  const removedProcesses = existingProcesses.filter((process) => !retainedProcessIds.has(process.id));
  const blockedProcess = removedProcesses.find((process) => process.workOrderProcesses.length > 0);
  if (blockedProcess) {
    throw new Error("A process used by an existing work order cannot be removed from this order.");
  }
  if (removedProcesses.length > 0) {
    await database.orderProcessControllerProcess.deleteMany({
      where: { id: { in: removedProcesses.map((process) => process.id) } },
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

export async function deleteOrders(orderIds: string[], organizationId: string, userId?: string) {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return { deletedCount: 0 };

  const protectedGrns = await prisma.factoryGrn.findMany({
    where: {
      organization_id: organizationId,
      workOrder: { order_id: { in: ids } },
    },
    select: { workOrder: { select: { work_order_no: true } } },
    take: 5,
  });

  if (protectedGrns.length > 0) {
    const workOrderNumbers = protectedGrns.map((grn) => grn.workOrder.work_order_no).join(", ");
    throw new Error(
      `These orders cannot be deleted because work order${protectedGrns.length === 1 ? "" : "s"} ${workOrderNumbers} ${protectedGrns.length === 1 ? "has" : "have"} GRN records. Close or reverse the related production records first.`,
    );
  }

  try {
    const result = await prisma.merchandisingOrder.deleteMany({
      where: {
        id: { in: ids },
        organization_id: organizationId,
      },
    });

    if (result.count > 0) {
      await createAuditEvent({
        organizationId,
        userId,
        module: "Order Management",
        action: "DELETE",
        entityType: "MerchandisingOrder",
        details: { deleted_count: result.count, order_ids: ids },
      });
    }

    return { deletedCount: result.count };
  } catch (error) {
    const errorCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    if (errorCode === "P2003") {
      throw new Error("One or more selected orders have production or GRN records and cannot be deleted.");
    }
    throw error;
  }
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
      stockUom: true,
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
      order: { select: { orderNo: true, styleName: true, brand: true, buyer: true, entity_id: true, entityName: true } },
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
    entityId: item.order.entity_id,
    entityName: item.order.entityName ?? "Missing Entity",
    orderQty: item.orderQty,
    styleName: item.order.styleName,
    brand: item.order.brand,
    buyer: item.order.buyer,
    categoryType: item.categoryType,
    category: item.category,
    subCategory: item.subCategory,
    rawMaterialName: item.rawMaterialName,
    stockUom: item.stockUom,
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

export async function createOrder(
  organizationId: string,
  input: CreateOrderInput,
  userId?: string,
  options: CreateOrderOptions = {},
) {
  if (!organizationId) {
    throw new Error("Organization is required to create an order.");
  }

  await assertNoDummyMasterReferences(organizationId, input as unknown as Record<string, unknown>);

  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;
  const calculatedFinishedGoods = Array.isArray(input.rows) ? calculateFinishedGoodsRows(input.rows) : null;
  const calculatedOrderQty = calculatedFinishedGoods?.orderQty ?? Number(input.orderQty ?? 0);
  const formRestriction = await getEffectiveSegmentFormRestriction(organizationId, "merchandising_orders");
  await validateRestrictedFormFields(organizationId, "merchandising_orders", input as unknown as Record<string, unknown>, formRestriction);

  const createdOrder = await prisma.$transaction(async (transaction) => {
    await lockOrganizationOrderQuantityLimit(transaction, organizationId);
    await validateMonthlyFormLimits(organizationId, "merchandising_orders", calculatedOrderQty, undefined, transaction, formRestriction);
    const entity = await requireActiveOrganizationEntity(organizationId, input.entityName, transaction);
    const orderNo = await reserveNextOrderNumber(organizationId, transaction);
    const processTemplate = options.processSnapshot
      ? null
      : await findProcessTemplate(organizationId, input.processTemplateId, transaction);
    const activeProcessTemplateId = options.processSnapshot
      ? input.processTemplateId
        ? (await transaction.masterProcessTemplate.findFirst({
            where: {
              organization_id: organizationId,
              OR: [{ id: input.processTemplateId }, { value_id: input.processTemplateId }],
              is_active: true,
            },
            select: { id: true },
          }))?.id ?? null
        : null
      : processTemplate?.id ?? null;
    if (options.processSnapshot && input.processTemplateId && !activeProcessTemplateId) {
      throw new Error("The selected process template is not active or does not belong to this organization.");
    }

    const createdOrder = await transaction.merchandisingOrder.create({
      data: {
        organization: { connect: { id: organizationId } },
        entity: { connect: { organization_id_id: { organization_id: organizationId, id: entity.id } } },
        orderNo,
        entityName: entity.entity_name,
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
        orderQty: calculatedFinishedGoods?.orderQty
          ?? (input.orderQty !== undefined && input.orderQty !== null ? Number(input.orderQty) : null),
        deliveryDate,
        finalStatus: input.finalStatus ?? "Draft",
        processStatus: input.processStatus ?? null,
        ...(activeProcessTemplateId ? { processTemplate: { connect: { id: activeProcessTemplateId } } } : {}),
      },
    });

    if (calculatedFinishedGoods) {
      await createFinishedGoodsForOrder(createdOrder.id, calculatedFinishedGoods.rows, transaction);
    }
    if (Array.isArray(input.bomRows)) {
      await createBomItemsForOrder(
        createdOrder.id,
        input.bomRows,
        calculatedFinishedGoods?.rows ?? [],
        calculatedFinishedGoods?.orderQty ?? Number(createdOrder.orderQty ?? 0),
        transaction,
      );
    }

    if (activeProcessTemplateId) {
      const processSteps = options.processSnapshot
        ? await createOrderProcessStepsFromSnapshot(createdOrder.id, options.processSnapshot, transaction)
        : await createOrderProcessSteps(createdOrder.id, processTemplate!, input.processRows ?? [], transaction);
      await createOrderProcessController(
        createdOrder.id,
        activeProcessTemplateId,
        processSteps,
        Number(createdOrder.orderQty ?? 0),
        transaction,
      );
    }

    return createdOrder;
  }, { maxWait: 10000, timeout: 30000 });

  await createAuditEvent({
    organizationId,
    userId,
    module: "Order Management",
    action: "CREATE",
    entityType: "MerchandisingOrder",
    entityId: createdOrder.id,
    details: { order_no: createdOrder.orderNo, status: createdOrder.finalStatus },
  });

  return createdOrder;
}

export async function prepareVariantOrder(
  organizationId: string,
  sourceOrderId: string,
  userId: string,
) {
  const source = await getOrderById(sourceOrderId, organizationId);
  if (!source) throw new Error("Source order not found.");

  const allowedSizes = [...new Set(source.finishedGoods
    .map((row) => String(row.size || row.buyerSize || "").trim())
    .filter(Boolean))];

  if (allowedSizes.length === 0 && source.sizeGroup) {
    const sizeGroup = await prisma.masterSizeGroup.findFirst({
      where: {
        organization_id: organizationId,
        OR: [
          { id: source.sizeGroup },
          { value_id: source.sizeGroup },
          { size_group: source.sizeGroup },
        ],
      },
      select: { id: true },
    });
    if (sizeGroup) {
      const sizeLinks = await getSizeGroupSizesForOrganization(organizationId, [sizeGroup.id]);
      allowedSizes.push(...sizeLinks.map((link) => link.size.label));
    }
  }

  const variantSource: VariantSourceOrder = {
    entityName: source.entityName,
    category: source.category,
    subCategory: source.subCategory,
    season: source.season,
    article: source.article,
    styleName: source.styleName,
    colors: source.colors,
    buyer: source.buyer,
    brand: source.brand,
    sizeGroup: source.sizeGroup,
    haveSizeRatio: source.haveSizeRatio,
    ratioOrderQty: source.ratioOrderQty,
    deliveryDate: source.deliveryDate,
    finishedGoods: source.finishedGoods.map((row) => ({
      buyerSize: row.buyerSize,
      size: row.size,
      buyerPoPrice: row.buyerPoPrice,
      exchangePrice: row.exchangePrice,
      priceInInr: row.priceInInr,
    })),
    bomItems: source.bomItems.map((row) => ({
      categoryType: row.categoryType,
      category: row.category,
      subCategory: row.subCategory,
      rawMaterialName: row.rawMaterialName,
      stockUom: row.stockUom,
      size: row.size,
      buyerConsumption: row.buyerConsumption,
      buyerPrice: row.buyerPrice,
      internalConsumption: row.internalConsumption,
      internalPrice: row.internalPrice,
      valuePerGarmentRm: row.valuePerGarmentRm,
      consumption: row.consumption,
      requiredQty: row.requiredQty,
      itemWiseExcessPercentage: row.itemWiseExcessPercentage,
      itemWiseExcessQty: row.itemWiseExcessQty,
      totalRequiredQty: row.totalRequiredQty,
    })),
    processTemplateId: source.processTemplate?.id ?? null,
    processSteps: source.processSteps.map((step) => ({
      source_template_step_id: step.source_template_step_id,
      process_id: step.process_id,
      process_name: step.process_name,
      sl_no: step.sl_no,
      operations: step.operations.map((operation) => ({
        id: operation.id,
        source_operation_template_step_id: operation.source_operation_template_step_id,
        operation: operation.operation,
        sl_no: operation.sl_no,
        price: operation.price,
      })),
    })),
  };

  return {
    preparedToken: createPreparedVariantToken({
      userId,
      organizationId,
      sourceOrderId,
      sourceUpdatedAt: source.updated_at.getTime(),
      source: variantSource,
      allowedSizes,
    }),
    sizes: allowedSizes,
  };
}

export async function createVariantOrder(
  organizationId: string,
  sourceOrderId: string,
  request: VariantCreateRequest,
  userId: string,
) {
  const prepared = readPreparedVariantToken(request.preparedToken);
  if (prepared.userId !== userId
    || prepared.organizationId !== organizationId
    || prepared.sourceOrderId !== sourceOrderId) {
    throw new Error("Variant preparation does not match this user, organization, or source order.");
  }

  const sourceStillAvailable = await prisma.merchandisingOrder.findFirst({
    where: { id: sourceOrderId, organization_id: organizationId },
    select: { updated_at: true },
  });
  if (!sourceStillAvailable) throw new Error("Source order not found.");
  if (sourceStillAvailable.updated_at.getTime() !== prepared.sourceUpdatedAt) {
    throw new Error("Source order changed while the variant was being prepared. Click Variant again to reload it.");
  }

  return createOrder(
    organizationId,
    buildVariantOrderInput(prepared.source, request, prepared.allowedSizes),
    userId,
    { processSnapshot: prepared.source.processSteps },
  );
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

  if (order.sourceStatus !== "DEMO") {
    await assertNoDummyMasterReferences(organizationId, input as unknown as Record<string, unknown>);
  }

  await validateRestrictedFormFields(organizationId, "merchandising_orders", input as unknown as Record<string, unknown>);
  const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : undefined;

  return prisma.$transaction(async (transaction) => {
    await lockOrganizationOrderQuantityLimit(transaction, organizationId);
    const entity = await requireActiveOrganizationEntity(organizationId, input.entityName ?? order.entity_id ?? order.entityName, transaction);
    if (order.entity_id && order.entity_id !== entity.id) {
      throw new Error("Entity cannot be changed after the order is created.");
    }
    if (input.orderQty !== undefined && input.orderQty !== null) {
      await validateMonthlyFormLimits(organizationId, "merchandising_orders", Number(input.orderQty), orderId, transaction);
    }
    return transaction.merchandisingOrder.update({
      where: { id: orderId },
      data: {
      entity_id: entity.id,
      entityName: entity.entity_name,
      ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
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

  const duplicateMaterials = findDuplicateBomMaterialNames(bomRows ?? []);
  if (duplicateMaterials.length > 0) {
    throw new Error(`Duplicate BOM material${duplicateMaterials.length === 1 ? "" : "s"}: ${duplicateMaterials.join(", ")}. Keep one row per material in the order and add its sizes to that row.`);
  }

  const existingItems = await database.billOfMaterialItem.findMany({
    where: { order_id: orderId },
    select: {
      id: true,
      _count: { select: { groupedPurchaseOrderLines: true, workOrderBomLines: true } },
    },
  });
  const calculatedRows = calculateBomRows(bomRows ?? [], calculateFinishedGoodsRows(finishedGoodsRows).rows, orderQty);
  const submittedIds = new Set(calculatedRows.map((row) => row.id).filter((id): id is string => Boolean(id)));
  const removedItems = existingItems.filter((item) => !submittedIds.has(item.id));
  const blockedRemoval = removedItems.find((item) => item._count.groupedPurchaseOrderLines > 0 || item._count.workOrderBomLines > 0);

  if (blockedRemoval) {
    throw new Error("This BOM row is already used in procurement or a work order and cannot be removed.");
  }

  if (removedItems.length > 0) {
    await database.billOfMaterialItem.deleteMany({
      where: { id: { in: removedItems.map((item) => item.id) } },
    });
  }

  const itemData = (row: (typeof calculatedRows)[number]) => ({
    order_id: orderId,
    categoryType: row.categoryType ?? null,
    category: row.category ?? null,
    subCategory: row.subCategory ?? null,
    rawMaterialName: row.rawMaterialName ?? null,
    stockUom: row.stockUom ?? null,
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
  });

  for (const row of calculatedRows) {
    if (row.id && existingItems.some((item) => item.id === row.id)) {
      await database.billOfMaterialItem.update({ where: { id: row.id }, data: itemData(row) });
    } else {
      await database.billOfMaterialItem.create({ data: itemData(row) });
    }
  }
}

async function createBomItemsForOrder(
  orderId: string,
  bomRows: BomRow[],
  finishedGoodsRows: CalculatedFinishedGoodsQuantity[],
  orderQty: number,
  transaction: Prisma.TransactionClient,
) {
  if (bomRows.length === 0) return;

  const duplicateMaterials = findDuplicateBomMaterialNames(bomRows);
  if (duplicateMaterials.length > 0) {
    throw new Error(`Duplicate BOM material${duplicateMaterials.length === 1 ? "" : "s"}: ${duplicateMaterials.join(", ")}. Keep one row per material in the order and add its sizes to that row.`);
  }

  const calculatedRows = calculateBomRows(bomRows, finishedGoodsRows, orderQty);
  await transaction.billOfMaterialItem.createMany({
    data: calculatedRows.map((row) => ({
      order_id: orderId,
      categoryType: row.categoryType ?? null,
      category: row.category ?? null,
      subCategory: row.subCategory ?? null,
      rawMaterialName: row.rawMaterialName ?? null,
      stockUom: row.stockUom ?? null,
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

async function createFinishedGoodsForOrder(
  orderId: string,
  rows: OrderRow[],
  transaction: Prisma.TransactionClient,
) {
  if (rows.length === 0) return;

  await transaction.finishedGoodsSizeWise.createMany({
    data: rows.map((row) => ({
      order_id: orderId,
      buyerSize: row.buyerSize ?? null,
      size: row.size ?? null,
      beforeExcessQty: row.beforeExcessQty !== undefined && row.beforeExcessQty !== null ? Number(row.beforeExcessQty) : null,
      excess: row.excess ? String(row.excess) : null,
      excessQty: Number(row.excessQty ?? 0),
      totalQty: Number(row.totalQty ?? 0),
      buyerPoPrice: row.buyerPoPrice ? String(row.buyerPoPrice) : null,
      exchangePrice: row.exchangePrice ? String(row.exchangePrice) : null,
      priceInInr: row.priceInInr ? String(row.priceInInr) : null,
    })),
  });
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
  userId?: string,
) {
  const updatedOrder = await prisma.$transaction(async (transaction) => {
    const order = await transaction.merchandisingOrder.findFirst({
      where: { id: orderId, organization_id: organizationId },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    const entity = await requireActiveOrganizationEntity(organizationId, input.entityName ?? order.entity_id ?? order.entityName, transaction);
    if (order.entity_id && order.entity_id !== entity.id) {
      throw new Error("Entity cannot be changed after the order is created.");
    }

    if (order.sourceStatus !== "DEMO") {
      await assertNoDummyMasterReferences(organizationId, input as unknown as Record<string, unknown>);
    }

    await lockOrganizationOrderQuantityLimit(transaction, organizationId);

    const changedFormFields: Record<string, unknown> = {};
    const currentOrder = order as unknown as Record<string, unknown>;
    for (const field of ["entityName", "category", "subCategory", "season", "article", "styleName", "colors", "buyer", "brand", "sizeGroup", "haveSizeRatio", "ratioOrderQty", "orderQty", "deliveryDate"]) {
      if (field in input && input[field as keyof CreateOrderInput] !== currentOrder[field]) {
        changedFormFields[field] = input[field as keyof CreateOrderInput];
      }
    }
    await validateRestrictedFormFields(organizationId, "merchandising_orders", changedFormFields);

    const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : undefined;
    const calculatedFinishedGoods = input.rows ? calculateFinishedGoodsRows(input.rows) : null;
    await validateMonthlyFormLimits(
      organizationId,
      "merchandising_orders",
      calculatedFinishedGoods?.orderQty ?? (input.orderQty !== undefined ? Number(input.orderQty) : Number(order.orderQty ?? 0)),
      orderId,
      transaction,
    );
    const updatedOrder = await transaction.merchandisingOrder.update({
      where: { id: orderId },
      data: {
        entity_id: entity.id,
        entityName: entity.entity_name,
        ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
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

  await createAuditEvent({
    organizationId,
    userId,
    module: "Order Management",
    action: "UPDATE",
    entityType: "MerchandisingOrder",
    entityId: updatedOrder.id,
    details: { order_no: updatedOrder.orderNo, status: updatedOrder.finalStatus },
  });

  return updatedOrder;
}

export async function getArticleOrderSummaries(organizationId: string) {
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      orderNo: true,
      entityName: true,
      category: true,
      subCategory: true,
      season: true,
      article: true,
      styleName: true,
      colors: true,
      buyer: true,
      brand: true,
      sizeGroup: true,
      orderQty: true,
      deliveryDate: true,
      finalStatus: true,
      processStatus: true,
      finishedGoods: {
        select: {
          id: true,
          buyerSize: true,
          size: true,
          beforeExcessQty: true,
          excess: true,
          excessQty: true,
          totalQty: true,
        },
        orderBy: [{ size: "asc" }, { id: "asc" }],
      },
      bomItems: {
        select: {
          id: true,
          rawMaterialName: true,
          categoryType: true,
          category: true,
          subCategory: true,
          size: true,
          totalRequiredQty: true,
        },
        orderBy: [{ rawMaterialName: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ season: "asc" }, { article: "asc" }, { orderNo: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<string, {
    season: string | null;
    article: string | null;
    orderCount: number;
    totalOrderQty: number;
    buyers: Set<string>;
    orderNumbers: string[];
    orders: Array<Record<string, unknown>>;
    sizeTotals: Map<string, number>;
    bomTotals: Map<string, {
      rawMaterialName: string;
      categoryType: string | null;
      category: string | null;
      subCategory: string | null;
      size: string | null;
      totalRequiredQty: number;
      affectedOrderNumbers: Set<string>;
    }>;
  }>();

  for (const order of orders) {
    const season = order.season?.trim() || null;
    const article = order.article?.trim() || null;
    const groupKey = JSON.stringify([season, article]);
    let summary = grouped.get(groupKey);

    if (!summary) {
      summary = {
        season,
        article,
        orderCount: 0,
        totalOrderQty: 0,
        buyers: new Set<string>(),
        orderNumbers: [],
        orders: [],
        sizeTotals: new Map<string, number>(),
        bomTotals: new Map(),
      };
      grouped.set(groupKey, summary);
    }

    summary.orderCount += 1;
    summary.totalOrderQty += Number(order.orderQty ?? 0);
    if (order.buyer?.trim()) summary.buyers.add(order.buyer.trim());
    summary.orderNumbers.push(order.orderNo);

    summary.orders.push({
      id: order.id,
      orderNo: order.orderNo,
      entityName: order.entityName,
      category: order.category,
      subCategory: order.subCategory,
      season,
      article,
      styleName: order.styleName,
      colors: order.colors,
      buyer: order.buyer,
      brand: order.brand,
      sizeGroup: order.sizeGroup,
      orderQty: order.orderQty,
      deliveryDate: toDateOnly(order.deliveryDate),
      finalStatus: order.finalStatus,
      processStatus: order.processStatus,
      finishedGoods: order.finishedGoods.map((row) => ({
        id: row.id,
        buyerSize: row.buyerSize,
        size: row.size,
        beforeExcessQty: row.beforeExcessQty,
        excess: row.excess === null ? null : Number(row.excess),
        excessQty: row.excessQty,
        totalQty: row.totalQty,
      })),
    });

    for (const row of order.finishedGoods) {
      const size = row.size?.trim() || "Unassigned Size";
      summary.sizeTotals.set(size, (summary.sizeTotals.get(size) ?? 0) + Number(row.totalQty ?? 0));
    }

    for (const item of order.bomItems) {
      const key = JSON.stringify([item.rawMaterialName, item.categoryType, item.category, item.subCategory, item.size]);
      let bomItem = summary.bomTotals.get(key);
      if (!bomItem) {
        bomItem = {
          rawMaterialName: item.rawMaterialName ?? "Unassigned Material",
          categoryType: item.categoryType,
          category: item.category,
          subCategory: item.subCategory,
          size: item.size,
          totalRequiredQty: 0,
          affectedOrderNumbers: new Set<string>(),
        };
        summary.bomTotals.set(key, bomItem);
      }
      bomItem.totalRequiredQty += Number(item.totalRequiredQty ?? 0);
      bomItem.affectedOrderNumbers.add(order.orderNo);
    }
  }

  return [...grouped.values()].map((summary) => ({
    season: summary.season,
    article: summary.article,
    orderCount: summary.orderCount,
    totalOrderQty: summary.totalOrderQty,
    buyers: [...summary.buyers].sort(),
    orderNumbers: summary.orderNumbers,
    orders: summary.orders,
    sizes: [...summary.sizeTotals].map(([size, totalQty]) => ({ size, totalQty })),
    bomItems: [...summary.bomTotals.values()].map((item) => ({
      ...item,
      affectedOrderNumbers: [...item.affectedOrderNumbers],
    })),
  }));
}
