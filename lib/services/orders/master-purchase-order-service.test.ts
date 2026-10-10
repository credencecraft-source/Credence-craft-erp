import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  masterPurchaseOrderFindFirst: vi.fn(),
  createAuditEvent: vi.fn(),
  transactionClient: {
    procurementDocumentCounter: { upsert: vi.fn() },
    groupedPurchaseOrder: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    masterPurchaseOrder: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    rawMaterialStockBooking: { findMany: vi.fn(), updateMany: vi.fn() },
    rawMaterialStock: { updateMany: vi.fn() },
    rmGrnVerification: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    masterPurchaseOrder: { findFirst: mocks.masterPurchaseOrderFindFirst },
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));

import { createMasterPurchaseOrder, deleteMasterPurchaseOrder, getMasterPurchaseOrder } from "./master-purchase-order-service";

describe("stock-origin grouped records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(mocks.transactionClient));
    mocks.transactionClient.groupedPurchaseOrder.findMany.mockResolvedValue([]);
    mocks.transactionClient.procurementDocumentCounter.upsert.mockResolvedValue({ current_value: 1 });
    mocks.transactionClient.groupedPurchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([]);
    mocks.transactionClient.rawMaterialStockBooking.updateMany.mockResolvedValue({ count: 0 });
    mocks.transactionClient.rawMaterialStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.rmGrnVerification.findMany.mockResolvedValue([]);
    mocks.transactionClient.rmGrnVerification.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transactionClient.masterPurchaseOrder.deleteMany.mockResolvedValue({ count: 1 });
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("allows only approved stock-origin records into the Master Group lookup", async () => {
    await expect(createMasterPurchaseOrder("org-1", ["stock-group-1"]))
      .rejects.toThrow("One or more grouped purchase orders are unavailable for master grouping.");

    expect(mocks.transactionClient.groupedPurchaseOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ["stock-group-1"] },
        organization_id: "org-1",
        source_type: { in: ["VENDOR", "STOCK"] },
        status: "PRICE_APPROVED",
      },
    }));
  });

  it("deletes a pending store notification and resets its stock group", async () => {
    mocks.transactionClient.masterPurchaseOrder.findFirst.mockResolvedValue({
      id: "master-1",
      master_po_no: "master-internal",
      display_no: 3,
      status: "STORE_NOTIFIED",
      sourceRecords: [{ grouped_purchase_order_id: "stock-group-1", groupedPurchaseOrder: {
        organization_id: "org-1",
        source_type: "STOCK",
        status: "MASTER_GROUPED",
        total_grouped_qty: new Prisma.Decimal("10"),
      } }],
      purchaseOrderSources: [],
    });

    await expect(deleteMasterPurchaseOrder("org-1", "master-1", "user-1")).resolves.toBeUndefined();

    expect(mocks.transactionClient.groupedPurchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["stock-group-1"] }, organization_id: "org-1" },
      data: { status: "PRICE_APPROVED" },
    });
    expect(mocks.transactionClient.masterPurchaseOrder.deleteMany).toHaveBeenCalledWith({
      where: { id: "master-1", organization_id: "org-1" },
    });
    expect(mocks.transactionClient.rmGrnVerification.deleteMany).not.toHaveBeenCalled();
  });

  it("reverses verified stock and deletes its verification and allocations", async () => {
    mocks.transactionClient.masterPurchaseOrder.findFirst.mockResolvedValue({
      id: "master-1",
      master_po_no: "master-internal",
      display_no: 3,
      status: "STOCK_ALLOCATED",
      sourceRecords: [{ grouped_purchase_order_id: "stock-group-1", groupedPurchaseOrder: {
        organization_id: "org-1",
        source_type: "STOCK",
        status: "STOCK_ALLOCATED",
        total_grouped_qty: new Prisma.Decimal("10"),
      } }],
      purchaseOrderSources: [],
    });
    mocks.transactionClient.rmGrnVerification.findMany.mockResolvedValue([{
      id: "verification-1",
      source_grouped_purchase_order_id: "stock-group-1",
      master_purchase_order_id: "master-1",
      approved_quantity: new Prisma.Decimal("8"),
    }]);
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      grouped_purchase_order_id: "stock-group-1",
      take_from_stock_id: "stock-1",
      booked_quantity: new Prisma.Decimal("10"),
      fulfilled_quantity: new Prisma.Decimal("8"),
      takeFromStock: {
        organization_id: "org-1",
        quantity_on_hand: new Prisma.Decimal("12"),
        quantity_reserved: new Prisma.Decimal("1"),
        quantity_issued: new Prisma.Decimal("8"),
      },
    }]);
    mocks.transactionClient.rawMaterialStockBooking.updateMany.mockResolvedValue({ count: 1 });
    mocks.transactionClient.rmGrnVerification.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteMasterPurchaseOrder("org-1", "master-1", "user-1")).resolves.toBeUndefined();

    expect(mocks.transactionClient.rawMaterialStock.updateMany).toHaveBeenCalledWith({
      where: {
        id: "stock-1",
        organization_id: "org-1",
        quantity_on_hand: new Prisma.Decimal("12"),
        quantity_reserved: new Prisma.Decimal("1"),
        quantity_issued: { gte: new Prisma.Decimal("8") },
      },
      data: {
        quantity_on_hand: { increment: new Prisma.Decimal("8") },
        quantity_reserved: { increment: new Prisma.Decimal("10") },
        quantity_issued: { decrement: new Prisma.Decimal("8") },
      },
    });
    expect(mocks.transactionClient.rawMaterialStockBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1", id: { in: ["booking-1"] }, status: "FULFILLED" },
      data: { status: "BOOKED", fulfilled_quantity: new Prisma.Decimal("0") },
    }));
    expect(mocks.transactionClient.rmGrnVerification.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", id: { in: ["verification-1"] } },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      action: "DELETE",
      entityType: "MasterPurchaseOrder",
      entityId: "master-1",
    }), mocks.transactionClient);
    expect(mocks.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 30000,
    });
  });

  it("preserves verified records when restoring their reservations would overbook stock", async () => {
    mocks.transactionClient.masterPurchaseOrder.findFirst.mockResolvedValue({
      id: "master-1",
      master_po_no: "master-internal",
      display_no: 3,
      status: "STOCK_ALLOCATED",
      sourceRecords: [{ grouped_purchase_order_id: "stock-group-1", groupedPurchaseOrder: {
        organization_id: "org-1",
        source_type: "STOCK",
        status: "STOCK_ALLOCATED",
        total_grouped_qty: new Prisma.Decimal("10"),
      } }],
      purchaseOrderSources: [],
    });
    mocks.transactionClient.rmGrnVerification.findMany.mockResolvedValue([{
      id: "verification-1",
      source_grouped_purchase_order_id: "stock-group-1",
      master_purchase_order_id: "master-1",
      approved_quantity: new Prisma.Decimal("8"),
    }]);
    mocks.transactionClient.rawMaterialStockBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      grouped_purchase_order_id: "stock-group-1",
      take_from_stock_id: "stock-1",
      booked_quantity: new Prisma.Decimal("10"),
      fulfilled_quantity: new Prisma.Decimal("8"),
      takeFromStock: {
        organization_id: "org-1",
        quantity_on_hand: new Prisma.Decimal("12"),
        quantity_reserved: new Prisma.Decimal("11"),
        quantity_issued: new Prisma.Decimal("8"),
      },
    }]);

    await expect(deleteMasterPurchaseOrder("org-1", "master-1", "user-1"))
      .rejects.toThrow("Cannot delete this Master Group because its issued stock has since been used or reserved.");

    expect(mocks.transactionClient.rawMaterialStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.rawMaterialStockBooking.updateMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.rmGrnVerification.deleteMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.masterPurchaseOrder.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("creates a Master Group from an approved Internal Store stock group", async () => {
    mocks.transactionClient.groupedPurchaseOrder.findMany.mockResolvedValue([{
      id: "stock-group-1",
      organization_id: "org-1",
      entity_id: "entity-1",
      source_type: "STOCK",
      status: "PRICE_APPROVED",
      vendor_id: "store-vendor-1",
      vendor: { id: "store-vendor-1", vendor: "Internal Store" },
      entity: { id: "entity-1", is_active: true },
      masterGroupSource: null,
      grouped_po_no: "stock-group-internal",
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      total_required_qty: new Prisma.Decimal("10"),
      total_grouped_qty: new Prisma.Decimal("10"),
      no_of_styles: 1,
      lines: [{
        id: "stock-line-1",
        source_bom_item_id: "bom-1",
        source_order_id: "order-1",
        order_no: "ORDER-1",
        style_name: "Style 1",
        brand: "Brand 1",
        category: "Fabric",
        sub_category: "Woven",
        item_name: "Cotton",
        required_qty: new Prisma.Decimal("10"),
        grouped_qty: new Prisma.Decimal("10"),
        vendor_price: new Prisma.Decimal("5"),
        total_spend: new Prisma.Decimal("50"),
        stock_uom: "PCS",
      }],
    }]);
    mocks.transactionClient.masterPurchaseOrder.create.mockResolvedValue({
      id: "master-1",
      entity_id: "entity-1",
      entity: { id: "entity-1", entity_name: "Factory" },
      master_po_no: "master-internal",
      display_no: 1,
      status: "MASTER_GROUPED",
      created_at: new Date("2026-10-01T00:00:00Z"),
      sourceRecords: [{ grouped_purchase_order_id: "stock-group-1", groupedPurchaseOrder: { source_type: "STOCK", grouped_po_no: "stock-group-internal", display_no: 2 } }],
      lines: [{
        id: "master-line-1",
        source_grouped_po_no: "stock-group-internal",
        source_order_id: "order-1",
        source_order_no: "ORDER-1",
        style_name: "Style 1",
        brand: "Brand 1",
        raw_material: "Cotton",
        category: "Fabric",
        sub_category: "Woven",
        required_qty: new Prisma.Decimal("10"),
        grouped_qty: new Prisma.Decimal("10"),
        vendor_price: new Prisma.Decimal("5"),
        total_spend: new Prisma.Decimal("50"),
        stock_uom: "PCS",
      }],
      purchaseOrderSources: [],
      vendor: { id: "store-vendor-1", vendor: "Internal Store" },
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      total_required_qty: new Prisma.Decimal("10"),
      total_grouped_qty: new Prisma.Decimal("10"),
      no_of_styles: 1,
    });

    await expect(createMasterPurchaseOrder("org-1", ["stock-group-1"], "Planner"))
      .resolves.toMatchObject({ sourceType: "STOCK", masterPoNo: "MGP-1", totalGroupedQty: 10 });
    expect(mocks.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 30000,
    });
    expect(mocks.transactionClient.masterPurchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendor_id: "store-vendor-1",
        sourceRecords: { create: [{ grouped_purchase_order_id: "stock-group-1" }] },
      }),
    }));
  });

  it("does not mix vendor and stock sources in one Master Group", async () => {
    const baseOrder = {
      organization_id: "org-1",
      entity_id: "entity-1",
      entity: { id: "entity-1", is_active: true },
      vendor_id: "vendor-1",
      vendor: { id: "vendor-1", vendor: "Vendor" },
      masterGroupSource: null,
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      lines: [],
    };
    mocks.transactionClient.groupedPurchaseOrder.findMany.mockResolvedValue([
      { ...baseOrder, id: "vendor-group-1", source_type: "VENDOR" },
      { ...baseOrder, id: "stock-group-1", source_type: "STOCK" },
    ]);

    await expect(createMasterPurchaseOrder("org-1", ["vendor-group-1", "stock-group-1"]))
      .rejects.toThrow("A Master Group cannot mix vendor and stock source records.");
    expect(mocks.transactionClient.masterPurchaseOrder.create).not.toHaveBeenCalled();
  });

  it("rejects source groups with differing price, GST, or HSN values", async () => {
    const source = {
      organization_id: "org-1",
      entity_id: "entity-1",
      entity: { id: "entity-1", is_active: true },
      vendor_id: "vendor-1",
      vendor: { id: "vendor-1", vendor: "Vendor" },
      source_type: "VENDOR",
      status: "PRICE_APPROVED",
      masterGroupSource: null,
      raw_material: "Cotton",
      category: "Fabric",
      sub_category: "Woven",
      vendor_price: new Prisma.Decimal("5"),
      vendor_price_inr: new Prisma.Decimal("5"),
      gst: new Prisma.Decimal("5"),
      hsn_code: "5208",
      lines: [{ id: "line-1", vendor_price: new Prisma.Decimal("5") }],
    };
    const mismatches = [
      { vendor_price: new Prisma.Decimal("6"), vendor_price_inr: new Prisma.Decimal("6"), lines: [{ id: "line-2", vendor_price: new Prisma.Decimal("6") }] },
      { gst: new Prisma.Decimal("12") },
      { hsn_code: "5209" },
    ];

    for (const mismatch of mismatches) {
      mocks.transactionClient.groupedPurchaseOrder.findMany.mockResolvedValueOnce([
        source,
        { ...source, id: "group-2", ...mismatch },
      ]);

      await expect(createMasterPurchaseOrder("org-1", ["group-1", "group-2"]))
        .rejects.toThrow("Master Group sources must have identical price, GST, and HSN.");
    }

    expect(mocks.transactionClient.masterPurchaseOrder.create).not.toHaveBeenCalled();
  });

  it("loads one Master Group by tenant-scoped ID", async () => {
    mocks.masterPurchaseOrderFindFirst.mockResolvedValue(null);

    await expect(getMasterPurchaseOrder("org-1", "master-1"))
      .rejects.toThrow("Master Group not found.");
    expect(mocks.masterPurchaseOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "master-1", organization_id: "org-1" },
    }));
  });
});
