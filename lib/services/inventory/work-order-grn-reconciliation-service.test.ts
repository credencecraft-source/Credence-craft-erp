import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  grnFindMany: vi.fn(),
  outwardLineFindMany: vi.fn(),
  salesLineFindMany: vi.fn(),
  issueLineFindMany: vi.fn(),
  grnLineUpdateMany: vi.fn(),
  generalReceiptUpdateMany: vi.fn(),
  allocatedReceiptUpdateMany: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import { reconcileSelectedWorkOrderGrns } from "./work-order-grn-reconciliation-service";

function grnRecord() {
  return {
    id: "grn-1",
    grn_no: "FGRN-1",
    status: "VERIFIED",
    lines: [{
      id: "line-1",
      size: "L",
      buyer_size: null,
      approved_quantity: 100,
      advance_booked_quantity: 0,
      general_inventory_quantity: 100,
      generalStockReceipt: {
        id: "general-receipt-1",
        organization_id: "org-1",
        quantity_in: 90,
        quantity_out: 10,
        current_stock: 80,
      },
      bookingAllocations: [{
        id: "allocation-1",
        organization_id: "org-1",
        allocated_quantity: 10,
        bookingAssignment: {
          bookingSizeLine: {
            booking: { booking_no: "BK-12" },
          },
        },
        finishedGoodsStockReceipt: {
          id: "allocated-receipt-1",
          organization_id: "org-1",
          grn_allocation_id: "allocation-1",
          quantity_in: 10,
          quantity_out: 0,
          current_stock: 10,
        },
      }],
    }],
  };
}

