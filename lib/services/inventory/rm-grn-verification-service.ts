import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

export class RmGrnVerificationNotFoundError extends Error {
  constructor() {
    super("GRN raw-material line not found.");
    this.name = "RmGrnVerificationNotFoundError";
  }
}

export class InvalidActualCountError extends Error {
  constructor(message = "Enter valid non-negative quantities with up to two decimal places.") {
    super(message);
    this.name = "InvalidActualCountError";
  }
}

export class MasterGroupRequiredError extends Error {
  constructor() {
    super("This GRN line must be linked to a Master Group before verification.");
    this.name = "MasterGroupRequiredError";
  }
}

type SourceGrouping = {
  id: string;
  display_no: number | null;
  grouped_po_no: string;
  total_grouped_qty: Prisma.Decimal | null;
};

type AllocationInput = {
  groupedPurchaseOrderId: string;
  verificationAllocated: unknown;
};

const zero = () => new Prisma.Decimal(0);

function parseQuantity(value: unknown) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || String(value).length > 64) {
    throw new InvalidActualCountError();
  }

  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(String(value).trim());
  } catch {
    throw new InvalidActualCountError();
  }
  if (
    !parsed.isFinite()
    || parsed.isNegative()
    || parsed.decimalPlaces() > 2
    || parsed.greaterThan("999999999999.99")
  ) {
    throw new InvalidActualCountError();
  }
  return parsed;
}

function availableQuantity(total: Prisma.Decimal | null, allocated: Prisma.Decimal | undefined) {
  const available = (total ?? zero()).minus(allocated ?? zero());
  return available.isNegative() ? zero() : available;
}

function calculateHeaderQuantities(verified: Prisma.Decimal, approved: Prisma.Decimal, groupedQtyGrn: Prisma.Decimal) {
  if (approved.greaterThan(verified)) {
    throw new InvalidActualCountError("Approved Qty cannot exceed Verified Qty.");
  }
  const rejected = verified.minus(approved);
  const approvedAboveGroupQty = approved.minus(groupedQtyGrn);
  const freshExcess = approvedAboveGroupQty.greaterThan(0) ? approvedAboveGroupQty : zero();
  const totalExcess = freshExcess.plus(rejected);
  return {
    rejected,
    freshExcess,
    totalExcess,
    availableToAllocate: verified.minus(totalExcess),
  };
}

function serializeGroupingNumber(grouping: Pick<SourceGrouping, "display_no" | "grouped_po_no">) {
  return grouping.display_no ? `GP-${grouping.display_no}` : grouping.grouped_po_no;
}

