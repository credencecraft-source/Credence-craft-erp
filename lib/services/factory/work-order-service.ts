import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { splitBomSizes } from "@/lib/services/orders/order-quantity-calculations";

export type WorkOrderQuantityInput = {
  sourceFinishedGoodsId?: string;
  quantity?: number | string;
};

export type WorkOrderUpdateInput = {
  status?: string;
  lines?: WorkOrderQuantityInput[];
};

export type WorkOrderCreateInput = {
  orderNo: string;
  lines: WorkOrderQuantityInput[];
};

function positiveDecimal(value: unknown) {
  const parsed = new Prisma.Decimal(String(value ?? 0));
  return parsed.isFinite() && parsed.greaterThan(0) ? parsed : new Prisma.Decimal(0);
}

type WorkOrderBomLineData = {
  source_bom_item_id: string;
  category_type: string | null;
  category: string | null;
  sub_category: string | null;
  raw_material_name: string | null;
  size: string | null;
  work_order_qty: number;
  internal_consumption: string;
  internal_price: string | null;
  required_qty: string;
  item_wise_excess_percentage: string;
  item_wise_excess_qty: string;
  total_required_qty: string;
};

function buildWorkOrderBomLines(bomItems: any[], sizeLines: Array<{ size: string | null; quantity: number }>, workOrderQty: number): WorkOrderBomLineData[] {
  return bomItems.map((item: any) => {
      const selectedSizes = splitBomSizes(item.size);
      const itemWorkOrderQty = selectedSizes.length > 0
        ? sizeLines.filter((line) => selectedSizes.includes(String(line.size ?? "").trim())).reduce((sum, line) => sum + line.quantity, 0)
        : workOrderQty;
      const internalConsumption = positiveDecimal(item.internalConsumption ?? item.consumption);
      const excessPercentage = positiveDecimal(item.itemWiseExcessPercentage);
      const requiredQty = internalConsumption.mul(itemWorkOrderQty);
      const excessQty = requiredQty.mul(excessPercentage).div(100);
      return {
        source_bom_item_id: item.id,
        category_type: item.categoryType,
        category: item.category,
        sub_category: item.subCategory,
        raw_material_name: item.rawMaterialName,
        size: item.size,
        work_order_qty: itemWorkOrderQty,
        internal_consumption: internalConsumption.toFixed(4),
        internal_price: item.internalPrice === null || item.internalPrice === undefined ? null : new Prisma.Decimal(String(item.internalPrice)).toFixed(4),
        required_qty: requiredQty.toFixed(2),
        item_wise_excess_percentage: excessPercentage.toFixed(2),
        item_wise_excess_qty: excessQty.toFixed(2),
        total_required_qty: requiredQty.plus(excessQty).toFixed(2),
      };
    });
  }

