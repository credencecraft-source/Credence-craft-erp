import { prisma } from "@/lib/database/prisma-client";
import type { ShopFloorProcessSummary } from "@/lib/services/factory/shop-floor-board";

export type ShopFloorProcessStatus = "UNASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "TRANSFERRED";

export type ShopFloorQueueItem = {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  orderNo: string;
  processId: string;
  processName: string;
  quantity: number;
  status: ShopFloorProcessStatus;
  batchId: string | null;
  contractorName: string | null;
  laborerName: string | null;
  scannedBy: string | null;
  receivedAt: string | null;
  completedAt: string | null;
};

async function getNextProcessId(organizationId: string, workOrderId: string, processId: string) {
  const workOrder = await prisma.factoryWorkOrder.findFirst({
    where: { id: workOrderId, organization_id: organizationId },
    include: {
      processController: {
        include: {
          processes: {
            orderBy: { sl_no: "asc" },
            include: { operations: true },
          },
        },
      },
    },
  });

  const nextProcess = (workOrder?.processController?.processes ?? []).findIndex((process) => process.process_id === processId);
  if (nextProcess === -1) return null;
  const process = (workOrder?.processController?.processes ?? [])[nextProcess + 1];
  return process?.process_id ?? null;
}

function normalizeShopFloorStatus(status: string): ShopFloorProcessStatus {
  if (status === "ASSIGNED") return "ASSIGNED";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "TRANSFERRED") return "TRANSFERRED";
  return "UNASSIGNED";
}

