import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  generalStockFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { finishedGoodsGeneralStockReceipt: { findMany: mocks.generalStockFindMany } },
}));

import { GET } from "./route";

describe("POS General FG stock route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.generalStockFindMany.mockResolvedValue([{
      id: "general-stock-1",
      style_name: "Classic Shirt",
      order_no: "ORDER-1",
      article_no: "ARTICLE-1",
      brand: "Brand",
      size: "M",
      colour: "Navy",
      product_category: "Garment",
      current_stock: 10,
      quantity_in: 12,
      quantity_out: 2,
      posted_at: new Date("2026-10-07T12:00:00Z"),
      created_by: "user-1",
      location: { location_name: "Finished Goods" },
    }]);
  });

  it("lists only positive General GRN stock scoped to authorized organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.generalStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", current_stock: { gt: 0 } },
    }));
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({
      id: "general-stock-1",
      current_stock: 10,
      inventory_bucket: "GENERAL",
      source: "WORK_ORDER_GRN",
    });
  });

  it("resolves a scanned record only from General stock", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockId=general-stock-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.generalStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", current_stock: { gt: 0 }, id: "general-stock-1" },
    }));
  });

  it("returns not found when scanned stock is unavailable", async () => {
    mocks.generalStockFindMany.mockResolvedValue([]);
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockId=allocated-stock-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain("General");
  });
});
