import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    merchandisingOrder: { findFirst: vi.fn() },
    masterVendor: { findFirst: vi.fn() },
    advanceBookingSizeLine: { findMany: vi.fn() },
    advanceBooking: { create: vi.fn() },
  },
  createAuditEvent: vi.fn(),
  reserveProcurementDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveProcurementDocumentNumber,
}));

import { createAdvanceBooking } from "./advance-booking-service";

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
      sizeLines: [{
        id: "booking-size-1",
        size: "M",
        booked_quantity: 30,
        assignments: [],
      }],
    });
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

  it("rejects quantities beyond the order balance without inserting a booking", async () => {
    await expect(createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 41 }],
    })).rejects.toThrow("exceeds the remaining order balance of 40");

    expect(mocks.transaction.advanceBooking.create).not.toHaveBeenCalled();
  });
});
