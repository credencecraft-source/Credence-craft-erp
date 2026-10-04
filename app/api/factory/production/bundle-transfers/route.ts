import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { reserveChallanNumber } from "@/lib/services/organizations/challan-number-configuration-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";

type SizeLineInput = {
  sourceFinishedGoodsId?: string | null;
  size?: string | null;
  buyerSize?: string | null;
  quantity?: number | string;
};

type TransferBody = {
  organizationId?: string;
  action?: "ISSUE" | "ACCEPT";
  transferId?: string;
  workOrderId?: string;
  fromProcessId?: string;
  toProcessId?: string;
  remarks?: string;
  sizeLines?: SizeLineInput[];
  operationLines?: Array<{
    operationId?: string | null;
    operationName?: string;
    actualMadeQty?: number | string;
    billable?: boolean;
    vendorName?: string;
    employeeName?: string;
    actualPrice?: number | string;
    remarks?: string;
  }>;
};

function normalizeSizeLines(lines: SizeLineInput[] | undefined, requireSource: boolean) {
  if (!Array.isArray(lines) || lines.length > 200) throw new Error("Enter a valid list of size quantities.");
  const normalized = lines.map((line) => {
    const quantity = line.quantity === "" || line.quantity === undefined || line.quantity === null ? 0 : Number(line.quantity);
    const sourceFinishedGoodsId = String(line.sourceFinishedGoodsId ?? "").trim();
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
      throw new Error("Size quantities must be whole numbers greater than or equal to zero.");
    }
    if (quantity > 0 && requireSource && !sourceFinishedGoodsId) {
      throw new Error("Select a source work-order size for each quantity.");
    }
    return { sourceFinishedGoodsId, size: line.size ?? null, buyerSize: line.buyerSize ?? null, quantity };
  }).filter((line) => line.quantity > 0);
  if (normalized.some((line) => line.sourceFinishedGoodsId && normalized.filter((candidate) => candidate.sourceFinishedGoodsId === line.sourceFinishedGoodsId).length > 1)) {
    throw new Error("Each work-order size can appear only once.");
  }
  return normalized;
}

