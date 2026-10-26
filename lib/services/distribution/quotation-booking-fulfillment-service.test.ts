import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    distributionQuotation: { findFirst: vi.fn() },
    distributionQuotationLine: { findMany: vi.fn(), findFirst: vi.fn() },
    advanceBooking: { findMany: vi.fn(), findFirst: vi.fn() },
    finishedGoodsOutwardRequestLine: { findMany: vi.fn(), updateMany: vi.fn() },
    finishedGoodsStock: { updateMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { create: vi.fn(), updateMany: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { deleteMany: vi.fn() },
    finishedGoodsOutwardRequest: { updateMany: vi.fn() },
    workOrderInventoryGrnLine: { updateMany: vi.fn() },
    workOrderInventoryGrnBookingAllocation: { deleteMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  listQuotationBookingFulfillment,
  reverseAdvanceBookingFulfillment,
  reverseQuotationBookingFulfillment,
} from "./quotation-booking-fulfillment-service";

const quote = {
  id: "quotation-1",
  quotation_no: "QT-1",
  mode: "SINGLE",
  status: "DRAFT",
  childQuotations: [],
};

const bookingWithFulfillment = () => ({
  id: "booking-1",
  booking_no: "BK-1",
  sizeLines: [{
    id: "booking-size-1",
    assignments: [{
      id: "assignment-1",
      grnAllocations: [{
        id: "allocation-1",
        grn_line_id: "grn-line-1",
        allocated_quantity: 5,
        grnLine: {
          id: "grn-line-1",
          advance_booked_quantity: 5,
          approved_quantity: 5,
          general_inventory_quantity: 0,
          grn: { grn_no: "WGRN-1" },
          bookingAllocations: [{ organization_id: "internal-org-1", allocated_quantity: 5 }],
          generalStockReceipt: null as {
            id: string;
            organization_id: string;
            quantity_in: number;
            quantity_out: number;
            current_stock: number;
          } | null,
        },
        finishedGoodsStockReceipt: {
          id: "receipt-1",
          organization_id: "internal-org-1",
          entity_id: "entity-1",
          location_id: "location-1",
          grn_id: "grn-1",
          grn_line_id: "grn-line-1",
          work_order_id: "work-order-1",
          order_id: "order-1",
          grn_no: "WGRN-1",
          grn_date: new Date("2026-10-01T00:00:00.000Z"),
          work_order_no: "WO-1",
          order_no: "ORD-1",
          article_no: "ART-1",
          style_name: "Style",
          brand: "Brand",
          buyer: "Buyer",
          product_category: "Category",
          colour: "Navy",
          size: "M",
          buyer_size: "M",
          received_quantity: 5,
          actual_received_quantity: 5,
          approved_quantity: 5,
          rejected_quantity: 0,
          quantity_in: 5,
          current_stock: 5,
          quantity_out: 0,
          created_by: "submitter@example.test",
          verified_by: "verifier@example.test",
          posted_at: new Date("2026-10-02T00:00:00.000Z"),
          created_at: new Date("2026-10-02T00:00:00.000Z"),
        },
      }],
      finishedGoodsStockReceipts: [{ id: "receipt-1" }],
    }],
  }],
});

describe("quotation-linked booking fulfillment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValue(quote);
    mocks.prisma.distributionQuotationLine.findMany.mockResolvedValue([{ source_booking_id: "booking-1" }]);
    mocks.prisma.distributionQuotationLine.findFirst.mockResolvedValue({
      quotation: { id: "quotation-1", parentQuotation: null },
    });
    mocks.prisma.advanceBooking.findMany.mockResolvedValue([bookingWithFulfillment()]);
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(bookingWithFulfillment());
    mocks.prisma.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.finishedGoodsGeneralStockReceipt.create.mockResolvedValue({ id: "general-receipt-1" });
    mocks.prisma.finishedGoodsGeneralStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.finishedGoodsOutwardRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.workOrderInventoryGrnLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.workOrderInventoryGrnBookingAllocation.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("lists only fulfilled bookings linked to this organization's quotation or its sales order", async () => {
    const result = await listQuotationBookingFulfillment("internal-org-1", "quotation-1");

    expect(mocks.prisma.distributionQuotation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "quotation-1", organization_id: "internal-org-1" },
    }));
    expect(mocks.prisma.distributionQuotationLine.findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", quotation_id: { in: ["quotation-1"] } },
      select: { source_booking_id: true },
    });
    expect(result.bookings).toEqual([{
      id: "booking-1",
      bookingNo: "BK-1",
      fulfilledQuantity: 5,
      grnNumbers: ["WGRN-1"],
      hasFulfillment: true,
    }]);
  });

  it("includes child quotation bookings when loading a sales-order fulfillment preview", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValue({
      ...quote,
      mode: "MASTER",
      childQuotations: [{ id: "child-quotation-1" }],
    });
    mocks.prisma.distributionQuotationLine.findMany.mockResolvedValue([
      { source_booking_id: "booking-1" },
      { source_booking_id: "booking-2" },
    ]);
    mocks.prisma.advanceBooking.findMany.mockResolvedValue([
      bookingWithFulfillment(),
      { ...bookingWithFulfillment(), id: "booking-2", booking_no: "BK-2" },
    ]);

    const result = await listQuotationBookingFulfillment("internal-org-1", "quotation-1");

    expect(mocks.prisma.distributionQuotationLine.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        quotation_id: { in: ["quotation-1", "child-quotation-1"] },
      },
      select: { source_booking_id: true },
    });
    expect(result.bookings.map((booking) => booking.bookingNo)).toEqual(["BK-1", "BK-2"]);
  });

  it("moves unused allocated stock back to general stock and writes an audit event", async () => {
    const result = await reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    );

    expect(result).toEqual({
      bookingId: "booking-1",
      bookingNo: "BK-1",
      reversedQuantity: 5,
      grnNumbers: ["WGRN-1"],
      cancelledRequestLineCount: 0,
      fullyCancelledRequestCount: 0,
    });
    expect(mocks.prisma.finishedGoodsStock.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        entity_id: "entity-1",
        location_id: "location-1",
        style_name: "Style",
        size: "M",
        quantity_reserved: { gte: 5 },
      },
      data: {
        quantity_reserved: { decrement: 5 },
      },
    });
    expect(mocks.prisma.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith({
      where: {
        id: "grn-line-1",
        grn: { organization_id: "internal-org-1" },
        advance_booked_quantity: 5,
        general_inventory_quantity: 0,
      },
      data: { advance_booked_quantity: 0, general_inventory_quantity: 5 },
    });
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        grn_line_id: "grn-line-1",
        order_id: "order-1",
        quantity_in: 5,
        current_stock: 5,
      }),
    });
    expect(mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["receipt-1"] }, booking_id: "booking-1" },
    });
    expect(mocks.prisma.workOrderInventoryGrnBookingAllocation.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["allocation-1"] } },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      userId: "user-1",
      action: "REVERSE_WORK_ORDER_GRN_BOOKING_FULFILLMENT",
      entityId: "booking-1",
      details: expect.objectContaining({
        quotation_id: "quotation-1",
        booking_no: "BK-1",
        grn_numbers: ["WGRN-1"],
        reversed_quantity: 5,
        transferred_to_general_quantity: 5,
      }),
    }), mocks.prisma);
  });

  it("repairs a stale GRN allocation counter from allocation records during reversal", async () => {
    const booking = bookingWithFulfillment();
    booking.sizeLines[0].assignments[0].grnAllocations[0].grnLine.advance_booked_quantity = 1;
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(booking);

    await reverseQuotationBookingFulfillment("internal-org-1", "user-1", "quotation-1", "booking-1");

    expect(mocks.prisma.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ advance_booked_quantity: 1 }),
      data: { advance_booked_quantity: 0, general_inventory_quantity: 5 },
    }));
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.create).toHaveBeenCalledOnce();
  });

  it("adds the reversed quantity to an existing general-stock receipt without erasing its issued history", async () => {
    const booking = bookingWithFulfillment();
    booking.sizeLines[0].assignments[0].grnAllocations[0].grnLine.approved_quantity = 7;
    booking.sizeLines[0].assignments[0].grnAllocations[0].grnLine.general_inventory_quantity = 2;
    booking.sizeLines[0].assignments[0].grnAllocations[0].grnLine.generalStockReceipt = {
      id: "general-receipt-1",
      organization_id: "internal-org-1",
      quantity_in: 3,
      quantity_out: 1,
      current_stock: 2,
    };
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(booking);

    await reverseQuotationBookingFulfillment("internal-org-1", "user-1", "quotation-1", "booking-1");

    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "general-receipt-1",
        organization_id: "internal-org-1",
        quantity_in: 3,
        current_stock: 2,
      },
      data: {
        quantity_in: { increment: 5 },
        current_stock: { increment: 5 },
      },
    });
    expect(mocks.prisma.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { advance_booked_quantity: 0, general_inventory_quantity: 7 },
    }));
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.create).not.toHaveBeenCalled();
  });

  it("reverses unused stock when stale GRN counters exceed approved quantity", async () => {
    const booking = bookingWithFulfillment();
    const grnLine = booking.sizeLines[0].assignments[0].grnAllocations[0].grnLine;
    grnLine.approved_quantity = 100;
    grnLine.advance_booked_quantity = 0;
    grnLine.general_inventory_quantity = 100;
    grnLine.generalStockReceipt = {
      id: "general-receipt-1",
      organization_id: "internal-org-1",
      quantity_in: 95,
      quantity_out: 0,
      current_stock: 95,
    };
    const allocatedReceipt = booking.sizeLines[0].assignments[0].grnAllocations[0].finishedGoodsStockReceipt!;
    allocatedReceipt.quantity_in = 4;
    allocatedReceipt.current_stock = 4;
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(booking);

    const result = await reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    );

    expect(result.reversedQuantity).toBe(5);
    expect(mocks.prisma.workOrderInventoryGrnLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { advance_booked_quantity: 0, general_inventory_quantity: 100 },
    }));
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { quantity_in: { increment: 5 }, current_stock: { increment: 5 } },
    }));
    expect(mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.prisma.finishedGoodsStock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { quantity_reserved: { decrement: 5 } },
    }));
  });

  it("finds the booking's draft sales order before using the same safe reversal flow", async () => {
    const result = await reverseAdvanceBookingFulfillment("internal-org-1", "user-1", "booking-1");

    expect(mocks.prisma.distributionQuotationLine.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", source_booking_id: "booking-1" },
      select: { quotation: { select: { id: true, parentQuotation: { select: { id: true } } } } },
    });
    expect(result.bookingNo).toBe("BK-1");
  });

  it("blocks reversal when allocated inventory has been issued", async () => {
    const booking = bookingWithFulfillment();
    booking.sizeLines[0].assignments[0].grnAllocations[0].finishedGoodsStockReceipt!.quantity_out = 1;
    booking.sizeLines[0].assignments[0].grnAllocations[0].finishedGoodsStockReceipt!.current_stock = 4;
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(booking);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("1 PCS issued");

    expect(mocks.prisma.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks reversal when the allocated receipt belongs to another organization", async () => {
    const booking = bookingWithFulfillment();
    booking.sizeLines[0].assignments[0].grnAllocations[0].finishedGoodsStockReceipt!.organization_id = "foreign-org";
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(booking);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("not available in this organization");

    expect(mocks.prisma.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks reversal when allocated stock has an unpicked active request", async () => {
    mocks.prisma.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      id: "request-line-1",
      request_id: "request-1",
      source_stock_id: "receipt-1",
      requested_quantity: new Prisma.Decimal(5),
      shipped_quantity: new Prisma.Decimal(0),
      request: {
        id: "request-1",
        request_no: "FGR-1",
        status: "ACCEPTED",
      },
    }]);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("FGR-1 (ACCEPTED, 5 PCS requested, 0 PCS issued)");

    expect(mocks.prisma.finishedGoodsOutwardRequestLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsOutwardRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsAllocatedStockReceipt.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks requests even when the request also contains unrelated stock", async () => {
    mocks.prisma.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      id: "request-line-1",
      request_id: "request-1",
      source_stock_id: "receipt-1",
      requested_quantity: new Prisma.Decimal(5),
      shipped_quantity: new Prisma.Decimal(0),
      request: {
        id: "request-1",
        request_no: "FGR-1",
        status: "ACCEPTED",
      },
    }]);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("Cannot delete this sales order");

    expect(mocks.prisma.finishedGoodsOutwardRequestLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsOutwardRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
  });

  it("blocks reversal when an active request has picked stock", async () => {
    mocks.prisma.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      id: "request-line-1",
      request_id: "request-1",
      source_stock_id: "receipt-1",
      requested_quantity: new Prisma.Decimal(5),
      shipped_quantity: new Prisma.Decimal(0),
      request: {
        id: "request-1",
        request_no: "FGR-1",
        status: "PICKED",
      },
    }]);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("Cannot delete this sales order");

    expect(mocks.prisma.finishedGoodsOutwardRequestLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsStock.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a booking not linked to the selected quotation", async () => {
    mocks.prisma.distributionQuotationLine.findMany.mockResolvedValue([]);

    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-foreign",
    )).rejects.toThrow("not linked to this quotation or sales order");

    expect(mocks.prisma.advanceBooking.findFirst).not.toHaveBeenCalled();
  });

  it("requires a draft quotation before listing or reversing fulfillment", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValue({ ...quote, status: "ISSUED" });

    await expect(listQuotationBookingFulfillment("internal-org-1", "quotation-1"))
      .rejects.toThrow("Only draft quotations");
    await expect(reverseQuotationBookingFulfillment(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    )).rejects.toThrow("Only draft quotations");
  });
});
