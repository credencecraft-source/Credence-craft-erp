import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

export class RmGrnOrderAllocationNotFoundError extends Error {
  constructor() {
    super("GRN order allocation was not found.");
    this.name = "RmGrnOrderAllocationNotFoundError";
  }
}

export class InvalidRmGrnOrderAllocationError extends Error {
  constructor(message = "Enter valid non-negative quantities with up to two decimal places.") {
    super(message);
    this.name = "InvalidRmGrnOrderAllocationError";
  }
}

type OrderAllocationInput = {
  groupedPurchaseOrderLineId: string;
  allocatedQuantity: unknown;
};

const zero = () => new Prisma.Decimal(0);

function parseQuantity(value: unknown) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "" || String(value).length > 64) {
    throw new InvalidRmGrnOrderAllocationError();
  }

  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(String(value).trim());
  } catch {
    throw new InvalidRmGrnOrderAllocationError();
  }

  if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 2 || parsed.greaterThan("999999999999.99")) {
    throw new InvalidRmGrnOrderAllocationError();
  }
  return parsed;
}

function remainingQuantity(total: Prisma.Decimal, allocated: Prisma.Decimal) {
  const remaining = total.minus(allocated);
  return remaining.isNegative() ? zero() : remaining;
}

export async function getRmGrnOrderAllocationLines(organizationId: string, allocationId: string) {
  const allocation = await prisma.rmGrnVerificationAllocation.findFirst({
    where: { id: allocationId, organization_id: organizationId },
    select: {
      id: true,
      organization_id: true,
      grouped_purchase_order_id: true,
      verification_allocated: true,
      verification: { select: { organization_id: true, inventory_receipt_line_id: true } },
      groupedPurchaseOrder: {
        select: {
          organization_id: true,
          lines: {
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
            select: { id: true, order_no: true, style_name: true, grouped_qty: true },
          },
        },
      },
      orderAllocations: {
        select: { grouped_purchase_order_line_id: true, allocated_quantity: true },
      },
    },
  });

  if (
    !allocation
    || allocation.organization_id !== organizationId
    || allocation.verification.organization_id !== organizationId
    || !allocation.verification.inventory_receipt_line_id
    || allocation.groupedPurchaseOrder.organization_id !== organizationId
  ) {
    throw new RmGrnOrderAllocationNotFoundError();
  }

  const lineIds = allocation.groupedPurchaseOrder.lines.map((line) => line.id);
  const totals = lineIds.length === 0 ? [] : await prisma.rmGrnOrderAllocation.groupBy({
    by: ["grouped_purchase_order_line_id"],
    where: { organization_id: organizationId, grouped_purchase_order_line_id: { in: lineIds } },
    _sum: { allocated_quantity: true },
  });
  const totalByLine = new Map(totals.map((row) => [row.grouped_purchase_order_line_id, row._sum.allocated_quantity ?? zero()]));
  const currentByLine = new Map(allocation.orderAllocations.map((row) => [row.grouped_purchase_order_line_id, row.allocated_quantity]));

  return {
    verificationAllocated: allocation.verification_allocated.toString(),
    lines: allocation.groupedPurchaseOrder.lines.map((line) => {
      const grouped = line.grouped_qty;
      const allocated = currentByLine.get(line.id) ?? zero();
      const totalAllocated = totalByLine.get(line.id) ?? zero();
      const allocatedByOtherReceipts = remainingQuantity(totalAllocated, allocated);
      const maxAllocatable = remainingQuantity(grouped, allocatedByOtherReceipts);
      return {
        groupedPurchaseOrderLineId: line.id,
        orderNo: line.order_no ?? "",
        styleNo: line.style_name ?? "",
        alreadyAllocated: allocatedByOtherReceipts.toString(),
        balanceToAllocate: remainingQuantity(maxAllocatable, allocated).toString(),
        grouped: grouped.toString(),
        allocate: allocated.toString(),
        maxAllocatable: maxAllocatable.toString(),
      };
    }),
  };
}