export async function listShopFloorBoardSummary(
  organizationId: string,
  workOrderId?: string,
  createdBy = "system",
) {
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: {
      organization_id: organizationId,
      ...(workOrderId ? { id: workOrderId } : {}),
    },
    select: {
      id: true,
      total_qty: true,
      created_at: true,
      processController: {
        select: {
          processes: {
            orderBy: { sl_no: "asc" },
            select: { process_id: true, process_name: true, sl_no: true },
          },
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
  });

  if (workOrders.length === 0) return { processes: [] as ShopFloorProcessSummary[] };

  const groupedLogs = await prisma.shopFloorProcessLog.groupBy({
    by: ["work_order_id", "process_id", "status"],
    where: {
      organization_id: organizationId,
      work_order_id: { in: workOrders.map((workOrder) => workOrder.id) },
    },
    _sum: { quantity: true },
    _count: { _all: true },
  });
  const existingProcessPairs = new Set(
    groupedLogs.map((log) => `${log.work_order_id}:${log.process_id}`),
  );
  const missingPools = workOrders.flatMap((workOrder) => {
    const firstProcess = workOrder.processController?.processes[0];
    if (!firstProcess || existingProcessPairs.has(`${workOrder.id}:${firstProcess.process_id}`)) {
      return [];
    }

    return [{
      organization_id: organizationId,
      work_order_id: workOrder.id,
      process_id: firstProcess.process_id,
      quantity: workOrder.total_qty,
      status: "UNASSIGNED",
      scanned_by: createdBy,
      received_at: new Date(),
      completed_at: null,
    }];
  });
  const createdPools = missingPools.length > 0
    ? await prisma.shopFloorProcessLog.createManyAndReturn({
      data: missingPools,
      select: { work_order_id: true, process_id: true, quantity: true, status: true },
    })
    : [];

  const logsByWorkOrderProcess = new Map<string, typeof groupedLogs>();
  for (const log of groupedLogs) {
    const key = `${log.work_order_id}:${log.process_id}`;
    const processLogs = logsByWorkOrderProcess.get(key) ?? [];
    processLogs.push(log);
    logsByWorkOrderProcess.set(key, processLogs);
  }
  for (const log of createdPools) {
    const key = `${log.work_order_id}:${log.process_id}`;
    const processLogs = logsByWorkOrderProcess.get(key) ?? [];
    processLogs.push({
      work_order_id: log.work_order_id,
      process_id: log.process_id,
      status: log.status,
      _sum: { quantity: log.quantity },
      _count: { _all: 1 },
    });
    logsByWorkOrderProcess.set(key, processLogs);
  }

  const processesByName = new Map<string, ShopFloorProcessSummary & { workOrderIds: Set<string> }>();
  for (const workOrder of workOrders) {
    for (const process of workOrder.processController?.processes ?? []) {
      const processName = process.process_name.trim();
      const key = processName.toLocaleLowerCase();
      if (!key) continue;
      let summary = processesByName.get(key);
      if (!summary) {
        summary = {
          id: key,
          processName,
          totalQty: 0,
          workOrderCount: 0,
          batchCount: 0,
          statusCounts: { UNASSIGNED: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, TRANSFERRED: 0 },
          workOrderIds: new Set<string>(),
        };
        processesByName.set(key, summary);
      }

      summary.totalQty += workOrder.total_qty;
      summary.workOrderIds.add(workOrder.id);
      for (const log of logsByWorkOrderProcess.get(`${workOrder.id}:${process.process_id}`) ?? []) {
        const status = normalizeShopFloorStatus(log.status);
        summary.statusCounts[status] += log._sum.quantity ?? 0;
        summary.batchCount += log._count._all;
      }
    }
  }

  return {
    processes: [...processesByName.values()].map(({ workOrderIds, ...process }) => ({
      ...process,
      workOrderCount: workOrderIds.size,
    })),
  };
}

export async function listShopFloorBoard(
  organizationId: string,
  workOrderId?: string,
  createdBy = "system",
  processName?: string,
) {
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: {
      organization_id: organizationId,
      ...(workOrderId ? { id: workOrderId } : {}),
      ...(processName
        ? {
            processController: {
              is: {
                processes: {
                  some: {
                    process_name: { equals: processName, mode: "insensitive" },
                  },
                },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      work_order_no: true,
      total_qty: true,
      status: true,
      created_at: true,
      order: {
        select: {
          orderNo: true,
          styleName: true,
          brand: true,
        },
      },
      processController: {
        select: {
          processes: {
            orderBy: { sl_no: "asc" },
            select: {
              id: true,
              process_id: true,
              process_name: true,
              sl_no: true,
            },
          },
        },
      },
      shopFloorBatches: {
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          process_id: true,
          contractor_name: true,
          laborer_name: true,
          assigned_quantity: true,
          status: true,
          created_at: true,
        },
      },
      shopFloorProcessLogs: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          work_order_id: true,
          process_id: true,
          batch_id: true,
          quantity: true,
          status: true,
          scanned_by: true,
          received_at: true,
          completed_at: true,
          created_at: true,
          batch: {
            select: {
              contractor_name: true,
              laborer_name: true,
            },
          },
        },
      },
      shopFloorTransfers: {
        where: { status: "PENDING_RECEIPT" },
        orderBy: { sent_at: "asc" },
        select: {
          id: true,
          quantity: true,
          work_order_id: true,
          to_process_id: true,
          sent_at: true,
          fromProcess: { select: { process_name: true } },
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
  });

  const missingPools = workOrders.flatMap((workOrder) => {
    const firstProcess = workOrder.processController?.processes[0];
    if (!firstProcess || workOrder.shopFloorProcessLogs.some((log) => log.process_id === firstProcess.process_id)) {
      return [];
    }

    return [{
      organization_id: organizationId,
      work_order_id: workOrder.id,
      process_id: firstProcess.process_id,
      quantity: workOrder.total_qty,
      status: "UNASSIGNED",
      scanned_by: createdBy,
      received_at: new Date(),
      completed_at: null,
    }];
  });

  if (missingPools.length > 0) {
    const createdLogs = await prisma.shopFloorProcessLog.createManyAndReturn({
      data: missingPools,
      select: {
        id: true,
        work_order_id: true,
        process_id: true,
        batch_id: true,
        quantity: true,
        status: true,
        scanned_by: true,
        received_at: true,
        completed_at: true,
        created_at: true,
      },
    });
    const workOrdersById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));
    for (const log of createdLogs) {
      workOrdersById.get(log.work_order_id)?.shopFloorProcessLogs.push({ ...log, batch: null });
    }
  }

  const board = workOrders.flatMap((workOrder) => {
    const processes = workOrder.processController?.processes ?? [];
    if (processes.length === 0) return [];

    const logsByProcessId = new Map<string, typeof workOrder.shopFloorProcessLogs>();
    for (const log of workOrder.shopFloorProcessLogs) {
      const processLogs = logsByProcessId.get(log.process_id) ?? [];
      processLogs.push(log);
      logsByProcessId.set(log.process_id, processLogs);
    }
    const batchesByProcessId = new Map<string, typeof workOrder.shopFloorBatches>();
    for (const batch of workOrder.shopFloorBatches) {
      const processBatches = batchesByProcessId.get(batch.process_id) ?? [];
      processBatches.push(batch);
      batchesByProcessId.set(batch.process_id, processBatches);
    }
    const transfersByProcessId = new Map<string, typeof workOrder.shopFloorTransfers>();
    for (const transfer of workOrder.shopFloorTransfers) {
      if (!transfer.to_process_id) continue;
      const processTransfers = transfersByProcessId.get(transfer.to_process_id) ?? [];
      processTransfers.push(transfer);
      transfersByProcessId.set(transfer.to_process_id, processTransfers);
    }

    return processes.map((process) => {
      const logs = logsByProcessId.get(process.process_id) ?? [];
      const batches = batchesByProcessId.get(process.process_id) ?? [];
      const incomingTransfers = transfersByProcessId.get(process.process_id) ?? [];
      const statusCounts = { UNASSIGNED: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, TRANSFERRED: 0 };

      for (const log of logs) {
        const normalized = normalizeShopFloorStatus(log.status);
        statusCounts[normalized] += log.quantity;
      }

      return {
        id: process.process_id,
        controllerProcessId: process.id,
        workOrderId: workOrder.id,
        workOrderNo: workOrder.work_order_no,
        orderNo: workOrder.order.orderNo,
        processName: process.process_name,
        totalQty: workOrder.total_qty,
        statusCounts,
        batches: batches.map((batch) => ({
          id: batch.id,
          contractorName: batch.contractor_name,
          laborerName: batch.laborer_name,
          assignedQuantity: batch.assigned_quantity,
          status: batch.status,
          createdAt: batch.created_at.toISOString(),
        })),
        queue: logs.map((log) => ({
          id: log.id,
          workOrderId: log.work_order_id,
          workOrderNo: workOrder.work_order_no,
          processId: log.process_id,
          processName: process.process_name,
          quantity: log.quantity,
          status: normalizeShopFloorStatus(log.status),
          batchId: log.batch_id,
          contractorName: log.batch?.contractor_name ?? null,
          laborerName: log.batch?.laborer_name ?? null,
          scannedBy: log.scanned_by,
          receivedAt: log.received_at ? log.received_at.toISOString() : null,
          completedAt: log.completed_at ? log.completed_at.toISOString() : null,
        })),
        incomingTransfers: incomingTransfers.map((transfer) => ({
          id: transfer.id,
          quantity: transfer.quantity,
          workOrderId: transfer.work_order_id,
          workOrderNo: workOrder.work_order_no,
          fromProcessName: transfer.fromProcess.process_name,
          sentAt: transfer.sent_at.toISOString(),
        })),
      };
    });
  });

  return {
    workOrders: workOrders.map((workOrder) => ({
      id: workOrder.id,
      workOrderNo: workOrder.work_order_no,
      orderNo: workOrder.order.orderNo,
      styleName: workOrder.order.styleName,
      brand: workOrder.order.brand,
      orderQty: workOrder.total_qty,
      status: workOrder.status,
      processCount: workOrder.processController?.processes.length ?? 0,
    })),
    processes: board,
  };
}

export async function assignWorkToBatch(
  organizationId: string,
  workOrderId: string,
  processId: string,
  quantity: number,
  userId: string,
  values: { contractorName?: string | null; laborerName?: string | null } = {},
) {
  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) throw new Error("Assign a valid positive quantity.");

  const workOrder = await prisma.factoryWorkOrder.findFirst({
    where: { id: workOrderId, organization_id: organizationId },
    select: { id: true, total_qty: true },
  });
  if (!workOrder) throw new Error("The selected work order was not found.");

  const process = await prisma.workOrderProcessControllerProcess.findFirst({
    where: {
      process_id: processId,
      controller: { work_order_id: workOrderId, orderController: { order: { organization_id: organizationId } } },
    },
  });
  if (!process) throw new Error("The selected process was not found for the work order.");

  return prisma.$transaction(async (transaction) => {
    const unassignedLogs = await transaction.shopFloorProcessLog.findMany({
      where: {
        organization_id: organizationId,
        work_order_id: workOrderId,
        process_id: processId,
        status: "UNASSIGNED",
      },
      orderBy: { created_at: "asc" },
    });
    const poolAvailable = unassignedLogs.reduce((total, log) => total + log.quantity, 0);
    if (poolAvailable < parsedQuantity) {
      throw new Error("The work order does not have enough unassigned quantity available to assign.");
    }

    const batch = await transaction.batchMaster.create({
      data: {
        organization_id: organizationId,
        work_order_id: workOrderId,
        process_id: processId,
        contractor_name: values.contractorName?.trim() || null,
        laborer_name: values.laborerName?.trim() || null,
        assigned_quantity: parsedQuantity,
        created_by: userId,
      },
    });

    let remaining = parsedQuantity;
    for (const unassignedLog of unassignedLogs) {
      if (remaining <= 0) break;
      const consumed = Math.min(unassignedLog.quantity, remaining);
      const updated = await transaction.shopFloorProcessLog.updateMany({
        where: {
          id: unassignedLog.id,
          organization_id: organizationId,
          status: "UNASSIGNED",
          quantity: { gte: consumed },
        },
        data: { quantity: { decrement: consumed } },
      });
      if (updated.count !== 1) {
        throw new Error("The available pool quantity changed during assignment. Refresh and try again.");
      }
      if (consumed === unassignedLog.quantity) {
        await transaction.shopFloorProcessLog.deleteMany({
          where: { id: unassignedLog.id, organization_id: organizationId, status: "UNASSIGNED", quantity: 0 },
        });
      }
      remaining -= consumed;
    }

    if (remaining > 0) {
      throw new Error("Insufficient unassigned pool quantity was available to complete the assignment.");
    }

    const assignedLog = await transaction.shopFloorProcessLog.create({
      data: {
        organization_id: organizationId,
        work_order_id: workOrderId,
        process_id: processId,
        batch_id: batch.id,
        quantity: parsedQuantity,
        status: "ASSIGNED",
        scanned_by: userId,
        received_at: new Date(),
      },
    });

    return {
      batchId: batch.id,
      assignedLogId: assignedLog.id,
      quantity: parsedQuantity,
    };
  });
}

