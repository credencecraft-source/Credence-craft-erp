import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  stockFindMany: vi.fn(),
  receiptLineFindMany: vi.fn(),
  rawMaterialFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    rawMaterialStock: { findMany: mocks.stockFindMany },
    inventoryReceiptLine: { findMany: mocks.receiptLineFindMany },
    masterRawMaterial: { findMany: mocks.rawMaterialFindMany },
  },
}));

import { listRawMaterialGeneralInventory } from "./rm-general-inventory-service";

describe("raw-material General Inventory GRN totals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rawMaterialFindMany.mockResolvedValue([]);
  });

  it("aggregates GRN verification quantities by item and location, including rejected-only materials", async () => {
    mocks.stockFindMany.mockResolvedValue([{
      id: "stock-1",
      location_id: "location-1",
      raw_material: "Cotton",
      purchaseOrderLine: { purchaseOrder: { is_asset_purchase: false } },
      source_type: "LEGACY",
      location: { location_name: "Receiving" },
      quantity_on_hand: new Prisma.Decimal("12"),
      quantity_reserved: new Prisma.Decimal("2"),
      quantity_issued: new Prisma.Decimal("1"),
    }]);
    mocks.receiptLineFindMany.mockResolvedValue([
      {
        raw_material: "Cotton",
        purchaseOrderLine: { purchaseOrder: { is_asset_purchase: false } },
        rejected_quantity: new Prisma.Decimal("1"),
        receipt: { location_id: "location-1", location: { location_name: "Receiving" } },
        rmGrnVerification: {
          fresh_excess: new Prisma.Decimal("2"),
          rejected_quantity: new Prisma.Decimal("1"),
          total_excess: new Prisma.Decimal("3"),
        },
      },
      {
        raw_material: "Cotton",
        rejected_quantity: new Prisma.Decimal("2"),
        receipt: { location_id: "location-1", location: { location_name: "Receiving" } },
        rmGrnVerification: {
          fresh_excess: new Prisma.Decimal("1"),
          rejected_quantity: new Prisma.Decimal("2"),
          total_excess: new Prisma.Decimal("3"),
        },
      },
      {
        raw_material: "Linen",
        purchaseOrderLine: { purchaseOrder: { is_asset_purchase: false } },
        rejected_quantity: new Prisma.Decimal("4"),
        receipt: { location_id: "location-1", location: { location_name: "Receiving" } },
        rmGrnVerification: {
          fresh_excess: new Prisma.Decimal("0"),
          rejected_quantity: new Prisma.Decimal("4"),
          total_excess: new Prisma.Decimal("4"),
        },
      },
    ]);

    const rows = await listRawMaterialGeneralInventory("internal-org-1");

    expect(mocks.stockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
    }));
    expect(mocks.receiptLineFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { receipt: { organization_id: "internal-org-1" } },
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      raw_material: "Cotton",
      fresh_excess: new Prisma.Decimal("3"),
      rejected_quantity: new Prisma.Decimal("3"),
      total_excess: new Prisma.Decimal("6"),
      quantity_on_hand: new Prisma.Decimal("12"),
    });
    expect(rows[1]).toMatchObject({
      raw_material: "Linen",
      fresh_excess: new Prisma.Decimal("0"),
      rejected_quantity: new Prisma.Decimal("4"),
      total_excess: new Prisma.Decimal("4"),
      quantity_on_hand: new Prisma.Decimal("0"),
    });
  });

  it("keeps each GRN stock lot separate and attaches verification totals to its own receipt line", async () => {
    mocks.stockFindMany.mockResolvedValue([
      {
        id: "stock-1",
        organization_id: "internal-org-1",
        location_id: "location-1",
        raw_material: "Cotton",
        source_type: "GRN",
        inventory_receipt_line_id: "receipt-line-1",
        created_at: new Date("2026-09-01T00:00:00.000Z"),
        location: { location_name: "Receiving" },
        receiptLine: {
          id: "receipt-line-1",
          rejected_quantity: new Prisma.Decimal("0"),
          receipt: { receipt_no: "GRN-1", received_date: new Date("2026-09-01T00:00:00.000Z") },
          rmGrnVerification: { fresh_excess: new Prisma.Decimal("0"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("0") },
        },
        quantity_on_hand: new Prisma.Decimal("10"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
      {
        id: "stock-2",
        organization_id: "internal-org-1",
        location_id: "location-1",
        raw_material: "Cotton",
        source_type: "GRN",
        inventory_receipt_line_id: "receipt-line-2",
        created_at: new Date("2026-09-08T00:00:00.000Z"),
        location: { location_name: "Receiving" },
        receiptLine: {
          id: "receipt-line-2",
          rejected_quantity: new Prisma.Decimal("0"),
          receipt: { receipt_no: "GRN-2", received_date: new Date("2026-09-08T00:00:00.000Z") },
          rmGrnVerification: { fresh_excess: new Prisma.Decimal("1"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("1") },
        },
        quantity_on_hand: new Prisma.Decimal("10"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
    ]);
    mocks.receiptLineFindMany.mockResolvedValue([]);

    const rows = await listRawMaterialGeneralInventory("internal-org-1");

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.id, row.quantity_on_hand.toString(), row.receipt_no])).toEqual([
      ["stock-1", "10", "GRN-1"],
      ["stock-2", "10", "GRN-2"],
    ]);
    expect(rows.map((row) => row.fresh_excess.toString())).toEqual(["0", "1"]);
  });

  it("separates asset stock using the PO snapshot and only includes verified receipt-only rows", async () => {
    mocks.stockFindMany.mockResolvedValue([
      {
        id: "asset-grn-stock",
        location_id: "location-1",
        raw_material: "Asset bought item",
        source_type: "GRN",
        inventory_receipt_line_id: "asset-line",
        location: { location_name: "Receiving" },
        receiptLine: {
          id: "asset-line",
          rejected_quantity: new Prisma.Decimal("0"),
          receipt: { receipt_no: "GRN-ASSET", received_date: new Date("2026-09-10T00:00:00.000Z") },
          purchaseOrderLine: { purchaseOrder: { procurement_type: "GENERAL", is_asset_purchase: true } },
          rmGrnVerification: { fresh_excess: new Prisma.Decimal("0"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("0") },
        },
        quantity_on_hand: new Prisma.Decimal("5"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
      {
        id: "non-asset-grn-stock",
        location_id: "location-1",
        raw_material: "Master now asset",
        source_type: "GRN",
        inventory_receipt_line_id: "non-asset-line",
        location: { location_name: "Receiving" },
        receiptLine: {
          id: "non-asset-line",
          rejected_quantity: new Prisma.Decimal("0"),
          receipt: { receipt_no: "GRN-RM", received_date: new Date("2026-09-10T00:00:00.000Z") },
          purchaseOrderLine: { purchaseOrder: { procurement_type: "STYLE_WISE", is_asset_purchase: false } },
          rmGrnVerification: { fresh_excess: new Prisma.Decimal("0"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("0") },
        },
        quantity_on_hand: new Prisma.Decimal("7"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
      {
        id: "master-classified-asset-stock",
        location_id: "location-1",
        raw_material: "Master-only asset",
        source_type: "MANUAL",
        location: { location_name: "Receiving" },
        quantity_on_hand: new Prisma.Decimal("1"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
      {
        id: "general-po-snapshot-rm-stock",
        location_id: "location-1",
        raw_material: "General PO snapshot false",
        source_type: "GRN",
        inventory_receipt_line_id: "general-po-rm-line",
        location: { location_name: "Receiving" },
        receiptLine: {
          id: "general-po-rm-line",
          rejected_quantity: new Prisma.Decimal("0"),
          receipt: { receipt_no: "GRN-RM", received_date: new Date("2026-09-10T00:00:00.000Z") },
          purchaseOrderLine: { purchaseOrder: { procurement_type: "GENERAL", is_asset_purchase: false } },
          rmGrnVerification: { fresh_excess: new Prisma.Decimal("0"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("0") },
        },
        quantity_on_hand: new Prisma.Decimal("3"),
        quantity_reserved: new Prisma.Decimal("0"),
        quantity_issued: new Prisma.Decimal("0"),
      },
    ]);
    mocks.rawMaterialFindMany.mockResolvedValue([
      { raw_material_name: "Master now asset", is_asset: true, raw_material_category: { raw_material_category: "Assets" } },
      { raw_material_name: "Master-only asset", is_asset: true, raw_material_category: { raw_material_category: "Assets" } },
      { raw_material_name: "General PO snapshot false", is_asset: false, raw_material_category: { raw_material_category: "Materials" } },
    ]);
    mocks.receiptLineFindMany.mockResolvedValue([
      {
        id: "verified-asset-without-stock-row",
        raw_material: "Verified asset receipt",
        rejected_quantity: new Prisma.Decimal("0"),
        purchaseOrderLine: { purchaseOrder: { procurement_type: "GENERAL", is_asset_purchase: true } },
        receipt: { location_id: "location-1", location: { location_name: "Receiving" } },
        rmGrnVerification: {
          fresh_excess: new Prisma.Decimal("2"),
          rejected_quantity: new Prisma.Decimal("0"),
          total_excess: new Prisma.Decimal("2"),
        },
      },
      {
        id: "unverified-asset",
        raw_material: "Unverified asset receipt",
        rejected_quantity: new Prisma.Decimal("0"),
        purchaseOrderLine: { purchaseOrder: { procurement_type: "GENERAL", is_asset_purchase: true } },
        receipt: { location_id: "location-1", location: { location_name: "Receiving" } },
        rmGrnVerification: null,
      },
    ]);

    const [assets, rawMaterials] = await Promise.all([
      listRawMaterialGeneralInventory("internal-org-1", { assetOnly: true }),
      listRawMaterialGeneralInventory("internal-org-1"),
    ]);

    expect(assets.map((row) => row.raw_material)).toEqual([
      "Asset bought item",
      "Master now asset",
      "Master-only asset",
      "Verified asset receipt",
    ]);
    expect(assets.every((row) => row.is_asset)).toBe(true);
    expect(rawMaterials.map((row) => row.raw_material)).toEqual(["General PO snapshot false"]);
    expect(rawMaterials[0].is_asset).toBe(false);
  });

  it("includes the tenant raw-material category on asset stock rows", async () => {
    mocks.stockFindMany.mockResolvedValue([{
      id: "asset-stock",
      location_id: "location-1",
      raw_material: "Press Machine",
      source_type: "GRN",
      inventory_receipt_line_id: "asset-line",
      location: { location_name: "Factory" },
      receiptLine: {
        id: "asset-line",
        rejected_quantity: new Prisma.Decimal("0"),
        receipt: { receipt_no: "GRN-ASSET", received_date: new Date("2026-09-10T00:00:00.000Z") },
        purchaseOrderLine: { purchaseOrder: { procurement_type: "GENERAL", is_asset_purchase: true } },
        rmGrnVerification: { fresh_excess: new Prisma.Decimal("0"), rejected_quantity: new Prisma.Decimal("0"), total_excess: new Prisma.Decimal("0") },
      },
      quantity_on_hand: new Prisma.Decimal("1"),
      quantity_reserved: new Prisma.Decimal("0"),
      quantity_issued: new Prisma.Decimal("0"),
    }]);
    mocks.receiptLineFindMany.mockResolvedValue([]);
    mocks.rawMaterialFindMany.mockResolvedValue([{
      raw_material_name: "Press Machine",
      is_asset: true,
      raw_material_category: { raw_material_category: "Factory Equipment" },
    }]);

    const rows = await listRawMaterialGeneralInventory("internal-org-1", { assetOnly: true });

    expect(mocks.rawMaterialFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
      select: expect.objectContaining({
        raw_material_category: { select: { raw_material_category: true } },
      }),
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ raw_material: "Press Machine", category: "Factory Equipment" });
  });
});