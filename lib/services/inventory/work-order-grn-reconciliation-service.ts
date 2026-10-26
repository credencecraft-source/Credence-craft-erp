import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

const grnReconciliationSelect = {
  id: true,
  grn_no: true,
  status: true,
  lines: {
    select: {
      id: true,
      size: true,
      buyer_size: true,
      approved_quantity: true,
      advance_booked_quantity: true,
      general_inventory_quantity: true,
      generalStockReceipt: {
        select: {
          id: true,
          organization_id: true,
          quantity_in: true,
          quantity_out: true,
          current_stock: true,
        },
      },
      bookingAllocations: {
        select: {
          id: true,
          organization_id: true,
          allocated_quantity: true,
          bookingAssignment: {
            select: {
              bookingSizeLine: {
                select: {
                  booking: { select: { booking_no: true } },
                },
              },
            },
          },
          finishedGoodsStockReceipt: {
            select: {
              id: true,
              organization_id: true,
              grn_allocation_id: true,
              quantity_in: true,
              quantity_out: true,
              current_stock: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.WorkOrderInventoryGrnSelect;

type OutwardLine = {
  id: string;
  source_stock_id: string;
  status: string;
  requested_quantity: Prisma.Decimal;
  picked_quantity: Prisma.Decimal;
  shipped_quantity: Prisma.Decimal;
  request: { id: string; request_no: string; status: string };
};

type IssuedItem = {
  bookingNo: string;
  quantityIssued: number;
  reservedQuantity: number;
  requestNo: string;
  requestId: string;
  requestStatus: string;
};

type ReconciliationLine = {
  lineId: string;
  size: string;
  approvedQuantity: number | null;
  allocatedQuantity: number;
  currentGeneralQuantity: number | null;
  expectedAllocatedQuantity: number | null;
  expectedGeneralQuantity: number | null;
  currentAllocatedQuantity: number | null;
  changed: boolean;
  skipped: string | null;
  blockers: string[];
  issuedItems: IssuedItem[];
};

type ReconciliationRecord = {
  grnId: string;
  grnNo: string;
  status: string;
  lines: ReconciliationLine[];
};

function validStockLedger(input: {
  quantity_in: number;
  quantity_out: number;
  current_stock: number;
}) {
  return Number.isSafeInteger(input.quantity_in)
    && Number.isSafeInteger(input.quantity_out)
    && Number.isSafeInteger(input.current_stock)
    && input.quantity_in >= 0
    && input.quantity_out >= 0
    && input.current_stock >= 0
    && input.current_stock + input.quantity_out === input.quantity_in;
}

export async function reconcileSelectedWorkOrderGrns(
  organizationId: string,
  userId: string,
  grnIds: string[],
  apply: boolean,
) {
  if (grnIds.length < 1 || grnIds.length > 100 || grnIds.some((id) => !id.trim())) {
    throw new Error("Select between 1 and 100 Work Order GRNs to reconcile.");
  }
  const selectedIds = [...new Set(grnIds)];
  if (selectedIds.length !== grnIds.length) {
    throw new Error("The selected Work Order GRNs contain duplicates. Refresh and try again.");
  }

  return prisma.$transaction(async (transaction) => {
    const records = await transaction.workOrderInventoryGrn.findMany({
      where: { organization_id: organizationId, id: { in: selectedIds } },
      select: grnReconciliationSelect,
    });
    if (records.length !== selectedIds.length) {
      throw new Error("One or more selected Work Order GRNs were not found in this organization.");
    }

    const allocatedReceiptIds = records.flatMap((record) =>
      record.lines.flatMap((line) => line.bookingAllocations.flatMap((allocation) =>
        allocation.finishedGoodsStockReceipt ? [allocation.finishedGoodsStockReceipt.id] : [],
      )),
    );
    const outwardLines: OutwardLine[] = allocatedReceiptIds.length > 0
      ? await transaction.finishedGoodsOutwardRequestLine.findMany({
          where: {
            organization_id: organizationId,
            source_stock_type: "ALLOCATED",
            source_stock_id: { in: allocatedReceiptIds },
          },
          select: {
            id: true,
            source_stock_id: true,
            status: true,
            picked_quantity: true,
            shipped_quantity: true,
            requested_quantity: true,
            request: {
              select: { id: true, request_no: true, status: true },
            },
          },
        })
      : [];
    const outwardLinesByReceiptId = new Map<string, OutwardLine[]>();
    for (const line of outwardLines) {
      const lines = outwardLinesByReceiptId.get(line.source_stock_id) ?? [];
      lines.push(line);
      outwardLinesByReceiptId.set(line.source_stock_id, lines);
    }

    const results: ReconciliationRecord[] = [];
    const auditDetails: Array<Record<string, unknown>> = [];
    for (const record of records) {
      const lineResults: ReconciliationLine[] = [];
      const changedLines: Array<Record<string, unknown>> = [];
      const issuedItems: IssuedItem[] = [];
      for (const line of record.lines) {
        const label = line.size || line.buyer_size || "Unspecified size";
        const blockers: string[] = [];
        const allocationQuantities = line.bookingAllocations.map((allocation) => allocation.allocated_quantity);
        const allocatedQuantity = allocationQuantities.reduce((total, quantity) => total + quantity, 0);
        const approvedQuantity = line.approved_quantity;
        const lineIssuedItems: IssuedItem[] = [];

        for (const allocation of line.bookingAllocations) {
          const receipt = allocation.finishedGoodsStockReceipt;
          if (
            allocation.organization_id !== organizationId
            || !receipt
            || receipt.organization_id !== organizationId
            || receipt.grn_allocation_id !== allocation.id
            || receipt.quantity_in !== allocation.allocated_quantity
            || !validStockLedger(receipt)
          ) {
            blockers.push(`Booking allocation ${allocation.id} has an inconsistent stock receipt.`);
            continue;
          }
          const relatedOutwardLines = outwardLinesByReceiptId.get(receipt.id) ?? [];
          let linkedShippedQuantity = 0;
          for (const outwardLine of relatedOutwardLines) {
            const picked = Number(outwardLine.picked_quantity);
            const shipped = Number(outwardLine.shipped_quantity);
            const requested = Number(outwardLine.requested_quantity);
            linkedShippedQuantity += shipped;
            const reserved = Math.max(requested - shipped, 0);
            if (shipped > 0 || picked > 0 || (outwardLine.request.status !== "CANCELLED" && reserved > 0)) {
              lineIssuedItems.push({
                bookingNo: allocation.bookingAssignment.bookingSizeLine.booking.booking_no,
                quantityIssued: shipped,
                reservedQuantity: outwardLine.request.status === "CANCELLED" ? 0 : reserved,
                requestNo: outwardLine.request.request_no,
                requestId: outwardLine.request.id,
                requestStatus: outwardLine.request.status,
              });
            }
          }
          if (linkedShippedQuantity > receipt.quantity_out) {
            blockers.push(`Booking allocation ${allocation.id} issued quantity exceeds its stock receipt ledger.`);
          }
          const unlinkedIssuedQuantity = receipt.quantity_out - linkedShippedQuantity;
          if (unlinkedIssuedQuantity > 0) {
            lineIssuedItems.push({
              bookingNo: allocation.bookingAssignment.bookingSizeLine.booking.booking_no,
              quantityIssued: unlinkedIssuedQuantity,
              reservedQuantity: 0,
              requestNo: "Unlinked stock issue",
              requestId: "",
              requestStatus: "ISSUED",
            });
          }
        }
        const uniqueIssuedItems = [...new Map(lineIssuedItems.map((item) => [
          `${item.requestId}:${item.bookingNo}`,
          item,
        ])).values()];

        if (approvedQuantity === null) {
          lineResults.push({
            lineId: line.id,
            size: label,
            approvedQuantity: null,
            allocatedQuantity,
            currentGeneralQuantity: line.general_inventory_quantity,
            expectedAllocatedQuantity: null,
            expectedGeneralQuantity: null,
            currentAllocatedQuantity: line.advance_booked_quantity,
            changed: false,
            skipped: "This line is still awaiting verification.",
            blockers,
            issuedItems: uniqueIssuedItems,
          });
          continue;
        }

        if (
          !Number.isSafeInteger(approvedQuantity)
          || approvedQuantity < 0
          || allocationQuantities.some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0)
          || !Number.isSafeInteger(allocatedQuantity)
          || allocatedQuantity > approvedQuantity
        ) {
          blockers.push("Allocation records exceed or invalidate the approved quantity.");
        }

        const expectedGeneralQuantity = approvedQuantity - allocatedQuantity;
        const generalReceipt = line.generalStockReceipt;
        if (expectedGeneralQuantity > 0 && !generalReceipt) {
          blockers.push("Approved general-stock quantity has no source receipt.");
        }
        if (generalReceipt && (
          generalReceipt.organization_id !== organizationId
          || !validStockLedger(generalReceipt)
        )) {
          blockers.push("The general-stock receipt ledger is inconsistent.");
        }

        const changed = blockers.length === 0 && (
          line.advance_booked_quantity !== allocatedQuantity
          || line.general_inventory_quantity !== expectedGeneralQuantity
        );
        if (apply && changed) {
          const updated = await transaction.workOrderInventoryGrnLine.updateMany({
            where: {
              id: line.id,
              grn_id: record.id,
              grn: { organization_id: organizationId },
              approved_quantity: line.approved_quantity,
              advance_booked_quantity: line.advance_booked_quantity,
              general_inventory_quantity: line.general_inventory_quantity,
            },
            data: {
              advance_booked_quantity: allocatedQuantity,
              general_inventory_quantity: expectedGeneralQuantity,
            },
          });
          if (updated.count !== 1) {
            throw new Error(`GRN ${record.grn_no} changed during reconciliation. Reload and try again.`);
          }
          changedLines.push({
            lineId: line.id,
            size: label,
            approvedQuantity,
            previousAllocatedQuantity: line.advance_booked_quantity,
            allocatedQuantity,
            previousGeneralQuantity: line.general_inventory_quantity,
            generalQuantity: expectedGeneralQuantity,
          });
        }

        lineResults.push({
          lineId: line.id,
          size: label,
          approvedQuantity,
          allocatedQuantity,
          currentGeneralQuantity: line.general_inventory_quantity,
          expectedAllocatedQuantity: allocatedQuantity,
          expectedGeneralQuantity,
          currentAllocatedQuantity: line.advance_booked_quantity,
          changed: apply ? changed && blockers.length === 0 : changed,
          skipped: null,
          blockers,
          issuedItems: uniqueIssuedItems,
        });
        issuedItems.push(...lineIssuedItems);
      }
      if (changedLines.length > 0) {
        auditDetails.push({
          grnId: record.id,
          grnNo: record.grn_no,
          lines: changedLines,
          issuedItems,
        });
      }
      results.push({
        grnId: record.id,
        grnNo: record.grn_no,
        status: record.status,
        lines: lineResults,
      });
    }

    if (apply && auditDetails.length > 0) {
      for (const entry of auditDetails) {
        await createAuditEvent({
          organizationId,
          userId,
          module: "Inventory Management",
          action: "RECONCILE_WORK_ORDER_GRN_ALLOCATION_TOTALS",
          entityType: "WorkOrderInventoryGrn",
          entityId: String(entry.grnId),
          details: entry,
        }, transaction);
      }
    }

    return { applied: apply, records: results };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10000,
    timeout: 30000,
  });
}
