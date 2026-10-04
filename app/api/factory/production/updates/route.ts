import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { prisma } from "@/lib/database/prisma-client";

type UpdateBody = {
  organizationId?: string;
  workOrderId?: string;
  processName?: string;
  operationId?: string;
  updateLevel?: "PROCESS" | "OPERATION";
  completedQty?: number | string;
  vendorBillable?: boolean;
  vendorName?: string;
  employeeName?: string;
  remarks?: string;
  sizeLines?: Array<{ sourceFinishedGoodsId?: string; size?: string | null; buyerSize?: string | null; quantity?: number | string }>;
};

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as UpdateBody;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const updateLevel = body.updateLevel === "OPERATION" ? "OPERATION" : "PROCESS";
    const completedQty = positiveInteger(body.completedQty);
    const sizeLines = (body.sizeLines ?? [])
      .map((line) => ({
        sourceFinishedGoodsId: String(line.sourceFinishedGoodsId ?? "").trim(),
        size: line.size ?? null,
        buyerSize: line.buyerSize ?? null,
        quantity: positiveInteger(line.quantity),
      }))
      .filter((line) => line.quantity > 0);
    const sizeTotal = sizeLines.reduce((total, line) => total + line.quantity, 0);
    const total = sizeTotal || completedQty;
    if (!body.workOrderId || !body.processName || total <= 0) throw new Error("Select a process and enter a completed quantity.");
    if (sizeLines.length === 0 || sizeLines.some((line) => !line.sourceFinishedGoodsId)) {
      throw new Error("Enter completed quantities against the work-order size lines.");
    }
    if (sizeLines.length > 200) throw new Error("A production update cannot contain more than 200 size lines.");
    if (new Set(sizeLines.map((line) => line.sourceFinishedGoodsId)).size !== sizeLines.length) {
      throw new Error("Each work-order size can appear only once in a production update.");
    }
    if (sizeTotal !== total) throw new Error("Production update size quantities do not match the total quantity.");
    const workOrderId = body.workOrderId;
    if (body.vendorBillable && !String(body.vendorName ?? "").trim()) throw new Error("Vendor name is required for billable updates.");

    let process = await prisma.workOrderProcessControllerProcess.findFirst({
      where: {
        controller: { work_order_id: workOrderId, orderController: { order: { organization_id: organization.id } } },
        process_name: String(body.processName).trim(),
      },
      include: { operations: true },
    });
    if (!process) {
      const legacyWorkOrder = await prisma.factoryWorkOrder.findFirst({
        where: { id: workOrderId, organization_id: organization.id },
        include: { order: { include: { processTemplate: true, processSteps: { include: { operations: true } } } } },
      });
      if (legacyWorkOrder?.order.processTemplate && legacyWorkOrder.order.processSteps.length > 0) {
        await prisma.$transaction(async (transaction) => {
          const controller = await transaction.orderProcessController.upsert({
            where: { order_id: legacyWorkOrder.order.id },
            update: {},
            create: { order_id: legacyWorkOrder.order.id, process_template_id: legacyWorkOrder.order.processTemplate!.id },
          });
          const existingProcesses = await transaction.orderProcessControllerProcess.findMany({ where: { controller_id: controller.id } });
          if (existingProcesses.length === 0) {
            for (const step of legacyWorkOrder.order.processSteps) {
              await transaction.orderProcessControllerProcess.create({
                data: {
                  controller_id: controller.id,
                  process_id: step.process_id,
                  process_name: step.process_name,
                  sl_no: step.sl_no,
                  order_qty: legacyWorkOrder.total_qty,
                  operations: { create: step.operations.map((operation) => ({ source_operation_id: operation.source_operation_template_step_id, operation: operation.operation, sl_no: operation.sl_no, budgeted_price: operation.price })) },
                },
              });
            }
          }
          await transaction.workOrderProcessController.upsert({ where: { work_order_id: workOrderId }, update: {}, create: { work_order_id: workOrderId, order_controller_id: controller.id } });
        }, { maxWait: 10000, timeout: 30000 });
        process = await prisma.workOrderProcessControllerProcess.findFirst({
          where: { controller: { work_order_id: workOrderId }, process_name: String(body.processName).trim() },
          include: { operations: true },
        });
      }
    }
    if (!process) throw new Error("The selected work-order process was not found.");
    const operation = updateLevel === "OPERATION" && body.operationId
      ? process.operations.find((item) => item.id === body.operationId)
      : null;
    if (updateLevel === "OPERATION" && !operation) throw new Error("Select an operation for this update.");

    const productionUpdate = await prisma.$transaction(async (transaction) => {
      const workOrder = await transaction.factoryWorkOrder.findFirst({
        where: { id: workOrderId, organization_id: organization.id },
        select: { id: true, status: true, sizeLines: { select: { source_finished_goods_id: true, size: true, buyer_size: true, quantity: true } } },
      });
      const currentProcess = await transaction.workOrderProcessControllerProcess.findFirst({
        where: { id: process.id, controller: { work_order_id: workOrderId } },
        include: { operations: true },
      });
      if (!workOrder || !currentProcess) throw new Error("The work order process was not found.");
      if (workOrder.status !== "IN PRODUCTION") {
        throw new Error("Set the work order to IN PRODUCTION before recording production updates.");
      }
      if (total > currentProcess.order_qty - currentProcess.completed_qty) {
        throw new Error("Production quantity exceeds the process quantity still pending.");
      }

      const sourceRows = new Map(workOrder.sizeLines.map((line) => [line.source_finished_goods_id, line]));
      const requestedBySize = new Map<string, number>();
      for (const line of sizeLines) {
        const source = sourceRows.get(line.sourceFinishedGoodsId);
        if (!source || source.size !== line.size || source.buyer_size !== line.buyerSize) {
          throw new Error("One or more production size lines do not belong to this work order.");
        }
        requestedBySize.set(line.sourceFinishedGoodsId, line.quantity);
      }

      const previousUpdates = await transaction.factoryProductionUpdate.findMany({
        where: { process_id: currentProcess.id },
        select: { completed_qty: true, sizeLines: { select: { source_finished_goods_id: true, size: true, buyer_size: true, quantity: true } } },
      });
      const completedBySize = new Map<string, number>();
      for (const previous of previousUpdates) {
        for (const previousLine of previous.sizeLines) {
          let sourceId = previousLine.source_finished_goods_id;
          if (!sourceId) {
            const legacyMatches = workOrder.sizeLines.filter((row) => row.size === previousLine.size && row.buyer_size === previousLine.buyer_size);
            if (legacyMatches.length === 1) sourceId = legacyMatches[0].source_finished_goods_id;
          }
          if (sourceId && sourceRows.has(sourceId)) {
            completedBySize.set(sourceId, (completedBySize.get(sourceId) ?? 0) + previousLine.quantity);
          }
        }
      }
      for (const [sourceId, quantity] of requestedBySize) {
        const source = sourceRows.get(sourceId)!;
        if (quantity + (completedBySize.get(sourceId) ?? 0) > source.quantity) {
          throw new Error(`Production quantity exceeds the remaining quantity for size ${source.size || source.buyer_size || "selected"}.`);
        }
      }

      const changedProcess = await transaction.workOrderProcessControllerProcess.updateMany({
        where: { id: currentProcess.id, completed_qty: { lte: currentProcess.order_qty - total } },
        data: { completed_qty: { increment: total }, status: "IN_PROGRESS" },
      });
      if (changedProcess.count !== 1) throw new Error("Production balance changed. Refresh WIP and retry.");
      if (operation) {
        const currentOperation = currentProcess.operations.find((item) => item.id === operation.id);
        if (!currentOperation || total > currentProcess.order_qty - currentOperation.completed_qty) {
          throw new Error("Operation quantity exceeds the remaining process quantity.");
        }
        const changedOperation = await transaction.workOrderProcessControllerOperation.updateMany({
          where: { id: operation.id, completed_qty: { lte: currentProcess.order_qty - total } },
          data: { completed_qty: { increment: total } },
        });
        if (changedOperation.count !== 1) throw new Error("Operation balance changed. Refresh WIP and retry.");
      }
      const update = await transaction.factoryProductionUpdate.create({
        data: {
          organization_id: organization.id,
          work_order_id: workOrderId,
          process_id: process.id,
          operation_id: operation?.id ?? null,
          update_level: updateLevel,
          completed_qty: total,
          vendor_billable: Boolean(body.vendorBillable),
          vendor_name: body.vendorName?.trim() || null,
          employee_name: body.employeeName?.trim() || null,
          remarks: body.remarks?.trim() || null,
          sizeLines: { create: sizeLines.map((line) => ({
            source_finished_goods_id: line.sourceFinishedGoodsId,
            size: line.size,
            buyer_size: line.buyerSize,
            quantity: line.quantity,
          })) },
        },
        include: { sizeLines: true },
      });
      await createAuditEvent({
        organizationId: organization.id,
        userId: user.id,
        module: "Factory Management",
        action: "RECORD_PRODUCTION_UPDATE",
        entityType: "FactoryProductionUpdate",
        entityId: update.id,
        details: { work_order_id: workOrderId, process_id: process.id, update_level: updateLevel, completed_qty: total },
      }, transaction);
      return update;
    }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true, productionUpdate });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save production update." }, { status: 400 });
  }
}
