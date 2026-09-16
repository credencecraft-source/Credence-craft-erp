import { prisma } from "@/lib/database/prisma-client";

export async function listWorkInProgress(organizationId: string) {
  const workOrders = await prisma.factoryWorkOrder.findMany({
    where: { organization_id: organizationId },
    include: {
      order: {
        select: {
          orderNo: true,
          styleName: true,
          brand: true,
          buyer: true,
          orderQty: true,
          processSteps: {
            orderBy: { sl_no: "asc" },
            include: { operations: { orderBy: { sl_no: "asc" } } },
          },
        },
      },
      processController: {
        include: {
          processes: {
            include: {
              operations: true,
              incomingBundleTransfers: { include: { sizeLines: true, fromProcess: { select: { process_name: true } } }, orderBy: { created_at: "desc" } },
              outgoingBundleTransfers: { include: { sizeLines: true, toProcess: { select: { process_name: true } } }, orderBy: { created_at: "desc" } },
            },
            orderBy: { sl_no: "asc" },
          },
        },
      },
      sizeLines: true,
    },
    orderBy: [{ created_at: "desc" }, { work_order_no: "desc" }],
    take: 200,
  });

  return workOrders.flatMap((workOrder) => {
    const processes = workOrder.processController?.processes.length
        ? workOrder.processController.processes.map((process, index, allProcesses) => ({
          id: process.id,
          isFirstProcess: index === 0,
          processName: process.process_name,
          orderQty: process.order_qty,
          completedQty: process.completed_qty,
          createdQty: process.created_qty,
          processStatus: process.status,
          receivedQty: process.received_qty,
          nextProcessId: allProcesses[index + 1]?.id ?? null,
          operations: process.operations.map((operation) => ({
            id: operation.id,
            operation: operation.operation,
            slNo: operation.sl_no,
            budgetedPrice: Number(operation.budgeted_price),
            actualPrice: operation.actual_price === null ? null : Number(operation.actual_price),
            completedQty: operation.completed_qty,
            qualityStatus: operation.quality_status,
            remarks: operation.remarks,
          })),
          incomingTransfers: process.incomingBundleTransfers.map((transfer) => {
            const pendingQty = transfer.sizeLines.reduce((total, line) => total + Math.max(line.issued_qty - line.accepted_qty, 0), 0);
            return { id: transfer.id, issuedQty: transfer.issued_qty, acceptedQty: transfer.accepted_qty, pendingQty, status: transfer.status, fromProcessName: transfer.fromProcess.process_name, sizeLines: transfer.sizeLines };
          }),
          outgoingTransfers: process.outgoingBundleTransfers.map((transfer) => {
            const pendingQty = transfer.sizeLines.reduce((total, line) => total + Math.max(line.issued_qty - line.accepted_qty, 0), 0);
            return { id: transfer.id, issuedQty: transfer.issued_qty, acceptedQty: transfer.accepted_qty, pendingQty, status: transfer.status, toProcessId: transfer.to_process_id, toProcessName: transfer.toProcess.process_name, sizeLines: transfer.sizeLines };
          }),
        }))
        : workOrder.order.processSteps.map((process, index) => ({
          id: `${workOrder.id}:${process.id}`,
          isFirstProcess: index === 0,
          processName: process.process_name,
          orderQty: workOrder.total_qty,
          completedQty: 0,
          createdQty: 0,
          processStatus: "OPEN",
          receivedQty: 0,
          nextProcessId: null,
          operations: process.operations.map((operation) => ({
            id: operation.id,
            operation: operation.operation,
            slNo: operation.sl_no,
            budgetedPrice: Number(operation.price),
            actualPrice: null,
            completedQty: 0,
            qualityStatus: null,
            remarks: null,
          })),
          incomingTransfers: [],
          outgoingTransfers: [],
        }));

    return processes.map((process) => ({
      id: process.id,
      workOrderId: workOrder.id,
      workOrderNo: workOrder.work_order_no,
      orderNo: workOrder.order.orderNo,
      styleName: workOrder.order.styleName,
      brand: workOrder.order.brand,
      buyer: workOrder.order.buyer,
      orderQty: process.orderQty,
      completedQty: process.completedQty,
      pendingQty: Math.max(process.orderQty - process.completedQty, 0),
      createdQty: process.createdQty,
      processName: process.processName,
      processStatus: process.processStatus,
      operations: process.operations,
      processId: process.id,
      nextProcessId: process.nextProcessId,
      receivedQty: process.receivedQty,
      incomingTransfers: process.incomingTransfers,
      outgoingTransfers: process.outgoingTransfers,
      pendingReceiptQty: process.incomingTransfers.reduce((total, transfer) => total + transfer.pendingQty, 0),
      bundleTransferredQty: process.outgoingTransfers.reduce((total, transfer) => total + transfer.issuedQty, 0),
      bundleAcceptedQty: process.outgoingTransfers.reduce((total, transfer) => total + transfer.acceptedQty, 0),
      bundleYetToTransferQty: Math.max(process.completedQty - process.outgoingTransfers.reduce((total, transfer) => total + transfer.issuedQty, 0), 0),
      flowInQty: process.isFirstProcess
        ? process.orderQty
        : process.incomingTransfers.reduce((total, transfer) => total + transfer.acceptedQty, 0),
      flowWipQty: Math.max(
        (process.isFirstProcess
          ? process.orderQty
          : process.incomingTransfers.reduce((total, transfer) => total + transfer.acceptedQty, 0))
          - process.outgoingTransfers.reduce((total, transfer) => total + transfer.acceptedQty, 0),
        0,
      ),
      flowOutIssuedQty: process.outgoingTransfers.reduce((total, transfer) => total + transfer.issuedQty, 0),
      flowOutAcceptedQty: process.outgoingTransfers.reduce((total, transfer) => total + transfer.acceptedQty, 0),
      sizeLines: workOrder.sizeLines.map((line) => ({ size: line.size, buyerSize: line.buyer_size, quantity: line.quantity })),
    }));
  });
}