async function loadSourceLine(database: Pick<typeof prisma, "inventoryReceiptLine">, organizationId: string, receiptLineId: string) {
  return database.inventoryReceiptLine.findFirst({
    where: { id: receiptLineId, receipt: { organization_id: organizationId } },
    include: {
      receipt: {
        select: {
          entity_id: true,
          location_id: true,
          receipt_no: true,
          purchaseOrder: { select: { purchase_order_no: true, display_no: true } },
        },
      },
      purchaseOrderLine: {
        select: {
          raw_material: true,
          purchaseOrder: { select: { organization_id: true } },
          masterPurchaseOrder: {
            select: {
              id: true,
              organization_id: true,
              master_po_no: true,
              display_no: true,
              raw_material: true,
              total_grouped_qty: true,
              sourceRecords: {
                select: {
                  groupedPurchaseOrder: {
                    select: {
                      id: true,
                      organization_id: true,
                      grouped_po_no: true,
                      display_no: true,
                      total_grouped_qty: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

async function getPriorAllocationTotals(
  database: Pick<typeof prisma, "rmGrnVerificationAllocation">,
  organizationId: string,
  groupIds: string[],
  exceptVerificationId?: string,
  excludedVerificationIds: string[] = [],
) {
  if (groupIds.length === 0) return new Map<string, Prisma.Decimal>();
  const allocations = await database.rmGrnVerificationAllocation.groupBy({
    by: ["grouped_purchase_order_id"],
    where: {
      organization_id: organizationId,
      grouped_purchase_order_id: { in: groupIds },
      ...(exceptVerificationId || excludedVerificationIds.length > 0
        ? {
            verification_id: {
              ...(exceptVerificationId ? { not: exceptVerificationId } : {}),
              ...(excludedVerificationIds.length > 0 ? { notIn: excludedVerificationIds } : {}),
            },
          }
        : {}),
    },
    _sum: { verification_allocated: true },
  });
  return new Map(allocations.map((allocation) => [
    allocation.grouped_purchase_order_id,
    allocation._sum.verification_allocated ?? zero(),
  ]));
}

export async function getRmGrnVerification(organizationId: string, receiptLineId: string) {
  const line = await loadSourceLine(prisma, organizationId, receiptLineId);
  if (!line) return null;
  if (line.purchaseOrderLine.purchaseOrder.organization_id !== organizationId) return null;

  const master = line.purchaseOrderLine.masterPurchaseOrder;
  if (master && master.organization_id !== organizationId) throw new RmGrnVerificationNotFoundError();
  const groupings = (master?.sourceRecords ?? [])
    .map(({ groupedPurchaseOrder }) => groupedPurchaseOrder)
    .filter((grouping) => grouping.organization_id === organizationId);
  const saved = await prisma.rmGrnVerification.findFirst({
    where: { organization_id: organizationId, inventory_receipt_line_id: line.id },
    include: { allocations: { select: { grouped_purchase_order_id: true, verification_allocated: true } } },
  });
  const groupIds = groupings.map((grouping) => grouping.id);
  const priorTotals = await getPriorAllocationTotals(prisma, organizationId, groupIds, saved?.id);
  const ownAllocations = new Map((saved?.allocations ?? []).map((allocation) => [
    allocation.grouped_purchase_order_id,
    allocation.verification_allocated,
  ]));
  const groupingRows = groupings.map((grouping) => {
    const total = availableQuantity(grouping.total_grouped_qty, priorTotals.get(grouping.id));
    const allocated = ownAllocations.get(grouping.id) ?? zero();
    return {
      groupedPurchaseOrderId: grouping.id,
      groupingNumber: serializeGroupingNumber(grouping),
      totalGroupedQty: total.toString(),
      verificationAllocated: allocated.toString(),
      balanceToAllocate: total.minus(allocated).toString(),
    };
  });
  const groupedQtyGrn = groupings.reduce(
    (total, grouping) => total.plus(availableQuantity(grouping.total_grouped_qty, priorTotals.get(grouping.id))),
    zero(),
  );
  const verified = saved?.verified_quantity ?? zero();
  const approved = saved?.approved_quantity ?? zero();
  const calculated = calculateHeaderQuantities(verified, approved, groupedQtyGrn);
  const groupedAllocated = groupingRows.reduce((total, row) => total.plus(row.verificationAllocated), zero());
  const groupedBalance = groupingRows.reduce((total, row) => total.plus(row.balanceToAllocate), zero());

  return {
    receiptLineId: line.id,
    grnNumber: line.receipt.receipt_no,
    rawMaterialName: line.purchaseOrderLine.raw_material ?? line.raw_material ?? "",
    grnQuantity: line.received_quantity.toString(),
    purchaseOrderNumber: line.receipt.purchaseOrder.display_no
      ? `PO-${line.receipt.purchaseOrder.display_no}`
      : line.receipt.purchaseOrder.purchase_order_no,
    masterPurchaseOrderId: master?.id ?? null,
    masterGroupingNumber: master
      ? master.display_no ? `MGP-${master.display_no}` : master.master_po_no
      : "",
    poQuantity: master?.total_grouped_qty?.toString() ?? "0",
    groupedQtyGrn: groupedQtyGrn.toString(),
    verifiedQuantity: saved?.verified_quantity.toString() ?? "",
    approvedQuantity: saved?.approved_quantity.toString() ?? "",
    rejectedQuantity: calculated.rejected.toString(),
    freshExcess: calculated.freshExcess.toString(),
    totalExcess: calculated.totalExcess.toString(),
    availableToAllocate: calculated.availableToAllocate.toString(),
    groupedAllocated: groupedAllocated.toString(),
    groupedBalanceToAllocate: groupedBalance.toString(),
    allocations: groupingRows,
  };
}

export async function getRmGrnVerificationDraftsForPurchaseOrder(organizationId: string, purchaseOrderId: string) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organization_id: organizationId, status: { in: ["APPROVED", "SHARED"] } },
    select: {
      purchase_order_no: true,
      display_no: true,
      lines: {
        select: {
          id: true,
          raw_material: true,
          quantity: true,
          masterPurchaseOrder: {
            select: {
              id: true,
              organization_id: true,
              master_po_no: true,
              display_no: true,
              total_grouped_qty: true,
              sourceRecords: {
                select: {
                  groupedPurchaseOrder: {
                    select: {
                      id: true,
                      organization_id: true,
                      grouped_po_no: true,
                      display_no: true,
                      total_grouped_qty: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!purchaseOrder) return null;

  const groupingsByLine = purchaseOrder.lines.map((line) => {
    const master = line.masterPurchaseOrder;
    if (master && master.organization_id !== organizationId) throw new RmGrnVerificationNotFoundError();
    return (master?.sourceRecords ?? [])
      .map(({ groupedPurchaseOrder }) => groupedPurchaseOrder)
      .filter((grouping) => grouping.organization_id === organizationId);
  });
  const allGroupingIds = [...new Set(groupingsByLine.flatMap((groupings) => groupings.map((grouping) => grouping.id)))];
  const priorTotals = await getPriorAllocationTotals(prisma, organizationId, allGroupingIds);
  const purchaseOrderNumber = purchaseOrder.display_no
    ? `PO-${purchaseOrder.display_no}`
    : purchaseOrder.purchase_order_no;

  return purchaseOrder.lines.map((line, index) => {
    const master = line.masterPurchaseOrder;
    const groupings = groupingsByLine[index];
    const allocations = groupings.map((grouping) => {
      const total = availableQuantity(grouping.total_grouped_qty, priorTotals.get(grouping.id));
      return {
        groupedPurchaseOrderId: grouping.id,
        groupingNumber: serializeGroupingNumber(grouping),
        totalGroupedQty: total.toString(),
        verificationAllocated: "0",
        balanceToAllocate: total.toString(),
      };
    });
    const groupedQtyGrn = allocations.reduce((total, allocation) => total.plus(allocation.totalGroupedQty), zero());

    return {
      purchaseOrderLineId: line.id,
      masterPurchaseOrderId: master?.id ?? null,
      grnNumber: "Assigned on save",
      rawMaterialName: line.raw_material ?? "",
      grnQuantity: "",
      purchaseOrderNumber,
      masterGroupingNumber: master
        ? master.display_no ? `MGP-${master.display_no}` : master.master_po_no
        : "",
      poQuantity: master?.total_grouped_qty?.toString() ?? line.quantity.toString(),
      groupedQtyGrn: groupedQtyGrn.toString(),
      verifiedQuantity: "",
      approvedQuantity: "",
      rejectedQuantity: "0",
      freshExcess: "0",
      totalExcess: "0",
      availableToAllocate: "0",
      groupedAllocated: "0",
      groupedBalanceToAllocate: groupedQtyGrn.toString(),
      allocations,
    };
  });
}

export async function listRmGrnVerificationAllocations(
  organizationId: string,
  { styleWiseInventory = false }: { styleWiseInventory?: boolean } = {},
) {
  const records = await prisma.rmGrnVerificationAllocation.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      created_at: true,
      verification_allocated: true,
      orderAllocations: {
        select: {
          allocated_quantity: true,
          groupedPurchaseOrderLine: {
            select: {
              id: true,
              order_no: true,
              style_name: true,
              grouped_qty: true,
              sourceOrder: { select: { organization_id: true, orderNo: true } },
              groupedPurchaseOrder: { select: { id: true, organization_id: true } },
            },
          },
        },
      },
      groupedPurchaseOrder: {
        select: {
          id: true,
          organization_id: true,
          grouped_po_no: true,
          display_no: true,
          total_grouped_qty: true,
        },
      },
      verification: {
        select: {
          id: true,
          organization_id: true,
          masterPurchaseOrder: { select: { master_po_no: true, display_no: true, organization_id: true } },
          sourceGroupedPurchaseOrder: {
            select: {
              id: true,
              organization_id: true,
              source_type: true,
              grouped_po_no: true,
              display_no: true,
              raw_material: true,
            },
          },
          inventoryReceiptLine: {
            select: {
              raw_material: true,
              receipt: {
                select: {
                  organization_id: true,
                  receipt_no: true,
                  notes: true,
                  purchaseOrder: { select: { organization_id: true, purchase_order_no: true, display_no: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { created_at: "desc" },
  });
  const isDummySample = (record: (typeof records)[number]) =>
    record.verification.inventoryReceiptLine?.receipt.notes?.startsWith("Dummy sample batch ") ?? false;
  const isFullyAllocated = (record: (typeof records)[number]) => {
    const allocated = record.orderAllocations.reduce(
      (total, allocation) => total.plus(allocation.allocated_quantity),
      zero(),
    );
    return record.verification_allocated.greaterThan(0)
      && allocated.greaterThanOrEqualTo(record.verification_allocated);
  };
  const hiddenSampleVerificationIds = styleWiseInventory
    ? [...new Set(records.filter((record) => isDummySample(record) && !isFullyAllocated(record)).map((record) => record.verification.id))]
    : [];
  const visibleRecords = records;
  const totalAllocatedByOrderLine = new Map<string, Prisma.Decimal>();
  for (const record of records) {
    for (const allocation of record.orderAllocations) {
      const line = allocation.groupedPurchaseOrderLine;
      if (
        line.groupedPurchaseOrder.organization_id !== organizationId
        || line.groupedPurchaseOrder.id !== record.groupedPurchaseOrder.id
        || line.sourceOrder.organization_id !== organizationId
      ) continue;
      const total = totalAllocatedByOrderLine.get(line.id) ?? zero();
      totalAllocatedByOrderLine.set(line.id, total.plus(allocation.allocated_quantity));
    }
  }
  const groupIds = [...new Set(visibleRecords.map((record) => record.groupedPurchaseOrder.id))];
  const totalAllocatedByGroup = await getPriorAllocationTotals(
    prisma,
    organizationId,
    groupIds,
    undefined,
    hiddenSampleVerificationIds,
  );

  return visibleRecords.flatMap((record) => {
    const grouping = record.groupedPurchaseOrder;
    const verification = record.verification;
    const receiptLine = verification.inventoryReceiptLine;
    const stockGroup = verification.sourceGroupedPurchaseOrder;
    const master = verification.masterPurchaseOrder;
    if (grouping.organization_id !== organizationId || verification.organization_id !== organizationId || (master && master.organization_id !== organizationId)) return [];
    const orderAllocated = record.orderAllocations.reduce(
      (total, allocation) => total.plus(allocation.allocated_quantity),
      zero(),
    );
    const allocationComplete = orderAllocated.greaterThanOrEqualTo(record.verification_allocated);
    if (allocationComplete && !styleWiseInventory) return [];

    const totalGroupedQty = grouping.total_grouped_qty ?? zero();
    const balanceToAllocate = totalGroupedQty.minus(totalAllocatedByGroup.get(grouping.id) ?? zero());
    const orderAllocations = record.orderAllocations.flatMap((allocation) => {
      const line = allocation.groupedPurchaseOrderLine;
      if (
        allocation.allocated_quantity.isZero()
        || line.groupedPurchaseOrder.organization_id !== organizationId
        || line.groupedPurchaseOrder.id !== grouping.id
        || line.sourceOrder.organization_id !== organizationId
      ) return [];

      const totalAllocated = totalAllocatedByOrderLine.get(line.id) ?? allocation.allocated_quantity;
      const alreadyAllocated = totalAllocated.minus(allocation.allocated_quantity);
      const lineBalance = line.grouped_qty.minus(totalAllocated);
      return [{
        groupedPurchaseOrderLineId: line.id,
        orderNo: line.order_no?.trim() || line.sourceOrder.orderNo,
        styleNo: line.style_name ?? "",
        alreadyAllocated: (alreadyAllocated.isNegative() ? zero() : alreadyAllocated).toString(),
        balanceToAllocate: (lineBalance.isNegative() ? zero() : lineBalance).toString(),
        grouped: line.grouped_qty.toString(),
        allocate: allocation.allocated_quantity.toString(),
      }];
    });
    if (receiptLine) {
      const receipt = receiptLine.receipt;
      if (receipt.organization_id !== organizationId || receipt.purchaseOrder.organization_id !== organizationId) return [];
      return [{
        id: record.id,
        verificationId: verification.id,
        grnNumber: receipt.receipt_no,
        purchaseOrderNumber: receipt.purchaseOrder.display_no
          ? `PO-${receipt.purchaseOrder.display_no}`
          : receipt.purchaseOrder.purchase_order_no,
        rawMaterialName: receiptLine.raw_material ?? "",
        masterGroupingNumber: master
          ? master.display_no ? `MGP-${master.display_no}` : master.master_po_no
          : "",
        groupingNumber: serializeGroupingNumber(grouping),
        totalGroupedQty: totalGroupedQty.toString(),
        verificationAllocated: record.verification_allocated.toString(),
        balanceToAllocate: (balanceToAllocate.isNegative() ? zero() : balanceToAllocate).toString(),
        orderAllocations,
      }];
    }
    if (!stockGroup || stockGroup.organization_id !== organizationId || stockGroup.source_type !== "STOCK") return [];
    return [{
      id: record.id,
      verificationId: verification.id,
      grnNumber: `STOCK-${serializeGroupingNumber(stockGroup)}`,
      purchaseOrderNumber: "Internal Store Issue",
      rawMaterialName: stockGroup.raw_material ?? "",
      masterGroupingNumber: master
        ? master.display_no ? `MGP-${master.display_no}` : master.master_po_no
        : "",
      groupingNumber: serializeGroupingNumber(grouping),
      totalGroupedQty: totalGroupedQty.toString(),
      verificationAllocated: record.verification_allocated.toString(),
      balanceToAllocate: (balanceToAllocate.isNegative() ? zero() : balanceToAllocate).toString(),
      orderAllocations,
    }];
  });
}

export async function saveRmGrnVerificationInTransaction(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  receiptLineId: string,
  input: { verifiedQuantity: unknown; approvedQuantity: unknown; allocations: unknown },
  actorId: string,
) {
    const line = await loadSourceLine(transaction, organizationId, receiptLineId);
    if (!line) throw new RmGrnVerificationNotFoundError();
    if (line.purchaseOrderLine.purchaseOrder.organization_id !== organizationId) {
      throw new RmGrnVerificationNotFoundError();
    }
    const master = line.purchaseOrderLine.masterPurchaseOrder;
    if (!master || master.organization_id !== organizationId) throw new MasterGroupRequiredError();

    const groupings = master.sourceRecords
      .map(({ groupedPurchaseOrder }) => groupedPurchaseOrder)
      .filter((grouping) => grouping.organization_id === organizationId);
    const groupIds = groupings.map((grouping) => grouping.id);
    const existing = await transaction.rmGrnVerification.findFirst({
      where: { organization_id: organizationId, inventory_receipt_line_id: line.id },
      select: {
        id: true,
        verified_quantity: true,
        approved_quantity: true,
        fresh_excess: true,
        allocations: { select: { orderAllocations: { select: { id: true } } } },
      },
    });
    if (existing?.allocations?.some((allocation) => allocation.orderAllocations.length > 0)) {
      throw new InvalidActualCountError("This GRN verification cannot be changed after quantities have been allocated to an order.");
    }
    const otherAllocationTotals = await getPriorAllocationTotals(
      transaction,
      organizationId,
      groupIds,
      existing?.id,
    );
    const groupingCapacities = new Map(groupings.map((grouping) => [
      grouping.id,
      availableQuantity(grouping.total_grouped_qty, otherAllocationTotals.get(grouping.id)),
    ]));
    const groupedQtyGrn = [...groupingCapacities.values()].reduce((total, value) => total.plus(value), zero());
    const verified = parseQuantity(input.verifiedQuantity);
    const approved = parseQuantity(input.approvedQuantity);
    const calculated = calculateHeaderQuantities(verified, approved, groupedQtyGrn);
    if (!Array.isArray(input.allocations)) throw new InvalidActualCountError();

      const allocationValues = new Map<string, Prisma.Decimal>();
    for (const item of input.allocations as AllocationInput[]) {
      const groupedPurchaseOrderId = String(item?.groupedPurchaseOrderId ?? "").trim();
      if (!groupingCapacities.has(groupedPurchaseOrderId) || allocationValues.has(groupedPurchaseOrderId)) {
        throw new InvalidActualCountError();
      }
      allocationValues.set(groupedPurchaseOrderId, parseQuantity(item.verificationAllocated));
    }

    const normalizedAllocations = groupings.map((grouping) => ({
      groupedPurchaseOrderId: grouping.id,
      verificationAllocated: allocationValues.get(grouping.id) ?? zero(),
      totalGroupedQty: groupingCapacities.get(grouping.id) ?? zero(),
    }));
    for (const allocation of normalizedAllocations) {
      if (allocation.verificationAllocated.greaterThan(allocation.totalGroupedQty)) {
        throw new InvalidActualCountError("A grouping allocation cannot exceed its remaining balance.");
      }
    }
    const groupedAllocated = normalizedAllocations.reduce((total, allocation) => total.plus(allocation.verificationAllocated), zero());
    if (groupedAllocated.greaterThan(calculated.availableToAllocate)) {
      throw new InvalidActualCountError("Grouped Allocated cannot exceed Available To Allocate.");
    }
    const groupedBalance = normalizedAllocations.reduce(
      (total, allocation) => total.plus(allocation.totalGroupedQty.minus(allocation.verificationAllocated)),
      zero(),
    );

    const receiptLineUpdate = await transaction.inventoryReceiptLine.updateMany({
      where: { id: line.id, receipt: { organization_id: organizationId } },
      data: {
        received_quantity: verified,
        accepted_quantity: approved,
        rejected_quantity: calculated.rejected,
      },
    });
    if (receiptLineUpdate.count !== 1) throw new RmGrnVerificationNotFoundError();

    const generalStock = await transaction.rawMaterialStock.findFirst({
      where: { organization_id: organizationId, inventory_receipt_line_id: line.id },
      select: { id: true, quantity_on_hand: true, quantity_reserved: true, quantity_issued: true },
    });
    if (generalStock) {
      if (
        !generalStock.quantity_on_hand.equals(existing?.fresh_excess ?? zero())
        || generalStock.quantity_reserved.greaterThan(0)
        || generalStock.quantity_issued.greaterThan(0)
      ) {
        throw new InvalidActualCountError("This GRN's excess stock has already been used or reserved and its verification cannot be changed.");
      }
      const stockUpdate = await transaction.rawMaterialStock.updateMany({
        where: {
          id: generalStock.id,
          organization_id: organizationId,
          inventory_receipt_line_id: line.id,
          quantity_on_hand: generalStock.quantity_on_hand,
          quantity_reserved: zero(),
          quantity_issued: zero(),
        },
        data: { quantity_on_hand: calculated.freshExcess },
      });
      if (stockUpdate.count !== 1) {
        throw new InvalidActualCountError("General Inventory changed while this verification was being saved. Reload and try again.");
      }
    } else {
      const rawMaterial = line.raw_material ?? line.purchaseOrderLine.raw_material;
      if (!rawMaterial) throw new InvalidActualCountError("The GRN line has no raw material for General Inventory.");
      await transaction.rawMaterialStock.create({
        data: {
          organization_id: organizationId,
          entity_id: line.receipt.entity_id,
          location_id: line.receipt.location_id,
          raw_material: rawMaterial,
          quantity_on_hand: calculated.freshExcess,
          source_type: "GRN",
          inventory_receipt_line_id: line.id,
        },
      });
    }

    const record = existing
      ? await transaction.rmGrnVerification.update({
          where: { id: existing.id, organization_id: organizationId },
          data: {
            master_purchase_order_id: master.id,
            po_quantity: master.total_grouped_qty ?? zero(),
            grouped_qty_grn: groupedQtyGrn,
            verified_quantity: verified,
            approved_quantity: approved,
            rejected_quantity: calculated.rejected,
            fresh_excess: calculated.freshExcess,
            total_excess: calculated.totalExcess,
            available_to_allocate: calculated.availableToAllocate,
            grouped_allocated: groupedAllocated,
            grouped_balance_to_allocate: groupedBalance,
            updated_by: actorId,
          },
        })
      : await transaction.rmGrnVerification.create({
          data: {
            organization_id: organizationId,
            inventory_receipt_line_id: line.id,
            master_purchase_order_id: master.id,
            po_quantity: master.total_grouped_qty ?? zero(),
            grouped_qty_grn: groupedQtyGrn,
            verified_quantity: verified,
            approved_quantity: approved,
            rejected_quantity: calculated.rejected,
            fresh_excess: calculated.freshExcess,
            total_excess: calculated.totalExcess,
            available_to_allocate: calculated.availableToAllocate,
            grouped_allocated: groupedAllocated,
            grouped_balance_to_allocate: groupedBalance,
            created_by: actorId,
            updated_by: actorId,
          },
        });

    for (const allocation of normalizedAllocations) {
      if (!allocation.verificationAllocated.greaterThan(0)) {
        if (existing) {
          await transaction.rmGrnVerificationAllocation.deleteMany({
            where: {
              organization_id: organizationId,
              verification_id: record.id,
              grouped_purchase_order_id: allocation.groupedPurchaseOrderId,
            },
          });
        }
        continue;
      }

      await transaction.rmGrnVerificationAllocation.upsert({
        where: {
          verification_id_grouped_purchase_order_id: {
            verification_id: record.id,
            grouped_purchase_order_id: allocation.groupedPurchaseOrderId,
          },
        },
        create: {
          organization_id: organizationId,
          verification_id: record.id,
          grouped_purchase_order_id: allocation.groupedPurchaseOrderId,
          verification_allocated: allocation.verificationAllocated,
        },
        update: { verification_allocated: allocation.verificationAllocated },
      });
    }

    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "Inventory Management",
      action: existing ? "UPDATE" : "CREATE",
      entityType: "RmGrnVerification",
      entityId: record.id,
      details: {
        receipt_line_id: line.id,
        previous_verified_quantity: existing?.verified_quantity.toString() ?? null,
        verified_quantity: verified.toString(),
        approved_quantity: approved.toString(),
        grouped_allocated: groupedAllocated.toString(),
      },
    }, transaction);

    return {
      created: !existing,
      verificationId: record.id,
      verifiedQuantity: record.verified_quantity.toString(),
      approvedQuantity: record.approved_quantity.toString(),
      groupedAllocated: record.grouped_allocated.toString(),
    };
}

export async function saveRmGrnVerification(
  organizationId: string,
  receiptLineId: string,
  input: { verifiedQuantity: unknown; approvedQuantity: unknown; allocations: unknown },
  actorId: string,
) {
  return prisma.$transaction(
    (transaction) => saveRmGrnVerificationInTransaction(transaction, organizationId, receiptLineId, input, actorId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}