export async function updateProcessLogStatus(
  organizationId: string,
  logId: string,
  status: ShopFloorProcessStatus,
  scannedBy: string,
) {
  const nextStatus = normalizeShopFloorStatus(status);
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.shopFloorProcessLog.findFirst({
      where: { id: logId, organization_id: organizationId },
    });
    if (!current) throw new Error("The selected floor log entry was not found.");

    const validNextStatus = current.status === "ASSIGNED" && nextStatus === "IN_PROGRESS"
      || current.status === "IN_PROGRESS" && nextStatus === "COMPLETED";
    if (!validNextStatus) {
      throw new Error("Only assigned work can be started, and only in-progress work can be completed.");
    }

    const updated = await transaction.shopFloorProcessLog.updateMany({
      where: { id: logId, organization_id: organizationId, status: current.status },
      data: {
        status: nextStatus,
        scanned_by: scannedBy,
        received_at: current.received_at ?? new Date(),
        completed_at: nextStatus === "COMPLETED" ? new Date() : current.completed_at,
      },
    });
    if (updated.count !== 1) throw new Error("The floor status changed before this action completed. Refresh and try again.");

    if (current.batch_id) {
      await transaction.batchMaster.updateMany({
        where: { id: current.batch_id, organization_id: organizationId },
        data: { status: nextStatus === "IN_PROGRESS" ? "IN_PROGRESS" : "COMPLETED" },
      });
    }

    return { ...current, status: nextStatus, scanned_by: scannedBy };
  });
}

