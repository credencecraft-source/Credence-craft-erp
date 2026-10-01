import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  bomFindMany: vi.fn(),
  groupedPurchaseOrderFindFirst: vi.fn(),
  groupedPurchaseOrderCount: vi.fn(),
  groupedLineGroupBy: vi.fn(),
  bookingGroupBy: vi.fn(),
  createAuditEvent: vi.fn(),
  transactionClient: {
    groupedPurchaseOrder: { findFirst: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    rawMaterialStockBooking: { findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    rawMaterialStock: { updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    billOfMaterialItem: { findMany: mocks.bomFindMany },
    groupedPurchaseOrder: { findFirst: mocks.groupedPurchaseOrderFindFirst, count: mocks.groupedPurchaseOrderCount },
    groupedPurchaseOrderLine: { groupBy: mocks.groupedLineGroupBy },
    rawMaterialStockBooking: { groupBy: mocks.bookingGroupBy },
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import { deleteGroupedPurchaseOrder, getGroupedPurchaseOrder, getProcurementSummary, listAllocatableBomRows, listAllocatableBomRowsPage, rejectGroupedPurchaseOrder } from "./grouped-purchase-order-service";

describe("stock-origin grouped price approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(mocks.transactionClient));
    mocks.transactionClient.groupedPurchaseOrder.findFirst.mockResolvedValue({ id: "group-1", source_type: "STOCK" });
    mocks.transactionClient.rawMaterialStockBooking.groupBy.mockResolvedValue([{
      take_from_stock_id: "stock-1",
      _sum: { booked_quantity: new Prisma.Decimal("3.5") },
    }]);
    mocks.transactionClient.rawMaterialStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.rawMaterialStockBooking.updateMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.groupedPurchaseOrder.update.mockResolvedValue({ id: "group-1" });
    mocks.transactionClient.groupedPurchaseOrder.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([]);
    mocks.transactionClient.rawMaterialStockBooking.deleteMany.mockResolvedValue({ count: 0 });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("releases and unlinks stock reservations before deleting an approved price record", async () => {
    mocks.transactionClient.groupedPurchaseOrder.findFirst.mockResolvedValue({
      id: "group-1",
      grouped_po_no: "group-internal",
      display_no: 7,
      source_type: "STOCK",
      status: "PRICE_APPROVED",
      total_grouped_qty: new Prisma.Decimal("3.5"),
      masterGroupSource: null,
    });
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([
      { id: "booking-1", take_from_stock_id: "stock-1", booked_quantity: new Prisma.Decimal("1.5") },
      { id: "booking-2", take_from_stock_id: "stock-1", booked_quantity: new Prisma.Decimal("2") },
    ]);
    mocks.transactionClient.rawMaterialStockBooking.deleteMany.mockResolvedValue({ count: 2 });

    await expect(deleteGroupedPurchaseOrder("org-1", "group-1", "user-1")).resolves.toBeUndefined();

    expect(mocks.transactionClient.rawMaterialStock.updateMany).toHaveBeenCalledWith({
      where: { id: "stock-1", organization_id: "org-1", quantity_reserved: { gte: new Prisma.Decimal("3.5") } },
      data: { quantity_reserved: { decrement: new Prisma.Decimal("3.5") } },
    });
    expect(mocks.transactionClient.rawMaterialStockBooking.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        id: { in: ["booking-1", "booking-2"] },
        status: "BOOKED",
        grouped_purchase_order_id: "group-1",
      },
    });
    expect(mocks.transactionClient.rawMaterialStockBooking.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.transactionClient.groupedPurchaseOrder.deleteMany.mock.invocationCallOrder[0]);
    expect(mocks.transactionClient.groupedPurchaseOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: "group-1", organization_id: "org-1", status: "PRICE_APPROVED" },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      entityType: "GroupedPurchaseOrder",
      entityId: "group-1",
      details: expect.objectContaining({ released_stock_booking_count: 2 }),
    }), mocks.transactionClient);
  });

  it("keeps a stock price record when its reservation cannot be released", async () => {
    mocks.transactionClient.groupedPurchaseOrder.findFirst.mockResolvedValue({
      id: "group-1",
      grouped_po_no: "group-internal",
      display_no: 7,
      source_type: "STOCK",
      status: "PENDING_PRICE_APPROVAL",
      total_grouped_qty: new Prisma.Decimal("3.5"),
      masterGroupSource: null,
    });
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([
      { id: "booking-1", take_from_stock_id: "stock-1", booked_quantity: new Prisma.Decimal("3.5") },
    ]);
    mocks.transactionClient.rawMaterialStock.updateMany.mockResolvedValue({ count: 0 });

    await expect(deleteGroupedPurchaseOrder("org-1", "group-1", "user-1"))
      .rejects.toThrow("Unable to release the reserved stock quantity safely.");

    expect(mocks.transactionClient.rawMaterialStockBooking.deleteMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.groupedPurchaseOrder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("blocks deletion after stock is master grouped", async () => {
    mocks.transactionClient.groupedPurchaseOrder.findFirst.mockResolvedValue({
      id: "group-1",
      source_type: "STOCK",
      status: "MASTER_GROUPED",
      masterGroupSource: { id: "master-1" },
    });

    await expect(deleteGroupedPurchaseOrder("org-1", "group-1", "user-1"))
      .rejects.toThrow("Delete the Master Group before deleting this Grouped PO.");

    expect(mocks.transactionClient.rawMaterialStockBooking.findMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.groupedPurchaseOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("releases linked stock reservations when the approval is rejected", async () => {
    await expect(rejectGroupedPurchaseOrder("org-1", "group-1", "Price mismatch"))
      .resolves.toEqual({ ok: true });

    expect(mocks.transactionClient.rawMaterialStock.updateMany).toHaveBeenCalledWith({
      where: {
        id: "stock-1",
        organization_id: "org-1",
        quantity_reserved: { gte: new Prisma.Decimal("3.5") },
      },
      data: { quantity_reserved: { decrement: new Prisma.Decimal("3.5") } },
    });
    expect(mocks.transactionClient.rawMaterialStockBooking.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", grouped_purchase_order_id: "group-1", status: "BOOKED" },
      data: { status: "REJECTED" },
    });
    expect(mocks.transactionClient.groupedPurchaseOrder.update).toHaveBeenCalledWith({
      where: { id: "group-1", organization_id: "org-1" },
      data: { status: "REJECTED", rejection_reason: "Price mismatch" },
    });
  });

  it("does not reject when the reservation cannot be released safely", async () => {
    mocks.transactionClient.rawMaterialStock.updateMany.mockResolvedValue({ count: 0 });

    await expect(rejectGroupedPurchaseOrder("org-1", "group-1", "Price mismatch"))
      .rejects.toThrow("Unable to release the reserved stock quantity safely.");

    expect(mocks.transactionClient.rawMaterialStockBooking.updateMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.groupedPurchaseOrder.update).not.toHaveBeenCalled();
  });

  it("returns the unfulfilled remainder after a partial store approval", async () => {
    mocks.bomFindMany.mockResolvedValue([{
      id: "bom-1",
      order_id: "order-1",
      orderQty: new Prisma.Decimal("1"),
      categoryType: "Fabric",
      category: "Fabric",
      subCategory: "Woven",
      rawMaterialName: "Cotton",
      stockUom: "PCS",
      internalConsumption: new Prisma.Decimal("1"),
      internalPrice: new Prisma.Decimal("2"),
      requiredQty: new Prisma.Decimal("10"),
      totalRequiredQty: new Prisma.Decimal("10"),
      order: { orderNo: "ORD-1", styleName: "Style 1", brand: "Brand", entity_id: "entity-1", entityName: "Factory", entity: { id: "entity-1", entity_name: "Factory", is_active: true } },
    }]);
    mocks.groupedLineGroupBy.mockResolvedValue([]);
    mocks.bookingGroupBy.mockResolvedValue([
      { source_bom_item_id: "bom-1", status: "BOOKED", _sum: { booked_quantity: new Prisma.Decimal("2"), fulfilled_quantity: new Prisma.Decimal("0") } },
      { source_bom_item_id: "bom-1", status: "FULFILLED", _sum: { booked_quantity: new Prisma.Decimal("0"), fulfilled_quantity: new Prisma.Decimal("3") } },
    ]);

    await expect(listAllocatableBomRows("org-1")).resolves.toMatchObject([{
      id: "bom-1",
      requiredQty: 10,
      remainingQty: 5,
    }]);
    expect(mocks.bomFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ order: { organization_id: "org-1" } }),
    }));
    expect(mocks.bomFindMany.mock.calls[0][0]).not.toHaveProperty("take");
    expect(mocks.groupedLineGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { groupedPurchaseOrder: { organization_id: "org-1", source_type: "VENDOR" } },
      by: ["source_bom_item_id"],
    }));
    expect(mocks.bookingGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", status: { in: ["BOOKED", "FULFILLED"] } },
      by: ["source_bom_item_id", "status"],
    }));
  });

  it("loads one Grouped PO by tenant-scoped ID", async () => {
    mocks.groupedPurchaseOrderFindFirst.mockResolvedValue(null);

    await expect(getGroupedPurchaseOrder("org-1", "group-1"))
      .rejects.toThrow("Grouped PO not found.");
    expect(mocks.groupedPurchaseOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "group-1", organization_id: "org-1" },
    }));
  });

  it("counts allocatable rows from a minimal BOM projection", async () => {
    mocks.bomFindMany.mockResolvedValue([
      { id: "bom-1", requiredQty: new Prisma.Decimal("10"), totalRequiredQty: null },
      { id: "bom-2", requiredQty: new Prisma.Decimal("4"), totalRequiredQty: null },
    ]);
    mocks.groupedLineGroupBy.mockResolvedValue([
      { source_bom_item_id: "bom-1", _sum: { grouped_qty: new Prisma.Decimal("3") } },
    ]);
    mocks.bookingGroupBy.mockResolvedValue([
      { source_bom_item_id: "bom-1", status: "BOOKED", _sum: { booked_quantity: new Prisma.Decimal("2"), fulfilled_quantity: new Prisma.Decimal("0") } },
      { source_bom_item_id: "bom-1", status: "FULFILLED", _sum: { booked_quantity: new Prisma.Decimal("0"), fulfilled_quantity: new Prisma.Decimal("3") } },
      { source_bom_item_id: "bom-2", status: "BOOKED", _sum: { booked_quantity: new Prisma.Decimal("4"), fulfilled_quantity: new Prisma.Decimal("0") } },
    ]);
    mocks.groupedPurchaseOrderCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    await expect(getProcurementSummary("org-1")).resolves.toEqual({
      pendingVendorAllocation: 1,
      pendingPriceApproval: 2,
      readyForPo: 3,
      totalOpen: 6,
    });
    expect(mocks.bomFindMany).toHaveBeenCalledWith({
      where: { order: { organization_id: "org-1" } },
      select: { id: true, requiredQty: true, totalRequiredQty: true },
    });
  });

  it("returns a bounded allocation page and scopes aggregates to its BOM IDs", async () => {
    const bomRow = (id: string) => ({
      id,
      order_id: `order-${id}`,
      categoryType: "Fabric",
      category: "Fabric",
      subCategory: "Woven",
      rawMaterialName: "Cotton",
      stockUom: "MTR",
      internalConsumption: new Prisma.Decimal("1"),
      internalPrice: new Prisma.Decimal("2"),
      requiredQty: new Prisma.Decimal("10"),
      totalRequiredQty: null,
      order: { orderNo: `ORDER-${id}`, styleName: "Style", brand: "Brand", entity_id: "entity-1", entityName: "Factory", entity: { id: "entity-1", entity_name: "Factory", is_active: true } },
    });
    mocks.bomFindMany.mockResolvedValue([bomRow("bom-1"), bomRow("bom-2")]);
    mocks.groupedLineGroupBy.mockResolvedValue([]);
    mocks.bookingGroupBy.mockResolvedValue([]);

    await expect(listAllocatableBomRowsPage("org-1", { limit: 1 }))
      .resolves.toMatchObject({ bomRows: [{ id: "bom-1", remainingQty: 10 }], nextCursor: "bom-1" });
    expect(mocks.bomFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(mocks.groupedLineGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        source_bom_item_id: { in: ["bom-1"] },
        groupedPurchaseOrder: { organization_id: "org-1", source_type: "VENDOR" },
      }),
    }));
  });
});
