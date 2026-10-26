import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  grnFindMany: vi.fn(),
  outwardLineFindMany: vi.fn(),
  grnLineUpdateMany: vi.fn(),
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
    mocks.grnLineUpdateMany.mockResolvedValue({ count: 1 });
    mocks.createAuditEvent.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation((callback) => callback({
      workOrderInventoryGrn: { findMany: mocks.grnFindMany },
      finishedGoodsOutwardRequestLine: { findMany: mocks.outwardLineFindMany },
      workOrderInventoryGrnLine: { updateMany: mocks.grnLineUpdateMany },
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
      action: "RECONCILE_WORK_ORDER_GRN_ALLOCATION_TOTALS",
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
        source_stock_id: "allocated-receipt-1",
        status: "SHIPPED",
        requested_quantity: new Prisma.Decimal(5),
        picked_quantity: new Prisma.Decimal(5),
        shipped_quantity: new Prisma.Decimal(3),
        request: { id: "request-shipped", request_no: "FG-1", status: "PARTIALLY_SHIPPED" },
      },
      {
        id: "outward-line-reserved",
        source_stock_id: "allocated-receipt-1",
        status: "ACCEPTED",
        requested_quantity: new Prisma.Decimal(4),
        picked_quantity: new Prisma.Decimal(0),
        shipped_quantity: new Prisma.Decimal(0),
        request: { id: "request-reserved", request_no: "FG-2", status: "ACCEPTED" },
      },
    ]);

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
});