describe("reconcileSelectedWorkOrderGrns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grnFindMany.mockResolvedValue([grnRecord()]);
    mocks.outwardLineFindMany.mockResolvedValue([]);
    mocks.salesLineFindMany.mockResolvedValue([]);
    mocks.issueLineFindMany.mockResolvedValue([]);
    mocks.grnLineUpdateMany.mockResolvedValue({ count: 1 });
    mocks.generalReceiptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.allocatedReceiptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation((callback) => callback({
      workOrderInventoryGrn: { findMany: mocks.grnFindMany },
      finishedGoodsOutwardRequestLine: { findMany: mocks.outwardLineFindMany },
      posSalesInvoiceLine: { findMany: mocks.salesLineFindMany },
      fGMaterialIssueLine: { findMany: mocks.issueLineFindMany },
      workOrderInventoryGrnLine: { updateMany: mocks.grnLineUpdateMany },
      finishedGoodsGeneralStockReceipt: { updateMany: mocks.generalReceiptUpdateMany },
      finishedGoodsAllocatedStockReceipt: { updateMany: mocks.allocatedReceiptUpdateMany },
    }));
  });

  it("previews counter corrections without writing stock or allocation records", async () => {
    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], false);

    expect(result.records[0].lines[0]).toMatchObject({
      currentAllocatedQuantity: 0,
      expectedAllocatedQuantity: 10,
      currentGeneralQuantity: 100,
      expectedGeneralQuantity: 90,
      changed: true,
      blockers: [],
      stockReceipts: expect.arrayContaining([
        expect.objectContaining({
          stockType: "GENERAL",
          currentQuantityOut: 10,
          expectedQuantityOut: 10,
          currentStock: 80,
          expectedCurrentStock: 80,
          changed: false,
        }),
      ]),
    });
    expect(mocks.grnLineUpdateMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("applies a safe counter correction and records an audit event", async () => {
    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.applied).toBe(true);
    expect(mocks.grnLineUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "line-1",
        grn_id: "grn-1",
        grn: { organization_id: "org-1" },
      }),
      data: { advance_booked_quantity: 10, general_inventory_quantity: 90 },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "user-1",
      action: "RECONCILE_WORK_ORDER_GRN_STOCK_AND_ALLOCATION_TOTALS",
      entityId: "grn-1",
    }), expect.anything());
  });

  it("blocks counter changes when an allocation receipt disagrees", async () => {
    const record = grnRecord();
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.quantity_in = 9;
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.current_stock = 9;
    mocks.grnFindMany.mockResolvedValue([record]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.records[0].lines[0].blockers).toContain(
      "Booking allocation allocation-1 has an inconsistent stock receipt.",
    );
    expect(mocks.grnLineUpdateMany).not.toHaveBeenCalled();
  });

  it("reports issued and reserved stock while correcting only counters", async () => {
    const record = grnRecord();
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.quantity_out = 3;
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.current_stock = 7;
    mocks.grnFindMany.mockResolvedValue([record]);
    mocks.outwardLineFindMany.mockResolvedValue([
      {
        id: "outward-line-shipped",
        source_stock_type: "ALLOCATED",
        source_stock_id: "allocated-receipt-1",
        status: "SHIPPED",
        requested_quantity: new Prisma.Decimal(5),
        picked_quantity: new Prisma.Decimal(5),
        shipped_quantity: new Prisma.Decimal(3),
        request: { id: "request-shipped", request_no: "FG-1", status: "PARTIALLY_SHIPPED" },
      },
      {
        id: "outward-line-reserved",
        source_stock_type: "ALLOCATED",
        source_stock_id: "allocated-receipt-1",
        status: "ACCEPTED",
        requested_quantity: new Prisma.Decimal(4),
        picked_quantity: new Prisma.Decimal(0),
        shipped_quantity: new Prisma.Decimal(0),
        request: { id: "request-reserved", request_no: "FG-2", status: "ACCEPTED" },
      },
    ]);
    mocks.issueLineFindMany.mockResolvedValue([{
      id: "issue-line-shipped",
      stock_type: "ALLOCATED",
      general_receipt_id: null,
      allocated_receipt_id: "allocated-receipt-1",
      shipment_box_line_id: "box-line-1",
      pos_invoice_line_id: null,
      shipmentBoxLine: {
        requestLine: { source_stock_type: "ALLOCATED", source_stock_id: "allocated-receipt-1" },
      },
      quantity: new Prisma.Decimal(3),
      stock_before: new Prisma.Decimal(10),
      stock_after: new Prisma.Decimal(7),
      reversal_of_line_id: null,
      issue: { id: "issue-1", movement: "ISSUE", source_type: "PACKING_LIST" },
      reversalOfLine: null,
    }]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.applied).toBe(true);
    expect(result.records[0].lines[0].issuedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestId: "request-shipped",
        quantityIssued: 3,
        reservedQuantity: 2,
      }),
      expect.objectContaining({
        requestId: "request-reserved",
        quantityIssued: 0,
        reservedQuantity: 4,
      }),
    ]));
    expect(mocks.grnLineUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { advance_booked_quantity: 10, general_inventory_quantity: 90 },
    }));
  });

  it("keeps warnings attached to their own line when other lines await verification", async () => {
    const verifiedRecord = grnRecord();
    const pendingLine = {
      ...verifiedRecord.lines[0],
      id: "pending-line",
      size: "M",
      approved_quantity: null,
    };
    const cleanApprovedLine = {
      ...verifiedRecord.lines[0],
      id: "clean-line",
      size: "S",
      bookingAllocations: [],
    };
    mocks.grnFindMany.mockResolvedValue([{
      ...verifiedRecord,
      lines: [pendingLine, cleanApprovedLine],
    }]);
    mocks.outwardLineFindMany.mockResolvedValue([{
      id: "outward-line-reserved",
      source_stock_type: "ALLOCATED",
      source_stock_id: "allocated-receipt-1",
      status: "ACCEPTED",
      requested_quantity: new Prisma.Decimal(10),
      picked_quantity: new Prisma.Decimal(0),
      shipped_quantity: new Prisma.Decimal(0),
      request: { id: "request-reserved", request_no: "FG-2", status: "ACCEPTED" },
    }]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], false);

    expect(result.records[0].lines[0].issuedItems).toEqual([
      expect.objectContaining({ requestId: "request-reserved", reservedQuantity: 10 }),
    ]);
    expect(result.records[0].lines[1].issuedItems).toEqual([]);
  });

  it("resets unmatched general stock only when no source issue exists", async () => {
    const record = grnRecord();
    record.lines[0].approved_quantity = 0;
    record.lines[0].advance_booked_quantity = 0;
    record.lines[0].general_inventory_quantity = 950;
    record.lines[0].bookingAllocations = [];
    record.lines[0].generalStockReceipt = {
      id: "general-receipt-1",
      organization_id: "org-1",
      quantity_in: 950,
      quantity_out: 100,
      current_stock: 850,
    };
    mocks.grnFindMany.mockResolvedValue([record]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.records[0].lines[0]).toMatchObject({
      changed: true,
      blockers: [],
      stockReceipts: [{
        stockType: "GENERAL",
        receiptId: "general-receipt-1",
        currentQuantityOut: 100,
        expectedQuantityOut: 0,
        currentStock: 850,
        expectedCurrentStock: 950,
        changed: true,
      }],
    });
    expect(mocks.generalReceiptUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "general-receipt-1",
        organization_id: "org-1",
        quantity_in: 950,
        quantity_out: 100,
        current_stock: 850,
      },
      data: { quantity_out: 0, current_stock: 950 },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "RECONCILE_WORK_ORDER_GRN_STOCK_AND_ALLOCATION_TOTALS",
      details: expect.objectContaining({
        lines: [expect.objectContaining({
          stockReceipts: [expect.objectContaining({
            receiptId: "general-receipt-1",
            expectedQuantityOut: 0,
            expectedCurrentStock: 950,
          })],
        })],
      }),
    }), expect.anything());
  });

  it("uses net issue and reversal rows while preserving active allocations", async () => {
    const record = grnRecord();
    record.lines[0].generalStockReceipt.quantity_in = 100;
    record.lines[0].generalStockReceipt.quantity_out = 14;
    record.lines[0].generalStockReceipt.current_stock = 86;
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.quantity_out = 3;
    record.lines[0].bookingAllocations[0].finishedGoodsStockReceipt.current_stock = 7;
    mocks.grnFindMany.mockResolvedValue([record]);
    mocks.salesLineFindMany.mockResolvedValue([
      { general_stock_receipt_id: "general-receipt-1", quantity: 2 },
    ]);
    mocks.outwardLineFindMany.mockResolvedValue([{
      id: "outward-shipped",
      source_stock_type: "ALLOCATED",
      source_stock_id: "allocated-receipt-1",
      status: "SHIPPED",
      requested_quantity: new Prisma.Decimal(3),
      picked_quantity: new Prisma.Decimal(3),
      shipped_quantity: new Prisma.Decimal(3),
      request: { id: "request-1", request_no: "FG-1", status: "SHIPPED" },
    }]);
    mocks.issueLineFindMany.mockResolvedValue([
      {
        id: "general-issue-line",
        stock_type: "GENERAL",
        general_receipt_id: "general-receipt-1",
        allocated_receipt_id: null,
        shipment_box_line_id: null,
        pos_invoice_line_id: "pos-line-1",
        quantity: new Prisma.Decimal(3),
        stock_before: new Prisma.Decimal(100),
        stock_after: new Prisma.Decimal(97),
        reversal_of_line_id: null,
        issue: { id: "general-issue", movement: "ISSUE", source_type: "POS_INVOICE" },
        reversalOfLine: null,
      },
      {
        id: "general-reversal-line",
        stock_type: "GENERAL",
        general_receipt_id: "general-receipt-1",
        allocated_receipt_id: null,
        shipment_box_line_id: null,
        pos_invoice_line_id: null,
        quantity: new Prisma.Decimal(1),
        stock_before: new Prisma.Decimal(97),
        stock_after: new Prisma.Decimal(98),
        reversal_of_line_id: "general-issue-line",
        issue: { id: "general-reversal", movement: "REVERSAL", source_type: "POS_INVOICE" },
        reversalOfLine: {
          id: "general-issue-line",
          stock_type: "GENERAL",
          general_receipt_id: "general-receipt-1",
          allocated_receipt_id: null,
          quantity: new Prisma.Decimal(3),
          issue: { movement: "ISSUE", source_type: "POS_INVOICE" },
        },
      },
      {
        id: "allocated-issue-line",
        stock_type: "ALLOCATED",
        general_receipt_id: null,
        allocated_receipt_id: "allocated-receipt-1",
        shipment_box_line_id: "box-line-1",
        pos_invoice_line_id: null,
        shipmentBoxLine: {
          requestLine: { source_stock_type: "ALLOCATED", source_stock_id: "allocated-receipt-1" },
        },
        quantity: new Prisma.Decimal(4),
        stock_before: new Prisma.Decimal(10),
        stock_after: new Prisma.Decimal(6),
        reversal_of_line_id: null,
        issue: { id: "allocated-issue", movement: "ISSUE", source_type: "PACKING_LIST" },
        reversalOfLine: null,
      },
      {
        id: "allocated-reversal-line",
        stock_type: "ALLOCATED",
        general_receipt_id: null,
        allocated_receipt_id: "allocated-receipt-1",
        shipment_box_line_id: "box-line-1",
        pos_invoice_line_id: null,
        shipmentBoxLine: {
          requestLine: { source_stock_type: "ALLOCATED", source_stock_id: "allocated-receipt-1" },
        },
        quantity: new Prisma.Decimal(1),
        stock_before: new Prisma.Decimal(7),
        stock_after: new Prisma.Decimal(8),
        reversal_of_line_id: "allocated-issue-line",
        issue: { id: "allocated-reversal", movement: "REVERSAL", source_type: "PACKING_LIST" },
        reversalOfLine: {
          id: "allocated-issue-line",
          stock_type: "ALLOCATED",
          general_receipt_id: null,
          allocated_receipt_id: "allocated-receipt-1",
          quantity: new Prisma.Decimal(4),
          issue: { movement: "ISSUE", source_type: "PACKING_LIST" },
        },
      },
    ]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.records[0].lines[0].blockers).toEqual([]);
    expect(result.records[0].lines[0].stockReceipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stockType: "GENERAL",
        expectedQuantityOut: 12,
        expectedCurrentStock: 88,
      }),
      expect.objectContaining({
        stockType: "ALLOCATED",
        expectedQuantityOut: 3,
        expectedCurrentStock: 7,
      }),
    ]));
    expect(mocks.generalReceiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { quantity_out: 12, current_stock: 88 },
    }));
    expect(mocks.allocatedReceiptUpdateMany).not.toHaveBeenCalled();
  });

  it("blocks a reset when a POS source is missing matching issue-ledger rows", async () => {
    const record = grnRecord();
    record.lines[0].approved_quantity = 0;
    record.lines[0].advance_booked_quantity = 0;
    record.lines[0].general_inventory_quantity = 100;
    record.lines[0].bookingAllocations = [];
    record.lines[0].generalStockReceipt.quantity_out = 10;
    record.lines[0].generalStockReceipt.current_stock = 80;
    mocks.grnFindMany.mockResolvedValue([record]);
    mocks.salesLineFindMany.mockResolvedValue([
      { general_stock_receipt_id: "general-receipt-1", quantity: 10 },
    ]);

    const result = await reconcileSelectedWorkOrderGrns("org-1", "user-1", ["grn-1"], true);

    expect(result.records[0].lines[0].blockers).toContain(
      "GENERAL receipt general-receipt-1 has POS or shipped quantities not fully represented in the FG issue ledger.",
    );
    expect(mocks.generalReceiptUpdateMany).not.toHaveBeenCalled();
    expect(mocks.grnLineUpdateMany).not.toHaveBeenCalled();
  });
});
