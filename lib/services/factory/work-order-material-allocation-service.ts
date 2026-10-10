import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

type WorkOrderMaterialAllocationDatabase = Prisma.TransactionClient | typeof prisma;

export async function getWorkOrderBomAllocatedQuantities(
  organizationId: string,
  workOrderBomLineIds: string[],
  database: WorkOrderMaterialAllocationDatabase = prisma,
) {
  if (workOrderBomLineIds.length === 0) return new Map<string, Prisma.Decimal>();

  const requestedLines = await database.factoryWorkOrderBomLine.findMany({
    where: {
      id: { in: workOrderBomLineIds },
      workOrder: { organization_id: organizationId },
    },
    select: { id: true, source_bom_item_id: true },
  });
  const sourceBomItemIds = [...new Set(requestedLines.map((line) => line.source_bom_item_id))];
  if (sourceBomItemIds.length === 0) return new Map<string, Prisma.Decimal>();

  const [workOrderLines, allocations] = await Promise.all([
    database.factoryWorkOrderBomLine.findMany({
      where: {
        source_bom_item_id: { in: sourceBomItemIds },
        workOrder: { organization_id: organizationId },
      },
      select: {
        id: true,
        source_bom_item_id: true,
        total_required_qty: true,
      },
      orderBy: [{ work_order_id: "asc" }, { id: "asc" }],
    }),
    database.rmGrnOrderAllocation.findMany({
      where: {
        organization_id: organizationId,
        groupedPurchaseOrderLine: {
          source_bom_item_id: { in: sourceBomItemIds },
          groupedPurchaseOrder: { organization_id: organizationId },
        },
      },
      select: {
        allocated_quantity: true,
        groupedPurchaseOrderLine: { select: { source_bom_item_id: true } },
      },
    }),
  ]);

  const allocatedBySource = new Map<string, Prisma.Decimal>();
  for (const allocation of allocations) {
    const sourceBomItemId = allocation.groupedPurchaseOrderLine.source_bom_item_id;
    allocatedBySource.set(
      sourceBomItemId,
      (allocatedBySource.get(sourceBomItemId) ?? new Prisma.Decimal(0)).plus(allocation.allocated_quantity),
    );
  }

  const linesBySource = new Map<string, typeof workOrderLines>();
  for (const line of workOrderLines) {
    const lines = linesBySource.get(line.source_bom_item_id) ?? [];
    lines.push(line);
    linesBySource.set(line.source_bom_item_id, lines);
  }

  const allocationByLineId = new Map<string, Prisma.Decimal>();
  for (const [sourceBomItemId, lines] of linesBySource) {
    const demandByLine = lines.map((line) => Prisma.Decimal.max(line.total_required_qty, 0));
    const totalDemand = demandByLine.reduce((total, quantity) => total.plus(quantity), new Prisma.Decimal(0));
    const totalAllocated = Prisma.Decimal.min(allocatedBySource.get(sourceBomItemId) ?? 0, totalDemand);
    let remaining = totalAllocated;
    if (!remaining.gt(0) || !totalDemand.gt(0)) continue;

    const shares = demandByLine.map((demand) => (totalAllocated
      .mul(demand)
      .div(totalDemand)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)));
    remaining = remaining.minus(shares.reduce((total, share) => total.plus(share), new Prisma.Decimal(0)));

    for (let index = 0; index < lines.length; index += 1) {
      const capacity = demandByLine[index].minus(shares[index]);
      const adjustment = Prisma.Decimal.min(
        capacity,
        remaining,
      ).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const share = shares[index].plus(adjustment);
      allocationByLineId.set(lines[index].id, share);
      remaining = remaining.minus(adjustment);
    }
  }

  return new Map(
    requestedLines.map((line) => [line.id, allocationByLineId.get(line.id) ?? new Prisma.Decimal(0)]),
  );
}
