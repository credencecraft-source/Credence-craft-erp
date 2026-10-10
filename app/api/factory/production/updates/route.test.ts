import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const factoryWorkOrderFindFirst = vi.fn();
  const transaction = {
    factoryWorkOrder: { findFirst: factoryWorkOrderFindFirst },
    workOrderProcessControllerProcess: { findFirst: vi.fn() },
  };
  return {
    requireSessionUser: vi.fn(),
    requireOrganizationContext: vi.fn(),
    processFindFirst: vi.fn(),
    factoryWorkOrderFindFirst,
    transaction,
    transactionProcessFindFirst: transaction.workOrderProcessControllerProcess.findFirst,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workOrderProcessControllerProcess: { findFirst: mocks.processFindFirst },
    $transaction: mocks.prismaTransaction,
  },
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { POST } from "./route";

describe("factory production update lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.processFindFirst.mockResolvedValue({
      id: "process-1",
      order_qty: 10,
      completed_qty: 0,
      operations: [],
    });
    mocks.factoryWorkOrderFindFirst.mockResolvedValue({
      id: "work-order-1",
      status: "OPEN",
      sizeLines: [{ source_finished_goods_id: "size-1", size: "M", buyer_size: "M", quantity: 10 }],
    });
    mocks.transactionProcessFindFirst.mockResolvedValue({
      id: "process-1",
      order_qty: 10,
      completed_qty: 0,
      operations: [],
    });
  });

  it("requires an order to be released to production before recording completed quantities", async () => {
    const response = await POST(new Request("http://localhost/api/factory/production/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        workOrderId: "work-order-1",
        processName: "Cutting",
        completedQty: 2,
        sizeLines: [{ sourceFinishedGoodsId: "size-1", size: "M", buyerSize: "M", quantity: 2 }],
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Set the work order to IN PRODUCTION before recording production updates.",
    });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(mocks.factoryWorkOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work-order-1", organization_id: "internal-org-1" },
    }));
  });
});
