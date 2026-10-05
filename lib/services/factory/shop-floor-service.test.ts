import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  factoryWorkOrderFindFirst: vi.fn(),
  shopFloorProcessLogFindFirst: vi.fn(),
  shopFloorProcessLogFindMany: vi.fn(),
  shopFloorProcessLogCreate: vi.fn(),
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
      create: mocks.shopFloorProcessLogCreate,
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

import { assignWorkToBatch, listShopFloorBoard } from "./shop-floor-service";

describe("shop floor service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an unassigned pool for the first process when the board is loaded", async () => {
    mocks.factoryWorkOrderFindFirst.mockResolvedValue({
      id: "wo-1",
      total_qty: 20,
      processController: {
        processes: [{ id: "process-1", process_id: "master-process-1", process_name: "Cutting", sl_no: 1, order_qty: 20, created_qty: 0, completed_qty: 0, received_qty: 0, status: "OPEN", operations: [] }],
      },
    });
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
    ]);
    mocks.shopFloorProcessLogFindFirst.mockResolvedValue(null);
    mocks.shopFloorProcessLogCreate.mockResolvedValue({ id: "log-1" });

    const board = await listShopFloorBoard("org-1");

    expect(mocks.shopFloorProcessLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-1",
        work_order_id: "wo-1",
        process_id: "master-process-1",
        quantity: 20,
        status: "UNASSIGNED",
      }),
    });
    expect(board.processes[0].processName).toBe("Cutting");
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
