import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

import { getArticleOrderSummaryIndex } from "./order-summary-service";

describe("getArticleOrderSummaryIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns database-aggregated season summaries with bounded results", async () => {
    mocks.queryRaw.mockResolvedValue([{
      season: "Winter",
      article: null,
      article_count: BigInt(2),
      order_count: BigInt(3),
      total_order_qty: BigInt(15),
      buyers: ["Buyer A", "Buyer B"],
      styles: [],
      statuses: ["Draft", "Approved"],
    }]);

    const result = await getArticleOrderSummaryIndex("org-1", { limit: 2 });

    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(result).toEqual({
      summaries: [{
        season: "Winter",
        article: null,
        articleCount: 2,
        orderCount: 3,
        totalOrderQty: 15,
        buyers: ["Buyer A", "Buyer B"],
        styles: [],
        statuses: ["Draft", "Approved"],
      }],
      nextOffset: null,
    });
  });

  it("requests one extra article summary row to determine the next offset", async () => {
    mocks.queryRaw.mockResolvedValue(Array.from({ length: 3 }, (_, index) => ({
      season: "Winter",
      article: `Article ${index + 1}`,
      article_count: BigInt(1),
      order_count: BigInt(2),
      total_order_qty: BigInt(20),
      buyers: ["Buyer A"],
      styles: ["Style"],
      statuses: ["Draft"],
    })));

    await expect(getArticleOrderSummaryIndex("org-1", {
      view: "articles",
      season: "Winter",
      search: "jacket",
      status: "Draft",
      offset: 50,
      limit: 2,
    })).resolves.toMatchObject({ summaries: [{ article: "Article 1" }, { article: "Article 2" }], nextOffset: 52 });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });
});
