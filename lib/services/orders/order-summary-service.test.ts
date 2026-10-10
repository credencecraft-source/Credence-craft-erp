import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    merchandisingOrder: {
      findMany: mocks.findMany,
    },
  },
}));

import { getArticleOrderSummaryIndex } from "./order-summary-service";

describe("getArticleOrderSummaryIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only order summary fields and groups scalar order data", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "OD-1",
        season: " Winter ",
        article: " Jacket ",
        buyer: "Buyer A",
        orderQty: 10,
        deliveryDate: new Date("2026-10-03T00:00:00.000Z"),
      },
      {
        id: "order-2",
        orderNo: "OD-2",
        season: "Winter",
        article: "Jacket",
        buyer: "Buyer B",
        orderQty: 5,
        deliveryDate: null,
      },
    ]);

    const result = await getArticleOrderSummaryIndex("org-1");

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1" },
      select: expect.not.objectContaining({ finishedGoods: expect.anything(), bomItems: expect.anything() }),
    }));
    expect(result).toMatchObject([{
      season: "Winter",
      article: "Jacket",
      orderCount: 2,
      totalOrderQty: 15,
      buyers: ["Buyer A", "Buyer B"],
      orders: [{ deliveryDate: "2026-10-03" }, { deliveryDate: null }],
    }]);
  });
});
