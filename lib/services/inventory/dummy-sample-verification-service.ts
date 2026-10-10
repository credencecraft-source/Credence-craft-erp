import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { getRmGrnVerification, saveRmGrnVerification } from "@/lib/services/inventory/rm-grn-verification-service";

const SAMPLE_RECEIPT_COUNT = 5;

function randomQuantityAtMost(maximum: Prisma.Decimal) {
  const maximumCents = toCents(maximum);
  if (!Number.isSafeInteger(maximumCents) || maximumCents < 1) {
    throw new Error("A sample GRN line must have a positive quantity with up to two decimal places.");
  }
  const cents = Math.floor(Math.random() * maximumCents) + 1;
  return new Prisma.Decimal(cents).div(100).toString();
}

function toCents(quantity: Prisma.Decimal) {
  const cents = quantity.mul(100).floor().toNumber();
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("A sample verification quantity is outside the supported range.");
  }
  return cents;
}

function randomVerificationAllocations(
  allocations: Array<{
    groupedPurchaseOrderId: string;
    balanceToAllocate: string;
  }>,
  approvedQuantity: Prisma.Decimal,
) {
  const availableGroups = allocations
    .map((allocation) => ({
      groupedPurchaseOrderId: allocation.groupedPurchaseOrderId,
      availableCents: toCents(new Prisma.Decimal(allocation.balanceToAllocate)),
    }))
    .filter((allocation) => allocation.availableCents > 0);
  const availableCents = availableGroups.reduce((total, allocation) => total + allocation.availableCents, 0);
  const maximumCents = Math.min(toCents(approvedQuantity), availableCents);
  if (!Number.isSafeInteger(availableCents) || !Number.isSafeInteger(maximumCents) || maximumCents < 1) {
    throw new Error("A sample GRN line must have positive approved quantity and available grouping balance.");
  }

  let remainingCents = Math.floor(Math.random() * maximumCents) + 1;
  for (let index = availableGroups.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [availableGroups[index], availableGroups[swapIndex]] = [availableGroups[swapIndex], availableGroups[index]];
  }

  const allocatedByGroup = new Map<string, number>();
  for (const allocation of availableGroups) {
    if (remainingCents === 0) break;
    const allocatedCents = Math.min(remainingCents, allocation.availableCents);
    allocatedByGroup.set(allocation.groupedPurchaseOrderId, allocatedCents);
    remainingCents -= allocatedCents;
  }

  return allocations.map((allocation) => ({
    groupedPurchaseOrderId: allocation.groupedPurchaseOrderId,
    verificationAllocated: new Prisma.Decimal(allocatedByGroup.get(allocation.groupedPurchaseOrderId) ?? 0)
      .div(100)
      .toString(),
  }));
}

export async function verifyDummySampleGrns(
  organizationId: string,
  batchId: string,
  purchaseOrderIds: string[],
  receiptIds: string[],
  actorId: string,
) {
  if (purchaseOrderIds.length < 10 || receiptIds.length !== SAMPLE_RECEIPT_COUNT) {
    throw new Error("Step 6 must create five sample GRNs before verification can start.");
  }

  const expectedPurchaseOrderIds = purchaseOrderIds.slice(0, SAMPLE_RECEIPT_COUNT);
  const receipts = await prisma.inventoryReceipt.findMany({
    where: {
      organization_id: organizationId,
      id: { in: receiptIds },
      purchase_order_id: { in: expectedPurchaseOrderIds },
      notes: `Dummy sample batch ${batchId}`,
    },
    select: {
      id: true,
      purchase_order_id: true,
      lines: {
        select: {
          id: true,
          received_quantity: true,
          rmGrnVerification: {
            select: {
              id: true,
              allocations: { select: { verification_allocated: true } },
            },
          },
        },
      },
    },
  });

  const receiptByPurchaseOrderId = new Map(receipts.map((receipt) => [receipt.purchase_order_id, receipt]));
  if (
    receipts.length !== SAMPLE_RECEIPT_COUNT
    || new Set(receipts.map((receipt) => receipt.purchase_order_id)).size !== SAMPLE_RECEIPT_COUNT
    || expectedPurchaseOrderIds.some((purchaseOrderId) => !receiptByPurchaseOrderId.has(purchaseOrderId))
  ) {
    throw new Error("Each of the five sample GRNs must belong to a different expected Purchase Order.");
  }

  const totalLineCount = receipts.reduce((total, receipt) => total + receipt.lines.length, 0);
  if (totalLineCount === 0 || receipts.some((receipt) => receipt.lines.length === 0)) {
    throw new Error("Every sample GRN must contain at least one raw-material line to verify.");
  }

  let completedLineCount = receipts.reduce(
    (total, receipt) => total + receipt.lines.filter((line) =>
      line.rmGrnVerification?.allocations.some((allocation) => allocation.verification_allocated.greaterThan(0)),
    ).length,
    0,
  );
  for (const purchaseOrderId of expectedPurchaseOrderIds) {
    const receipt = receiptByPurchaseOrderId.get(purchaseOrderId);
    if (!receipt) throw new Error("A required sample GRN could not be loaded.");
    for (const line of receipt.lines) {
      if (line.rmGrnVerification?.allocations.some((allocation) => allocation.verification_allocated.greaterThan(0))) continue;

      const details = await getRmGrnVerification(organizationId, line.id);
      if (!details || !details.masterPurchaseOrderId) {
        throw new Error("A sample GRN line must be linked to a tenant-owned Master Group before verification.");
      }
      const verifiedDecimal = details.verifiedQuantity
        ? new Prisma.Decimal(details.verifiedQuantity)
        : new Prisma.Decimal(randomQuantityAtMost(line.received_quantity));
      const approvedDecimal = details.approvedQuantity
        ? new Prisma.Decimal(details.approvedQuantity)
        : new Prisma.Decimal(randomQuantityAtMost(verifiedDecimal));
      if (!verifiedDecimal.greaterThan(0) || !approvedDecimal.greaterThan(0)) {
        throw new Error("A sample GRN line must have positive verified and approved quantities before allocation.");
      }
      const allocations = randomVerificationAllocations(details.allocations, approvedDecimal);
      const result = await saveRmGrnVerification(
        organizationId,
        line.id,
        {
          verifiedQuantity: verifiedDecimal.toString(),
          approvedQuantity: approvedDecimal.toString(),
          allocations,
        },
        actorId,
      );
      if (!result.verificationId) {
        throw new Error("The normal GRN verification workflow did not persist a verification record.");
      }
      completedLineCount += 1;
    }
  }

  return {
    completedLineCount,
    totalLineCount,
    receiptIds,
  };
}
