import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  purchaseBillFindMany: vi.fn(),
  vendorFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    posPurchaseRecord: {
      findMany: mocks.findMany,
    },
    posPurchaseBill: {
      findMany: mocks.purchaseBillFindMany,
    },
    masterVendor: {
      findMany: mocks.vendorFindMany,
    },
  },
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

import { createPurchaseBillFinishedGoodsStock, listPurchaseBills, listPurchaseRecords } from "./purchase-bill-service";

function setupStockTransaction(options: {
  color?: string | null;
  size?: string | null;
  location?: { id: string; entity_id: string } | null;
  billEntityId?: string | null;
} = {}) {
  const bill = {
    id: "bill-1",
    organization_id: "organization-1",
    entity_id: options.billEntityId ?? null,
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    masterEntity: { findFirst: vi.fn().mockResolvedValue({ id: "entity-1" }) },
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
      findFirst: vi.fn().mockResolvedValue(options.location === undefined
        ? { id: "location-1", entity_id: "entity-1" }
        : options.location),
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

  describe("listPurchaseBills", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("loads a bounded bill summary page without fetching bill lines", async () => {
      const createdAt = new Date("2026-10-17T00:00:00.000Z");
      mocks.purchaseBillFindMany.mockResolvedValue([
        {
          id: "bill-1",
          document_number: "PB-001",
          vendor_id: "vendor-1",
          bill_number: "SUPPLIER-001",
          bill_date: createdAt,
          status: "POSTED",
          total_quantity: "2",
          subtotal: "100",
          tax: "5",
          total: "105",
          created_at: createdAt,
        },
      ]);
      mocks.vendorFindMany.mockResolvedValue([{ id: "vendor-1", vendor: "Vendor" }]);

      const result = await listPurchaseBills("organization-1", { take: 50 });

      expect(mocks.purchaseBillFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "organization-1" },
        select: expect.not.objectContaining({ lines: true }),
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 51,
      }));
      expect(mocks.vendorFindMany).toHaveBeenCalledWith({
        where: { organization_id: "organization-1", id: { in: ["vendor-1"] } },
        select: { id: true, vendor: true },
      });
      expect(result.bills[0]).toMatchObject({
        documentNumber: "PB-001",
        party: "Vendor",
        net: 105,
      });
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("applies tenant-scoped search and keyset pagination", async () => {
      const createdAt = new Date("2026-10-17T00:00:00.000Z");
      mocks.vendorFindMany.mockResolvedValue([{ id: "vendor-1" }]);
      mocks.purchaseBillFindMany.mockResolvedValue([]);

      await listPurchaseBills("organization-1", {
        take: 25,
        search: "vendor",
        cursor: { id: "bill-cursor", createdAt },
      });

      expect(mocks.vendorFindMany).toHaveBeenCalledWith({
        where: {
          organization_id: "organization-1",
          vendor: { contains: "vendor", mode: "insensitive" },
        },
        select: { id: true },
      });
      expect(mocks.purchaseBillFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "organization-1",
          OR: expect.arrayContaining([
            { document_number: { contains: "vendor", mode: "insensitive" } },
            { bill_number: { contains: "vendor", mode: "insensitive" } },
            { vendor_id: { in: ["vendor-1"] } },
          ]),
          AND: [{
            OR: [
              { created_at: { lt: createdAt } },
              { created_at: createdAt, id: { lt: "bill-cursor" } },
            ],
          }],
        }),
        take: 26,
      }));
    });
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

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", "location-1"))
      .rejects.toThrow("transaction test sentinel");

    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      }),
    );
  });

  it("creates purchase-bill stock with the variant SKU and sequential POS barcode", async () => {
    const transaction = setupStockTransaction();

    await createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", "location-1");

    expect(transaction.masterLocation.findFirst).toHaveBeenCalledWith({
      where: { id: "location-1", organization_id: "organization-1", is_active: true },
      select: { id: true, entity_id: true },
    });
    expect(transaction.finishedGoodsSkuStock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        entity_id: "entity-1",
        location_id: "location-1",
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

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", "location-1"))
      .rejects.toThrow("needs a style, colour, and size to generate its POS SKU");

    expect(transaction.procurementDocumentCounter.upsert).not.toHaveBeenCalled();
    expect(transaction.finishedGoodsSkuStock.create).not.toHaveBeenCalled();
  });

  it("rejects a location that is inactive or outside the authorized organization", async () => {
    const transaction = setupStockTransaction({ location: null });

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", "foreign-location"))
      .rejects.toThrow("inactive or unavailable in this organization");

    expect(transaction.masterLocation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-location", organization_id: "organization-1", is_active: true },
    }));
    expect(transaction.procurementDocumentCounter.upsert).not.toHaveBeenCalled();
    expect(transaction.finishedGoodsSkuStock.create).not.toHaveBeenCalled();
  });

  it("does not create stock at a location belonging to another bill Entity", async () => {
    const transaction = setupStockTransaction({ billEntityId: "entity-2" });

    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", "location-1"))
      .rejects.toThrow("different Entity");

    expect(transaction.finishedGoodsSkuStock.create).not.toHaveBeenCalled();
  });

  it("requires a selected location before opening a stock transaction", async () => {
    await expect(createPurchaseBillFinishedGoodsStock("organization-1", "actor-1", "bill-1", ""))
      .rejects.toThrow("Select an active location before approving");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
