import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  masterFindMany: vi.fn(),
  masterFindFirst: vi.fn(),
  masterUpdate: vi.fn(),
  groupFindFirst: vi.fn(),
  bookingGroupBy: vi.fn(),
  verificationFindFirst: vi.fn(),
  verificationFindMany: vi.fn(),
  groupTransactionFindFirst: vi.fn(),
  stockUpdateMany: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingUpdateMany: vi.fn(),
  transactionVerificationFindFirst: vi.fn(),
  verificationCreate: vi.fn(),
  allocationCreate: vi.fn(),
  groupUpdate: vi.fn(),
  sourceFindMany: vi.fn(),
  transaction: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    masterPurchaseOrder: { findMany: mocks.masterFindMany },
    groupedPurchaseOrder: { findFirst: mocks.groupFindFirst },
    rmGrnVerification: { findFirst: mocks.verificationFindFirst, findMany: mocks.verificationFindMany },
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import { getStockVerificationDetails, listPendingStockVerificationTasks, notifyStoreForStockMasterGroup, saveStockGroupVerification } from "./rm-stock-verification-service";

const transaction = {
  masterPurchaseOrder: { findFirst: mocks.masterFindFirst, update: mocks.masterUpdate },
  groupedPurchaseOrder: { findFirst: mocks.groupTransactionFindFirst, update: mocks.groupUpdate },
  rawMaterialStock: { updateMany: mocks.stockUpdateMany },
  rawMaterialStockBooking: { groupBy: mocks.bookingGroupBy, findMany: mocks.bookingFindMany, updateMany: mocks.bookingUpdateMany },
  rmGrnVerification: { findFirst: mocks.transactionVerificationFindFirst, findMany: mocks.verificationFindMany, create: mocks.verificationCreate },
  rmGrnVerificationAllocation: { create: mocks.allocationCreate },
  masterPurchaseOrderSource: { findMany: mocks.sourceFindMany },
};

