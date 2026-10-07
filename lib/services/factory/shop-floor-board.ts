export type ShopFloorStatusKey = "UNASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "TRANSFERRED";

export type ShopFloorQueueItem = {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  processId: string;
  processName: string;
  quantity: number;
  status: ShopFloorStatusKey;
  batchId: string | null;
  contractorName: string | null;
  laborerName: string | null;
  scannedBy: string | null;
  receivedAt: string | null;
  completedAt: string | null;
};

export type ShopFloorProcessBoardRow = {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  orderNo: string;
  processName: string;
  totalQty: number;
  statusCounts: Record<ShopFloorStatusKey, number>;
  queue: ShopFloorQueueItem[];
  incomingTransfers: Array<{
    id: string;
    quantity: number;
    workOrderId: string;
    workOrderNo: string;
    fromProcessName: string;
    sentAt: string;
  }>;
};

export type ShopFloorProcessBoard = {
  id: string;
  processName: string;
  totalQty: number;
  workOrderCount: number;
  statusCounts: Record<ShopFloorStatusKey, number>;
  queue: ShopFloorQueueItem[];
  incomingTransfers: ShopFloorProcessBoardRow["incomingTransfers"];
};

export type ShopFloorProcessSummary = {
  id: string;
  processName: string;
  totalQty: number;
  workOrderCount: number;
  batchCount: number;
  statusCounts: Record<ShopFloorStatusKey, number>;
};

export function getShopFloorFlowTotals(statusCounts: Record<ShopFloorStatusKey, number>) {
  const out = statusCounts.TRANSFERRED;
  const balanceInHand = statusCounts.UNASSIGNED
    + statusCounts.ASSIGNED
    + statusCounts.IN_PROGRESS
    + statusCounts.COMPLETED;

  return {
    in: balanceInHand + out,
    out,
    balanceInHand,
  };
}

const STATUS_ORDER: ShopFloorStatusKey[] = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "TRANSFERRED"];

export function consolidateShopFloorProcesses(rows: ShopFloorProcessBoardRow[]): ShopFloorProcessBoard[] {
  const processes = new Map<string, ShopFloorProcessBoard & { workOrderIds: Set<string> }>();

  for (const row of rows) {
    const key = row.processName.trim().toLocaleLowerCase();
    if (!key) continue;
    let process = processes.get(key);
    if (!process) {
      process = {
        id: key,
        processName: row.processName.trim(),
        totalQty: 0,
        workOrderCount: 0,
        workOrderIds: new Set<string>(),
        statusCounts: { UNASSIGNED: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, TRANSFERRED: 0 },
        queue: [],
        incomingTransfers: [],
      };
      processes.set(key, process);
    }

    process.totalQty += row.totalQty;
    process.workOrderIds.add(row.workOrderId);
    for (const status of STATUS_ORDER) {
      process.statusCounts[status] += row.statusCounts[status] ?? 0;
    }
    process.queue.push(...row.queue);
    process.incomingTransfers.push(...row.incomingTransfers);
  }

  return [...processes.values()].map(({ workOrderIds, ...process }) => ({
    ...process,
    workOrderCount: workOrderIds.size,
  }));
}
