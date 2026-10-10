import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  stockFindMany: vi.fn(),
  materialFindMany: vi.fn(),
  requireOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    rawMaterialStock: { findMany: mocks.stockFindMany },
    masterRawMaterial: { findMany: mocks.materialFindMany },
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationAccess: mocks.requireOrganizationAccess,
}));

import { listRawMaterialInventoryStatus } from "./raw-material-inventory-status-service";

const asOf = new Date("2025-06-01T00:00:00.000Z");

function stock(
  id: string,
  name: string,
  dayOffset: number,
  onHand: string,
  category = "Fabric",
  price: string | null = "1",
) {
  const receivedAt = new Date(asOf.getTime() - dayOffset * 86_400_000);
  return {
    id,
    raw_material: name,
    quantity_on_hand: new Prisma.Decimal(onHand),
    created_at: receivedAt,
    receiptLine: {
      receipt: { organization_id: "internal-org-1", received_date: receivedAt },
      purchaseOrderLine: {
        category,
        price: price === null ? null : new Prisma.Decimal(price),
        purchaseOrder: { organization_id: "internal-org-1" },
      },
    },
  };
}

function materialMaster(name: string, category = "Fabric", openStockPrice: string | null = null) {
  return {
    raw_material_name: name,
    raw_material_category: { raw_material_category: category },
    open_stock_price: openStockPrice === null ? null : new Prisma.Decimal(openStockPrice),
  };
}

describe("raw-material inventory value aging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-1" });
  });

  it("summarizes total on-hand value and its age bands by category", async () => {
    mocks.stockFindMany.mockResolvedValue([
      stock("cotton-new", "Cotton", 30, "10", "Fabric", "2"),
      stock("cotton-old", "Cotton", 45, "6", "Fabric", "2"),
      stock("linen", "Linen", 60, "20", "Fabric", "3"),
      stock("depleted", "Depleted trim", 90, "0", "Fabric", null),
      stock("unpriced", "Unpriced trim", 20, "5", "Fabric", null),
    ]);
    mocks.materialFindMany.mockResolvedValue([
      materialMaster("Cotton"),
      materialMaster("Linen"),
      materialMaster("Depleted trim"),
      materialMaster("Unpriced trim"),
    ]);

    const rows = await listRawMaterialInventoryStatus("user-1", "public-org-1", asOf);

    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith("user-1", "public-org-1");
    expect(mocks.stockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(rows).toEqual([{
      id: "fabric",
      category: "Fabric",
      totalValue: 92,
      unpricedQuantity: 5,
      days0To30Value: 20,
      days31To60Value: 72,
      days61To90Value: 0,
      daysOver90Value: 0,
    }]);
  });

  it("places inventory value on exact age-band boundaries and retains stock older than 90 days", async () => {
    const entries = [
      ["M30", 30, "1"],
      ["M31", 31, "2"],
      ["M60", 60, "3"],
      ["M61", 61, "4"],
      ["M90", 90, "5"],
      ["M91", 91, "6"],
      ["M120", 120, "7"],
      ["M121", 121, "8"],
    ] as const;
    mocks.stockFindMany.mockResolvedValue(entries.map(([name, days, quantity]) =>
      stock(name, name, days, quantity),
    ));
    mocks.materialFindMany.mockResolvedValue(entries.map(([name]) => materialMaster(name)));

    const [row] = await listRawMaterialInventoryStatus("user-1", "public-org-1", asOf);

    expect(row).toMatchObject({
      totalValue: 36,
      days0To30Value: 1,
      days31To60Value: 5,
      days61To90Value: 9,
      daysOver90Value: 21,
    });
  });

  it("uses receipt-line category and reports quantities without an available price", async () => {
    mocks.stockFindMany.mockResolvedValue([
      stock("legacy-stock", "Legacy cotton", 10, "12", "Legacy fabric", null),
    ]);
    mocks.materialFindMany.mockResolvedValue([]);

    const [row] = await listRawMaterialInventoryStatus("user-1", "public-org-1", asOf);

    expect(row).toMatchObject({
      category: "Legacy fabric",
      totalValue: 0,
      unpricedQuantity: 12,
    });
  });

  it("ignores receipt and purchase-order details linked to another organization", async () => {
    const crossOrganizationStock = stock("foreign-stock", "Foreign cotton", 10, "4", "Foreign fabric", "99");
    crossOrganizationStock.receiptLine.receipt.organization_id = "other-org";
    crossOrganizationStock.receiptLine.purchaseOrderLine.purchaseOrder.organization_id = "other-org";
    mocks.stockFindMany.mockResolvedValue([crossOrganizationStock]);
    mocks.materialFindMany.mockResolvedValue([]);

    const [row] = await listRawMaterialInventoryStatus("user-1", "public-org-1", asOf);

    expect(row).toMatchObject({
      category: "Uncategorized",
      totalValue: 0,
      unpricedQuantity: 4,
    });
  });

  it("uses the master opening-stock price when the receipt has no purchase-order price", async () => {
    const legacyStock = {
      ...stock("opening-stock", "Cotton", 10, "4", "Fabric", null),
      receiptLine: null,
    };
    mocks.stockFindMany.mockResolvedValue([legacyStock]);
    mocks.materialFindMany.mockResolvedValue([materialMaster("Cotton", "Fabric", "2.5")]);

    const [row] = await listRawMaterialInventoryStatus("user-1", "public-org-1", asOf);

    expect(row).toMatchObject({
      totalValue: 10,
      days0To30Value: 10,
      unpricedQuantity: 0,
    });
  });
});
