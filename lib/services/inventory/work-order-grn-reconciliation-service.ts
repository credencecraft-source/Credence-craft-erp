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
  source_stock_type: string;
  source_stock_id: string;
  status: string;
  requested_quantity: Prisma.Decimal;
  picked_quantity: Prisma.Decimal;
  shipped_quantity: Prisma.Decimal;
  request: { id: string; request_no: string; status: string };
};

type StockReceiptReconciliation = {
  stockType: "GENERAL" | "ALLOCATED";
  receiptId: string;
  currentQuantityOut: number;
  expectedQuantityOut: number;
  currentStock: number;
  expectedCurrentStock: number;
  changed: boolean;
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
  stockReceipts: StockReceiptReconciliation[];
  issuedItems: IssuedItem[];
};

type ReconciliationRecord = {
  grnId: string;
  grnNo: string;
  status: string;
  lines: ReconciliationLine[];
};

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
    const generalReceiptIds = records.flatMap((record) =>
      record.lines.flatMap((line) => line.generalStockReceipt ? [line.generalStockReceipt.id] : []),
    );
    const allReceiptIds = [...new Set([...generalReceiptIds, ...allocatedReceiptIds])];
    const outwardLines: OutwardLine[] = allReceiptIds.length > 0
      ? await transaction.finishedGoodsOutwardRequestLine.findMany({
          where: {
            organization_id: organizationId,
            OR: [
              ...(generalReceiptIds.length > 0
                ? [{ source_stock_type: "GENERAL", source_stock_id: { in: generalReceiptIds } }]
                : []),
              ...(allocatedReceiptIds.length > 0
                ? [{ source_stock_type: "ALLOCATED", source_stock_id: { in: allocatedReceiptIds } }]
                : []),
            ],
          },
          select: {
            id: true,
            source_stock_type: true,
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
    const [salesLines, issueLines] = await Promise.all([
      generalReceiptIds.length > 0
        ? transaction.posSalesInvoiceLine.findMany({
            where: {
              organization_id: organizationId,
              general_stock_receipt_id: { in: generalReceiptIds },
            },
            select: { general_stock_receipt_id: true, quantity: true },
          })
        : Promise.resolve([]),
      allReceiptIds.length > 0
        ? transaction.fGMaterialIssueLine.findMany({
            where: {
              organization_id: organizationId,
              OR: [
                ...(generalReceiptIds.length > 0
                  ? [{ general_receipt_id: { in: generalReceiptIds } }]
                  : []),
                ...(allocatedReceiptIds.length > 0
                  ? [{ allocated_receipt_id: { in: allocatedReceiptIds } }]
                  : []),
              ],
            },
            select: {
              id: true,
              stock_type: true,
              general_receipt_id: true,
              allocated_receipt_id: true,
              shipment_box_line_id: true,
              pos_invoice_line_id: true,
              shipmentBoxLine: {
                select: {
                  requestLine: {
                    select: { source_stock_type: true, source_stock_id: true },
                  },
                },
              },
              quantity: true,
              stock_before: true,
              stock_after: true,
              reversal_of_line_id: true,
              issue: { select: { id: true, movement: true, source_type: true } },
              reversalOfLine: {
                select: {
                  id: true,
                  stock_type: true,
                  general_receipt_id: true,
                  allocated_receipt_id: true,
                  quantity: true,
                  issue: { select: { movement: true, source_type: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const receiptKeyFor = (
      stockType: string,
      generalReceiptId: string | null,
      allocatedReceiptId: string | null,
    ) => {
      if (stockType === "GENERAL" && generalReceiptId && !allocatedReceiptId) {
        return `GENERAL:${generalReceiptId}`;
      }
      if (stockType === "ALLOCATED" && allocatedReceiptId && !generalReceiptId) {
        return `ALLOCATED:${allocatedReceiptId}`;
      }
      return null;
    };
    const issueQuantityByReceipt = new Map<string, number>();
    const issueQuantityByLineId = new Map<string, number>();
    const reversalQuantityByLineId = new Map<string, number>();
    const ledgerBlockersByReceipt = new Map<string, string[]>();
    const addLedgerBlocker = (key: string | null, message: string) => {
      if (!key) return;
      const current = ledgerBlockersByReceipt.get(key) ?? [];
      current.push(message);
      ledgerBlockersByReceipt.set(key, current);
    };
    const validLedgerLines = new Map<string, {
      key: string;
      movement: string;
      sourceType: string;
      quantity: number;
      reversalOfLineId: string | null;
      reversalOfLine: (typeof issueLines)[number]["reversalOfLine"];
    }>();
    for (const issueLine of issueLines) {
      const key = receiptKeyFor(
        issueLine.stock_type,
        issueLine.general_receipt_id,
        issueLine.allocated_receipt_id,
      );
      const referencedReceiptKeys = [
        ...(issueLine.general_receipt_id && generalReceiptIds.includes(issueLine.general_receipt_id)
          ? [`GENERAL:${issueLine.general_receipt_id}`]
          : []),
        ...(issueLine.allocated_receipt_id && allocatedReceiptIds.includes(issueLine.allocated_receipt_id)
          ? [`ALLOCATED:${issueLine.allocated_receipt_id}`]
          : []),
      ];
      const quantity = issueLine.quantity.toNumber();
      const expectedStockAfter = issueLine.issue?.movement === "ISSUE"
        ? issueLine.stock_before.minus(issueLine.quantity)
        : issueLine.stock_before.plus(issueLine.quantity);
      if (
        !key
        || !Number.isSafeInteger(quantity)
        || quantity <= 0
        || !issueLine.issue
        || (issueLine.issue.movement !== "ISSUE" && issueLine.issue.movement !== "REVERSAL")
        || !issueLine.stock_before.isFinite()
        || issueLine.stock_before.lt(0)
        || !issueLine.stock_after.isFinite()
        || issueLine.stock_after.lt(0)
        || !expectedStockAfter.equals(issueLine.stock_after)
      ) {
        for (const referencedKey of referencedReceiptKeys) {
          addLedgerBlocker(referencedKey, "An FG issue ledger line is invalid and cannot be used to recalculate this receipt.");
        }
        continue;
      }
      if (
        (issueLine.issue.movement === "ISSUE"
          && issueLine.issue.source_type === "POS_INVOICE"
          && (issueLine.stock_type !== "GENERAL" || !issueLine.general_receipt_id || !issueLine.pos_invoice_line_id))
        || (issueLine.issue.movement === "ISSUE"
          && issueLine.issue.source_type === "PACKING_LIST"
          && !issueLine.shipment_box_line_id)
        || (issueLine.issue.source_type === "PACKING_LIST"
          && (!issueLine.shipmentBoxLine
            || issueLine.shipmentBoxLine.requestLine.source_stock_type !== issueLine.stock_type
            || issueLine.shipmentBoxLine.requestLine.source_stock_id
              !== (issueLine.general_receipt_id ?? issueLine.allocated_receipt_id)))
      ) {
        addLedgerBlocker(key, "An FG issue ledger line has inconsistent source details.");
        continue;
      }
      validLedgerLines.set(issueLine.id, {
        key,
        movement: issueLine.issue.movement,
        sourceType: issueLine.issue.source_type,
        quantity,
        reversalOfLineId: issueLine.reversal_of_line_id,
        reversalOfLine: issueLine.reversalOfLine,
      });
      if (issueLine.issue.movement === "ISSUE") {
        issueQuantityByReceipt.set(key, (issueQuantityByReceipt.get(key) ?? 0) + quantity);
        issueQuantityByLineId.set(issueLine.id, quantity);
      }
    }
    for (const issueLine of issueLines) {
      const validLine = validLedgerLines.get(issueLine.id);
      if (!validLine || validLine.movement !== "REVERSAL") continue;
      const original = validLine.reversalOfLine;
      const originalQuantity = validLine.reversalOfLineId
        ? issueQuantityByLineId.get(validLine.reversalOfLineId)
        : undefined;
      const originalKey = original
        ? receiptKeyFor(original.stock_type, original.general_receipt_id, original.allocated_receipt_id)
        : null;
      if (
        !validLine.reversalOfLineId
        || !original
        || original.issue.movement !== "ISSUE"
        || original.issue.source_type !== validLine.sourceType
        || originalKey !== validLine.key
        || originalQuantity === undefined
      ) {
        addLedgerBlocker(validLine.key, "An FG reversal is not linked to a matching issue line.");
        continue;
      }
      const reversed = (reversalQuantityByLineId.get(validLine.reversalOfLineId) ?? 0) + validLine.quantity;
      reversalQuantityByLineId.set(validLine.reversalOfLineId, reversed);
      if (reversed > originalQuantity) {
        addLedgerBlocker(validLine.key, "FG reversal quantities exceed their original issue.");
        continue;
      }
      issueQuantityByReceipt.set(
        validLine.key,
        (issueQuantityByReceipt.get(validLine.key) ?? 0) - validLine.quantity,
      );
    }
    const documentIssueQuantityByReceipt = new Map<string, number>();
    for (const saleLine of salesLines) {
      const key = `GENERAL:${saleLine.general_stock_receipt_id}`;
      documentIssueQuantityByReceipt.set(
        key,
        (documentIssueQuantityByReceipt.get(key) ?? 0) + saleLine.quantity,
      );
    }
    for (const outwardLine of outwardLines) {
      const key = `${outwardLine.source_stock_type}:${outwardLine.source_stock_id}`;
      const shippedQuantity = outwardLine.shipped_quantity.toNumber();
      if (!Number.isSafeInteger(shippedQuantity) || shippedQuantity < 0) {
        addLedgerBlocker(key, "A shipped outward quantity is invalid and cannot be reconciled.");
        continue;
      }
      documentIssueQuantityByReceipt.set(
        key,
        (documentIssueQuantityByReceipt.get(key) ?? 0) + shippedQuantity,
      );
    }
    const outwardLinesByReceiptId = new Map<string, OutwardLine[]>();
    for (const line of outwardLines) {
      const key = `${line.source_stock_type}:${line.source_stock_id}`;
      const lines = outwardLinesByReceiptId.get(key) ?? [];
      lines.push(line);
      outwardLinesByReceiptId.set(key, lines);
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
        const stockPlans: Array<{
          key: string;
          stockType: "GENERAL" | "ALLOCATED";
          receiptId: string;
          quantityIn: number;
          quantityOut: number;
          currentStock: number;
          expectedQuantityOut: number;
          expectedCurrentStock: number;
        }> = [];
        const stockReceipts: StockReceiptReconciliation[] = [];

        for (const allocation of line.bookingAllocations) {
          const receipt = allocation.finishedGoodsStockReceipt;
          if (
            allocation.organization_id !== organizationId
            || !receipt
            || receipt.organization_id !== organizationId
            || receipt.grn_allocation_id !== allocation.id
            || receipt.quantity_in !== allocation.allocated_quantity
            || !Number.isSafeInteger(receipt.quantity_out)
            || receipt.quantity_out < 0
            || !Number.isSafeInteger(receipt.current_stock)
            || receipt.current_stock < 0
          ) {
            blockers.push(`Booking allocation ${allocation.id} has an inconsistent stock receipt.`);
            continue;
          }
          const relatedOutwardLines = outwardLinesByReceiptId.get(`ALLOCATED:${receipt.id}`) ?? [];
          for (const outwardLine of relatedOutwardLines) {
            const picked = Number(outwardLine.picked_quantity);
            const shipped = Number(outwardLine.shipped_quantity);
            const requested = Number(outwardLine.requested_quantity);
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
            stockReceipts,
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
          || !Number.isSafeInteger(generalReceipt.quantity_in)
          || generalReceipt.quantity_in < 0
        )) {
          blockers.push("The general-stock receipt quantity is invalid.");
        }

        const planReceipt = (
          stockType: "GENERAL" | "ALLOCATED",
          receiptId: string,
          quantityIn: number,
          quantityOut: number,
          currentStock: number,
          allocationQuantity: number,
        ) => {
          const key = `${stockType}:${receiptId}`;
          const issuedQuantity = issueQuantityByReceipt.get(key) ?? 0;
          const documentIssueQuantity = documentIssueQuantityByReceipt.get(key) ?? 0;
          blockers.push(...(ledgerBlockersByReceipt.get(key) ?? []));
          if (!Number.isSafeInteger(documentIssueQuantity) || documentIssueQuantity < 0) {
            blockers.push(`${stockType} receipt ${receiptId} has invalid source-document quantities.`);
          }
          if (documentIssueQuantity > issuedQuantity) {
            blockers.push(
              `${stockType} receipt ${receiptId} has POS or shipped quantities not fully represented in the FG issue ledger.`,
            );
          }
          const expectedQuantityOut = allocationQuantity + issuedQuantity;
          if (
            !Number.isSafeInteger(quantityIn)
            || quantityIn < 0
            || !Number.isSafeInteger(issuedQuantity)
            || issuedQuantity < 0
            || !Number.isSafeInteger(expectedQuantityOut)
            || expectedQuantityOut < 0
            || expectedQuantityOut > quantityIn
            || !Number.isSafeInteger(quantityOut)
            || !Number.isSafeInteger(currentStock)
          ) {
            blockers.push(`${stockType} receipt ${receiptId} cannot be reconciled to its verified ledger quantities.`);
            return;
          }
          stockPlans.push({
            key,
            stockType,
            receiptId,
            quantityIn,
            quantityOut,
            currentStock,
            expectedQuantityOut,
            expectedCurrentStock: quantityIn - expectedQuantityOut,
          });
        };
        if (generalReceipt) {
          planReceipt(
            "GENERAL",
            generalReceipt.id,
            generalReceipt.quantity_in,
            generalReceipt.quantity_out,
            generalReceipt.current_stock,
            allocatedQuantity,
          );
        }
        for (const allocation of line.bookingAllocations) {
          const receipt = allocation.finishedGoodsStockReceipt;
          if (receipt && receipt.organization_id === organizationId && receipt.grn_allocation_id === allocation.id) {
            planReceipt(
              "ALLOCATED",
              receipt.id,
              receipt.quantity_in,
              receipt.quantity_out,
              receipt.current_stock,
              0,
            );
          }
        }

        const stockChanged = stockPlans.some((plan) =>
          plan.quantityOut !== plan.expectedQuantityOut
          || plan.currentStock !== plan.expectedCurrentStock,
        );
        for (const plan of stockPlans) {
          const changed = plan.quantityOut !== plan.expectedQuantityOut
            || plan.currentStock !== plan.expectedCurrentStock;
          if (apply && changed && blockers.length === 0) {
            const where = {
              id: plan.receiptId,
              organization_id: organizationId,
              quantity_in: plan.quantityIn,
              quantity_out: plan.quantityOut,
              current_stock: plan.currentStock,
            };
            const data = {
              quantity_out: plan.expectedQuantityOut,
              current_stock: plan.expectedCurrentStock,
            };
            const updated = plan.stockType === "GENERAL"
              ? await transaction.finishedGoodsGeneralStockReceipt.updateMany({ where, data })
              : await transaction.finishedGoodsAllocatedStockReceipt.updateMany({ where, data });
            if (updated.count !== 1) {
              throw new Error(`${plan.stockType} stock receipt changed during reconciliation. Reload and try again.`);
            }
          }
          stockReceipts.push({
            stockType: plan.stockType,
            receiptId: plan.receiptId,
            currentQuantityOut: plan.quantityOut,
            expectedQuantityOut: plan.expectedQuantityOut,
            currentStock: plan.currentStock,
            expectedCurrentStock: plan.expectedCurrentStock,
            changed: apply ? changed && blockers.length === 0 : changed,
          });
        }

        const countersChanged = (
          line.advance_booked_quantity !== allocatedQuantity
          || line.general_inventory_quantity !== expectedGeneralQuantity
        );
        const changed = blockers.length === 0 && (countersChanged || stockChanged);
        if (apply && countersChanged && blockers.length === 0) {
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
        }
        if (apply && changed) {
          changedLines.push({
            lineId: line.id,
            size: label,
            approvedQuantity,
            previousAllocatedQuantity: line.advance_booked_quantity,
            allocatedQuantity,
            previousGeneralQuantity: line.general_inventory_quantity,
            generalQuantity: expectedGeneralQuantity,
            stockReceipts: stockReceipts.filter((receipt) => receipt.changed),
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
          stockReceipts,
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
          action: "RECONCILE_WORK_ORDER_GRN_STOCK_AND_ALLOCATION_TOTALS",
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
