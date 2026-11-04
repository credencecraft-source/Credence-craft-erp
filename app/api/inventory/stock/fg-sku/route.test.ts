import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  workspaceUserFindMany: vi.fn(),
  skuFindFirst: vi.fn(),
  skuFindMany: vi.fn(),
  skuCreate: vi.fn(),
  skuUpdate: vi.fn(),
  counterUpsert: vi.fn(),
  transaction: vi.fn(),
  locationFindFirst: vi.fn(),
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
    $transaction: mocks.transaction,
    workspaceUser: { findMany: mocks.workspaceUserFindMany },
    finishedGoodsSkuStock: { findFirst: mocks.skuFindFirst, findMany: mocks.skuFindMany, create: mocks.skuCreate, update: mocks.skuUpdate },
    procurementDocumentCounter: { upsert: mocks.counterUpsert },
    masterLocation: { findFirst: mocks.locationFindFirst },
    finishedGoodsGeneralStockReceipt: { findFirst: mocks.generalReceiptFindFirst, findMany: mocks.generalReceiptFindMany },
    finishedGoodsAllocatedStockReceipt: { findFirst: mocks.allocatedReceiptFindFirst, findMany: mocks.allocatedReceiptFindMany },
  },
}));

import { GET, POST, PUT } from "./route";

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
    mocks.skuCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "sku-created",
      ...data,
    }));
    mocks.skuUpdate.mockResolvedValue({ id: "sku-record-1", sku_code: "CLASSIC-TEE-BLACK-L", barcode: "POS1" });
    mocks.counterUpsert.mockResolvedValue({ current_value: 1 });
    mocks.locationFindFirst.mockResolvedValue({ id: "location-1", entity_id: "entity-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      finishedGoodsSkuStock: {
        findFirst: mocks.skuFindFirst,
        create: mocks.skuCreate,
      },
      procurementDocumentCounter: { upsert: mocks.counterUpsert },
    }));
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

  it("creates POS stock with a style-colour-size SKU and an automatically reserved barcode", async () => {
    mocks.skuFindFirst.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/inventory/stock/fg-sku", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        locationId: "location-1",
        source: "DIRECT_FROM_POS",
        styleName: "Classic Tee",
        colour: "Navy Blue",
        size: "M",
        qtyIn: 4,
        qtyOut: 0,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.record).toMatchObject({
      sku_code: "CLASSIC-TEE-NAVY-BLUE-M",
      barcode: "POS1",
    });
    expect(mocks.skuFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        organization_id: "internal-org-1",
        sku_code: "CLASSIC-TEE-NAVY-BLUE-M",
      },
      select: { id: true },
    });
    expect(mocks.counterUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id_document_type: {
          organization_id: "internal-org-1",
          document_type: "POS_BARCODE",
        },
      },
    }));
    expect(mocks.skuCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        sku_code: "CLASSIC-TEE-NAVY-BLUE-M",
        barcode: "POS1",
        style_name: "CLASSIC TEE",
        colour: "NAVY BLUE",
        size: "M",
      }),
    }));
  });

  it("requires style, colour, and size for generated POS SKUs", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/stock/fg-sku", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        locationId: "location-1",
        source: "DIRECT_FROM_POS",
        styleName: "Classic Tee",
        colour: "",
        size: "M",
        qtyIn: 4,
        qtyOut: 0,
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.skuCreate).not.toHaveBeenCalled();
    expect(mocks.counterUpsert).not.toHaveBeenCalled();
  });

  it("recalculates the POS SKU when its variant changes and preserves its barcode", async () => {
    mocks.skuFindFirst
      .mockResolvedValueOnce({
        id: "sku-record-1",
        organization_id: "internal-org-1",
        source: "DIRECT_FROM_POS",
        sku_code: "CLASSIC-TEE-NAVY-M",
        barcode: "POS1",
        style_name: "CLASSIC TEE",
        order_no: "DIRECT",
        article_no: "DIRECT",
        size: "M",
        colour: "NAVY",
        location_id: "location-1",
        qty_in: 4,
        qty_out: 0,
      })
      .mockResolvedValueOnce(null);
    const response = await PUT(new Request("http://localhost/api/inventory/stock/fg-sku", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        recordId: "sku-record-1",
        styleName: "Classic Tee",
        orderNo: "DIRECT",
        articleNo: "DIRECT",
        colour: "Black",
        size: "L",
        locationId: "location-1",
        qtyIn: 4,
        qtyOut: 0,
        source: "DIRECT_FROM_POS",
        barcode: "CLIENT-SUPPLIED",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.skuUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sku-record-1", organization_id: "internal-org-1" },
      data: expect.objectContaining({
        sku_code: "CLASSIC-TEE-BLACK-L",
        barcode: "POS1",
        style_name: "CLASSIC TEE",
        size: "L",
        colour: "BLACK",
      }),
    }));
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

  it("limits the POS stock report to POS sources and excludes inventory GRN receipts", async () => {
    mocks.skuFindMany.mockResolvedValue([
      { id: "sku-pos", source: "POS_PURCHASE_BILL" },
    ]);

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org&surface=POS"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.skuFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        source: { in: ["DIRECT_FROM_POS", "POS", "POS_PURCHASE_BILL"] },
      },
    }));
    expect(mocks.generalReceiptFindMany).not.toHaveBeenCalled();
    expect(mocks.allocatedReceiptFindMany).not.toHaveBeenCalled();
    expect(body.records.some((record: { source: string }) => record.source === "POS_PURCHASE_BILL")).toBe(true);
  });

  it("keeps POS-origin SKU sources in the inventory report", async () => {
    mocks.skuFindMany.mockResolvedValue([
      { id: "sku-inventory", source: "DIRECT_FROM_INVENTORY" },
      { id: "sku-pos", source: "POS_PURCHASE_BILL" },
    ]);

    const response = await GET(new Request("http://localhost/api/inventory/stock/fg-sku?organizationId=public-org"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.skuFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(body.records.map((record: { source: string }) => record.source)).toEqual([
      "DIRECT_FROM_INVENTORY",
      "POS_PURCHASE_BILL",
      "WO_ORDER_GRN",
      "WO_ORDER_GRN",
    ]);
    expect(body.records.map((record: { main_source: string; sub_source: string }) => [record.main_source, record.sub_source])).toEqual([
      ["Inventory Module", "—"],
      ["POS Module", "POS Bill"],
      ["Inventory Module", "WO Order GRN"],
      ["Inventory Module", "WO Order GRN"],
    ]);
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
      include: {
        location: {
          select: {
            location_name: true,
            entity: { select: { entity_name: true } },
          },
        },
      },
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
