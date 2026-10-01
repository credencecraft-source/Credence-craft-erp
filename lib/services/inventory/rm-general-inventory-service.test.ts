import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  stockFindMany: vi.fn(),
  receiptLineFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    rawMaterialStock: { findMany: mocks.stockFindMany },
    inventoryReceiptLine: { findMany: mocks.receiptLineFindMany },
  },
}));

import { listRawMaterialGeneralInventory } from "./rm-general-inventory-service";

describe("raw-material General Inventory GRN totals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates GRN verification quantities by item and location, including rejected-only materials", async () => {
    mocks.stockFindMany.mockResolvedValue([{
      id: "stock-1",
      location_id: "location-1",
      raw_material: "Cotton",
      source_type: "LEGACY",
      location: { location_name: "Receiving" },
      quantity_on_hand: new Prisma.Decimal("12"),
      quantity_reserved: new Prisma.Decimal("2"),
      quantity_issued: new Prisma.Decimal("1"),
    }]);
    mocks.receiptLineFindMany.mockResolvedValue([
      {
        raw_material: "Cotton",
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
});