export async function saveRmGrnOrderAllocations(
  organizationId: string,
  allocationId: string,
  input: unknown,
  actorId: string,
) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
    throw new InvalidRmGrnOrderAllocationError("Grouped order lines are required for allocation.");
  }

  const requested = new Map<string, Prisma.Decimal>();
  for (const item of input as OrderAllocationInput[]) {
    const lineId = String(item?.groupedPurchaseOrderLineId ?? "").trim();
    if (!lineId || lineId.length > 128 || requested.has(lineId)) {
      throw new InvalidRmGrnOrderAllocationError("Each grouped order line must be submitted once.");
    }
    requested.set(lineId, parseQuantity(item.allocatedQuantity));
  }

  return prisma.$transaction(async (transaction) => {
    const allocation = await transaction.rmGrnVerificationAllocation.findFirst({
      where: { id: allocationId, organization_id: organizationId },
      select: {
        id: true,
        organization_id: true,
        grouped_purchase_order_id: true,
        verification_allocated: true,
        verification: { select: { organization_id: true, inventory_receipt_line_id: true } },
        groupedPurchaseOrder: {
          select: {
            organization_id: true,
            lines: {
              orderBy: [{ created_at: "asc" }, { id: "asc" }],
              select: { id: true, grouped_qty: true },
            },
          },
        },
        orderAllocations: {
          select: { grouped_purchase_order_line_id: true, allocated_quantity: true },
        },
      },
    });

    if (
      !allocation
      || allocation.organization_id !== organizationId
      || allocation.verification.organization_id !== organizationId
      || !allocation.verification.inventory_receipt_line_id
      || allocation.groupedPurchaseOrder.organization_id !== organizationId
    ) {
      throw new RmGrnOrderAllocationNotFoundError();
    }

    const groupedLines = allocation.groupedPurchaseOrder.lines;
    if (groupedLines.length === 0 || requested.size !== groupedLines.length || groupedLines.some((line) => !requested.has(line.id))) {
      throw new InvalidRmGrnOrderAllocationError("The submitted order lines do not match this GRN grouping.");
    }

    const requestedTotal = [...requested.values()].reduce((total, value) => total.plus(value), zero());
    if (requestedTotal.greaterThan(allocation.verification_allocated)) {
      throw new InvalidRmGrnOrderAllocationError("Total allocated quantity cannot exceed the GRN verification allocation.");
    }

    const lineIds = groupedLines.map((line) => line.id);
    const previousByLine = await transaction.rmGrnOrderAllocation.groupBy({
      by: ["grouped_purchase_order_line_id"],
      where: {
        organization_id: organizationId,
        verification_allocation_id: { not: allocation.id },
        grouped_purchase_order_line_id: { in: lineIds },
      },
      _sum: { allocated_quantity: true },
    });
    const previousTotals = new Map(previousByLine.map((row) => [row.grouped_purchase_order_line_id, row._sum.allocated_quantity ?? zero()]));

    for (const line of groupedLines) {
      const capacity = remainingQuantity(line.grouped_qty, previousTotals.get(line.id) ?? zero());
      if ((requested.get(line.id) ?? zero()).greaterThan(capacity)) {
        throw new InvalidRmGrnOrderAllocationError("An order-line allocation exceeds its remaining grouped quantity.");
      }
    }

    const previousValues = allocation.orderAllocations.map((row) => ({
      groupedPurchaseOrderLineId: row.grouped_purchase_order_line_id,
      allocatedQuantity: row.allocated_quantity.toString(),
    }));

    for (const line of groupedLines) {
      const allocatedQuantity = requested.get(line.id) ?? zero();
      if (allocatedQuantity.isZero()) {
        await transaction.rmGrnOrderAllocation.deleteMany({
          where: {
            organization_id: organizationId,
            verification_allocation_id: allocation.id,
            grouped_purchase_order_line_id: line.id,
          },
        });
        continue;
      }

      await transaction.rmGrnOrderAllocation.upsert({
        where: {
          verification_allocation_id_grouped_purchase_order_line_id: {
            verification_allocation_id: allocation.id,
            grouped_purchase_order_line_id: line.id,
          },
        },
        create: {
          organization_id: organizationId,
          verification_allocation_id: allocation.id,
          grouped_purchase_order_line_id: line.id,
          allocated_quantity: allocatedQuantity,
          created_by: actorId,
          updated_by: actorId,
        },
        update: { allocated_quantity: allocatedQuantity, updated_by: actorId },
      });
    }

    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "Inventory Management",
      action: "UPDATE",
      entityType: "RmGrnVerificationAllocation",
      entityId: allocation.id,
      details: {
        grouped_purchase_order_id: allocation.grouped_purchase_order_id,
        previous_order_allocations: previousValues,
        order_allocations: groupedLines.map((line) => ({
          groupedPurchaseOrderLineId: line.id,
          allocatedQuantity: (requested.get(line.id) ?? zero()).toString(),
        })),
      },
    }, transaction);

    return {
      allocatedQuantity: requestedTotal.toString(),
      fullyAllocated: requestedTotal.greaterThanOrEqualTo(allocation.verification_allocated),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}