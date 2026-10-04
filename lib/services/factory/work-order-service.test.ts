import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const merchandisingOrderFindFirst = vi.fn();
  const factoryWorkOrderCreate = vi.fn();
  const transaction = {
    merchandisingOrder: { findFirst: merchandisingOrderFindFirst },
    factoryWorkOrder: { create: factoryWorkOrderCreate },
    factoryWorkOrderBomLine: { createMany: vi.fn() },
    challanNumberConfiguration: { upsert: vi.fn(), update: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return {
    merchandisingOrderFindFirst,
    factoryWorkOrderCreate,
    transaction,
    prismaTransaction: vi.fn((callback: (database: typeof transaction) => unknown) => callback(transaction)),
    reserveChallanNumber: vi.fn(),
    createAuditEvent: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.prismaTransaction },
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: mocks.reserveChallanNumber,
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { createWorkOrders } from "./work-order-service";

describe("factory work-order batch creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveChallanNumber.mockResolvedValue("WO-1");
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.merchandisingOrderFindFirst.mockImplementation(async ({ where }: { where: { orderNo: string } }) => ({
      id: `source-${where.orderNo}`,
      orderNo: where.orderNo,
      finishedGoods: [{ id: `size-${where.orderNo}`, size: "M", buyerSize: "M", totalQty: 10 }],
      processTemplate: null,
      process_template_id: null,
      processSteps: [],
      bomItems: [],
      workOrders: [],
    }));
    let nextId = 0;
    mocks.factoryWorkOrderCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      nextId += 1;
      const sizeLines = data.sizeLines as { create: Array<Record<string, unknown>> };
      return {
        id: `work-order-${nextId}`,
        work_order_no: data.work_order_no,
        total_qty: data.total_qty,
        sizeLines: sizeLines.create.map((line, index) => ({ id: `line-${nextId}-${index}`, ...line })),
      };
    });
  });

  it("creates a multi-order request inside one serializable transaction", async () => {
    const workOrders = await createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-2", lines: [{ sourceFinishedGoodsId: "size-ORD-2", quantity: 6 }] },
    ]);

    expect(workOrders).toHaveLength(2);
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.prismaTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 30000,
    });
    expect(mocks.factoryWorkOrderCreate).toHaveBeenCalledTimes(2);
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate orders before opening a transaction", async () => {
    await expect(createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 2 }] },
    ])).rejects.toThrow("appears more than once");

    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("rejects batches beyond the bounded atomic size", async () => {
    const requests = Array.from({ length: 51 }, (_, index) => ({ orderNo: `ORD-${index}`, lines: [] }));

    await expect(createWorkOrders("internal-org-1", "user-1", requests)).rejects.toThrow("no more than 50 orders");
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("fails the entire batch when any member cannot be allocated", async () => {
    mocks.merchandisingOrderFindFirst.mockImplementation(async ({ where }: { where: { orderNo: string } }) => ({
      id: `source-${where.orderNo}`,
      orderNo: where.orderNo,
      finishedGoods: [{ id: `size-${where.orderNo}`, size: "M", buyerSize: "M", totalQty: where.orderNo === "ORD-2" ? 2 : 10 }],
      processTemplate: null,
      process_template_id: null,
      processSteps: [],
      bomItems: [],
      workOrders: [],
    }));

    await expect(createWorkOrders("internal-org-1", "user-1", [
      { orderNo: "ORD-1", lines: [{ sourceFinishedGoodsId: "size-ORD-1", quantity: 4 }] },
      { orderNo: "ORD-2", lines: [{ sourceFinishedGoodsId: "size-ORD-2", quantity: 3 }] },
    ])).rejects.toThrow("exceeds the remaining order quantity");

    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.factoryWorkOrderCreate).toHaveBeenCalledTimes(1);
  });
});
