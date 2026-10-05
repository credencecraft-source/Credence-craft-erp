import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  lineFindFirst: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
  savedFindFirst: vi.fn(),
  transaction: vi.fn(),
  transactionLineFindFirst: vi.fn(),
  transactionVerificationFindFirst: vi.fn(),
  verificationCreate: vi.fn(),
  verificationUpdate: vi.fn(),
  allocationGroupBy: vi.fn(),
  allocationFindMany: vi.fn(),
  allocationUpsert: vi.fn(),
  allocationDeleteMany: vi.fn(),
  receiptLineUpdateMany: vi.fn(),
  rawMaterialStockFindFirst: vi.fn(),
  rawMaterialStockCreate: vi.fn(),
  rawMaterialStockUpdateMany: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    inventoryReceiptLine: { findFirst: mocks.lineFindFirst },
    purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
    rmGrnVerification: { findFirst: mocks.savedFindFirst },
    rmGrnVerificationAllocation: { groupBy: mocks.allocationGroupBy, findMany: mocks.allocationFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { getRmGrnVerification, getRmGrnVerificationDraftsForPurchaseOrder, listRmGrnVerificationAllocations, MasterGroupRequiredError, RmGrnVerificationNotFoundError, saveRmGrnVerification } from "./rm-grn-verification-service";

const transaction = {
  inventoryReceiptLine: {
    findFirst: mocks.transactionLineFindFirst,
    updateMany: mocks.receiptLineUpdateMany,
  },
  rawMaterialStock: {
    findFirst: mocks.rawMaterialStockFindFirst,
    create: mocks.rawMaterialStockCreate,
    updateMany: mocks.rawMaterialStockUpdateMany,
  },
  rmGrnVerification: {
    findFirst: mocks.transactionVerificationFindFirst,
    create: mocks.verificationCreate,
    update: mocks.verificationUpdate,
  },
  rmGrnVerificationAllocation: {
    groupBy: mocks.allocationGroupBy,
    upsert: mocks.allocationUpsert,
    deleteMany: mocks.allocationDeleteMany,
  },
};

const sourceLine = (withMaster = true, groupedQuantity = "10", masterQuantity = "14") => ({
  id: "receipt-line-1",
  raw_material: "Cotton",
  received_quantity: new Prisma.Decimal("12"),
  receipt: {
    entity_id: "entity-1",
    location_id: "location-1",
    receipt_no: "GRN-1",
    purchaseOrder: { purchase_order_no: "po-internal", display_no: 12 },
  },
  purchaseOrderLine: {
    raw_material: "Cotton",
    purchaseOrder: { organization_id: "org-1" },
    masterPurchaseOrder: withMaster ? {
      id: "master-1",
      organization_id: "org-1",
      master_po_no: "master-internal",
      display_no: 3,
      total_grouped_qty: new Prisma.Decimal(masterQuantity),
      sourceRecords: [{
        groupedPurchaseOrder: {
          id: "group-1",
          organization_id: "org-1",
          grouped_po_no: "group-internal",
          display_no: 8,
          total_grouped_qty: new Prisma.Decimal(groupedQuantity),
        },
      }],
    } : null,
  },
});

const savedOrderAllocation = (allocatedQuantity: string, groupedQuantity: string) => ({
  allocated_quantity: new Prisma.Decimal(allocatedQuantity),
  groupedPurchaseOrderLine: {
    id: "group-line-1",
    order_no: null,
    style_name: "STYLE-1",
    grouped_qty: new Prisma.Decimal(groupedQuantity),
    sourceOrder: { organization_id: "org-1", orderNo: "ORDER-1" },
    groupedPurchaseOrder: { id: "group-1", organization_id: "org-1" },
  },
});

describe("RM GRN Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(transaction));
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.allocationGroupBy.mockResolvedValue([]);
    mocks.allocationUpsert.mockResolvedValue({});
    mocks.receiptLineUpdateMany.mockResolvedValue({ count: 1 });
    mocks.rawMaterialStockFindFirst.mockResolvedValue(null);
    mocks.rawMaterialStockCreate.mockResolvedValue({});
    mocks.rawMaterialStockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("loads tenant-scoped source values, capacity, and saved calculations", async () => {
    mocks.lineFindFirst.mockResolvedValue(sourceLine());
    mocks.savedFindFirst.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("14"),
      approved_quantity: new Prisma.Decimal("12"),
      allocations: [{ grouped_purchase_order_id: "group-1", verification_allocated: new Prisma.Decimal("6") }],
    });

    await expect(getRmGrnVerification("org-1", "receipt-line-1")).resolves.toMatchObject({
      masterPurchaseOrderId: "master-1",
      grnNumber: "GRN-1",
      purchaseOrderNumber: "PO-12",
      masterGroupingNumber: "MGP-3",
      poQuantity: "14",
      groupedQtyGrn: "10",
      verifiedQuantity: "14",
      approvedQuantity: "12",
      rejectedQuantity: "2",
      freshExcess: "2",
      totalExcess: "4",
      availableToAllocate: "10",
      groupedAllocated: "6",
      groupedBalanceToAllocate: "4",
      allocations: [{
        groupedPurchaseOrderId: "group-1",
        groupingNumber: "GP-8",
        totalGroupedQty: "10",
        verificationAllocated: "6",
        balanceToAllocate: "4",
      }],
    });
    expect(mocks.lineFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "receipt-line-1", receipt: { organization_id: "org-1" } },
    }));
  });

  it("returns no grouping rows for a legacy receipt line without a master group", async () => {
    mocks.lineFindFirst.mockResolvedValue(sourceLine(false));
    mocks.savedFindFirst.mockResolvedValue(null);

    await expect(getRmGrnVerification("org-1", "receipt-line-1")).resolves.toMatchObject({
      masterPurchaseOrderId: null,
      masterGroupingNumber: "",
      allocations: [],
    });
  });

  it("loads every PO line for the pre-post popup with only unallocated grouping capacity", async () => {
    mocks.purchaseOrderFindFirst.mockResolvedValue({
      purchase_order_no: "po-internal",
      display_no: 12,
      lines: [{
        id: "po-line-1",
        raw_material: "Cotton",
        quantity: new Prisma.Decimal("14"),
        masterPurchaseOrder: sourceLine().purchaseOrderLine.masterPurchaseOrder,
      }],
    });
    mocks.allocationGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "group-1",
      _sum: { verification_allocated: new Prisma.Decimal("3") },
    }]);

    await expect(getRmGrnVerificationDraftsForPurchaseOrder("org-1", "po-1")).resolves.toMatchObject([{
      purchaseOrderLineId: "po-line-1",
      masterPurchaseOrderId: "master-1",
      grnNumber: "Assigned on save",
      purchaseOrderNumber: "PO-12",
      masterGroupingNumber: "MGP-3",
      poQuantity: "14",
      groupedQtyGrn: "7",
      verifiedQuantity: "",
      allocations: [{
        groupedPurchaseOrderId: "group-1",
        groupingNumber: "GP-8",
        totalGroupedQty: "7",
        verificationAllocated: "0",
        balanceToAllocate: "7",
      }],
    }]);
    expect(mocks.purchaseOrderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "po-1", organization_id: "org-1", status: { in: ["APPROVED", "SHARED"] } },
    }));
  });

  it("lists tenant-scoped allocation subform rows with their live group balance", async () => {
    mocks.allocationFindMany.mockResolvedValue([{
      id: "allocation-1",
      created_at: new Date("2026-09-30T00:00:00Z"),
      verification_allocated: new Prisma.Decimal("2"),
      orderAllocations: [],
      groupedPurchaseOrder: {
        id: "group-1",
        organization_id: "org-1",
        grouped_po_no: "group-internal",
        display_no: 8,
        total_grouped_qty: new Prisma.Decimal("10"),
      },
      verification: {
        id: "verification-1",
        organization_id: "org-1",
        masterPurchaseOrder: { master_po_no: "master-internal", display_no: 3, organization_id: "org-1" },
        inventoryReceiptLine: {
          raw_material: "Cotton",
          receipt: {
            organization_id: "org-1",
            receipt_no: "GRN-1",
            purchaseOrder: { organization_id: "org-1", purchase_order_no: "po-internal", display_no: 12 },
          },
        },
      },
    }]);
    mocks.allocationGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "group-1",
      _sum: { verification_allocated: new Prisma.Decimal("4") },
    }]);

    await expect(listRmGrnVerificationAllocations("org-1")).resolves.toEqual([{
      id: "allocation-1",
      verificationId: "verification-1",
      grnNumber: "GRN-1",
      purchaseOrderNumber: "PO-12",
      rawMaterialName: "Cotton",
      masterGroupingNumber: "MGP-3",
      groupingNumber: "GP-8",
      totalGroupedQty: "10",
      verificationAllocated: "2",
      balanceToAllocate: "6",
      orderAllocations: [],
    }]);
    expect(mocks.allocationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1" },
    }));
  });

  it("lists sample GRNs in Style-wise Inventory only after Step 8 allocations are complete", async () => {
    const allocationRecord = {
      id: "allocation-real",
      created_at: new Date("2026-10-02T00:00:00Z"),
      verification_allocated: new Prisma.Decimal("3"),
      orderAllocations: [],
      groupedPurchaseOrder: {
        id: "group-1",
        organization_id: "org-1",
        grouped_po_no: "group-internal",
        display_no: 8,
        total_grouped_qty: new Prisma.Decimal("10"),
      },
      verification: {
        id: "verification-real",
        organization_id: "org-1",
        masterPurchaseOrder: null,
        inventoryReceiptLine: {
          raw_material: "Cotton",
          receipt: {
            organization_id: "org-1",
            receipt_no: "GRN-REAL",
            notes: "Regular receipt",
            purchaseOrder: { organization_id: "org-1", purchase_order_no: "po-internal", display_no: 12 },
          },
        },
      },
    };
    const pendingSampleAllocation = {
      ...allocationRecord,
      id: "allocation-sample-pending",
      verification_allocated: new Prisma.Decimal("2"),
      orderAllocations: [{
        allocated_quantity: new Prisma.Decimal("1"),
        groupedPurchaseOrderLine: {
          id: "sample-line-1",
          order_no: null,
          style_name: "SAMPLE-STYLE",
          grouped_qty: new Prisma.Decimal("5"),
          sourceOrder: { organization_id: "org-1", orderNo: "SAMPLE-ORDER-1" },
          groupedPurchaseOrder: { id: "group-1", organization_id: "org-1" },
        },
      }],
      verification: {
        ...allocationRecord.verification,
        id: "verification-sample-pending",
        inventoryReceiptLine: {
          ...allocationRecord.verification.inventoryReceiptLine,
          receipt: {
            ...allocationRecord.verification.inventoryReceiptLine.receipt,
            receipt_no: "GRN-SAMPLE",
            notes: "Dummy sample batch batch-1",
          },
        },
      },
    };
    const completedSampleAllocation = {
      ...pendingSampleAllocation,
      id: "allocation-sample-complete",
      orderAllocations: [savedOrderAllocation("2", "5")],
      verification: {
        ...pendingSampleAllocation.verification,
        id: "verification-sample-complete",
      },
    };
    const completedRealAllocation = {
      ...allocationRecord,
      id: "allocation-real-complete",
      orderAllocations: [savedOrderAllocation("3", "8")],
    };
    mocks.allocationFindMany.mockResolvedValue([
      pendingSampleAllocation,
      completedSampleAllocation,
      completedRealAllocation,
    ]);
    mocks.allocationGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "group-1",
      _sum: { verification_allocated: new Prisma.Decimal("5") },
    }]);

    await expect(listRmGrnVerificationAllocations("org-1", { styleWiseInventory: true }))
      .resolves.toMatchObject([
        {
          id: "allocation-sample-pending",
          orderAllocations: [{
            orderNo: "SAMPLE-ORDER-1",
            styleNo: "SAMPLE-STYLE",
            allocate: "1",
          }],
        },
        { id: "allocation-sample-complete", grnNumber: "GRN-SAMPLE", verificationAllocated: "2" },
        {
          id: "allocation-real-complete",
          grnNumber: "GRN-REAL",
          orderAllocations: [{
            groupedPurchaseOrderLineId: "group-line-1",
            orderNo: "ORDER-1",
            styleNo: "STYLE-1",
            alreadyAllocated: "2",
            balanceToAllocate: "3",
            grouped: "8",
            allocate: "3",
          }],
        },
      ]);

    expect(mocks.allocationGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-1",
        verification_id: { notIn: ["verification-sample-pending"] },
      }),
    }));
  });

  it("hides a GRN allocation after all of its quantity is assigned to order lines", async () => {
    mocks.allocationFindMany.mockResolvedValue([{
      id: "completed-allocation-1",
      created_at: new Date("2026-09-30T00:00:00Z"),
      verification_allocated: new Prisma.Decimal("2"),
      orderAllocations: [savedOrderAllocation("2", "5")],
      groupedPurchaseOrder: {
        id: "group-1",
        organization_id: "org-1",
        grouped_po_no: "group-internal",
        display_no: 8,
        total_grouped_qty: new Prisma.Decimal("10"),
      },
      verification: {
        id: "verification-1",
        organization_id: "org-1",
        masterPurchaseOrder: null,
        inventoryReceiptLine: {
          raw_material: "Cotton",
          receipt: {
            organization_id: "org-1",
            receipt_no: "GRN-1",
            purchaseOrder: { organization_id: "org-1", purchase_order_no: "po-internal", display_no: 12 },
          },
        },
      },
    }]);

    await expect(listRmGrnVerificationAllocations("org-1")).resolves.toEqual([]);
  });

  it("includes stock-backed verification allocations in the normal allocation register", async () => {
    mocks.allocationFindMany.mockResolvedValue([{
      id: "stock-allocation-1",
      created_at: new Date("2026-10-01T00:00:00Z"),
      verification_allocated: new Prisma.Decimal("7"),
      orderAllocations: [],
      groupedPurchaseOrder: {
        id: "stock-group-1",
        organization_id: "org-1",
        grouped_po_no: "stock-group-internal",
        display_no: 9,
        total_grouped_qty: new Prisma.Decimal("10"),
      },
      verification: {
        id: "stock-verification-1",
        organization_id: "org-1",
        masterPurchaseOrder: { master_po_no: "master-internal", display_no: 3, organization_id: "org-1" },
        inventoryReceiptLine: null,
        sourceGroupedPurchaseOrder: {
          id: "stock-group-1",
          organization_id: "org-1",
          source_type: "STOCK",
          grouped_po_no: "stock-group-internal",
          display_no: 9,
          raw_material: "Cotton",
        },
      },
    }]);
    mocks.allocationGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "stock-group-1",
      _sum: { verification_allocated: new Prisma.Decimal("7") },
    }]);

    await expect(listRmGrnVerificationAllocations("org-1")).resolves.toEqual([{
      id: "stock-allocation-1",
      verificationId: "stock-verification-1",
      grnNumber: "STOCK-GP-9",
      purchaseOrderNumber: "Internal Store Issue",
      rawMaterialName: "Cotton",
      masterGroupingNumber: "MGP-3",
      groupingNumber: "GP-9",
      totalGroupedQty: "10",
      verificationAllocated: "7",
      balanceToAllocate: "3",
      orderAllocations: [],
    }]);
  });

  it("calculates the header and persists grouping allocations", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.verificationCreate.mockImplementation(({ data }) => Promise.resolve({
      id: "verification-1",
      verified_quantity: data.verified_quantity,
      approved_quantity: data.approved_quantity,
      grouped_allocated: data.grouped_allocated,
    }));

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "14",
      approvedQuantity: "12",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "6" }],
    }, "user-1")).resolves.toEqual({
      created: true,
      verificationId: "verification-1",
      verifiedQuantity: "14",
      approvedQuantity: "12",
      groupedAllocated: "6",
    });
    expect(mocks.verificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      organization_id: "org-1",
      inventory_receipt_line_id: "receipt-line-1",
      master_purchase_order_id: "master-1",
      po_quantity: new Prisma.Decimal("14"),
      grouped_qty_grn: new Prisma.Decimal("10"),
      verified_quantity: new Prisma.Decimal("14"),
      approved_quantity: new Prisma.Decimal("12"),
      rejected_quantity: new Prisma.Decimal("2"),
      fresh_excess: new Prisma.Decimal("2"),
      total_excess: new Prisma.Decimal("4"),
      available_to_allocate: new Prisma.Decimal("10"),
      grouped_allocated: new Prisma.Decimal("6"),
      grouped_balance_to_allocate: new Prisma.Decimal("4"),
    }) });
    expect(mocks.receiptLineUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "receipt-line-1", receipt: { organization_id: "org-1" } },
      data: {
        received_quantity: new Prisma.Decimal("14"),
        accepted_quantity: new Prisma.Decimal("12"),
        rejected_quantity: new Prisma.Decimal("2"),
      },
    }));
    expect(mocks.rawMaterialStockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      organization_id: "org-1",
      entity_id: "entity-1",
      location_id: "location-1",
      raw_material: "Cotton",
      quantity_on_hand: new Prisma.Decimal("2"),
      source_type: "GRN",
      inventory_receipt_line_id: "receipt-line-1",
    }) });
    expect(mocks.allocationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        organization_id: "org-1",
        grouped_purchase_order_id: "group-1",
        verification_allocated: new Prisma.Decimal("6"),
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("sends accepted excess and rejected counts to General Inventory and caps order allocation at the PO grouping", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine(true, "100", "100"));
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.verificationCreate.mockImplementation(({ data }) => Promise.resolve({
      id: "verification-1",
      verified_quantity: data.verified_quantity,
      approved_quantity: data.approved_quantity,
      grouped_allocated: data.grouped_allocated,
    }));

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "120",
      approvedQuantity: "110",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "100" }],
    }, "user-1")).resolves.toMatchObject({
      verifiedQuantity: "120",
      approvedQuantity: "110",
      groupedAllocated: "100",
    });

    expect(mocks.verificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      verified_quantity: new Prisma.Decimal("120"),
      approved_quantity: new Prisma.Decimal("110"),
      rejected_quantity: new Prisma.Decimal("10"),
      fresh_excess: new Prisma.Decimal("10"),
      total_excess: new Prisma.Decimal("20"),
      available_to_allocate: new Prisma.Decimal("100"),
      grouped_allocated: new Prisma.Decimal("100"),
    }) });
    expect(mocks.receiptLineUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        received_quantity: new Prisma.Decimal("120"),
        accepted_quantity: new Prisma.Decimal("110"),
        rejected_quantity: new Prisma.Decimal("10"),
      },
    }));
    expect(mocks.rawMaterialStockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      quantity_on_hand: new Prisma.Decimal("10"),
      inventory_receipt_line_id: "receipt-line-1",
    }) });
  });

  it("does not insert allocation rows when submitted quantities are zero", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.verificationCreate.mockImplementation(({ data }) => Promise.resolve({
      id: "verification-1",
      verified_quantity: data.verified_quantity,
      approved_quantity: data.approved_quantity,
      grouped_allocated: data.grouped_allocated,
    }));

    await saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "6",
      approvedQuantity: "6",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "0" }],
    }, "user-1");

    expect(mocks.allocationUpsert).not.toHaveBeenCalled();
    expect(mocks.allocationDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes an existing allocation row when its submitted quantity is reset to zero", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("6"),
      approved_quantity: new Prisma.Decimal("6"),
    });
    mocks.verificationUpdate.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("6"),
      approved_quantity: new Prisma.Decimal("6"),
      grouped_allocated: new Prisma.Decimal("0"),
    });

    await saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "6",
      approvedQuantity: "6",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "0" }],
    }, "user-1");

    expect(mocks.allocationDeleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        verification_id: "verification-1",
        grouped_purchase_order_id: "group-1",
      },
    });
    expect(mocks.allocationUpsert).not.toHaveBeenCalled();
  });

  it("requires a Master Group before creating a verification", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine(false));

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "5",
      approvedQuantity: "5",
      allocations: [],
    }, "user-1")).rejects.toBeInstanceOf(MasterGroupRequiredError);
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
  });

  it("subtracts allocations from other verification records before accepting a new allocation", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);
    mocks.allocationGroupBy.mockResolvedValue([{
      grouped_purchase_order_id: "group-1",
      _sum: { verification_allocated: new Prisma.Decimal("6") },
    }]);

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "10",
      approvedQuantity: "10",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "5" }],
    }, "user-1")).rejects.toThrow();
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
  });

  it("rejects Approved Qty above Verified Qty", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue(null);

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "4",
      approvedQuantity: "5",
      allocations: [],
    }, "user-1")).rejects.toThrow("Approved Qty cannot exceed Verified Qty.");
  });

  it("updates the existing verification record for the same tenant and GRN line", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("4"),
      approved_quantity: new Prisma.Decimal("4"),
    });
    mocks.verificationUpdate.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("6"),
      approved_quantity: new Prisma.Decimal("6"),
      grouped_allocated: new Prisma.Decimal("0"),
    });

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "6",
      approvedQuantity: "6",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "0" }],
    }, "user-1")).resolves.toEqual({
      created: false,
      verificationId: "verification-1",
      verifiedQuantity: "6",
      approvedQuantity: "6",
      groupedAllocated: "0",
    });
    expect(mocks.verificationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "verification-1", organization_id: "org-1" },
    }));
  });

  it("prevents changing verification after quantities are allocated to order lines", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(sourceLine());
    mocks.transactionVerificationFindFirst.mockResolvedValue({
      id: "verification-1",
      verified_quantity: new Prisma.Decimal("6"),
      approved_quantity: new Prisma.Decimal("6"),
      fresh_excess: new Prisma.Decimal("0"),
      allocations: [{ orderAllocations: [{ id: "order-allocation-1" }] }],
    });

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "6",
      approvedQuantity: "6",
      allocations: [{ groupedPurchaseOrderId: "group-1", verificationAllocated: "6" }],
    }, "user-1")).rejects.toThrow("This GRN verification cannot be changed after quantities have been allocated to an order.");
    expect(mocks.receiptLineUpdateMany).not.toHaveBeenCalled();
    expect(mocks.verificationUpdate).not.toHaveBeenCalled();
  });

  it("does not save a receipt line outside the authorized organization", async () => {
    mocks.transactionLineFindFirst.mockResolvedValue(null);

    await expect(saveRmGrnVerification("org-1", "foreign-line", {
      verifiedQuantity: "5",
      approvedQuantity: "5",
      allocations: [],
    }, "user-1")).rejects.toBeInstanceOf(RmGrnVerificationNotFoundError);
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
    expect(mocks.transactionLineFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-line", receipt: { organization_id: "org-1" } },
    }));
  });

  it("does not expose or save a linked Purchase Order from another organization", async () => {
    const foreignPurchaseOrderLine = sourceLine();
    foreignPurchaseOrderLine.purchaseOrderLine.purchaseOrder.organization_id = "org-2";
    mocks.transactionLineFindFirst.mockResolvedValue(foreignPurchaseOrderLine);

    await expect(saveRmGrnVerification("org-1", "receipt-line-1", {
      verifiedQuantity: "5",
      approvedQuantity: "5",
      allocations: [],
    }, "user-1")).rejects.toBeInstanceOf(RmGrnVerificationNotFoundError);
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });
});