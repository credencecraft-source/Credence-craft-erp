import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPublishedOnlineStore: vi.fn(),
  entityFindMany: vi.fn(),
  skuStockFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    masterEntity: { findMany: mocks.entityFindMany },
    finishedGoodsSkuStock: { findMany: mocks.skuStockFindMany },
  },
}));
vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  findPublishedOnlineStore: mocks.findPublishedOnlineStore,
}));

import { GET } from "./route";

const storeKey = "a".repeat(43);
const store = { id: "internal-org-1", organization_name: "Public Boutique" };

describe("public online-store catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPublishedOnlineStore.mockResolvedValue(store);
    mocks.entityFindMany.mockResolvedValue([{ id: "entity-1", entity_name: "Main Store" }]);
    mocks.skuStockFindMany.mockResolvedValue([]);
  });

  it("serves only active organization store locations without requiring a staff session", async () => {
    const response = await GET(
      new Request(`http://localhost/api/public/stores/${storeKey}/catalog`),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      storeName: "Public Boutique",
      entities: [{ id: "entity-1", name: "Main Store" }],
      records: [],
    });
    expect(mocks.entityFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", is_active: true },
      take: 100,
    }));
    expect(mocks.skuStockFindMany).not.toHaveBeenCalled();
  });

  it("returns bounded public stock scoped to the enabled store, location, and searchable fields", async () => {
    mocks.skuStockFindMany.mockResolvedValue([{
      id: "sku-1",
      style_name: "Shirt",
      order_no: "ORDER-1",
      article_no: "ARTICLE-1",
      brand: "Brand",
      size: "M",
      colour: "Navy",
      current_stock: 3,
      gst_rate: 5,
      hsn_code: "6105",
      sales_price: 125,
      mrp: 150,
    }]);
    const response = await GET(
      new Request(`http://localhost/api/public/stores/${storeKey}/catalog?entityId=entity-1&search=sh&limit=24&offset=0`),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      records: [{ id: "sku-1", current_stock: 3, stock_type: "SKU" }],
      hasMore: false,
    });
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        current_stock: { gt: 0 },
      }),
      skip: 0,
      take: 25,
    }));
  });

  it("does not expose a disabled or unknown store", async () => {
    mocks.findPublishedOnlineStore.mockResolvedValue(null);
    const response = await GET(
      new Request(`http://localhost/api/public/stores/${storeKey}/catalog`),
      { params: Promise.resolve({ storeKey }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.entityFindMany).not.toHaveBeenCalled();
  });
});
