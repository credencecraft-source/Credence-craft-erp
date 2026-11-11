import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  generalStockFindMany: vi.fn(),
  skuStockFindMany: vi.fn(),
  entityFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    masterEntity: { findFirst: mocks.entityFindFirst },
    finishedGoodsGeneralStockReceipt: { findMany: mocks.generalStockFindMany },
    finishedGoodsSkuStock: { findMany: mocks.skuStockFindMany },
  },
}));

import { GET } from "./route";

describe("POS General FG stock route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.skuStockFindMany.mockResolvedValue([]);
    mocks.generalStockFindMany.mockResolvedValue([{
      id: "general-stock-1",
      entity_id: "entity-1",
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
    mocks.entityFindFirst.mockResolvedValue({ id: "entity-1" });
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
      orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
      take: 11,
    }));
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        source: { in: expect.arrayContaining(["DIRECT", "DIRECT_FROM_INVENTORY"]) },
        current_stock: { gt: 0 },
      }),
      orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
      take: 11,
    }));
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({
      id: "general-stock-1",
      current_stock: 10,
      inventory_bucket: "GENERAL",
      source: "WORK_ORDER_GRN",
    });

    expect(body.hasMore).toBe(false);
  });

  it("denies stock reads before querying when VIEW_INVENTORY_STOCK is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: VIEW_INVENTORY_STOCK permission is required."),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.generalStockFindMany).not.toHaveBeenCalled();
    expect(mocks.skuStockFindMany).not.toHaveBeenCalled();
  });

  it("resolves a scanned record only from General stock", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockId=general-stock-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.generalStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", current_stock: { gt: 0 }, id: "general-stock-1" },
      take: 2,
    }));
  });

  it("searches tenant stock fields with a bounded result set", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?search=sh"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.generalStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        current_stock: { gt: 0 },
        OR: expect.arrayContaining([
          { style_name: { contains: "sh", mode: "insensitive" } },
          { order_no: { contains: "sh", mode: "insensitive" } },
        ]),
      }),
      orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
      take: 11,
    }));
  });

  it("limits stock lookups to an active Entity in the authorized organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?entityId=entity-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.entityFindFirst).toHaveBeenCalledWith({
      where: { id: "entity-1", organization_id: "internal-org-1", is_active: true },
      select: { id: true },
    });
    expect(mocks.generalStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        current_stock: { gt: 0 },
        entity_id: "entity-1",
      },
    }));
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entity_id: "entity-1" }),
    }));
  });

  it("returns only the first 10 General stock records in alphabetical order", async () => {
    mocks.generalStockFindMany.mockResolvedValue([]);
    mocks.skuStockFindMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        id: `sku-stock-${index + 1}`,
        style_name: `Style ${String.fromCharCode(65 + index)}`,
        order_no: `ORDER-${index + 1}`,
        article_no: `ARTICLE-${index + 1}`,
        brand: "Brand",
        size: "M",
        colour: "Navy",
        product_category: "Garment",
        sub_product_category: null,
        current_stock: 10,
        qty_in: 12,
        qty_out: 2,
        gst_rate: 5,
        hsn_code: "6105",
        purchase_price: 50,
        sales_price: 100,
        mrp: 120,
        sku_code: `SKU-${index + 1}`,
        barcode: `BARCODE-${index + 1}`,
        source: "DIRECT_FROM_INVENTORY",
        added_time: new Date("2026-10-07T12:00:00Z"),
        added_user: "user@example.test",
        location: { location_name: "Finished Goods" },
      })),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.records).toHaveLength(10);
    expect(body.hasMore).toBe(true);
    expect(body.records.map((record: { style_name: string }) => record.style_name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Style ${String.fromCharCode(65 + index)}`),
    );
  });

  it("supports bounded tenant-scoped pagination for explicit stock types", async () => {
    mocks.generalStockFindMany.mockResolvedValue([]);
    mocks.skuStockFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockType=SKU&limit=50&offset=50"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "internal-org-1" }),
      skip: 50,
      take: 51,
    }));
    expect(mocks.generalStockFindMany).not.toHaveBeenCalled();
  });

  it("rejects unbounded pagination and pagination across merged stock types", async () => {
    const unbounded = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockType=SKU&limit=500"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const merged = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?offset=10"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(unbounded.status).toBe(400);
    expect(merged.status).toBe(400);
  });

  it("merges SKU and GRN inventory before applying the first 10 alphabetical limit", async () => {
    const postedAt = new Date("2026-10-07T12:00:00Z");
    mocks.skuStockFindMany.mockResolvedValue(
      ["A", "C", "E", "G", "I", "K"].map((letter) => ({
        id: `sku-${letter}`,
        style_name: letter,
        order_no: "DIRECT",
        article_no: "DIRECT",
        brand: null,
        size: "M",
        colour: null,
        product_category: "Garment",
        sub_product_category: null,
        current_stock: 1,
        qty_in: 1,
        qty_out: 0,
        gst_rate: null,
        hsn_code: null,
        purchase_price: null,
        sales_price: null,
        mrp: null,
        sku_code: null,
        barcode: null,
        source: "DIRECT",
        added_time: postedAt,
        added_user: "user@example.test",
        location: { location_name: "Finished Goods" },
      })),
    );
    mocks.generalStockFindMany.mockResolvedValue(
      ["B", "D", "F", "H", "J", "L"].map((letter) => ({
        id: `grn-${letter}`,
        style_name: letter,
        order_no: `ORDER-${letter}`,
        article_no: `ARTICLE-${letter}`,
        brand: null,
        size: "M",
        colour: null,
        product_category: "Garment",
        current_stock: 1,
        quantity_in: 1,
        quantity_out: 0,
        posted_at: postedAt,
        created_by: "user-1",
        location: { location_name: "Finished Goods" },
      })),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.records.map((record: { style_name: string }) => record.style_name)).toEqual(
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
    );
    expect(body.hasMore).toBe(true);
  });

  it("includes direct General SKU stock such as Rascal in the alphabetical results", async () => {
    mocks.generalStockFindMany.mockResolvedValue([]);
    mocks.skuStockFindMany.mockResolvedValue([{
      id: "rascal-stock-1",
      style_name: "Rascal",
      order_no: "DIRECT",
      article_no: "DIRECT",
      brand: "Brand",
      size: "M",
      colour: "Black",
      product_category: "Garment",
      sub_product_category: null,
      current_stock: 8,
      qty_in: 10,
      qty_out: 2,
      gst_rate: 5,
      hsn_code: "6105",
      purchase_price: 50,
      sales_price: 100,
      mrp: 120,
      sku_code: "RASCAL-M-BLACK",
      barcode: "RASCAL-BARCODE",
      source: "DIRECT_FROM_INVENTORY",
      added_time: new Date("2026-10-07T12:00:00Z"),
      added_user: "user@example.test",
      location: { location_name: "Finished Goods" },
    }]);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?search=ra"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.records).toHaveLength(1);
    expect(body.records[0]).toMatchObject({
      id: "rascal-stock-1",
      stock_type: "SKU",
      style_name: "Rascal",
      current_stock: 8,
      inventory_bucket: "GENERAL",
    });
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        current_stock: { gt: 0 },
        OR: expect.arrayContaining([
          { style_name: { contains: "ra", mode: "insensitive" } },
          { article_no: { contains: "ra", mode: "insensitive" } },
        ]),
      }),
    }));
  });

  it("resolves scanned SKU stock only from its authorized organization", async () => {
    mocks.generalStockFindMany.mockResolvedValue([]);
    mocks.skuStockFindMany.mockResolvedValue([{
      id: "sku-stock-1",
      style_name: "Rascal",
      order_no: "DIRECT",
      article_no: "DIRECT",
      brand: null,
      size: "M",
      colour: "Black",
      product_category: "Garment",
      sub_product_category: null,
      current_stock: 2,
      qty_in: 2,
      qty_out: 0,
      gst_rate: null,
      hsn_code: null,
      purchase_price: null,
      sales_price: null,
      mrp: null,
      sku_code: null,
      barcode: null,
      source: "DIRECT",
      added_time: new Date("2026-10-07T12:00:00Z"),
      added_user: "user@example.test",
      location: { location_name: "Finished Goods" },
    }]);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?stockId=sku-stock-1&stockType=SKU"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.skuStockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        id: "sku-stock-1",
      }),
      take: 2,
    }));
    expect(mocks.generalStockFindMany).not.toHaveBeenCalled();
  });

  it("rejects unbounded or underspecified search terms before querying stock", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/general-stock?search=a"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.generalStockFindMany).not.toHaveBeenCalled();
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
