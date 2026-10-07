import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  factoryWorkOrderFindFirst: vi.fn(),
  shopFloorProcessLogFindFirst: vi.fn(),
  shopFloorProcessLogFindMany: vi.fn(),
  shopFloorProcessLogGroupBy: vi.fn(),
  shopFloorProcessLogCreate: vi.fn(),
  shopFloorProcessLogCreateManyAndReturn: vi.fn(),
  shopFloorProcessLogUpdate: vi.fn(),
  shopFloorProcessLogUpdateMany: vi.fn(),
  shopFloorProcessLogDelete: vi.fn(),
  shopFloorProcessLogDeleteMany: vi.fn(),
  factoryWorkOrderFindMany: vi.fn(),
  workOrderProcessControllerProcessFindFirst: vi.fn(),
  batchMasterCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    factoryWorkOrder: {
      findFirst: mocks.factoryWorkOrderFindFirst,
      findMany: mocks.factoryWorkOrderFindMany,
    },
    shopFloorProcessLog: {
      findFirst: mocks.shopFloorProcessLogFindFirst,
      findMany: mocks.shopFloorProcessLogFindMany,
      groupBy: mocks.shopFloorProcessLogGroupBy,
      create: mocks.shopFloorProcessLogCreate,
      createManyAndReturn: mocks.shopFloorProcessLogCreateManyAndReturn,
      update: mocks.shopFloorProcessLogUpdate,
      delete: mocks.shopFloorProcessLogDelete,
    },
    workOrderProcessControllerProcess: {
      findFirst: mocks.workOrderProcessControllerProcessFindFirst,
    },
    batchMaster: {
      create: mocks.batchMasterCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { assignWorkToBatch, listShopFloorBoard, listShopFloorBoardSummary } from "./shop-floor-service";

describe("shop floor service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates missing first-process pools in one batch using one board read", async () => {
    mocks.factoryWorkOrderFindMany.mockResolvedValue([
      {
        id: "wo-1",
        work_order_no: "WO-001",
        total_qty: 20,
        status: "OPEN",
        created_at: new Date(),
        order: { orderNo: "ORD-100", styleName: "Style A", brand: "Brand 1", buyer: "Buyer 1", orderQty: 20 },
        processController: {
          processes: [{ id: "process-1", process_id: "master-process-1", process_name: "Cutting", sl_no: 1, order_qty: 20, created_qty: 0, completed_qty: 0, received_qty: 0, status: "OPEN", operations: [] }],
        },
        shopFloorBatches: [],
        shopFloorProcessLogs: [],
        shopFloorTransfers: [],
      },
      {
        id: "wo-2",
        work_order_no: "WO-002",
        total_qty: 30,
        status: "OPEN",
        created_at: new Date(),
        order: { orderNo: "ORD-200", styleName: "Style B", brand: "Brand 2" },
        processController: {
          processes: [{ id: "process-2", process_id: "master-process-1", process_name: "Cutting", sl_no: 1 }],
        },
        shopFloorBatches: [],
        shopFloorProcessLogs: [],
        shopFloorTransfers: [],
      },
    ]);
    mocks.shopFloorProcessLogCreateManyAndReturn.mockResolvedValue([{
      id: "log-1",
      work_order_id: "wo-1",
      process_id: "master-process-1",
      batch_id: null,
      quantity: 20,
      status: "UNASSIGNED",
      scanned_by: "user-1",
      received_at: new Date(),
      completed_at: null,
      created_at: new Date(),
    }, {
      id: "log-2",
      work_order_id: "wo-2",
      process_id: "master-process-1",
      batch_id: null,
      quantity: 30,
      status: "UNASSIGNED",
      scanned_by: "system",
      received_at: new Date(),
      completed_at: null,
      created_at: new Date(),
    }]);

    const board = await listShopFloorBoard("org-1");

    expect(mocks.shopFloorProcessLogCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(mocks.shopFloorProcessLogCreateManyAndReturn).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          organization_id: "org-1",
          work_order_id: "wo-1",
          process_id: "master-process-1",
          quantity: 20,
          status: "UNASSIGNED",
          scanned_by: "system",
          received_at: expect.any(Date),
          completed_at: null,
        }),
        expect.objectContaining({
          organization_id: "org-1",
          work_order_id: "wo-2",
          process_id: "master-process-1",
          quantity: 30,
          status: "UNASSIGNED",
          scanned_by: "system",
          received_at: expect.any(Date),
          completed_at: null,
        }),
      ]),
      select: {
        id: true,
        work_order_id: true,
        process_id: true,
        batch_id: true,
        quantity: true,
        status: true,
        scanned_by: true,
        received_at: true,
        completed_at: true,
        created_at: true,
      },
    });
    expect(mocks.factoryWorkOrderFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.factoryWorkOrderFindFirst).not.toHaveBeenCalled();
    expect(mocks.shopFloorProcessLogFindFirst).not.toHaveBeenCalled();
    expect(board.processes[0].processName).toBe("Cutting");
    expect(board.processes[0].queue).toHaveLength(1);
    expect(board.processes[0].statusCounts.UNASSIGNED).toBe(20);
  });

  it("aggregates overview counts in the database and batches pool initialization", async () => {
    mocks.factoryWorkOrderFindMany.mockResolvedValue([
      {
        id: "wo-1",
        total_qty: 12,
        created_at: new Date(),
        processController: {
          processes: [{ process_id: "master-process-1", process_name: "Cutting", sl_no: 1 }],
        },
      },
      {
        id: "wo-2",
        total_qty: 5,
        created_at: new Date(),
        processController: {
          processes: [{ process_id: "master-process-1", process_name: "Cutting", sl_no: 1 }],
        },
      },
    ]);
    mocks.shopFloorProcessLogGroupBy.mockResolvedValue([
      {
        work_order_id: "wo-1",
        process_id: "master-process-1",
        status: "ASSIGNED",
        _sum: { quantity: 3 },
        _count: { _all: 1 },
      },
      {
        work_order_id: "wo-1",
        process_id: "master-process-1",
        status: "COMPLETED",
        _sum: { quantity: 2 },
        _count: { _all: 1 },
      },
    ]);
    mocks.shopFloorProcessLogCreateManyAndReturn.mockResolvedValue([{
      work_order_id: "wo-2",
      process_id: "master-process-1",
      quantity: 5,
      status: "UNASSIGNED",
    }]);

    const board = await listShopFloorBoardSummary("org-1");

    expect(mocks.shopFloorProcessLogGroupBy).toHaveBeenCalledWith({
      by: ["work_order_id", "process_id", "status"],
      where: { organization_id: "org-1", work_order_id: { in: ["wo-1", "wo-2"] } },
      _sum: { quantity: true },
      _count: { _all: true },
    });
    expect(mocks.shopFloorProcessLogCreateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(board.processes).toEqual([{
      id: "cutting",
      processName: "Cutting",
      totalQty: 17,
      workOrderCount: 2,
      batchCount: 3,
      statusCounts: {
        UNASSIGNED: 5,
        ASSIGNED: 3,
        IN_PROGRESS: 0,
        COMPLETED: 2,
        TRANSFERRED: 0,
      },
    }]);
  });

  it("assigns available pool quantity into a batch and reduces the unassigned pool", async () => {
    mocks.factoryWorkOrderFindFirst.mockResolvedValue({ id: "wo-1", total_qty: 12 });
    mocks.workOrderProcessControllerProcessFindFirst.mockResolvedValue({ id: "controller-process-1", process_id: "master-process-1" });
    mocks.transaction.mockImplementation(async (callback: (database: Record<string, unknown>) => unknown) => {
      const transaction = {
        shopFloorProcessLog: {
          findMany: vi.fn().mockResolvedValue([{ id: "log-1", quantity: 12, process_id: "master-process-1", work_order_id: "wo-1", organization_id: "org-1", status: "UNASSIGNED", batch_id: null, created_at: new Date(), scanned_by: null, received_at: null, completed_at: null }]),
          updateMany: mocks.shopFloorProcessLogUpdateMany.mockResolvedValue({ count: 1 }),
          deleteMany: mocks.shopFloorProcessLogDeleteMany,
          create: mocks.shopFloorProcessLogCreate,
        },
        batchMaster: { create: mocks.batchMasterCreate },
      };
      mocks.batchMasterCreate.mockResolvedValue({ id: "batch-1" });
      mocks.shopFloorProcessLogCreate.mockResolvedValue({ id: "assigned-log-1" });
      return callback(transaction);
    });

    const result = await assignWorkToBatch("org-1", "wo-1", "master-process-1", 4, "user-1");

    expect(result.quantity).toBe(4);
    expect(mocks.batchMasterCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-1",
        work_order_id: "wo-1",
        process_id: "master-process-1",
        assigned_quantity: 4,
        created_by: "user-1",
      }),
    });
    expect(mocks.shopFloorProcessLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batch_id: "batch-1",
        status: "ASSIGNED",
        quantity: 4,
      }),
    });
    expect(mocks.shopFloorProcessLogUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "log-1",
        organization_id: "org-1",
        status: "UNASSIGNED",
        quantity: { gte: 4 },
      },
      data: { quantity: { decrement: 4 } },
    });
  });
});
