import { describe, expect, it } from "vitest";

import { consolidateShopFloorProcesses, type ShopFloorProcessBoardRow } from "./shop-floor-board";

function processRow(
  workOrderId: string,
  processName: string,
  logId: string,
  quantity: number,
): ShopFloorProcessBoardRow {
  const workOrderNo = `WO-${workOrderId}`;
  return {
    id: `process-${workOrderId}`,
    workOrderId,
    workOrderNo,
    orderNo: `ORD-${workOrderId}`,
    processName,
    totalQty: quantity,
    statusCounts: { UNASSIGNED: quantity, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, TRANSFERRED: 0 },
    queue: [{
      id: logId,
      workOrderId,
      workOrderNo,
      processId: `master-process-${workOrderId}`,
      processName,
      quantity,
      status: "UNASSIGNED",
      batchId: null,
      contractorName: null,
      laborerName: null,
      scannedBy: null,
      receivedAt: null,
      completedAt: null,
    }],
    incomingTransfers: [],
  };
}

describe("consolidateShopFloorProcesses", () => {
  it("renders one tab per process name while retaining each work order's own queue item", () => {
    const result = consolidateShopFloorProcesses([
      processRow("1", "Cutting", "log-1", 100),
      processRow("2", "cutting", "log-2", 80),
      processRow("1", "Sewing", "log-3", 60),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      processName: "Cutting",
      totalQty: 180,
      workOrderCount: 2,
      statusCounts: { UNASSIGNED: 180 },
    });
    expect(result[0].queue.map((item) => [item.workOrderId, item.processId, item.id])).toEqual([
      ["1", "master-process-1", "log-1"],
      ["2", "master-process-2", "log-2"],
    ]);
  });
});
