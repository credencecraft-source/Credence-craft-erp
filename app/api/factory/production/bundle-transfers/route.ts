import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";

type TransferBody = {
  organizationId?: string;
  action?: "ISSUE" | "ACCEPT";
  transferId?: string;
  workOrderId?: string;
  fromProcessId?: string;
  toProcessId?: string;
  remarks?: string;
  sizeLines?: Array<{ size?: string | null; buyerSize?: string | null; quantity?: number | string }>;
  operationLines?: Array<{ operationId?: string | null; operationName?: string; actualMadeQty?: number | string; billable?: boolean; vendorName?: string; employeeName?: string; actualPrice?: number | string; remarks?: string }>;
};

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as TransferBody;
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const action = body.action === "ACCEPT" ? "ACCEPT" : "ISSUE";

    if (action === "ACCEPT") {
      if (!body.transferId) throw new Error("Bundle transfer is required.");
      const transfer = await prisma.factoryBundleTransfer.findFirst({
        where: { id: body.transferId, organization_id: organization.id },
        include: { sizeLines: true, toProcess: { include: { operations: { select: { id: true } } } } },
      });
      if (!transfer) throw new Error("Bundle transfer was not found.");
      const acceptedLines = (body.sizeLines ?? []).map((line) => ({ size: line.size ?? null, buyerSize: line.buyerSize ?? null, quantity: positiveInteger(line.quantity) })).filter((line) => line.quantity > 0);
      const acceptedQty = acceptedLines.length > 0 ? acceptedLines.reduce((total, line) => total + line.quantity, 0) : transfer.issued_qty - transfer.accepted_qty;
      if (acceptedQty <= 0 || acceptedQty > transfer.issued_qty - transfer.accepted_qty) throw new Error("Accepted quantity exceeds the bundle quantity still pending.");
      const operationLines = (body.operationLines ?? [])
        .map((line) => ({ operationId: line.operationId ?? null, operationName: String(line.operationName ?? "").trim(), actualMadeQty: positiveInteger(line.actualMadeQty), billable: Boolean(line.billable), vendorName: line.vendorName?.trim() || null, employeeName: line.employeeName?.trim() || null, actualPrice: Number(line.actualPrice ?? 0) || null, remarks: line.remarks?.trim() || null }))
        .filter((line) => line.actualMadeQty > 0);
      if (operationLines.length === 0) throw new Error("Add at least one operation GRN line.");
      if (operationLines.some((line) => !line.operationName)) throw new Error("Every GRN line needs an operation.");
      const toProcessOperationIds = new Set(transfer.toProcess.operations.map((operation) => operation.id));
      if (operationLines.some((line) => line.operationId && !toProcessOperationIds.has(line.operationId))) throw new Error("One or more GRN operations do not belong to the receiving process.");
      const result = await prisma.$transaction(async (transaction) => {
        const updatedAcceptedQty = transfer.accepted_qty + acceptedQty;
        const updated = await transaction.factoryBundleTransfer.update({ where: { id: transfer.id }, data: { accepted_qty: updatedAcceptedQty, status: updatedAcceptedQty >= transfer.issued_qty ? "ACCEPTED" : "PARTIALLY_ACCEPTED" } });
        for (const line of acceptedLines) {
          const existingLine = transfer.sizeLines.find((candidate) => candidate.size === line.size && candidate.buyer_size === line.buyerSize);
          if (!existingLine || line.quantity > existingLine.issued_qty - existingLine.accepted_qty) throw new Error("Accepted size quantity exceeds the pending bundle quantity.");
          await transaction.factoryBundleTransferSizeLine.update({ where: { id: existingLine.id }, data: { accepted_qty: { increment: line.quantity } } });
        }
        await transaction.workOrderProcessControllerProcess.update({ where: { id: transfer.to_process_id }, data: { received_qty: { increment: acceptedQty } } });
        for (const line of operationLines) {
          if (line.operationId) {
            await transaction.workOrderProcessControllerOperation.update({ where: { id: line.operationId }, data: { completed_qty: { increment: line.actualMadeQty }, actual_price: line.actualPrice ?? undefined } });
          }
        }
        const grn = await transaction.factoryGrn.create({
          data: {
            organization_id: organization.id,
            grn_no: `GRN-${Date.now()}-${transfer.id.slice(-6)}`,
            grn_date: new Date(),
            work_order_id: transfer.work_order_id,
            bundle_transfer_id: transfer.id,
            from_process_id: transfer.from_process_id,
            to_process_id: transfer.to_process_id,
            received_qty: acceptedQty,
            received_by: user.full_name || user.email,
            remarks: body.remarks?.trim() || null,
            lines: { create: operationLines.map((line) => ({ operation_id: line.operationId, operation_name: line.operationName, actual_made_qty: line.actualMadeQty, received_qty: line.actualMadeQty, billable: line.billable, vendor_name: line.vendorName, employee_name: line.employeeName, actual_price: line.actualPrice, remarks: line.remarks })) },
          },
          include: { lines: true },
        });
        return { transfer: updated, grn };
      }, { maxWait: 10000, timeout: 30000 });
      return NextResponse.json({ ok: true, bundleTransfer: result.transfer, grn: result.grn });
    }

    if (!body.workOrderId || !body.fromProcessId || !body.toProcessId) throw new Error("Source and next process are required.");
    const sizeLines = (body.sizeLines ?? []).map((line) => ({ size: line.size ?? null, buyerSize: line.buyerSize ?? null, quantity: positiveInteger(line.quantity) })).filter((line) => line.quantity > 0);
    const issuedQty = sizeLines.reduce((total, line) => total + line.quantity, 0);
    if (issuedQty <= 0) throw new Error("Enter bundle quantity by size.");

    const processes = await prisma.workOrderProcessControllerProcess.findMany({
      where: { id: { in: [body.fromProcessId, body.toProcessId] }, controller: { work_order_id: body.workOrderId, orderController: { order: { organization_id: organization.id } } } },
      select: { id: true, sl_no: true, process_name: true, completed_qty: true, outgoingBundleTransfers: { select: { issued_qty: true } } },
    });
    const fromProcess = processes.find((process) => process.id === body.fromProcessId);
    const toProcess = processes.find((process) => process.id === body.toProcessId);
    if (!fromProcess || !toProcess || toProcess.sl_no !== fromProcess.sl_no + 1) throw new Error("Bundle transfer must go to the next process in sequence.");
    const alreadyIssuedQty = fromProcess.outgoingBundleTransfers.reduce((total, transfer) => total + transfer.issued_qty, 0);
    if (issuedQty > Math.max(fromProcess.completed_qty - alreadyIssuedQty, 0)) throw new Error("Bundle quantity exceeds the source process quantity available for transfer.");

    const bundleTransfer = await prisma.factoryBundleTransfer.create({
      data: {
        organization_id: organization.id,
        work_order_id: body.workOrderId,
        from_process_id: fromProcess.id,
        to_process_id: toProcess.id,
        issued_qty: issuedQty,
        remarks: body.remarks?.trim() || null,
        sizeLines: { create: sizeLines.map((line) => ({ size: line.size, buyer_size: line.buyerSize, issued_qty: line.quantity })) },
      },
      include: { sizeLines: true },
    });
    return NextResponse.json({ ok: true, bundleTransfer });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save bundle transfer." }, { status: 400 });
  }
}
