import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaMock, getAllocationLinesMock, saveAllocationsMock } = vi.hoisted(() => ({
  prismaMock: { rmGrnVerificationAllocation: { findMany: vi.fn() } },
  getAllocationLinesMock: vi.fn(),
  saveAllocationsMock: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/inventory/rm-grn-order-allocation-service", () => ({
  getRmGrnOrderAllocationLines: getAllocationLinesMock,
  saveRmGrnOrderAllocations: saveAllocationsMock,
}));

import { allocateDummySampleGrnsTopDown } from "./dummy-sample-allocation-service";

const receiptIds = Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.rmGrnVerificationAllocation.findMany.mockResolvedValue([
    { id: "allocation-1", verification_allocated: new Prisma.Decimal("4") },
    { id: "allocation-2", verification_allocated: new Prisma.Decimal("3") },
  ]);
  saveAllocationsMock.mockResolvedValue({ fullyAllocated: true });
});

describe("allocateDummySampleGrnsTopDown", () => {
  it("allocates from the first grouped line down and preserves existing line quantities", async () => {
    getAllocationLinesMock
      .mockResolvedValueOnce({
        verificationAllocated: "4",
        lines: [
          { groupedPurchaseOrderLineId: "line-1", allocate: "0", balanceToAllocate: "3" },
          { groupedPurchaseOrderLineId: "line-2", allocate: "0", balanceToAllocate: "5" },
        ],
      })
      .mockResolvedValueOnce({
        verificationAllocated: "3",
        lines: [
          { groupedPurchaseOrderLineId: "line-1", allocate: "1", balanceToAllocate: "2" },
          { groupedPurchaseOrderLineId: "line-2", allocate: "0", balanceToAllocate: "4" },
        ],
      });

    await expect(allocateDummySampleGrnsTopDown("org-1", "batch-1", receiptIds, "user-1"))
      .resolves.toEqual({ completedCount: 2, totalCount: 2 });

    expect(prismaMock.rmGrnVerificationAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        verification: expect.objectContaining({
          inventoryReceiptLine: expect.objectContaining({
            receipt: expect.objectContaining({
              organization_id: "org-1",
              id: { in: receiptIds },
              notes: "Dummy sample batch batch-1",
            }),
          }),
        }),
      }),
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }));
    expect(saveAllocationsMock).toHaveBeenNthCalledWith(1, "org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "3" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "1" },
    ], "user-1");
    expect(saveAllocationsMock).toHaveBeenNthCalledWith(2, "org-1", "allocation-2", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "3" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "0" },
    ], "user-1");
  });

  it("resubmits already-complete allocations without adding more quantity", async () => {
    prismaMock.rmGrnVerificationAllocation.findMany.mockResolvedValue([
      { id: "allocation-1", verification_allocated: new Prisma.Decimal("4") },
    ]);
    getAllocationLinesMock.mockResolvedValue({
      verificationAllocated: "4",
      lines: [
        { groupedPurchaseOrderLineId: "line-1", allocate: "3", balanceToAllocate: "0" },
        { groupedPurchaseOrderLineId: "line-2", allocate: "1", balanceToAllocate: "4" },
      ],
    });

    await expect(allocateDummySampleGrnsTopDown("org-1", "batch-1", receiptIds, "user-1"))
      .resolves.toEqual({ completedCount: 1, totalCount: 1 });
    expect(saveAllocationsMock).toHaveBeenCalledWith("org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "3" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "1" },
    ], "user-1");
  });
});
