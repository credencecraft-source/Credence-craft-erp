import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
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
  sizeLines?: Array<{ size?: string | null; buyerSize?: string | null; quantity?: number | string }>;
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
      .map((line) => ({ size: line.size ?? null, buyerSize: line.buyerSize ?? null, quantity: positiveInteger(line.quantity) }))
      .filter((line) => line.quantity > 0);
    const sizeTotal = sizeLines.reduce((total, line) => total + line.quantity, 0);
    const total = sizeTotal || completedQty;
    if (!body.workOrderId || !body.processName || total <= 0) throw new Error("Select a process and enter a completed quantity.");
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
      await transaction.workOrderProcessControllerProcess.update({
        where: { id: process.id },
        data: { completed_qty: { increment: total }, status: "IN_PROGRESS" },
      });
      if (operation) {
        await transaction.workOrderProcessControllerOperation.update({
          where: { id: operation.id },
          data: { completed_qty: { increment: total } },
        });
      }
      return transaction.factoryProductionUpdate.create({
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
          sizeLines: { create: sizeLines.map((line) => ({ size: line.size, buyer_size: line.buyerSize, quantity: line.quantity })) },
        },
        include: { sizeLines: true },
      });
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ ok: true, productionUpdate });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save production update." }, { status: 400 });
  }
}
