import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  getRmGrnOrderAllocationLines,
  saveRmGrnOrderAllocations,
} from "@/lib/services/inventory/rm-grn-order-allocation-service";

const SAMPLE_RECEIPT_COUNT = 5;
const ZERO = new Prisma.Decimal(0);

export async function allocateDummySampleGrnsTopDown(
  organizationId: string,
  batchId: string,
  receiptIds: string[],
  actorId: string,
) {
  if (receiptIds.length !== SAMPLE_RECEIPT_COUNT) {
    throw new Error("Step 7 must verify all five sample GRNs before allocation can start.");
  }

  const records = await prisma.rmGrnVerificationAllocation.findMany({
    where: {
      organization_id: organizationId,
      verification: {
        organization_id: organizationId,
        inventoryReceiptLine: {
          receipt: {
            organization_id: organizationId,
            id: { in: receiptIds },
            notes: `Dummy sample batch ${batchId}`,
          },
        },
      },
      verification_allocated: { gt: ZERO },
    },
    select: { id: true, verification_allocated: true },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  if (records.length === 0) {
    throw new Error("No positive sample verification allocations are available for Step 8.");
  }

  let completedCount = 0;
  for (const record of records) {
    const allocation = await getRmGrnOrderAllocationLines(organizationId, record.id);
    const verificationAllocated = new Prisma.Decimal(allocation.verificationAllocated);
    let remaining = verificationAllocated.minus(
      allocation.lines.reduce((total, line) => total.plus(line.allocate), ZERO),
    );
    if (remaining.isNegative()) {
      throw new Error("Existing sample order-line allocations exceed their verification allocation.");
    }

    const lines = allocation.lines.map((line) => {
      const current = new Prisma.Decimal(line.allocate);
      const capacity = new Prisma.Decimal(line.balanceToAllocate);
      const additional = Prisma.Decimal.min(remaining, capacity);
      remaining = remaining.minus(additional);
      return {
        groupedPurchaseOrderLineId: line.groupedPurchaseOrderLineId,
        allocatedQuantity: current.plus(additional).toString(),
      };
    });
    if (remaining.greaterThan(0)) {
      throw new Error("The available grouped order-line quantities cannot cover a sample verification allocation.");
    }

    const result = await saveRmGrnOrderAllocations(
      organizationId,
      record.id,
      lines,
      actorId,
    );
    if (!result.fullyAllocated) {
      throw new Error(`Sample verification allocation ${record.id} was not fully allocated.`);
    }
    completedCount += 1;
  }

  return { completedCount, totalCount: records.length };
}
