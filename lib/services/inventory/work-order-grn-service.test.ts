import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workOrderFindFirst: vi.fn(),
  workOrderFindMany: vi.fn(),
  grnLineFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    factoryWorkOrder: {
      findFirst: mocks.workOrderFindFirst,
      findMany: mocks.workOrderFindMany,
    },
    workOrderInventoryGrnLine: {
      findMany: mocks.grnLineFindMany,
    },
  },
}));

import { listWorkOrdersForReceiving } from "./work-order-grn-service";

describe("listWorkOrdersForReceiving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workOrderFindFirst.mockResolvedValue({ id: "work-order-1" });
    mocks.workOrderFindMany.mockResolvedValue([{
      id: "work-order-1",
      order_id: "order-1",
      work_order_no: "WO-01",
      order_no: "ORD-01",
      total_qty: 20,
      status: "IN PRODUCTION",
      order: { article: "ART-1", styleName: "Style 1", brand: "Brand 1", buyer: "Buyer 1" },
      sizeLines: [{ id: "size-line-1", size: "S", buyer_size: null, quantity: 20 }],
    }]);
    mocks.grnLineFindMany.mockResolvedValue([{
      work_order_id: "work-order-1",
      work_order_size_line_id: "size-line-1",
      received_quantity: 5,
      verified_actual_quantity: null,
      approved_quantity: null,
    }]);
  });

  it("scopes the work-order lookup and receipt history to the authorized organization", async () => {
    const result = await listWorkOrdersForReceiving("internal-org-1", { limit: 100 });

    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
      },
    }));
    expect(mocks.grnLineFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        work_order_id: { in: ["work-order-1"] },
        grn: { organization_id: "internal-org-1" },
      },
    }));
    expect(result.workOrders[0].sizeLines[0]).toMatchObject({
      previouslyReceivedQuantity: 5,
      availableQuantity: 15,
    });
  });

  it("includes OPEN work orders for receipt selection", async () => {
    mocks.workOrderFindMany.mockResolvedValue([{
      id: "open-work-order",
      order_id: "order-2",
      work_order_no: "WO-OPEN",
      order_no: "ORD-02",
      total_qty: 12,
      status: "OPEN",
      order: { article: null, styleName: null, brand: null, buyer: null },
      sizeLines: [{ id: "size-line-open", size: null, buyer_size: "M", quantity: 12 }],
    }]);
    mocks.grnLineFindMany.mockResolvedValue([]);

    const result = await listWorkOrdersForReceiving("internal-org-1");

    expect(result.workOrders).toHaveLength(1);
    expect(result.workOrders[0].status).toBe("OPEN");
    expect(mocks.workOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
  });

  it("rejects a pagination cursor that is outside the authorized organization", async () => {
    mocks.workOrderFindFirst.mockResolvedValue(null);

    await expect(listWorkOrdersForReceiving("internal-org-1", { cursor: "foreign-cursor" }))
      .rejects.toThrow(/list changed/i);

    expect(mocks.workOrderFindFirst).toHaveBeenCalledWith({
      where: {
        id: "foreign-cursor",
        organization_id: "internal-org-1",
      },
      select: { id: true },
    });
    expect(mocks.workOrderFindMany).not.toHaveBeenCalled();
  });
});