export async function createShopFloorTransfer(
  organizationId: string,
  workOrderId: string,
  logId: string,
  userId: string,
) {
  const current = await prisma.shopFloorProcessLog.findFirst({
    where: { id: logId, organization_id: organizationId, work_order_id: workOrderId },
    include: { batch: true },
  });

  if (!current) throw new Error("The selected process log was not found.");
  if (current.status !== "COMPLETED") {
    throw new Error("Only completed quantities can be transferred to the next process.");
  }

  const nextProcessId = await getNextProcessId(organizationId, workOrderId, current.process_id);
  const existingTransfer = await prisma.shopFloorTransfer.findFirst({
    where: { organization_id: organizationId, source_log_id: current.id },
    select: { id: true },
  });
  if (existingTransfer) throw new Error("This completed quantity has already been transferred.");
  const transfer = await prisma.$transaction(async (transaction) => {
    const stillCompleted = await transaction.shopFloorProcessLog.findFirst({
      where: { id: current.id, organization_id: organizationId, status: "COMPLETED" },
      select: { id: true },
    });
    if (!stillCompleted) throw new Error("The completed quantity changed before transfer. Refresh and try again.");
    const created = await transaction.shopFloorTransfer.create({
      data: {
        organization_id: organizationId,
        work_order_id: workOrderId,
        source_log_id: current.id,
        from_process_id: current.process_id,
        to_process_id: nextProcessId,
        quantity: current.quantity,
        status: nextProcessId ? "PENDING_RECEIPT" : "COMPLETED",
        is_final: !nextProcessId,
        sent_by: userId,
      },
    });

    await transaction.shopFloorProcessLog.update({
      where: { id: current.id },
      data: {
        status: "TRANSFERRED",
        scanned_by: userId,
        completed_at: new Date(),
      },
    });

    return created;
  });

  if (!nextProcessId) {
    return { transfer, receivingProcessId: null };
  }

  return { transfer, receivingProcessId: nextProcessId };
}