export async function listOrdersByArticle(organizationId: string, article: string, options: { cursor?: string; limit?: number } = {}) {
  const normalizedArticle = article.trim();
  const take = Math.min(Math.max(options.limit ?? 50, 1), 100);
  if (options.cursor) {
    const cursorRecord = await prisma.merchandisingOrder.findFirst({
      where: { id: options.cursor, organization_id: organizationId, article: { equals: normalizedArticle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!cursorRecord) throw new Error("The order list changed. Search the article again.");
  }
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId, article: { equals: normalizedArticle, mode: "insensitive" } },
    select: { id: true, orderNo: true, article: true, styleName: true, orderQty: true },
    orderBy: [{ created_at: "desc" }, { orderNo: "asc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });

  const hasMore = orders.length > take;
  const page = hasMore ? orders.slice(0, take) : orders;
  return { orders: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

export async function listWorkOrderAllocationsByArticle(organizationId: string, article: string, options: { cursor?: string; limit?: number } = {}) {
  const normalizedArticle = article.trim();
  const take = Math.min(Math.max(options.limit ?? 50, 1), 100);
  if (options.cursor) {
    const cursorRecord = await prisma.merchandisingOrder.findFirst({
      where: { id: options.cursor, organization_id: organizationId, article: { equals: normalizedArticle, mode: "insensitive" } },
      select: { id: true },
    });
    if (!cursorRecord) throw new Error("The order allocation list changed. Search the article again.");
  }
  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId, article: { equals: normalizedArticle, mode: "insensitive" } },
    select: {
      id: true,
      orderNo: true,
      styleName: true,
      buyer: true,
      orderQty: true,
      finishedGoods: { select: { id: true, size: true, buyerSize: true, totalQty: true } },
      workOrders: { select: { sizeLines: { select: { source_finished_goods_id: true, quantity: true } } } },
    },
    orderBy: [{ created_at: "desc" }, { orderNo: "asc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });

  const hasMore = orders.length > take;
  const page = hasMore ? orders.slice(0, take) : orders;
  const allocations = page.map((order) => {
    const allocated = new Map<string, number>();
    for (const workOrder of order.workOrders) {
      for (const line of workOrder.sizeLines) {
        allocated.set(line.source_finished_goods_id, (allocated.get(line.source_finished_goods_id) ?? 0) + line.quantity);
      }
    }
    return {
      order: { orderNo: order.orderNo, styleName: order.styleName, buyer: order.buyer, orderQty: order.orderQty },
      sizes: order.finishedGoods.map((row) => {
        const allocatedQty = allocated.get(row.id) ?? 0;
        const orderedQty = row.totalQty ?? 0;
        return { id: row.id, size: row.size, buyerSize: row.buyerSize, orderedQty, allocatedQty, remainingQty: Math.max(orderedQty - allocatedQty, 0) };
      }),
    };
  });
  return { allocations, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

function mapProcessTemplate(template: { id?: string; value_id?: string | null; process_name?: string | null } | null | undefined) {
  if (!template) return null;
  return {
    id: template.id,
    value_id: template.value_id ?? null,
    process_name: template.process_name ?? null,
    Process_Template_Name: template.process_name ?? null,
  };
}

function mapProcessSteps(steps: Array<any> = []) {
  return steps.map((step) => ({
    id: step.id,
    process_id: step.process_id ?? step.process?.id ?? null,
    process_name: step.process_name ?? step.process?.process_name ?? null,
    sl_no: step.sl_no,
    operation_template_name: step.operation_template_name ?? step.operationTemplateName ?? null,
    operations: Array.isArray(step.operations) ? step.operations.map((operation: any) => ({
      id: operation.id,
      source_operation_template_step_id: operation.source_operation_template_step_id ?? operation.sourceOperationId ?? null,
      operation: operation.operation,
      sl_no: operation.sl_no,
      price: operation.price !== null && operation.price !== undefined ? Number(operation.price) : 0,
    })) : [],
  }));
}

function mapWorkOrderProcessController(controller: any) {
  if (!controller) return null;
  return {
    id: controller.id,
    orderControllerId: controller.order_controller_id,
    processes: (controller.processes ?? []).map((process: any) => ({
      id: process.id,
      processId: process.process_id,
      processName: process.process_name,
      slNo: process.sl_no,
      orderQty: process.order_qty,
      createdQty: process.created_qty,
      completedQty: process.completed_qty,
      status: process.status,
      operations: (process.operations ?? []).map((operation: any) => ({
        id: operation.id,
        sourceOperationId: operation.source_operation_id,
        operation: operation.operation,
        slNo: operation.sl_no,
        budgetedPrice: Number(operation.budgeted_price),
        actualPrice: operation.actual_price === null ? null : Number(operation.actual_price),
        createdQty: operation.created_qty,
        completedQty: operation.completed_qty,
        qualityStatus: operation.quality_status,
        remarks: operation.remarks,
      })),
    })),
  };
}

async function ensureOrderProcessController(transaction: any, order: any) {
  if (!order.processTemplate || order.processSteps.length === 0) return null;

  const existing = await transaction.orderProcessController.findUnique({
    where: { order_id: order.id },
    include: { processes: { include: { operations: true }, orderBy: { sl_no: "asc" } } },
  });
  if (existing) return existing;

  const controller = await transaction.orderProcessController.create({
    data: { order_id: order.id, process_template_id: order.processTemplate.id },
  });
  for (const step of order.processSteps) {
    await transaction.orderProcessControllerProcess.create({
      data: {
        controller_id: controller.id,
        process_id: step.process_id,
        process_name: step.process_name,
        sl_no: step.sl_no,
        order_qty: Number(order.orderQty ?? 0),
        operations: {
          create: step.operations.map((operation: any) => ({
            source_operation_id: operation.source_operation_template_step_id,
            operation: operation.operation,
            sl_no: operation.sl_no,
            budgeted_price: operation.price,
          })),
        },
      },
    });
  }
  return transaction.orderProcessController.findUnique({
    where: { id: controller.id },
    include: { processes: { include: { operations: true }, orderBy: { sl_no: "asc" } } },
  });
}

async function createWorkOrderProcessController(transaction: any, workOrderId: string, controller: any, workOrderQty: number) {
  if (!controller) return null;
  return transaction.workOrderProcessController.create({
    data: {
      work_order_id: workOrderId,
      order_controller_id: controller.id,
      processes: {
        create: controller.processes.map((process: any) => ({
          source_process_id: process.id,
          process_id: process.process_id,
          process_name: process.process_name,
          sl_no: process.sl_no,
          order_qty: workOrderQty,
          operations: {
            create: process.operations.map((operation: any) => ({
              source_operation_id: operation.id,
              operation: operation.operation,
              sl_no: operation.sl_no,
              budgeted_price: operation.budgeted_price,
            })),
          },
        })),
      },
    },
    include: { processes: { include: { operations: true }, orderBy: { sl_no: "asc" } } },
  });
}

export async function getWorkOrderAllocation(organizationId: string, orderNo: string) {
  const order = await prisma.merchandisingOrder.findFirst({
    where: { organization_id: organizationId, orderNo: orderNo.trim() },
    include: {
      finishedGoods: true,
      processTemplate: { select: { id: true, value_id: true, process_name: true } },
      processSteps: {
        orderBy: { sl_no: "asc" },
        include: {
          process: { select: { id: true, value_id: true, process_name: true } },
          operations: { orderBy: { sl_no: "asc" } },
        },
      },
      processController: {
        include: { processes: { include: { operations: true }, orderBy: { sl_no: "asc" } } },
      },
      workOrders: {
        include: {
          sizeLines: true,
          bomLines: true,
          processController: { include: { processes: { include: { operations: true }, orderBy: { sl_no: "asc" } } } },
        },
        orderBy: { created_at: "desc" },
      },
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
    order: {
      id: order.id,
      orderNo: order.orderNo,
      styleName: order.styleName,
      buyer: order.buyer,
      brand: order.brand,
      orderQty: order.orderQty,
      processTemplateId: order.processTemplate?.id ?? order.process_template_id ?? null,
      processTemplate: mapProcessTemplate(order.processTemplate),
      processSteps: mapProcessSteps(order.processSteps),
    },
    sizes: order.finishedGoods.map((row) => ({ id: row.id, size: row.size, buyerSize: row.buyerSize, orderedQty: row.totalQty ?? 0, allocatedQty: allocated.get(row.id) ?? 0, remainingQty: Math.max((row.totalQty ?? 0) - (allocated.get(row.id) ?? 0), 0) })),
    workOrders: order.workOrders.map((workOrder) => ({
      id: workOrder.id,
      workOrderNo: workOrder.work_order_no,
      totalQty: workOrder.total_qty,
      status: workOrder.status,
      createdAt: workOrder.created_at,
      sizeLines: workOrder.sizeLines.map((line) => ({
        id: line.id,
        sourceFinishedGoodsId: line.source_finished_goods_id,
        size: line.size,
        buyerSize: line.buyer_size,
        quantity: line.quantity,
      })),
      bomLines: workOrder.bomLines.map((line) => ({
        id: line.id,
        sourceBomItemId: line.source_bom_item_id,
        categoryType: line.category_type,
        category: line.category,
        subCategory: line.sub_category,
        rawMaterialName: line.raw_material_name,
        size: line.size,
        workOrderQty: Number(line.work_order_qty),
        internalConsumption: line.internal_consumption === null ? null : Number(line.internal_consumption),
        internalPrice: line.internal_price === null ? null : Number(line.internal_price),
        requiredQty: Number(line.required_qty),
        itemWiseExcessPercentage: line.item_wise_excess_percentage === null ? null : Number(line.item_wise_excess_percentage),
        itemWiseExcessQty: Number(line.item_wise_excess_qty),
        totalRequiredQty: Number(line.total_required_qty),
      })),
      processTemplateId: order.processTemplate?.id ?? order.process_template_id ?? null,
      processTemplate: mapProcessTemplate(order.processTemplate),
      processSteps: mapProcessSteps(order.processSteps),
      processController: mapWorkOrderProcessController((workOrder as any).processController),
    })),
  };
}

async function createWorkOrderInTransaction(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  orderNo: string,
  lines: WorkOrderQuantityInput[],
) {
  const normalizedLines = lines
    .map((line) => {
      const sourceFinishedGoodsId = String(line.sourceFinishedGoodsId ?? "").trim();
      const rawQuantity = line.quantity === "" || line.quantity === undefined || line.quantity === null ? 0 : Number(line.quantity);
      if (!sourceFinishedGoodsId || !Number.isSafeInteger(rawQuantity) || rawQuantity < 0 || rawQuantity > 2147483647) {
        throw new Error("Each size needs a valid whole-number quantity.");
      }
      return { sourceFinishedGoodsId, quantity: rawQuantity };
    })
    .filter((line) => line.quantity > 0);

  if (normalizedLines.length === 0) throw new Error(`Enter a quantity for at least one size on order ${orderNo}.`);
  if (normalizedLines.length > 200) throw new Error("A work order cannot contain more than 200 size lines.");

  const duplicateIds = new Set<string>();
  for (const line of normalizedLines) {
    if (duplicateIds.has(line.sourceFinishedGoodsId)) throw new Error("Each size can only appear once in a work order.");
    duplicateIds.add(line.sourceFinishedGoodsId);
  }

  const order = await transaction.merchandisingOrder.findFirst({
      where: { organization_id: organizationId, orderNo: orderNo.trim() },
      include: {
        finishedGoods: true,
        processTemplate: { select: { id: true, value_id: true, process_name: true } },
        processSteps: {
          orderBy: { sl_no: "asc" },
          include: {
            process: { select: { id: true, value_id: true, process_name: true } },
            operations: { orderBy: { sl_no: "asc" } },
          },
        },
        bomItems: true,
        workOrders: { include: { sizeLines: true } },
      },
    });
  if (!order) throw new Error(`Order ${orderNo} was not found in this organization.`);
  if (order.finishedGoods.length === 0) throw new Error(`Order ${orderNo} has no size-wise quantities configured.`);

  const orderProcessController = await ensureOrderProcessController(transaction, order);

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

  const createdWorkOrder = await transaction.factoryWorkOrder.create({
      data: {
        organization_id: organizationId,
        order_id: order.id,
        order_no: order.orderNo,
        work_order_no: await reserveChallanNumber(organizationId, "FACTORY_WO", transaction),
        total_qty: totalQty,
        sizeLines: { create: normalizedLines.map((line) => { const sourceRow = sourceRows.get(line.sourceFinishedGoodsId)!; return { source_finished_goods_id: sourceRow.id, size: sourceRow.size, buyer_size: sourceRow.buyerSize, quantity: line.quantity }; }) },
      },
      include: { sizeLines: true },
    });
  const bomLines = buildWorkOrderBomLines(order.bomItems, normalizedLines.map((line) => ({ size: sourceRows.get(line.sourceFinishedGoodsId)!.size, quantity: line.quantity })), totalQty);
  if (bomLines.length > 0) {
    await transaction.factoryWorkOrderBomLine.createMany({ data: bomLines.map((line) => ({ ...line, work_order_id: createdWorkOrder.id })) });
  }
  const workOrderProcessController = await createWorkOrderProcessController(transaction, createdWorkOrder.id, orderProcessController, totalQty);
  await createAuditEvent({
    organizationId,
    userId,
    module: "Factory Management",
    action: "CREATE_WORK_ORDER",
    entityType: "FactoryWorkOrder",
    entityId: createdWorkOrder.id,
    details: { work_order_no: createdWorkOrder.work_order_no, order_no: order.orderNo, total_qty: totalQty },
  }, transaction);

  return {
    ...createdWorkOrder,
    bomLines,
    processTemplateId: order.processTemplate?.id ?? order.process_template_id ?? null,
    processTemplate: mapProcessTemplate(order.processTemplate),
    processSteps: mapProcessSteps(order.processSteps),
    processController: workOrderProcessController,
  };
}

export async function createWorkOrders(organizationId: string, userId: string, requests: WorkOrderCreateInput[]) {
  if (requests.length === 0) throw new Error("Add at least one order to create work orders.");
  if (requests.length > 50) throw new Error("Create work orders for no more than 50 orders at a time.");

  const orderNos = new Set<string>();
  for (const request of requests) {
    const orderNo = request.orderNo.trim();
    if (!orderNo || orderNo.length > 100) throw new Error("Every work order needs a valid order number.");
    if (orderNos.has(orderNo)) throw new Error(`Order ${orderNo} appears more than once in this batch.`);
    if (!Array.isArray(request.lines) || request.lines.length > 200) throw new Error(`Order ${orderNo} has an invalid size-line list.`);
    orderNos.add(orderNo);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const created = [];
        for (const request of requests) {
          created.push(await createWorkOrderInTransaction(transaction, organizationId, userId, request.orderNo.trim(), request.lines));
        }
        return created;
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      const canRetry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!canRetry || attempt === 2) throw error;
    }
  }
  throw new Error("Work order creation could not be serialized. Please retry.");
}

export async function createWorkOrder(organizationId: string, userId: string, orderNo: string, lines: WorkOrderQuantityInput[]) {
  const [workOrder] = await createWorkOrders(organizationId, userId, [{ orderNo, lines }]);
  return workOrder;
}

export async function listWorkOrders(organizationId: string, options: { cursor?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 200);
  if (options.cursor) {
    const cursorRecord = await prisma.factoryWorkOrder.findFirst({
      where: { id: options.cursor, organization_id: organizationId },
      select: { id: true },
    });
    if (!cursorRecord) throw new Error("The work-order list changed. Refresh the report and try again.");
  }
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: { organization_id: organizationId },
    include: {
      order: {
        select: {
          orderNo: true,
          article: true,
          styleName: true,
          brand: true,
        },
      },
      sizeLines: true,
      bomLines: true,
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: take + 1,
  });
  const hasMore = workOrders.length > take;
  const page = hasMore ? workOrders.slice(0, take) : workOrders;

  return {
    workOrders: page.map((workOrder) => ({
      id: workOrder.id,
      workOrderNo: workOrder.work_order_no,
      orderNo: workOrder.order.orderNo,
      article: workOrder.order.article,
      styleName: workOrder.order.styleName,
      brand: workOrder.order.brand,
      totalQty: workOrder.total_qty,
      status: workOrder.status,
      createdAt: workOrder.created_at,
      sizeLines: workOrder.sizeLines.map((line) => ({ size: line.size || line.buyer_size || "Unspecified", quantity: line.quantity })),
      bomLines: workOrder.bomLines.map((line) => ({
        id: line.id,
        rawMaterialName: line.raw_material_name,
        category: line.category,
        size: line.size,
        workOrderQty: Number(line.work_order_qty),
        requiredQty: Number(line.required_qty),
        totalRequiredQty: Number(line.total_required_qty),
      })),
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function updateWorkOrder(organizationId: string, userId: string, workOrderId: string, input: WorkOrderUpdateInput) {
  const status = String(input.status ?? "").trim();
  if (status && !["OPEN", "IN PRODUCTION", "READY FOR PACKING", "CLOSED"].includes(status)) {
    throw new Error("Select a valid work order status.");
  }

  return prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.factoryWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId },
      include: {
        order: { include: { finishedGoods: true, workOrders: { include: { sizeLines: true } } } },
        sizeLines: true,
        bomLines: true,
        processController: { include: { processes: { select: { sl_no: true, order_qty: true, completed_qty: true, received_qty: true } } } },
        productionUpdates: { select: { id: true }, take: 1 },
        bundleTransfers: { select: { issued_qty: true, accepted_qty: true } },
        grns: { select: { id: true }, take: 1 },
      },
    });
    if (!workOrder) throw new Error("Work order was not found in this organization.");

    const allowedNextStatuses: Record<string, string[]> = {
      OPEN: ["IN PRODUCTION"],
      "IN PRODUCTION": ["READY FOR PACKING"],
      "READY FOR PACKING": [],
      CLOSED: [],
    };
    if (status && status !== workOrder.status && !allowedNextStatuses[workOrder.status]?.includes(status)) {
      if (status === "CLOSED") throw new Error("Work orders cannot be closed until the finished-goods packing and dispatch workflow is available.");
      throw new Error(`Work order cannot move from ${workOrder.status} to ${status}.`);
    }
    const processRows = [...(workOrder.processController?.processes ?? [])].sort((left, right) => left.sl_no - right.sl_no);
    if (status === "IN PRODUCTION" && workOrder.status === "OPEN" && processRows.length === 0) {
      throw new Error("Add a process template to the source order before releasing this work order to production.");
    }
    if (status === "READY FOR PACKING" && workOrder.status !== "READY FOR PACKING") {
      if (processRows.length === 0 || processRows.some((process) => process.completed_qty < process.order_qty)) {
        throw new Error("Every work-order process must be fully completed before it is marked ready for packing.");
      }
      if (workOrder.bundleTransfers.some((transfer) => transfer.accepted_qty < transfer.issued_qty)) {
        throw new Error("A bundle transfer is still awaiting receipt. Complete all GRNs before marking the work order ready.");
      }
    }

    const hasProductionActivity = workOrder.productionUpdates.length > 0
      || workOrder.bundleTransfers.length > 0
      || workOrder.grns.length > 0
      || workOrder.processController?.processes.some((process) => process.completed_qty > 0 || process.received_qty > 0) === true;
    let normalizedLines: Array<{ sourceFinishedGoodsId: string; quantity: number }> | null = null;
    if (input.lines !== undefined) {
      normalizedLines = input.lines
        .map((line) => {
          const sourceFinishedGoodsId = String(line.sourceFinishedGoodsId ?? "").trim();
          const rawQuantity = line.quantity === "" || line.quantity === undefined || line.quantity === null ? 0 : Number(line.quantity);
          if (!sourceFinishedGoodsId || !Number.isSafeInteger(rawQuantity) || rawQuantity <= 0 || rawQuantity > 2147483647) {
            throw new Error("Each work-order size needs a positive whole-number quantity.");
          }
          return { sourceFinishedGoodsId, quantity: rawQuantity };
        });
      if (normalizedLines.length === 0 || normalizedLines.length > 200) throw new Error("A work order must contain between 1 and 200 size lines.");
      const sourceIds = new Set<string>();
      for (const line of normalizedLines) {
        if (sourceIds.has(line.sourceFinishedGoodsId)) throw new Error("Each size can only appear once in a work order.");
        sourceIds.add(line.sourceFinishedGoodsId);
      }
    }

    const sourceRows = new Map(workOrder.order.finishedGoods.map((row) => [row.id, row]));
    const allocatedBySize = new Map<string, number>();
    for (const otherWorkOrder of workOrder.order.workOrders) {
      if (otherWorkOrder.id === workOrderId) continue;
      for (const line of otherWorkOrder.sizeLines) {
        allocatedBySize.set(line.source_finished_goods_id, (allocatedBySize.get(line.source_finished_goods_id) ?? 0) + line.quantity);
      }
    }
    const quantityChanged = normalizedLines !== null && (
      normalizedLines.length !== workOrder.sizeLines.length
      || normalizedLines.some((line) => !workOrder.sizeLines.some((existing) =>
        existing.source_finished_goods_id === line.sourceFinishedGoodsId && existing.quantity === line.quantity))
    );
    if (quantityChanged && hasProductionActivity) {
      throw new Error("Work-order quantities are locked after production activity. Use a controlled adjustment instead.");
    }

    let updatedSizeLines = workOrder.sizeLines;
    let updatedTotalQty = workOrder.total_qty;
    let updatedBomLines = workOrder.bomLines;
    if (quantityChanged && normalizedLines) {
      const totalQty = normalizedLines.reduce((total, line) => {
        const sourceRow = sourceRows.get(line.sourceFinishedGoodsId);
        if (!sourceRow) throw new Error("One or more selected sizes do not belong to this order.");
        const remainingQty = Math.max((sourceRow.totalQty ?? 0) - (allocatedBySize.get(sourceRow.id) ?? 0), 0);
        if (line.quantity > remainingQty) throw new Error(`The quantity for size ${sourceRow.size || sourceRow.buyerSize || "selected"} exceeds the remaining order quantity.`);
        return total + line.quantity;
      }, 0);
      const result = await transaction.factoryWorkOrder.update({
        where: { id: workOrderId },
        data: {
          total_qty: totalQty,
          sizeLines: {
            deleteMany: {},
            create: normalizedLines.map((line) => {
              const sourceRow = sourceRows.get(line.sourceFinishedGoodsId)!;
              return { source_finished_goods_id: sourceRow.id, size: sourceRow.size, buyer_size: sourceRow.buyerSize, quantity: line.quantity };
            }),
          },
        },
        include: { sizeLines: true },
      });
      updatedSizeLines = result.sizeLines;
      updatedTotalQty = result.total_qty;
      const bomItems = await transaction.billOfMaterialItem.findMany({ where: { order_id: workOrder.order_id } });
      const bomLines = buildWorkOrderBomLines(bomItems, normalizedLines.map((line) => ({ size: sourceRows.get(line.sourceFinishedGoodsId)!.size, quantity: line.quantity })), totalQty);
      await transaction.factoryWorkOrderBomLine.deleteMany({ where: { work_order_id: workOrderId } });
      if (bomLines.length > 0) {
        await transaction.factoryWorkOrderBomLine.createMany({ data: bomLines.map((line) => ({ ...line, work_order_id: workOrderId })) });
      }
      updatedBomLines = await transaction.factoryWorkOrderBomLine.findMany({ where: { work_order_id: workOrderId } });
      await transaction.workOrderProcessControllerProcess.updateMany({
        where: { controller: { work_order_id: workOrderId } },
        data: { order_qty: totalQty },
      });
    }
    if (status && status !== workOrder.status) {
      await transaction.factoryWorkOrder.update({
        where: { id: workOrderId },
        data: { status },
      });
    }
    if (quantityChanged || (status && status !== workOrder.status)) {
      await createAuditEvent({
        organizationId,
        userId,
        module: "Factory Management",
        action: quantityChanged ? "UPDATE_WORK_ORDER_QUANTITY" : "UPDATE_WORK_ORDER_STATUS",
        entityType: "FactoryWorkOrder",
        entityId: workOrderId,
        details: {
          previous_status: workOrder.status,
          next_status: status || workOrder.status,
          previous_qty: workOrder.total_qty,
          next_qty: updatedTotalQty,
        },
      }, transaction);
    }
    return {
      ...workOrder,
      total_qty: updatedTotalQty,
      status: status || workOrder.status,
      sizeLines: updatedSizeLines,
      bomLines: updatedBomLines.map((line) => ({
        id: line.id,
        sourceBomItemId: line.source_bom_item_id,
        categoryType: line.category_type,
        category: line.category,
        subCategory: line.sub_category,
        rawMaterialName: line.raw_material_name,
        size: line.size,
        workOrderQty: Number(line.work_order_qty),
        internalConsumption: line.internal_consumption === null ? null : Number(line.internal_consumption),
        internalPrice: line.internal_price === null ? null : Number(line.internal_price),
        requiredQty: Number(line.required_qty),
        itemWiseExcessPercentage: line.item_wise_excess_percentage === null ? null : Number(line.item_wise_excess_percentage),
        itemWiseExcessQty: Number(line.item_wise_excess_qty),
        totalRequiredQty: Number(line.total_required_qty),
      })),
    };
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}

export async function deleteWorkOrder(organizationId: string, userId: string, workOrderId: string) {
  await prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.factoryWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId },
      select: {
        id: true,
        status: true,
        productionUpdates: { select: { id: true }, take: 1 },
        bundleTransfers: { select: { id: true }, take: 1 },
        grns: { select: { id: true }, take: 1 },
        dailyProductionReportLines: { select: { id: true }, take: 1 },
        processController: { select: { processes: { where: { OR: [{ completed_qty: { gt: 0 } }, { received_qty: { gt: 0 } }] }, select: { id: true }, take: 1 } } },
      },
    });
    if (!workOrder) throw new Error("Work order was not found in this organization.");
    const hasActivity = workOrder.productionUpdates.length > 0
      || workOrder.bundleTransfers.length > 0
      || workOrder.grns.length > 0
      || workOrder.dailyProductionReportLines.length > 0
      || (workOrder.processController?.processes.length ?? 0) > 0;
    if (hasActivity || workOrder.status !== "OPEN") {
      throw new Error("Only an untouched OPEN work order can be deleted. Cancel or reverse operational activity instead.");
    }

    await createAuditEvent({
      organizationId,
      userId,
      module: "Factory Management",
      action: "DELETE_WORK_ORDER",
      entityType: "FactoryWorkOrder",
      entityId: workOrderId,
    }, transaction);
    await transaction.factoryWorkOrder.delete({ where: { id: workOrderId } });
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}