async function serializableTransaction<T>(action: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(action, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error) {
      const canRetry = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!canRetry || attempt === 2) throw error;
    }
  }
  throw new Error("Factory quantities changed concurrently. Refresh WIP and retry.");
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as TransferBody;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const action = body.action === "ACCEPT" ? "ACCEPT" : "ISSUE";

    if (action === "ACCEPT") {
      if (!body.transferId) throw new Error("Bundle transfer is required.");
      const acceptedLines = normalizeSizeLines(body.sizeLines, false);
      const operationLines = (body.operationLines ?? [])
        .map((line) => {
          const actualMadeQty = Number(line.actualMadeQty ?? 0);
          const actualPrice = line.actualPrice === "" || line.actualPrice === undefined || line.actualPrice === null ? null : Number(line.actualPrice);
          const operationName = String(line.operationName ?? "").trim();
          if (!Number.isSafeInteger(actualMadeQty) || actualMadeQty < 0 || actualMadeQty > 2147483647) {
            throw new Error("GRN operation quantities must be whole numbers.");
          }
          if (actualPrice !== null && (!Number.isFinite(actualPrice) || actualPrice < 0)) {
            throw new Error("Operation rates must be valid non-negative amounts.");
          }
          return {
            operationId: line.operationId ?? null,
            operationName,
            actualMadeQty,
            billable: Boolean(line.billable),
            vendorName: String(line.vendorName ?? "").trim() || null,
            employeeName: String(line.employeeName ?? "").trim() || null,
            actualPrice,
            remarks: String(line.remarks ?? "").trim() || null,
          };
        })
        .filter((line) => line.actualMadeQty > 0);
      if (operationLines.length === 0) throw new Error("Add at least one operation GRN line.");
      if (operationLines.some((line) => !line.operationName || line.operationName.length > 255)) throw new Error("Every GRN line needs a valid operation name.");
      if (operationLines.some((line) => line.remarks && line.remarks.length > 1000)) throw new Error("Operation remarks cannot exceed 1000 characters.");
      if (operationLines.some((line) => line.billable && !line.vendorName)) throw new Error("Vendor name is required for billable GRN lines.");

      const result = await serializableTransaction(async (transaction) => {
        const transfer = await transaction.factoryBundleTransfer.findFirst({
          where: { id: body.transferId, organization_id: organization.id },
          include: {
            sizeLines: true,
            toProcess: { include: { operations: true } },
          },
        });
        if (!transfer) throw new Error("Bundle transfer was not found.");
        if (transfer.accepted_qty >= transfer.issued_qty) throw new Error("This bundle transfer has no pending quantity.");

        let linesToAccept = acceptedLines;
        if (linesToAccept.length === 0) {
          linesToAccept = transfer.sizeLines
            .map((line) => ({
              sourceFinishedGoodsId: line.source_finished_goods_id ?? "",
              size: line.size,
              buyerSize: line.buyer_size,
              quantity: line.issued_qty - line.accepted_qty,
            }))
            .filter((line) => line.quantity > 0);
        }
        const acceptedQty = linesToAccept.reduce((total, line) => total + line.quantity, 0);
        if (acceptedQty <= 0 || acceptedQty > transfer.issued_qty - transfer.accepted_qty) {
          throw new Error("Accepted quantity exceeds the bundle quantity still pending.");
        }
        const resolvedLines = linesToAccept.map((line) => {
          let transferLine = line.sourceFinishedGoodsId
            ? transfer.sizeLines.find((candidate) => candidate.source_finished_goods_id === line.sourceFinishedGoodsId)
            : undefined;
          if (!transferLine) {
            const matching = transfer.sizeLines.filter((candidate) => candidate.size === line.size && candidate.buyer_size === line.buyerSize);
            if (matching.length !== 1) throw new Error("Select an unambiguous work-order size for each accepted quantity.");
            transferLine = matching[0];
          }
          if (line.quantity > transferLine.issued_qty - transferLine.accepted_qty) {
            throw new Error("Accepted size quantity exceeds the pending bundle quantity.");
          }
          return { line, transferLine };
        });
        const operationIds = new Set(transfer.toProcess.operations.map((operation) => operation.id));
        if (operationLines.some((line) => line.operationId && !operationIds.has(line.operationId))) {
          throw new Error("One or more GRN operations do not belong to the receiving process.");
        }
        if (operationLines.some((line) => line.actualMadeQty > acceptedQty)) {
          throw new Error("GRN operation quantity cannot exceed the accepted bundle quantity.");
        }
        if (transfer.toProcess.received_qty + acceptedQty > transfer.toProcess.order_qty) {
          throw new Error("Accepted quantity exceeds the receiving process balance.");
        }

        const updatedAcceptedQty = transfer.accepted_qty + acceptedQty;
        const updatedStatus = updatedAcceptedQty >= transfer.issued_qty ? "ACCEPTED" : "PARTIALLY_ACCEPTED";
        const changedTransfer = await transaction.factoryBundleTransfer.updateMany({
          where: { id: transfer.id, accepted_qty: transfer.accepted_qty },
          data: { accepted_qty: { increment: acceptedQty }, status: updatedStatus },
        });
        if (changedTransfer.count !== 1) throw new Error("Bundle balance changed. Refresh WIP and retry.");
        for (const { line, transferLine } of resolvedLines) {
          const updatedLine = await transaction.factoryBundleTransferSizeLine.updateMany({
            where: { id: transferLine.id, accepted_qty: { lte: transferLine.issued_qty - line.quantity } },
            data: { accepted_qty: { increment: line.quantity } },
          });
          if (updatedLine.count !== 1) throw new Error("Accepted size balance changed. Refresh WIP and retry.");
        }
        const changedProcess = await transaction.workOrderProcessControllerProcess.updateMany({
          where: { id: transfer.to_process_id, received_qty: { lte: transfer.toProcess.order_qty - acceptedQty } },
          data: { received_qty: { increment: acceptedQty } },
        });
        if (changedProcess.count !== 1) throw new Error("Receiving process balance changed. Refresh WIP and retry.");
        for (const line of operationLines) {
          if (!line.operationId) continue;
          const operation = transfer.toProcess.operations.find((candidate) => candidate.id === line.operationId);
          if (!operation || operation.completed_qty + line.actualMadeQty > transfer.toProcess.order_qty) {
            throw new Error("Operation quantity exceeds the receiving process balance.");
          }
          const updatedOperation = await transaction.workOrderProcessControllerOperation.updateMany({
            where: { id: operation.id, completed_qty: { lte: transfer.toProcess.order_qty - line.actualMadeQty } },
            data: { completed_qty: { increment: line.actualMadeQty, ...(line.actualPrice !== null ? { actual_price: line.actualPrice } : {}) } },
          });
          if (updatedOperation.count !== 1) throw new Error("Operation balance changed. Refresh WIP and retry.");
        }
        const grn = await transaction.factoryGrn.create({
          data: {
            organization_id: organization.id,
            grn_no: await reserveChallanNumber(organization.id, "FACTORY_GRN", transaction),
            grn_date: new Date(),
            work_order_id: transfer.work_order_id,
            bundle_transfer_id: transfer.id,
            from_process_id: transfer.from_process_id,
            to_process_id: transfer.to_process_id,
            received_qty: acceptedQty,
            received_by: user.full_name,
            remarks: body.remarks?.trim() || null,
            lines: {
              create: operationLines.map((line) => ({
                operation_id: line.operationId,
                operation_name: line.operationName,
                actual_made_qty: line.actualMadeQty,
                received_qty: line.actualMadeQty,
                billable: line.billable,
                vendor_name: line.vendorName,
                employee_name: line.employeeName,
                actual_price: line.actualPrice,
                remarks: line.remarks,
              })),
            },
          },
          include: { lines: true },
        });
        await createAuditEvent({
          organizationId: organization.id,
          userId: user.id,
          module: "Factory Management",
          action: "ACCEPT_BUNDLE_AND_CREATE_GRN",
          entityType: "FactoryGrn",
          entityId: grn.id,
          details: { work_order_id: transfer.work_order_id, transfer_id: transfer.id, accepted_qty: acceptedQty },
        }, transaction);
        return { bundleTransfer: { id: transfer.id, accepted_qty: updatedAcceptedQty, status: updatedStatus }, grn };
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!body.workOrderId || !body.fromProcessId || !body.toProcessId) throw new Error("Source and next process are required.");
    const sizeLines = normalizeSizeLines(body.sizeLines, true);
    const issuedQty = sizeLines.reduce((total, line) => total + line.quantity, 0);
    if (issuedQty <= 0) throw new Error("Enter bundle quantity by size.");
    if (body.remarks && body.remarks.length > 1000) throw new Error("Transfer remarks cannot exceed 1000 characters.");

    const bundleTransfer = await serializableTransaction(async (transaction) => {
      const workOrder = await transaction.factoryWorkOrder.findFirst({
        where: { id: body.workOrderId, organization_id: organization.id },
        select: { id: true, status: true, sizeLines: { select: { source_finished_goods_id: true, size: true, buyer_size: true, quantity: true } } },
      });
      if (!workOrder) throw new Error("Work order was not found in this organization.");
      if (workOrder.status !== "IN PRODUCTION") throw new Error("Set the work order to IN PRODUCTION before issuing bundles.");
      const processes = await transaction.workOrderProcessControllerProcess.findMany({
        where: {
          id: { in: [body.fromProcessId!, body.toProcessId!] },
          controller: { work_order_id: body.workOrderId, orderController: { order: { organization_id: organization.id } } },
        },
        select: {
          id: true,
          sl_no: true,
          process_name: true,
          completed_qty: true,
          outgoingBundleTransfers: { select: { sizeLines: { select: { source_finished_goods_id: true, size: true, buyer_size: true, issued_qty: true } } } },
          productionUpdates: { select: { sizeLines: { select: { source_finished_goods_id: true, size: true, buyer_size: true, quantity: true } } } },
        },
      });
      const fromProcess = processes.find((process) => process.id === body.fromProcessId);
      const toProcess = processes.find((process) => process.id === body.toProcessId);
      if (!fromProcess || !toProcess || toProcess.sl_no !== fromProcess.sl_no + 1) {
        throw new Error("Bundle transfer must go to the next process in sequence.");
      }

      const orderSizes = new Map(workOrder.sizeLines.map((line) => [line.source_finished_goods_id, line]));
      const issuedBySize = new Map<string, number>();
      for (const transfer of fromProcess.outgoingBundleTransfers) {
        for (const line of transfer.sizeLines) {
          let sourceId = line.source_finished_goods_id;
          if (!sourceId) {
            const matches = workOrder.sizeLines.filter((size) => size.size === line.size && size.buyer_size === line.buyer_size);
            if (matches.length === 1) sourceId = matches[0].source_finished_goods_id;
          }
          if (sourceId) issuedBySize.set(sourceId, (issuedBySize.get(sourceId) ?? 0) + line.issued_qty);
        }
      }
      const completedBySize = new Map<string, number>();
      const alreadyIssuedQty = fromProcess.outgoingBundleTransfers.reduce((total, transfer) => (
        total + transfer.sizeLines.reduce((lineTotal, line) => lineTotal + line.issued_qty, 0)
      ), 0);
      for (const update of fromProcess.productionUpdates) {
        for (const line of update.sizeLines) {
          let sourceId = line.source_finished_goods_id;
          if (!sourceId) {
            const matches = workOrder.sizeLines.filter((size) => size.size === line.size && size.buyer_size === line.buyer_size);
            if (matches.length === 1) sourceId = matches[0].source_finished_goods_id;
          }
          if (sourceId) completedBySize.set(sourceId, (completedBySize.get(sourceId) ?? 0) + line.quantity);
        }
      }
      for (const line of sizeLines) {
        const source = orderSizes.get(line.sourceFinishedGoodsId);
        if (!source || source.size !== line.size || source.buyer_size !== line.buyerSize) {
          throw new Error("One or more transfer size lines do not belong to this work order.");
        }
        if (line.quantity > (completedBySize.get(source.source_finished_goods_id) ?? 0) - (issuedBySize.get(source.source_finished_goods_id) ?? 0)) {
          throw new Error(`Bundle quantity exceeds the completed quantity available for size ${source.size || source.buyer_size || "selected"}.`);
        }
      }
      if (issuedQty > fromProcess.completed_qty - alreadyIssuedQty) {
        throw new Error("Bundle quantity exceeds the source process quantity available for transfer.");
      }

      const transfer = await transaction.factoryBundleTransfer.create({
        data: {
          organization_id: organization.id,
          work_order_id: body.workOrderId!,
          from_process_id: fromProcess.id,
          to_process_id: toProcess.id,
          issued_qty: issuedQty,
          remarks: body.remarks?.trim() || null,
          sizeLines: {
            create: sizeLines.map((line) => ({
              source_finished_goods_id: line.sourceFinishedGoodsId,
              size: line.size,
              buyer_size: line.buyerSize,
              issued_qty: line.quantity,
            })),
          },
        },
        include: { sizeLines: true },
      });
      await createAuditEvent({
        organizationId: organization.id,
        userId: user.id,
        module: "Factory Management",
        action: "ISSUE_BUNDLE_TRANSFER",
        entityType: "FactoryBundleTransfer",
        entityId: transfer.id,
        details: { work_order_id: workOrder.id, from_process_id: fromProcess.id, to_process_id: toProcess.id, issued_qty: issuedQty },
      }, transaction);
      return transfer;
    });
    return NextResponse.json({ ok: true, bundleTransfer });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save bundle transfer." }, { status: 400 });
  }
}
