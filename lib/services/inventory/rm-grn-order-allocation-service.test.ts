import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  allocationFindFirst: vi.fn(),
  transactionAllocationFindFirst: vi.fn(),
  allocationGroupBy: vi.fn(),
  allocationUpsert: vi.fn(),
  allocationDeleteMany: vi.fn(),
  transaction: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    rmGrnVerificationAllocation: { findFirst: mocks.allocationFindFirst },
    rmGrnOrderAllocation: { groupBy: mocks.allocationGroupBy },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  getRmGrnOrderAllocationLines,
  InvalidRmGrnOrderAllocationError,
  RmGrnOrderAllocationNotFoundError,
  saveRmGrnOrderAllocations,
} from "./rm-grn-order-allocation-service";

const allocation = () => ({
  id: "allocation-1",
  organization_id: "org-1",
  grouped_purchase_order_id: "group-1",
  verification_allocated: new Prisma.Decimal("5"),
  verification: { organization_id: "org-1", inventory_receipt_line_id: "receipt-line-1" },
  groupedPurchaseOrder: {
    organization_id: "org-1",
    lines: [
      { id: "line-1", order_no: "ORDER-1", style_name: "STYLE-1", grouped_qty: new Prisma.Decimal("5") },
      { id: "line-2", order_no: "ORDER-2", style_name: "STYLE-2", grouped_qty: new Prisma.Decimal("3") },
    ],
  },
  orderAllocations: [{ grouped_purchase_order_line_id: "line-1", allocated_quantity: new Prisma.Decimal("1") }],
});

const transaction = {
  rmGrnVerificationAllocation: { findFirst: mocks.transactionAllocationFindFirst },
  rmGrnOrderAllocation: {
    groupBy: mocks.allocationGroupBy,
    upsert: mocks.allocationUpsert,
    deleteMany: mocks.allocationDeleteMany,
  },
};

describe("RM GRN order allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.allocationGroupBy.mockResolvedValue([]);
    mocks.allocationUpsert.mockResolvedValue({});
    mocks.allocationDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("loads order lines and remaining capacity within the authorized organization", async () => {
    mocks.allocationFindFirst.mockResolvedValue(allocation());
    mocks.allocationGroupBy.mockResolvedValue([
      { grouped_purchase_order_line_id: "line-1", _sum: { allocated_quantity: new Prisma.Decimal("3") } },
      { grouped_purchase_order_line_id: "line-2", _sum: { allocated_quantity: new Prisma.Decimal("0.5") } },
    ]);

    await expect(getRmGrnOrderAllocationLines("org-1", "allocation-1")).resolves.toEqual({
      verificationAllocated: "5",
      lines: [
        {
          groupedPurchaseOrderLineId: "line-1",
          orderNo: "ORDER-1",
          styleNo: "STYLE-1",
          alreadyAllocated: "2",
          balanceToAllocate: "2",
          grouped: "5",
          allocate: "1",
          maxAllocatable: "3",
        },
        {
          groupedPurchaseOrderLineId: "line-2",
          orderNo: "ORDER-2",
          styleNo: "STYLE-2",
          alreadyAllocated: "0.5",
          balanceToAllocate: "2.5",
          grouped: "3",
          allocate: "0",
          maxAllocatable: "2.5",
        },
      ],
    });
    expect(mocks.allocationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "allocation-1", organization_id: "org-1" },
    }));
  });

  it("does not load an allocation from another organization", async () => {
    mocks.allocationFindFirst.mockResolvedValue(null);

    await expect(getRmGrnOrderAllocationLines("org-1", "foreign-allocation")).rejects.toBeInstanceOf(RmGrnOrderAllocationNotFoundError);
    expect(mocks.allocationGroupBy).not.toHaveBeenCalled();
  });

  it("saves valid line quantities transactionally and records an audit event", async () => {
    mocks.transactionAllocationFindFirst.mockResolvedValue(allocation());
    mocks.allocationGroupBy.mockResolvedValue([
      { grouped_purchase_order_line_id: "line-1", _sum: { allocated_quantity: new Prisma.Decimal("2") } },
    ]);

    await expect(saveRmGrnOrderAllocations("org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "2.5" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "2" },
    ], "user-1")).resolves.toEqual({ allocatedQuantity: "4.5", fullyAllocated: false });

    expect(mocks.allocationUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.allocationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        organization_id: "org-1",
        verification_allocation_id: "allocation-1",
        grouped_purchase_order_line_id: "line-1",
        allocated_quantity: new Prisma.Decimal("2.5"),
        created_by: "user-1",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("rejects a total above the GRN verification allocation before writing", async () => {
    mocks.transactionAllocationFindFirst.mockResolvedValue(allocation());

    await expect(saveRmGrnOrderAllocations("org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "3" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "3" },
    ], "user-1")).rejects.toBeInstanceOf(InvalidRmGrnOrderAllocationError);
    expect(mocks.allocationUpsert).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects quantities above the order line's remaining grouped capacity", async () => {
    mocks.transactionAllocationFindFirst.mockResolvedValue(allocation());
    mocks.allocationGroupBy.mockResolvedValue([
      { grouped_purchase_order_line_id: "line-1", _sum: { allocated_quantity: new Prisma.Decimal("4") } },
    ]);

    await expect(saveRmGrnOrderAllocations("org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "2" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "0" },
    ], "user-1")).rejects.toThrow("An order-line allocation exceeds its remaining grouped quantity.");
    expect(mocks.allocationUpsert).not.toHaveBeenCalled();
  });

  it("rejects line IDs outside the selected grouped order", async () => {
    mocks.transactionAllocationFindFirst.mockResolvedValue(allocation());

    await expect(saveRmGrnOrderAllocations("org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "foreign-line", allocatedQuantity: "1" },
      { groupedPurchaseOrderLineId: "line-2", allocatedQuantity: "0" },
    ], "user-1")).rejects.toBeInstanceOf(InvalidRmGrnOrderAllocationError);
    expect(mocks.allocationUpsert).not.toHaveBeenCalled();
  });
});