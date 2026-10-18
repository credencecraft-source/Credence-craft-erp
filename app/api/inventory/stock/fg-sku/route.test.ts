import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  workspaceUserFindMany: vi.fn(),
  skuFindFirst: vi.fn(),
  skuFindMany: vi.fn(),
  generalReceiptFindFirst: vi.fn(),
  generalReceiptFindMany: vi.fn(),
  allocatedReceiptFindFirst: vi.fn(),
  allocatedReceiptFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workspaceUser: { findMany: mocks.workspaceUserFindMany },
    finishedGoodsSkuStock: { findFirst: mocks.skuFindFirst, findMany: mocks.skuFindMany },
    finishedGoodsGeneralStockReceipt: { findFirst: mocks.generalReceiptFindFirst, findMany: mocks.generalReceiptFindMany },
    finishedGoodsAllocatedStockReceipt: { findFirst: mocks.allocatedReceiptFindFirst, findMany: mocks.allocatedReceiptFindMany },
  },
}));

import { GET } from "./route";

function createReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-1",
    location_id: "location-1",
    location: { location_name: "Finished Goods" },
    style_name: "Classic Shirt",
    order_no: "ORDER-1",
    article_no: "ARTICLE-1",
    brand: "Brand",
    size: "M",
    colour: "Navy",
    product_category: "Garment",
    posted_at: new Date("2026-10-07T12:00:00Z"),
    quantity_in: 10,
    quantity_out: 0,
    current_stock: 10,
    grn_id: "grn-1",
    grn_line_id: "line-1",
    grn_no: "GRN-1",
    work_order_id: "work-order-1",
    work_order_no: "WO-1",
    order_id: "order-1",
    booking_id: "booking-1",
    booking_size_line_id: "booking-size-1",
    booking_assignment_id: "booking-assignment-1",
    booking_no: "BOOKING-1",
    buyer: "Buyer",
    buyer_size: "M",
    received_quantity: 12,
    actual_received_quantity: 11,
    approved_quantity: 10,
    rejected_quantity: 1,
    created_by: "submitter-user-id",
    verified_by: "verifier-user-id",
    ...overrides,
  };
}

describe("finished goods stock report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1", role: "INVENTORY" });
    mocks.skuFindMany.mockResolvedValue([]);
    mocks.skuFindFirst.mockResolvedValue(null);
    mocks.generalReceiptFindFirst.mockResolvedValue(null);
    mocks.generalReceiptFindMany.mockResolvedValue([createReceipt()]);
    mocks.allocatedReceiptFindFirst.mockResolvedValue(null);
    mocks.allocatedReceiptFindMany.mockResolvedValue([
      createReceipt({ id: "receipt-2", grn_line_id: "line-2" }),
    ]);
    mocks.workspaceUserFindMany.mockResolvedValue([
      { id: "submitter-user-id", email: "submitter@example.test" },
      { id: "verifier-user-id", email: "verifier@example.test" },
    ]);
  });

  it("returns email addresses for GRN submitter and verifier instead of user IDs", async () => {
    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.workspaceUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["submitter-user-id", "verifier-user-id"] } },
      select: { id: true, email: true },
    });
    expect(body.records).toHaveLength(2);
    expect(body.records[0]).toMatchObject({
      added_user: "submitter@example.test",
      created_by: "submitter@example.test",
      verified_by: "verifier@example.test",
    });
    expect(body.records[1]).toMatchObject({
      added_user: "submitter@example.test",
      created_by: "submitter@example.test",
      verified_by: "verifier@example.test",
    });
  });

  it("reports missing actor emails without exposing raw user IDs", async () => {
    mocks.workspaceUserFindMany.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.records[0]).toMatchObject({
      added_user: "Email unavailable",
      created_by: "Email unavailable",
      verified_by: "Email unavailable",
    });
  });

  it("loads one tenant-scoped SKU stock record for its detail page", async () => {
    const skuRecord = {
      id: "sku-record-1",
      organization_id: "internal-org-1",
      source: "DIRECT",
      order_no: "",
      location: { location_name: "Warehouse" },
    };
    mocks.skuFindFirst.mockResolvedValue(skuRecord);

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org&barcode=sku-record-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.skuFindFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", OR: [{ id: "sku-record-1" }, { sku_code: "sku-record-1" }, { barcode: "sku-record-1" }] },
      include: { location: { select: { location_name: true } } },
    });
    expect(body.record).toMatchObject({ id: "sku-record-1", location: { location_name: "Warehouse" } });
    expect(body.canEdit).toBe(true);
  });

  it("does not expose SKU editing to a read-only organization role", async () => {
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1", role: "VIEWER" });
    mocks.skuFindFirst.mockResolvedValue({ id: "sku-record-1", organization_id: "internal-org-1" });

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org&barcode=sku-record-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.canEdit).toBe(false);
  });

  it("loads a tenant-scoped posted receipt and resolves actor emails", async () => {
    mocks.generalReceiptFindFirst.mockResolvedValue(createReceipt());

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org&recordType=general&recordId=receipt-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generalReceiptFindFirst).toHaveBeenCalledWith({
      where: { id: "receipt-1", organization_id: "internal-org-1" },
      include: { location: { select: { location_name: true } } },
    });
    expect(body.record).toMatchObject({
      id: "receipt-1",
      inventory_bucket: "GENERAL",
      created_by: "submitter@example.test",
      verified_by: "verifier@example.test",
      location: { location_name: "Finished Goods" },
    });
  });

  it("returns not found when the requested tenant-scoped record is absent", async () => {
    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org&recordType=allocated&recordId=missing"));

    expect(response.status).toBe(404);
    expect(mocks.allocatedReceiptFindFirst).toHaveBeenCalledWith({
      where: { id: "missing", organization_id: "internal-org-1" },
      include: { location: { select: { location_name: true } } },
    });
  });
});
