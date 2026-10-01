import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  transactionClient: {
    masterVendor: { findFirst: vi.fn() },
    billOfMaterialItem: { findMany: vi.fn() },
    rawMaterialStockBooking: { groupBy: vi.fn(), createMany: vi.fn() },
    groupedPurchaseOrderLine: { groupBy: vi.fn() },
    rawMaterialStock: { findMany: vi.fn(), update: vi.fn() },
    groupedPurchaseOrder: { create: vi.fn() },
    procurementDocumentCounter: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    rawMaterialStockBooking: { findMany: vi.fn() },
  },
}));

import { createRawMaterialStockBookings } from "./rm-stock-booking-service";

describe("raw-material stock booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(mocks.transactionClient));
    mocks.transactionClient.masterVendor.findFirst.mockResolvedValue({ id: "store-1" });
    mocks.transactionClient.billOfMaterialItem.findMany.mockResolvedValue([{
      id: "bom-1",
      order_id: "order-1",
      category: "Fabric",
      categoryType: "Fabric",
      subCategory: "Cotton",
      rawMaterialName: "Cotton",
      stockUom: "MTR",
      internalConsumption: new Prisma.Decimal("1"),
      internalPrice: new Prisma.Decimal("2"),
      requiredQty: new Prisma.Decimal("8"),
      totalRequiredQty: new Prisma.Decimal("8"),
      order: { orderNo: "ORD-1", styleName: "Style 1", brand: "Brand", entity_id: "entity-1", entity: { is_active: true } },
    }]);
    mocks.transactionClient.rawMaterialStockBooking.groupBy.mockResolvedValue([]);
    mocks.transactionClient.groupedPurchaseOrderLine.groupBy.mockResolvedValue([]);
    mocks.transactionClient.rawMaterialStock.findMany.mockResolvedValue([{
      id: "stock-1",
      raw_material: "Cotton",
      quantity_on_hand: new Prisma.Decimal("10"),
      quantity_reserved: new Prisma.Decimal("2"),
    }]);
    mocks.transactionClient.rawMaterialStock.update.mockResolvedValue({});
    mocks.transactionClient.rawMaterialStockBooking.createMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.groupedPurchaseOrder.create.mockResolvedValue({ id: "grouped-stock-1" });
    mocks.transactionClient.procurementDocumentCounter.upsert.mockResolvedValue({ current_value: 1 });
  });

  it("books inventory and creates a pending stock price-approval record", async () => {
    const result = await createRawMaterialStockBookings({
      organizationId: "organization-1",
      bookedBy: "Buyer",
      currentStoreVendorId: "store-1",
      lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "5" }],
    });

    expect(result).toEqual({ bookedLines: 1, groupedPurchaseOrderId: "grouped-stock-1" });
    expect(mocks.transactionClient.rawMaterialStock.update).toHaveBeenCalledWith({
      where: { id: "stock-1", organization_id: "organization-1" },
      data: { quantity_reserved: { increment: new Prisma.Decimal("5") } },
    });
    expect(mocks.transactionClient.rawMaterialStockBooking.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organization_id: "organization-1",
        grouped_purchase_order_id: "grouped-stock-1",
        take_from_stock_id: "stock-1",
        current_store_vendor_id: "store-1",
        source_bom_item_id: "bom-1",
        booked_quantity: new Prisma.Decimal("5"),
        booked_by: "Buyer",
      })],
    });
    expect(mocks.transactionClient.groupedPurchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        entity_id: "entity-1",
        source_type: "STOCK",
        vendor_id: "store-1",
        status: "PENDING_PRICE_APPROVAL",
        total_grouped_qty: new Prisma.Decimal("5"),
      }),
    }));
  });

  it("rejects a booking that exceeds currently available inventory", async () => {
    mocks.transactionClient.rawMaterialStock.findMany.mockResolvedValue([{
      id: "stock-1",
      raw_material: "Cotton",
      quantity_on_hand: new Prisma.Decimal("10"),
      quantity_reserved: new Prisma.Decimal("5"),
    }]);

    await expect(createRawMaterialStockBookings({
      organizationId: "organization-1",
      bookedBy: "Buyer",
      currentStoreVendorId: "store-1",
      lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "6" }],
    })).rejects.toThrow("Booked quantity exceeds available stock for Cotton.");

    expect(mocks.transactionClient.rawMaterialStock.update).not.toHaveBeenCalled();
    expect(mocks.transactionClient.rawMaterialStockBooking.createMany).not.toHaveBeenCalled();
  });

  it("rejects a booking beyond the BOM remainder after prior stock and vendor allocations", async () => {
    mocks.transactionClient.rawMaterialStockBooking.groupBy.mockResolvedValue([{
      source_bom_item_id: "bom-1",
      _sum: { booked_quantity: new Prisma.Decimal("3") },
    }]);
    mocks.transactionClient.groupedPurchaseOrderLine.groupBy.mockResolvedValue([{
      source_bom_item_id: "bom-1",
      _sum: { grouped_qty: new Prisma.Decimal("4") },
    }]);

    await expect(createRawMaterialStockBookings({
      organizationId: "organization-1",
      bookedBy: "Buyer",
      currentStoreVendorId: "store-1",
      lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "2" }],
    })).rejects.toThrow("Booked quantity exceeds the remaining requirement for ORD-1.");

    expect(mocks.transactionClient.rawMaterialStock.update).not.toHaveBeenCalled();
  });

  it("counts only the fulfilled portion of a prior store issue against the remaining BOM quantity", async () => {
    mocks.transactionClient.rawMaterialStockBooking.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        source_bom_item_id: "bom-1",
        _sum: { fulfilled_quantity: new Prisma.Decimal("5") },
      }]);

    await expect(createRawMaterialStockBookings({
      organizationId: "organization-1",
      bookedBy: "Buyer",
      currentStoreVendorId: "store-1",
      lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "4" }],
    })).rejects.toThrow("Booked quantity exceeds the remaining requirement for ORD-1.");

    expect(mocks.transactionClient.rawMaterialStock.update).not.toHaveBeenCalled();
    expect(mocks.transactionClient.rawMaterialStockBooking.createMany).not.toHaveBeenCalled();
  });
});