export async function acceptShopFloorTransfer(organizationId: string, transferId: string, userId: string) {
  const transfer = await prisma.shopFloorTransfer.findFirst({
    where: { id: transferId, organization_id: organizationId },
  });

  if (!transfer) throw new Error("The selected transfer was not found.");
  const receivingProcessId = transfer.to_process_id;
  if (!receivingProcessId) {
    throw new Error("Final transfer quantities do not require receiving-pool acceptance.");
  }
  if (transfer.status !== "PENDING_RECEIPT") {
    throw new Error("This transfer has already been received or is no longer awaiting receipt.");
  }

  return prisma.$transaction(async (transaction) => {
    const pendingTransfer = await transaction.shopFloorTransfer.findFirst({
      where: { id: transferId, organization_id: organizationId, status: "PENDING_RECEIPT", to_process_id: receivingProcessId },
    });
    if (!pendingTransfer) throw new Error("This transfer has already been received or is no longer awaiting receipt.");

    const createdPool = await transaction.shopFloorProcessLog.create({
      data: {
        organization_id: organizationId,
        work_order_id: pendingTransfer.work_order_id,
        process_id: receivingProcessId,
        quantity: pendingTransfer.quantity,
        status: "UNASSIGNED",
        scanned_by: userId,
        received_at: new Date(),
      },
    });

    const received = await transaction.shopFloorTransfer.updateMany({
      where: { id: transferId, organization_id: organizationId, status: "PENDING_RECEIPT" },
      data: {
        status: "RECEIVED",
        received_by: userId,
        received_at: new Date(),
      },
    });
    if (received.count !== 1) throw new Error("This transfer was already accepted. Refresh the board.");

    return {
      poolLogId: createdPool.id,
      quantity: pendingTransfer.quantity,
      processId: receivingProcessId,
    };
  });
}