describe("stock Master Group store notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.masterFindFirst.mockResolvedValue({
      id: "master-1",
      master_po_no: "master-internal",
      display_no: 3,
      status: "MASTER_GROUPED",
      sourceRecords: [{ groupedPurchaseOrder: {
        id: "stock-group-1",
        organization_id: "org-1",
        source_type: "STOCK",
        status: "MASTER_GROUPED",
        total_grouped_qty: new Prisma.Decimal("10"),
        vendor: { organization_id: "org-1", is_current_store: true, is_active: true },
      } }],
    });
    mocks.bookingGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "stock-group-1",
      _sum: { booked_quantity: new Prisma.Decimal("10") },
    }]);
    mocks.verificationFindMany.mockResolvedValue([]);
    mocks.masterUpdate.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("notifies the active store once and keeps the stock reserved for verification", async () => {
    await expect(notifyStoreForStockMasterGroup("org-1", "master-1", "user-1"))
      .resolves.toEqual({ notified: true, verificationTasks: 1 });

    expect(mocks.masterFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "master-1", organization_id: "org-1" },
    }));
    expect(mocks.masterUpdate).toHaveBeenCalledWith({
      where: { id: "master-1", organization_id: "org-1" },
      data: { status: "STORE_NOTIFIED" },
    });
    expect(mocks.bookingGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", grouped_purchase_order_id: { in: ["stock-group-1"] }, status: "BOOKED" },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "STORE_NOTIFIED",
      entityType: "MasterPurchaseOrder",
      entityId: "master-1",
    }), transaction);
  });

  it("does not notify a vendor-origin Master Group", async () => {
    mocks.masterFindFirst.mockResolvedValue({
      id: "master-1",
      status: "MASTER_GROUPED",
      sourceRecords: [{ groupedPurchaseOrder: { id: "vendor-group-1", organization_id: "org-1", source_type: "VENDOR", status: "MASTER_GROUPED", total_grouped_qty: new Prisma.Decimal("10"), vendor: { organization_id: "org-1", is_current_store: false, is_active: true } } }],
    });

    await expect(notifyStoreForStockMasterGroup("org-1", "master-1", "user-1"))
      .rejects.toThrow("Notify Store is available only for stock-origin Master Groups.");
    expect(mocks.masterUpdate).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("lists only unverified stock groups notified to this organization", async () => {
    mocks.masterFindMany.mockResolvedValue([{
      id: "master-1",
      master_po_no: "master-internal",
      display_no: 3,
      created_at: new Date("2026-10-01T00:00:00Z"),
      entity: { entity_name: "Factory" },
      sourceRecords: [{ groupedPurchaseOrder: {
        id: "stock-group-1",
        organization_id: "org-1",
        source_type: "STOCK",
        grouped_po_no: "gpo-stock-internal",
        display_no: 8,
        raw_material: "Cotton",
        category: "Fabric",
        sub_category: "Woven",
        total_grouped_qty: new Prisma.Decimal("10"),
        stockBookings: [{ booked_quantity: new Prisma.Decimal("10") }],
      } }],
    }]);
    mocks.verificationFindMany.mockResolvedValue([]);

    await expect(listPendingStockVerificationTasks("org-1")).resolves.toMatchObject([{
      sourceGroupedPurchaseOrderId: "stock-group-1",
      masterPurchaseOrderId: "master-1",
      masterGroupingNumber: "MGP-3",
      groupingNumber: "GP-8",
      rawMaterialName: "Cotton",
      expectedQuantity: "10",
    }]);
    expect(mocks.masterFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", status: "STORE_NOTIFIED" },
    }));
    expect(mocks.verificationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", source_grouped_purchase_order_id: { in: ["stock-group-1"] } },
    }));
  });

  it("loads a pending stock task using its authorized grouped purchase order", async () => {
    mocks.groupFindFirst.mockResolvedValue({
      id: "stock-group-1",
      organization_id: "org-1",
      grouped_po_no: "gpo-stock-internal",
      display_no: 8,
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      total_grouped_qty: new Prisma.Decimal("10"),
      status: "MASTER_GROUPED",
      stockBookings: [{ booked_quantity: new Prisma.Decimal("10") }],
      masterGroupSource: { masterPurchaseOrder: {
        id: "master-1",
        organization_id: "org-1",
        master_po_no: "master-internal",
        display_no: 3,
        total_grouped_qty: new Prisma.Decimal("10"),
        status: "STORE_NOTIFIED",
      } },
    });
    mocks.verificationFindFirst.mockResolvedValue(null);

    await expect(getStockVerificationDetails("org-1", "stock-group-1")).resolves.toMatchObject({
      isStockIssue: true,
      sourceGroupedPurchaseOrderId: "stock-group-1",
      grnNumber: "STOCK-GP-8",
      masterGroupingNumber: "MGP-3",
      grnQuantity: "10",
      allocations: [{ groupedPurchaseOrderId: "stock-group-1", verificationAllocated: "0", balanceToAllocate: "10" }],
    });
    expect(mocks.groupFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "stock-group-1", organization_id: "org-1", source_type: "STOCK" },
    }));
  });

  it("consumes approved quantities by style line, releases reservations, and creates allocation rows", async () => {
    mocks.groupTransactionFindFirst.mockResolvedValue({
      id: "stock-group-1",
      organization_id: "org-1",
      grouped_po_no: "gpo-stock-internal",
      total_grouped_qty: new Prisma.Decimal("10"),
      lines: [
        { source_bom_item_id: "bom-1", grouped_qty: new Prisma.Decimal("6") },
        { source_bom_item_id: "bom-2", grouped_qty: new Prisma.Decimal("4") },
      ],
      masterGroupSource: { masterPurchaseOrder: {
        id: "master-1",
        organization_id: "org-1",
        status: "STORE_NOTIFIED",
        total_grouped_qty: new Prisma.Decimal("10"),
      } },
    });
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.bookingFindMany.mockResolvedValue([
      {
        id: "booking-1",
        source_bom_item_id: "bom-1",
        take_from_stock_id: "stock-1",
        booked_quantity: new Prisma.Decimal("6"),
        takeFromStock: { id: "stock-1", quantity_on_hand: new Prisma.Decimal("10"), quantity_reserved: new Prisma.Decimal("6") },
      },
      {
        id: "booking-2",
        source_bom_item_id: "bom-2",
        take_from_stock_id: "stock-2",
        booked_quantity: new Prisma.Decimal("4"),
        takeFromStock: { id: "stock-2", quantity_on_hand: new Prisma.Decimal("8"), quantity_reserved: new Prisma.Decimal("4") },
      },
    ]);
    mocks.stockUpdateMany.mockResolvedValue({ count: 1 });
    mocks.bookingUpdateMany.mockResolvedValue({ count: 1 });
    mocks.verificationCreate.mockResolvedValue({ id: "verification-1" });
    mocks.allocationCreate.mockResolvedValue({});
    mocks.groupUpdate.mockResolvedValue({});
    mocks.sourceFindMany.mockResolvedValue([{ grouped_purchase_order_id: "stock-group-1" }]);
    mocks.verificationFindMany.mockResolvedValue([{ source_grouped_purchase_order_id: "stock-group-1" }]);

    await expect(saveStockGroupVerification("org-1", "stock-group-1", {
      verifiedQuantity: "8",
      approvedQuantity: "7",
    }, "store-user")).resolves.toMatchObject({
      created: true,
      verificationId: "verification-1",
      verifiedQuantity: "8",
      approvedQuantity: "7",
      rejectedQuantity: "1",
      groupedAllocated: "7",
      masterGroupCompleted: true,
    });

    expect(mocks.stockUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ id: "stock-1", organization_id: "org-1" }),
      data: {
        quantity_reserved: { decrement: new Prisma.Decimal("6") },
        quantity_on_hand: { decrement: new Prisma.Decimal("6") },
        quantity_issued: { increment: new Prisma.Decimal("6") },
      },
    }));
    expect(mocks.stockUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: "stock-2", organization_id: "org-1" }),
      data: {
        quantity_reserved: { decrement: new Prisma.Decimal("4") },
        quantity_on_hand: { decrement: new Prisma.Decimal("1") },
        quantity_issued: { increment: new Prisma.Decimal("1") },
      },
    }));
    expect(mocks.bookingUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "booking-1", organization_id: "org-1", status: "BOOKED" },
      data: { status: "FULFILLED", fulfilled_quantity: new Prisma.Decimal("6") },
    });
    expect(mocks.bookingUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "booking-2", organization_id: "org-1", status: "BOOKED" },
      data: { status: "FULFILLED", fulfilled_quantity: new Prisma.Decimal("1") },
    });
    expect(mocks.verificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      organization_id: "org-1",
      inventory_receipt_line_id: null,
      source_grouped_purchase_order_id: "stock-group-1",
      master_purchase_order_id: "master-1",
      verified_quantity: new Prisma.Decimal("8"),
      approved_quantity: new Prisma.Decimal("7"),
      rejected_quantity: new Prisma.Decimal("1"),
    }) });
    expect(mocks.allocationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      organization_id: "org-1",
      verification_id: "verification-1",
      grouped_purchase_order_id: "stock-group-1",
      verification_allocated: new Prisma.Decimal("7"),
    }) });
    expect(mocks.masterUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "master-1", organization_id: "org-1", status: "STORE_NOTIFIED" },
      data: { status: "STOCK_ALLOCATED" },
    }));
  });

  it("rejects a physical verification quantity above the reserved amount without changing stock", async () => {
    mocks.groupTransactionFindFirst.mockResolvedValue({
      id: "stock-group-1",
      organization_id: "org-1",
      total_grouped_qty: new Prisma.Decimal("10"),
      lines: [],
      masterGroupSource: { masterPurchaseOrder: {
        id: "master-1",
        organization_id: "org-1",
        status: "STORE_NOTIFIED",
        total_grouped_qty: new Prisma.Decimal("10"),
      } },
    });
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.bookingFindMany.mockResolvedValue([{
      id: "booking-1",
      source_bom_item_id: "bom-1",
      take_from_stock_id: "stock-1",
      booked_quantity: new Prisma.Decimal("10"),
      takeFromStock: { id: "stock-1", quantity_on_hand: new Prisma.Decimal("10"), quantity_reserved: new Prisma.Decimal("10") },
    }]);

    await expect(saveStockGroupVerification("org-1", "stock-group-1", {
      verifiedQuantity: "11",
      approvedQuantity: "10",
    }, "store-user")).rejects.toThrow("Verified Qty cannot exceed the stock reserved for this group.");
    expect(mocks.stockUpdateMany).not.toHaveBeenCalled();
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
  });

  it("rejects a duplicate stock verification before touching reserved stock", async () => {
    mocks.groupTransactionFindFirst.mockResolvedValue({
      id: "stock-group-1",
      organization_id: "org-1",
      total_grouped_qty: new Prisma.Decimal("10"),
      masterGroupSource: { masterPurchaseOrder: { id: "master-1", organization_id: "org-1", status: "STORE_NOTIFIED" } },
    });
    mocks.transactionVerificationFindFirst.mockResolvedValue({ id: "verification-1" });

    await expect(saveStockGroupVerification("org-1", "stock-group-1", {
      verifiedQuantity: "10",
      approvedQuantity: "10",
    }, "store-user")).rejects.toThrow("This stock group has already been verified.");
    expect(mocks.bookingFindMany).not.toHaveBeenCalled();
    expect(mocks.stockUpdateMany).not.toHaveBeenCalled();
  });
});