import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { splitBomSizes } from "@/lib/services/orders/order-quantity-calculations";

export type WorkOrderQuantityInput = {
  sourceFinishedGoodsId?: string;
  quantity?: number | string;
};

export type WorkOrderUpdateInput = {
  status?: string;
  lines?: WorkOrderQuantityInput[];
};

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
function positiveNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildWorkOrderBomLines(bomItems: any[], sizeLines: Array<{ size: string | null; quantity: number }>, workOrderQty: number) {
  return bomItems.map((item: any) => {
      const selectedSizes = splitBomSizes(item.size);
      const itemWorkOrderQty = selectedSizes.length > 0
        ? sizeLines.filter((line) => selectedSizes.includes(String(line.size ?? "").trim())).reduce((sum, line) => sum + line.quantity, 0)
        : workOrderQty;
      const internalConsumption = positiveNumber(item.internalConsumption ?? item.consumption);
      const excessPercentage = positiveNumber(item.itemWiseExcessPercentage);
      const requiredQty = internalConsumption * itemWorkOrderQty;
      const excessQty = requiredQty * excessPercentage / 100;
      return {
        source_bom_item_id: item.id,
        category_type: item.categoryType,
        category: item.category,
        sub_category: item.subCategory,
        raw_material_name: item.rawMaterialName,
        size: item.size,
        work_order_qty: itemWorkOrderQty,
        internal_consumption: internalConsumption,
        internal_price: item.internalPrice === null || item.internalPrice === undefined ? null : Number(item.internalPrice),
        required_qty: requiredQty,
        item_wise_excess_percentage: excessPercentage,
        item_wise_excess_qty: excessQty,
        total_required_qty: requiredQty + excessQty,
      };
    });
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
    if (!order) throw new Error("Order number was not found in this organization.");
    if (order.finishedGoods.length === 0) throw new Error("This order has no size-wise quantities configured.");

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
        work_order_no: `WO-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
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

    return {
      ...createdWorkOrder,
      bomLines,
      processTemplateId: order.processTemplate?.id ?? order.process_template_id ?? null,
      processTemplate: mapProcessTemplate(order.processTemplate),
      processSteps: mapProcessSteps(order.processSteps),
      processController: workOrderProcessController,
    };
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}

export async function listWorkOrders(organizationId: string) {
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
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
    take: 100,
  });

  return workOrders.map((workOrder) => ({
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
  }));
}

export async function updateWorkOrder(organizationId: string, workOrderId: string, input: WorkOrderUpdateInput) {
  const status = String(input.status ?? "").trim();
  const normalizedLines = (input.lines ?? [])
    .map((line) => ({ sourceFinishedGoodsId: String(line.sourceFinishedGoodsId ?? ""), quantity: positiveInteger(line.quantity) }))
    .filter((line) => line.sourceFinishedGoodsId && line.quantity > 0);

  if (status.length > 50) throw new Error("Work order status is too long.");
  if (normalizedLines.length === 0) throw new Error("Enter a quantity for at least one size.");

  const sourceIds = new Set<string>();
  for (const line of normalizedLines) {
    if (sourceIds.has(line.sourceFinishedGoodsId)) throw new Error("Each size can only appear once in a work order.");
    sourceIds.add(line.sourceFinishedGoodsId);
  }

  return prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.factoryWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId },
      include: {
        order: { include: { finishedGoods: true, workOrders: { include: { sizeLines: true } } } },
        sizeLines: true,
        bomLines: true,
      },
    });
    if (!workOrder) throw new Error("Work order was not found in this organization.");

    const sourceRows = new Map(workOrder.order.finishedGoods.map((row) => [row.id, row]));
    const allocatedBySize = new Map<string, number>();
    for (const otherWorkOrder of workOrder.order.workOrders) {
      if (otherWorkOrder.id === workOrderId) continue;
      for (const line of otherWorkOrder.sizeLines) {
        allocatedBySize.set(line.source_finished_goods_id, (allocatedBySize.get(line.source_finished_goods_id) ?? 0) + line.quantity);
      }
    }
    const totalQty = normalizedLines.reduce((total, line) => {
      const sourceRow = sourceRows.get(line.sourceFinishedGoodsId);
      if (!sourceRow) throw new Error("One or more selected sizes do not belong to this order.");
      const remainingQty = Math.max((sourceRow.totalQty ?? 0) - (allocatedBySize.get(sourceRow.id) ?? 0), 0);
      if (line.quantity > remainingQty) throw new Error(`The quantity for size ${sourceRow.size || sourceRow.buyerSize || "selected"} exceeds the remaining order quantity.`);
      return total + line.quantity;
    }, 0);

    const updatedWorkOrder = await transaction.factoryWorkOrder.update({
      where: { id: workOrderId },
      data: {
        ...(status ? { status } : {}),
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
    const bomItems = await transaction.billOfMaterialItem.findMany({ where: { order_id: workOrder.order_id } });
    const bomLines = buildWorkOrderBomLines(bomItems, normalizedLines.map((line) => ({ size: sourceRows.get(line.sourceFinishedGoodsId)!.size, quantity: line.quantity })), totalQty);
    await transaction.factoryWorkOrderBomLine.deleteMany({ where: { work_order_id: workOrderId } });
    if (bomLines.length > 0) {
      await transaction.factoryWorkOrderBomLine.createMany({ data: bomLines.map((line) => ({ ...line, work_order_id: workOrderId })) });
    }
    await transaction.workOrderProcessControllerProcess.updateMany({
      where: { controller: { work_order_id: workOrderId } },
      data: { order_qty: totalQty },
    });

    return { ...updatedWorkOrder, bomLines };
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}

export async function deleteWorkOrder(organizationId: string, workOrderId: string) {
  await prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.factoryWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId },
      select: { id: true },
    });
    if (!workOrder) throw new Error("Work order was not found in this organization.");

    // Remove report history before operational records because report lines protect their work order.
    await transaction.factoryDailyProductionReportLine.deleteMany({ where: { work_order_id: workOrderId } });
    await transaction.factoryGrn.deleteMany({ where: { work_order_id: workOrderId } });
    await transaction.factoryBundleTransfer.deleteMany({ where: { work_order_id: workOrderId } });

    await transaction.factoryWorkOrder.delete({ where: { id: workOrderId } });
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}
