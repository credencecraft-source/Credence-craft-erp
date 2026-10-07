import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn(), advanceBooking: { findFirst: vi.fn(), findMany: vi.fn() } },
  transaction: {
    merchandisingOrder: { findFirst: vi.fn() },
    masterVendor: { findFirst: vi.fn() },
    advanceBookingSizeLine: { findMany: vi.fn() },
    advanceBooking: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
  reserveProcurementDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveProcurementDocumentNumber,
}));

import { createAdvanceBooking, deleteAdvanceBookings, getAdvanceBookingById, listAdvanceBookings } from "./advance-booking-service";

describe("advance-booking persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction));
    mocks.transaction.merchandisingOrder.findFirst.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      brand: "Brand",
      styleName: "Style",
      deliveryDate: new Date("2026-12-01T00:00:00.000Z"),
      finishedGoods: [{ size: "M", buyerSize: "M", totalQty: 40, beforeExcessQty: 40 }],
    });
    mocks.transaction.masterVendor.findFirst.mockResolvedValue({ id: "vendor-1", vendor: "Customer" });
    mocks.transaction.advanceBookingSizeLine.findMany.mockResolvedValue([]);
    mocks.reserveProcurementDocumentNumber.mockResolvedValue("BK-1");
    mocks.transaction.advanceBooking.create.mockResolvedValue({
      id: "booking-record-1",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: "vendor-1",
      booking_no: "BK-1",
      customer: "Customer",
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      quotationLines: [],
      sizeLines: [{
        id: "booking-size-1",
        size: "M",
        booked_quantity: 30,
        assignments: [],
      }],
    });
    mocks.transaction.advanceBooking.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("writes the booking and size quantities in one serializable database transaction", async () => {
    const booking = await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 30 }],
    });

    expect(booking.bookingId).toBe("BK-1");
    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        order_id: "order-1",
        vendor_id: "vendor-1",
        created_by: "user-1",
        sizeLines: { create: [{ size: "M", booked_quantity: 30 }] },
      }),
    }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: "Serializable",
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });

  it("loads shipment details by organization-scoped internal booking ID", async () => {
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue({
      id: "booking-record-1",
      booking_no: "BK-1",
      order_id: "order-1",
      vendor_id: "vendor-1",
      customer: "Customer",
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      quotationLines: [],
      sizeLines: [],
    });

    const result = await getAdvanceBookingById("internal-org-1", "booking-record-1");

    expect(mocks.prisma.advanceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "booking-record-1", organization_id: "internal-org-1" },
    }));
    expect(result.booking).toMatchObject({
      id: "booking-record-1",
      bookingId: "BK-1",
      orderNo: "ORD-1",
    });
  });

  it("does not return a booking outside the organization scope", async () => {
    mocks.prisma.advanceBooking.findFirst.mockResolvedValue(null);

    await expect(getAdvanceBookingById("internal-org-1", "other-org-booking"))
      .rejects.toThrow("Advance booking was not found in this organization.");
  });

  it("rejects quantities beyond the order balance without inserting a booking", async () => {
    await expect(createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 41 }],
    })).rejects.toThrow("exceeds the remaining order balance of 40");

    expect(mocks.transaction.advanceBooking.create).not.toHaveBeenCalled();
  });

  it("deletes an unquoted, unassigned booking with an audit event", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      booking_no: "BK-1",
      sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [] }],
      quotationLines: [],
    }]);

    const result = await deleteAdvanceBookings("internal-org-1", "user-1", ["booking-record-1"]);

    expect(result).toEqual({ deletedBookingNos: ["BK-1"] });
    expect(mocks.transaction.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: { in: ["booking-record-1"] } },
    }));
    expect(mocks.transaction.advanceBooking.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["booking-record-1"] } },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELETE_ADVANCE_BOOKING",
      entityId: "booking-record-1",
    }), mocks.transaction);
  });

  it("blocks booking deletion while a quotation or work-order assignment references it", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      booking_no: "BK-1",
      sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [] }],
      quotationLines: [{
        quotation: {
          quotation_no: "QT-1",
          customer: "Quotation Vendor",
          parentQuotation: { customer: "Master Quotation Vendor" },
        },
      }],
    }]);
    await expect(deleteAdvanceBookings("internal-org-1", "user-1", ["booking-record-1"]))
      .rejects.toThrow("Delete quotation QT-1 before deleting booking BK-1");

    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      booking_no: "BK-1",
      sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [{ id: "assignment-1" }] }],
      quotationLines: [],
    }]);
    await expect(deleteAdvanceBookings("internal-org-1", "user-1", ["booking-record-1"]))
      .rejects.toThrow("has work-order assignments");
    expect(mocks.transaction.advanceBooking.deleteMany).not.toHaveBeenCalled();
  });

  it("identifies quotations on saved bookings so registers can hide them and fulfillment can retain them", async () => {
    mocks.prisma.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: "vendor-1",
      booking_no: "BK-1",
      customer: "Customer",
      brand: "Brand",
      style_name: "Style",
      delivery_date: null,
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      quotationLines: [{
        quotation: {
          quotation_no: "QT-1",
          customer: "Quotation Vendor",
          parentQuotation: { customer: "Master Quotation Vendor" },
        },
      }],
      sizeLines: [{
        id: "size-1",
        size: "M",
        booked_quantity: 30,
        assignments: [{
          assigned_quantity: 30,
          work_order_size_line_id: "work-order-size-1",
          workOrderSizeLine: {
            workOrder: { id: "work-order-1", work_order_no: "WO-1" },
          },
          grnAllocations: [],
        }],
      }],
    }]);

    const result = await listAdvanceBookings("internal-org-1");

    expect(result.bookings[0]).toMatchObject({
      bookingId: "BK-1",
      quotationNo: "QT-1",
      customer: "Customer",
      quotationVendor: "Quotation Vendor",
      masterQuotationVendor: "Master Quotation Vendor",
      totalBooked: 30,
      totalAssigned: 30,
      totalAllocated: 30,
      sizes: [{ assignedQuantity: 30 }],
    });
    expect(mocks.prisma.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
      include: expect.objectContaining({
        quotationLines: expect.objectContaining({
          select: {
            quotation: {
              select: {
                quotation_no: true,
                customer: true,
                parentQuotation: { select: { customer: true } },
              },
            },
          },
          take: 1,
        }),
        sizeLines: expect.objectContaining({
          include: expect.objectContaining({
            assignments: expect.objectContaining({
              include: expect.objectContaining({
                grnAllocations: { select: { allocated_quantity: true } },
                workOrderSizeLine: expect.any(Object),
              }),
            }),
          }),
        }),
      }),
    }));
  });
});
