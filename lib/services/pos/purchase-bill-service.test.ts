import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    posPurchaseRecord: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

import { createPurchaseBillFinishedGoodsStock, listPurchaseRecords } from "./purchase-bill-service";

function setupStockTransaction(options: { color?: string | null; size?: string | null } = {}) {
  const bill = {
    id: "bill-1",
    organization_id: "organization-1",
    vendor_id: "vendor-1",
    document_number: "PB-001",
    bill_number: "SUPPLIER-001",
    bill_date: new Date("2026-01-01T00:00:00.000Z"),
    tax_mode: "EXCLUSIVE",
    status: "POSTED",
    total_quantity: "2",
    subtotal: "100",
    tax: "5",
    total: "105",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    posted_at: new Date("2026-01-01T00:00:00.000Z"),
    lines: [{
      id: "line-1",
      item_name: "Classic Tee",
      size: options.size === undefined ? "L" : options.size,
      quantity: "2",
      purchase_price: "50",
      sales_price: "80",
      gst_rate: "5",
      hsn_code: "6109",
      tax_amount: "5",
      total: "105",
      finished_goods_stock: null,
      sourceRecord: {
        id: "source-1",
        record_number: "FG-001",
        item_type: "FINISHED_GOODS",
        style_name: "Classic Tee",
        brand_id: null,
        color_id: options.color === undefined ? "color-1" : options.color ? "color-1" : null,
        category_id: null,
        sub_category_id: null,
      },
    }],
  };
  const transaction = {
    posPurchaseBill: {
      findFirst: vi.fn().mockResolvedValue(bill),
      update: vi.fn().mockResolvedValue({ ...bill, status: "APPROVED" }),
    },
    masterVendor: {
      findFirst: vi.fn().mockResolvedValue({
        id: "vendor-1",
        vendor: "Vendor",
        gst_number: null,
        registered_state: null,
      }),
    },
    masterBrand: { findMany: vi.fn().mockResolvedValue([]) },
    masterColor: {
      findMany: vi.fn().mockResolvedValue(options.color === null ? [] : [{ id: "color-1", colors: "Black" }]),
    },
    masterCategory: { findMany: vi.fn().mockResolvedValue([]) },
    masterSubCategory: { findMany: vi.fn().mockResolvedValue([]) },
    masterLocation: {
      findFirst: vi.fn().mockResolvedValue({ id: "location-1", entity_id: "entity-1" }),
    },
    procurementDocumentCounter: {
      upsert: vi.fn().mockResolvedValue({ current_value: 1 }),
    },
    finishedGoodsSkuStock: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "stock-1", sku_code: "CLASSIC-TEE-BLACK-L" }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  mocks.transaction.mockImplementation(async (callback) => callback(transaction));
  return transaction;
}

describe("listPurchaseRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("filters record details by both record and authorized organization", async () => {
    await listPurchaseRecords("organization-internal-id", "record-id");

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
        id: "record-id",
      },
      include: { lines: { orderBy: { created_at: "asc" } } },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  });

  it("preserves the organization filter for report list reads", async () => {
    await listPurchaseRecords("organization-internal-id");

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
      },
    }));
  });

  it("bounds paginated report reads while keeping them organization-scoped", async () => {
    await listPurchaseRecords("organization-internal-id", undefined, { skip: 100, take: 100 });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
      },
      skip: 100,
      take: 100,
    }));
  });

  it("caps the requested report page size", async () => {
    await listPurchaseRecords("organization-internal-id", undefined, { skip: 0, take: 500 });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 100,
    }));
  });

  it("allows enough time for finished-goods stock creation to complete its transaction", async () => {
    mocks.transaction.mockRejectedValue(new Error("transaction test sentinel"));

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1"))
      .rejects.toThrow("transaction test sentinel");

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 10_000,
      timeout: 30_000,
    });
  });

  it("creates purchase-bill stock with the variant SKU and sequential POS barcode", async () => {
    const transaction = setupStockTransaction();

    await createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1");

    expect(transaction.finishedGoodsSkuStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        sku_code: "CLASSIC-TEE-BLACK-L",
        barcode: "POS1",
        source: "POS_PURCHASE_BILL",
        purchase_bill_line_id: "line-1",
      }),
    }));
    expect(transaction.procurementDocumentCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id_document_type: {
          organization_id: "organization-1",
          document_type: "POS_BARCODE",
        },
      },
    }));
  });

  it("rejects purchase-bill stock creation when a variant attribute is missing", async () => {
    const transaction = setupStockTransaction({ color: null });

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1"))
      .rejects.toThrow("needs a style, colour, and size to generate its POS SKU");

    expect(transaction.procurementDocumentCounter.upsert).not.toHaveBeenCalled();
    expect(transaction.finishedGoodsSkuStock.create).not.toHaveBeenCalled();
  });
});
