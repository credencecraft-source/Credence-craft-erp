import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  receiptFindMany: vi.fn(),
  getVerification: vi.fn(),
  saveVerification: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { inventoryReceipt: { findMany: mocks.receiptFindMany } },
}));
vi.mock("@/lib/services/inventory/rm-grn-verification-service", () => ({
  getRmGrnVerification: mocks.getVerification,
  saveRmGrnVerification: mocks.saveVerification,
}));

import { verifyDummySampleGrns } from "./dummy-sample-verification-service";

const purchaseOrderIds = Array.from({ length: 10 }, (_, index) => `po-${index + 1}`);
const receiptIds = Array.from({ length: 5 }, (_, index) => `receipt-${index + 1}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.receiptFindMany.mockResolvedValue(receiptIds.map((id, index) => ({
    id,
    purchase_order_id: purchaseOrderIds[index],
    lines: [
      { id: `line-${index + 1}-1`, received_quantity: new Prisma.Decimal("12"), rmGrnVerification: null },
      { id: `line-${index + 1}-2`, received_quantity: new Prisma.Decimal("8"), rmGrnVerification: null },
    ],
  })));
  mocks.getVerification.mockResolvedValue({
    masterPurchaseOrderId: "master-1",
    grnQuantity: "12",
    verifiedQuantity: "",
    approvedQuantity: "",
    allocations: [{
      groupedPurchaseOrderId: "group-1",
      totalGroupedQty: "10",
      balanceToAllocate: "10",
    }],
  });
  mocks.saveVerification.mockImplementation(async (_organizationId: string, lineId: string, input: {
    verifiedQuantity: string;
    approvedQuantity: string;
    allocations: Array<{ groupedPurchaseOrderId: string; verificationAllocated: string }>;
  }) => ({
    verificationId: `verification-${lineId}`,
    verifiedQuantity: input.verifiedQuantity,
    approvedQuantity: input.approvedQuantity,
  }));
});

describe("dummy sample GRN verification", () => {
  it("verifies every sample GRN line through the standard service with varied quantities", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.getVerification
      .mockResolvedValueOnce({
        masterPurchaseOrderId: "master-1",
        grnQuantity: "12",
        verifiedQuantity: "",
        approvedQuantity: "",
        allocations: [{
          groupedPurchaseOrderId: "group-1",
          totalGroupedQty: "10",
          balanceToAllocate: "10",
        }],
      })
      .mockResolvedValueOnce({
        masterPurchaseOrderId: "master-1",
        grnQuantity: "8",
        verifiedQuantity: "",
        approvedQuantity: "",
        allocations: [{
          groupedPurchaseOrderId: "group-1",
          totalGroupedQty: "10",
          balanceToAllocate: "10",
        }],
      });

    await expect(verifyDummySampleGrns("org-1", "batch-1", purchaseOrderIds, receiptIds, "actor-1"))
      .resolves.toMatchObject({ completedLineCount: 10, totalLineCount: 10, receiptIds });

    expect(mocks.receiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-1",
        id: { in: receiptIds },
        purchase_order_id: { in: purchaseOrderIds.slice(0, 5) },
        notes: "Dummy sample batch batch-1",
      },
    }));
    expect(mocks.saveVerification).toHaveBeenCalledTimes(10);
    expect(mocks.saveVerification).toHaveBeenNthCalledWith(1, "org-1", "line-1-1", {
      verifiedQuantity: "6.01",
      approvedQuantity: "3.01",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "1.51" }],
    }, "actor-1");
    expect(mocks.saveVerification).toHaveBeenNthCalledWith(2, "org-1", "line-1-2", {
      verifiedQuantity: "4.01",
      approvedQuantity: "2.01",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "1.01" }],
    }, "actor-1");
    expect(mocks.saveVerification.mock.calls.every((call) => {
      const approved = Number(call[2].approvedQuantity);
      const verified = Number(call[2].verifiedQuantity);
      const allocated = call[2].allocations.reduce(
        (total: number, allocation: { verificationAllocated: string }) => total + Number(allocation.verificationAllocated),
        0,
      );
      return allocated > 0 && allocated <= approved && approved <= verified && allocated <= 10;
    }))
      .toBe(true);
    random.mockRestore();
  });

  it("resumes by leaving already-verified lines unchanged", async () => {
    mocks.receiptFindMany.mockResolvedValue([
      {
        id: receiptIds[0],
        purchase_order_id: purchaseOrderIds[0],
        lines: [
          {
            id: "line-already-verified",
            received_quantity: new Prisma.Decimal("12"),
            rmGrnVerification: { id: "verification-existing", allocations: [{ verification_allocated: new Prisma.Decimal("2") }] },
          },
          { id: "line-pending", received_quantity: new Prisma.Decimal("8"), rmGrnVerification: null },
        ],
      },
      ...receiptIds.slice(1).map((id, index) => ({
        id,
        purchase_order_id: purchaseOrderIds[index + 1],
        lines: [{
          id: `line-${index + 2}`,
          received_quantity: new Prisma.Decimal("8"),
          rmGrnVerification: { id: `verification-${index + 2}`, allocations: [{ verification_allocated: new Prisma.Decimal("1") }] },
        }],
      })),
    ]);

    const progress = await verifyDummySampleGrns("org-1", "batch-1", purchaseOrderIds, receiptIds, "actor-1");

    expect(progress).toMatchObject({ completedLineCount: 6, totalLineCount: 6 });
    expect(mocks.getVerification).not.toHaveBeenCalledWith("org-1", "line-already-verified");
    expect(mocks.saveVerification).toHaveBeenCalledTimes(1);
  });

  it("refuses to verify receipts that do not belong to the five required POs", async () => {
    mocks.receiptFindMany.mockResolvedValue(receiptIds.map((id, index) => ({
      id,
      purchase_order_id: index === 0 ? "other-po" : purchaseOrderIds[index],
      lines: [{ id: `line-${index}`, received_quantity: new Prisma.Decimal("8"), rmGrnVerification: null }],
    })));

    await expect(verifyDummySampleGrns("org-1", "batch-1", purchaseOrderIds, receiptIds, "actor-1"))
      .rejects.toThrow("Each of the five sample GRNs must belong to a different expected Purchase Order.");
    expect(mocks.saveVerification).not.toHaveBeenCalled();
  });

  it("fails instead of silently skipping a line without grouping allocation capacity", async () => {
    mocks.getVerification.mockResolvedValue({
      masterPurchaseOrderId: "master-1",
      grnQuantity: "12",
      allocations: [{ groupedPurchaseOrderId: "group-1", totalGroupedQty: "0", balanceToAllocate: "0" }],
    });

    await expect(verifyDummySampleGrns("org-1", "batch-1", purchaseOrderIds, receiptIds, "actor-1"))
      .rejects.toThrow("A sample GRN line must have positive approved quantity and available grouping balance.");
    expect(mocks.saveVerification).not.toHaveBeenCalled();
  });

  it("repairs existing zero-allocation verifications without changing saved quantities", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mocks.receiptFindMany.mockResolvedValue(receiptIds.map((id, index) => ({
      id,
      purchase_order_id: purchaseOrderIds[index],
      lines: [{
        id: `line-${index + 1}`,
        received_quantity: new Prisma.Decimal("12"),
        rmGrnVerification: index === 0
          ? { id: "verification-zero-allocation", allocations: [] }
          : { id: `verification-${index + 1}`, allocations: [{ verification_allocated: new Prisma.Decimal("1") }] },
      }],
    })));
    mocks.getVerification.mockResolvedValue({
      masterPurchaseOrderId: "master-1",
      grnQuantity: "12",
      verifiedQuantity: "6.01",
      approvedQuantity: "3.01",
      allocations: [{
        groupedPurchaseOrderId: "group-1",
        totalGroupedQty: "10",
        balanceToAllocate: "10",
      }],
    });

    await expect(verifyDummySampleGrns("org-1", "batch-1", purchaseOrderIds, receiptIds, "actor-1"))
      .resolves.toMatchObject({ completedLineCount: 5, totalLineCount: 5 });

    expect(mocks.saveVerification).toHaveBeenCalledTimes(1);
    expect(mocks.saveVerification).toHaveBeenCalledWith("org-1", "line-1", {
      verifiedQuantity: "6.01",
      approvedQuantity: "3.01",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "1.51" }],
    }, "actor-1");
    vi.restoreAllMocks();
  });
});
