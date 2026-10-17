import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    advanceBooking: { findFirst: vi.fn(), findMany: vi.fn() },
    masterArticle: { findMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn(), groupBy: vi.fn() },
  },
  transaction: {
    merchandisingOrder: { findFirst: vi.fn() },
    masterSizeGroup: { findMany: vi.fn() },
    masterSizeGroupSize: { findMany: vi.fn() },
    contact: { findFirst: vi.fn() },
    masterVendor: { findFirst: vi.fn() },
    advanceBookingSizeLine: { findMany: vi.fn(), groupBy: vi.fn() },
    advanceBooking: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    factoryWorkOrder: { findFirst: vi.fn() },
    advanceBookingWorkOrderAssignment: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
  createAuditEvent: vi.fn(),
  reserveProcurementDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveProcurementDocumentNumber,
}));

import {
  assignAdvanceBookingToWorkOrder,
  createAdvanceBooking,
  deleteAdvanceBookings,
  getAdvanceBookingById,
  listAdvanceBookings,
} from "./advance-booking-service";

describe("advance-booking persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy.mockResolvedValue([]);
    mocks.prisma.masterArticle.findMany.mockResolvedValue([]);
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
    mocks.transaction.advanceBookingSizeLine.groupBy.mockResolvedValue([]);
    mocks.transaction.advanceBookingWorkOrderAssignment.deleteMany.mockResolvedValue({ count: 1 });
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
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT" },
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
      select: expect.objectContaining({
        sizeLines: {
          select: { id: true, size: true, booked_quantity: true },
        },
      }),
    }));
    expect(booking.sizes).toEqual([expect.objectContaining({
      size: "M",
      bookedQuantity: 30,
      assignedQuantity: 0,
      unassignedQuantity: 30,
      assignments: [],
    })]);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: "Serializable",
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });

  it("saves and returns booking sizes in the selected order's Size Group order", async () => {
    mocks.transaction.merchandisingOrder.findFirst.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-1",
      brand: "Brand",
      styleName: "Style",
      deliveryDate: new Date("2026-12-01T00:00:00.000Z"),
      sizeGroup: "group-1",
      finishedGoods: ["S", "M", "L", "XL"].map((size) => ({
        size,
        buyerSize: size,
        totalQty: 40,
        beforeExcessQty: 40,
      })),
    });
    mocks.transaction.masterSizeGroup.findMany.mockResolvedValue([{
      id: "group-id",
      value_id: "group-value-id",
      size_group: "group-1",
    }]);
    mocks.transaction.masterSizeGroupSize.findMany.mockResolvedValue(
      ["S", "M", "L", "XL"].map((size) => ({
        size_group_id: "group-id",
        size: { organization_id: "internal-org-1", size },
      })),
    );
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
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT", sizeGroup: "group-1" },
      quotationLines: [],
      sizeLines: ["XL", "L", "M", "S"].map((size) => ({
        id: `booking-size-${size}`,
        size,
        booked_quantity: 1,
        assignments: [],
      })),
    });

    const booking = await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: ["XL", "L", "M", "S"].map((size) => ({ size, quantity: 1 })),
    });

    expect(mocks.transaction.masterSizeGroupSize.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", size_group_id: { in: ["group-id"] } },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }));
    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sizeLines: {
          create: ["S", "M", "L", "XL"].map((size) => ({ size, booked_quantity: 1 })),
        },
      }),
    }));
    expect(booking.sizes.map(({ size }) => size)).toEqual(["S", "M", "L", "XL"]);
  });

  it("allows a selected inactive End Customer from the same organization", async () => {
    mocks.transaction.masterVendor.findFirst.mockResolvedValue({
      id: "vendor-1",
      vendor: "Inactive Customer",
      is_active: false,
    });

    await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 30 }],
    });

    expect(mocks.transaction.masterVendor.findFirst).toHaveBeenCalledWith({
      where: { id: "vendor-1", organization_id: "internal-org-1" },
      select: { id: true, vendor: true },
    });
    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: "vendor-1", customer: "Inactive Customer" }),
    }));
  });

  it("allows an advance booking without an End Customer", async () => {
    mocks.transaction.advanceBooking.create.mockResolvedValue({
      id: "booking-record-optional",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: null,
      booking_no: "BK-OPTIONAL",
      customer: null,
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT" },
      quotationLines: [],
      sizeLines: [{ id: "booking-size-1", size: "M", booked_quantity: 30, assignments: [] }],
    });
    mocks.transaction.masterVendor.findFirst.mockResolvedValue(null);

    const booking = await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: null,
      sizes: [{ size: "M", quantity: 30 }],
    });

    expect(booking.customer).toBe("");
    expect(mocks.transaction.masterVendor.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: null, customer: null }),
    }));
  });

  it("saves an arbitrary Contact Master contact as an End Customer without requiring a Vendor record", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      legal_name: "ACME GARMENTS",
      display_name: "ACME",
    });
    mocks.transaction.masterVendor.findFirst.mockResolvedValue(null);
    mocks.transaction.advanceBooking.create.mockResolvedValueOnce({
      id: "booking-record-contact",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: null,
      booking_no: "BK-CONTACT",
      customer: "ACME",
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT" },
      sizeLines: [{ id: "booking-size-contact", size: "M", booked_quantity: 10 }],
    });

    const booking = await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: null,
      contactId: "contact-1",
      sizes: [{ size: "M", quantity: 10 }],
    });

    expect(mocks.transaction.contact.findFirst).toHaveBeenCalledWith({
      where: { id: "contact-1", organization_id: "internal-org-1" },
      select: { id: true, legal_name: true, display_name: true },
    });
    expect(mocks.transaction.masterVendor.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", contact_id: "contact-1" },
      select: { id: true, vendor: true },
    });
    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: null, customer: "ACME" }),
    }));
    expect(booking.customer).toBe("ACME");
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
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT" },
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

  it("automatically accepts and audits booking quantities above the remaining order balance", async () => {
    mocks.transaction.advanceBooking.create.mockResolvedValueOnce({
      id: "booking-record-overbook",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: "vendor-1",
      booking_no: "BK-OVERBOOK",
      customer: "Customer",
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      sizeLines: [{ id: "booking-size-overbook", size: "M", booked_quantity: 41 }],
    });
    await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 41 }],
    });

    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sizeLines: { create: [{ size: "M", booked_quantity: 41 }] },
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        total_quantity: 41,
        total_order_quantity_increase: 1,
        order_quantity_increases: [{ size: "M", quantity: 1 }],
      }),
    }), mocks.transaction);
  });

  it("calculates and audits the excess booked quantity automatically", async () => {
    mocks.transaction.advanceBooking.create.mockResolvedValueOnce({
      id: "booking-record-1",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: null,
      booking_no: "BK-1",
      customer: null,
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      sizeLines: [{ id: "booking-size-1", size: "M", booked_quantity: 45 }],
    });

    await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: null,
      sizes: [{ size: "M", quantity: 45 }],
    });

    expect(mocks.transaction.advanceBooking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sizeLines: { create: [{ size: "M", booked_quantity: 45 }] },
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        total_quantity: 45,
        total_order_quantity_increase: 5,
        order_quantity_increases: [{ size: "M", quantity: 5 }],
      }),
    }), mocks.transaction);
  });

  it("aggregates prior booked quantities by size in the authorized organization and order", async () => {
    mocks.transaction.advanceBookingSizeLine.groupBy.mockResolvedValue([{
      size: "M",
      _sum: { booked_quantity: 35 },
    }]);
    mocks.transaction.advanceBooking.create.mockResolvedValueOnce({
      id: "booking-record-1",
      organization_id: "internal-org-1",
      order_id: "order-1",
      vendor_id: null,
      booking_no: "BK-1",
      customer: null,
      brand: "Brand",
      style_name: "Style",
      delivery_date: new Date("2026-12-01T00:00:00.000Z"),
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1" },
      sizeLines: [{ id: "booking-size-1", size: "M", booked_quantity: 10 }],
    });

    await createAdvanceBooking("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: null,
      sizes: [{ size: "M", quantity: 10 }],
    });

    expect(mocks.transaction.advanceBookingSizeLine.groupBy).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", booking: { order_id: "order-1" } },
      by: ["size"],
      _sum: { booked_quantity: true },
    });
    expect(mocks.transaction.advanceBookingSizeLine.findMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        total_order_quantity_increase: 5,
        order_quantity_increases: [{ size: "M", quantity: 5 }],
      }),
    }), mocks.transaction);
  });

  it("deletes an unquoted, unassigned booking with an audit event", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      booking_no: "BK-1",
      sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [{
        id: "assignment-1",
        grnAllocations: [],
        finishedGoodsStockReceipts: [],
      }] }],
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
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["assignment-1"] },
        booking_size_line_id: { in: ["size-1"] },
      },
    });
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.transaction.advanceBooking.deleteMany.mock.invocationCallOrder[0]);
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELETE_ADVANCE_BOOKING",
      entityId: "booking-record-1",
      details: expect.objectContaining({ unassigned_work_order_count: 1 }),
    }), mocks.transaction);
  });

  it("blocks booking deletion while a quotation references it", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-record-1",
      booking_no: "BK-1",
      sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [] }],
      quotationLines: [{
        quotation: {
          quotation_no: "QT-1",
          customer: "Quotation Vendor",
          vendor: { vendor: "Quotation Vendor" },
          parentQuotation: {
            quotation_no: "SO-1",
            customer: "Master Quotation Vendor",
            vendor: { vendor: "Master Quotation Vendor" },
          },
        },
      }],
    }]);
    await expect(deleteAdvanceBookings("internal-org-1", "user-1", ["booking-record-1"]))
      .rejects.toThrow("Delete quotation QT-1 before deleting booking BK-1");

    expect(mocks.transaction.advanceBooking.deleteMany).not.toHaveBeenCalled();
  });

  it.each(["grnAllocations", "finishedGoodsStockReceipts"] as const)(
    "does not delete a booking with %s fulfillment",
    async (fulfillmentRelation) => {
      const assignment: {
        id: string;
        grnAllocations: Array<{ id: string }>;
        finishedGoodsStockReceipts: Array<{ id: string }>;
      } = {
        id: "assignment-1",
        grnAllocations: [],
        finishedGoodsStockReceipts: [],
      };
      assignment[fulfillmentRelation] = [{ id: "fulfillment-id" }];
      mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
        id: "booking-record-1",
        booking_no: "BK-1",
        sizeLines: [{ id: "size-1", size: "M", booked_quantity: 30, assignments: [assignment] }],
        quotationLines: [],
      }]);

      await expect(deleteAdvanceBookings("internal-org-1", "user-1", ["booking-record-1"]))
        .rejects.toThrow("has fulfilled work-order assignments");
      expect(mocks.transaction.advanceBookingWorkOrderAssignment.deleteMany).not.toHaveBeenCalled();
      expect(mocks.transaction.advanceBooking.deleteMany).not.toHaveBeenCalled();
    },
  );

  it("identifies quotations on saved bookings so registers can hide them and fulfillment can retain them", async () => {
    const bookingRow = {
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
          vendor: { vendor: "Quotation Vendor" },
          parentQuotation: {
            quotation_no: "SO-1",
            customer: "Master Quotation Vendor",
            vendor: { vendor: "Master Quotation Vendor" },
          },
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
    };
    mocks.prisma.advanceBooking.findMany.mockResolvedValue([
      bookingRow,
      { ...bookingRow, id: "booking-record-2", booking_no: "BK-2" },
    ]);
    mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy.mockResolvedValue([{
      order_id: "order-1",
      size: "m",
      _sum: { current_stock: 4 },
    }]);

    const result = await listAdvanceBookings("internal-org-1", { limit: 1 });

    expect(result.bookings[0]).toMatchObject({
      bookingId: "BK-1",
      quotationNo: "QT-1",
      orderSourceStatus: "DIRECT",
      customer: "Customer",
      quotationVendor: "Quotation Vendor",
      masterQuotationVendor: "Master Quotation Vendor",
      salesOrderNo: "SO-1",
      totalBooked: 30,
      totalAssigned: 30,
      totalAllocated: 30,
      sizes: [{ assignedQuantity: 30, generalInventoryAvailableQuantity: 4 }],
    });
    expect(result.bookings).toHaveLength(1);
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        order_id: { in: ["order-1"] },
        current_stock: { gt: 0 },
      },
      by: ["order_id", "size"],
      _sum: { current_stock: true },
    });
    expect(result.nextCursor).toBeTruthy();
    expect(mocks.prisma.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 2,
      include: expect.objectContaining({
        quotationLines: expect.objectContaining({
          select: {
            quotation: {
              select: {
                quotation_no: true,
                customer: true,
                vendor: { select: { vendor: true } },
                parentQuotation: {
                  select: {
                    quotation_no: true,
                    customer: true,
                    vendor: { select: { vendor: true } },
                  },
                },
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

  it("filters quoted bookings in the order register query before pagination", async () => {
    mocks.prisma.advanceBooking.findMany.mockResolvedValue([{
      id: "unquoted-booking-record",
      order_id: "order-1",
      booking_no: "BK-UNQUOTED",
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      order: { orderNo: "ORD-1", sourceStatus: "DIRECT", article: null, sizeGroup: null },
      quotationLines: [],
      sizeLines: [],
    }]);

    const result = await listAdvanceBookings("internal-org-1", { limit: 1, view: "booking" });

    expect(result.bookings.map((booking) => booking.bookingId)).toEqual(["BK-UNQUOTED"]);
    expect(mocks.prisma.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        quotationLines: { none: {} },
      },
      take: 2,
    }));
    expect(mocks.prisma.finishedGoodsGeneralStockReceipt.groupBy).not.toHaveBeenCalled();
  });

  it("rejects malformed booking cursors instead of silently restarting the list", async () => {
    await expect(listAdvanceBookings("internal-org-1", { cursor: "invalid" }))
      .rejects.toThrow("booking page cursor is invalid");
    expect(mocks.prisma.advanceBooking.findMany).not.toHaveBeenCalled();
  });

  it("checks existing work-order assignments with one tenant-scoped lookup for all sizes", async () => {
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue({
      id: "booking-record-1",
      booking_no: "BK-1",
      order_id: "order-1",
      quotationLines: [{ quotation: { parentQuotation: { quotation_no: "SO-1" } } }],
      sizeLines: [
        { id: "booking-size-m", size: "M", booked_quantity: 10, assignments: [] },
        { id: "booking-size-s", size: "S", booked_quantity: 12, assignments: [] },
      ],
    });
    mocks.transaction.factoryWorkOrder.findFirst.mockResolvedValue({
      id: "work-order-1",
      work_order_no: "WO-1",
      sizeLines: [
        { id: "work-order-size-m", size: "M", buyer_size: null, quantity: 20, bookingAssignments: [{ assigned_quantity: 2 }] },
        { id: "work-order-size-s", size: "S", buyer_size: null, quantity: 20, bookingAssignments: [] },
      ],
    });
    mocks.transaction.advanceBookingWorkOrderAssignment.findMany.mockResolvedValue([{
      booking_size_line_id: "booking-size-m",
      work_order_size_line_id: "work-order-size-m",
      assigned_quantity: 1,
    }]);

    await assignAdvanceBookingToWorkOrder("internal-org-1", "user-1", "booking-record-1", {
      workOrderId: "work-order-1",
      lines: [
        { bookingSizeLineId: "booking-size-m", assignedQuantity: 2 },
        { bookingSizeLineId: "booking-size-s", assignedQuantity: 3 },
      ],
    });

    expect(mocks.transaction.advanceBooking.findFirst).toHaveBeenCalledWith({
      where: { id: "booking-record-1", organization_id: "internal-org-1" },
      include: {
        quotationLines: {
          select: {
            quotation: {
              select: { parentQuotation: { select: { quotation_no: true } } },
            },
          },
          take: 1,
        },
        sizeLines: { include: { assignments: { select: { assigned_quantity: true } } } },
      },
    });
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        OR: [
          { booking_size_line_id: "booking-size-m", work_order_size_line_id: "work-order-size-m" },
          { booking_size_line_id: "booking-size-s", work_order_size_line_id: "work-order-size-s" },
        ],
      },
      select: {
        booking_size_line_id: true,
        work_order_size_line_id: true,
        assigned_quantity: true,
      },
    });
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { assigned_quantity: { increment: 2 } },
    }));
    expect(mocks.transaction.advanceBookingWorkOrderAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        booking_size_line_id: "booking-size-s",
        work_order_size_line_id: "work-order-size-s",
        assigned_quantity: 3,
      }),
    }));
  });

  it("rejects work-order assignment until the booking belongs to a sales order", async () => {
    mocks.transaction.advanceBooking.findFirst.mockResolvedValue({
      id: "booking-record-1",
      booking_no: "BK-1",
      order_id: "order-1",
      quotationLines: [{ quotation: { parentQuotation: null } }],
      sizeLines: [],
    });

    await expect(assignAdvanceBookingToWorkOrder("internal-org-1", "user-1", "booking-record-1", {
      workOrderId: "work-order-1",
      lines: [{ bookingSizeLineId: "booking-size-m", assignedQuantity: 1 }],
    })).rejects.toThrow("Create a Sales Order before assigning this advance booking to a work order.");
    expect(mocks.transaction.factoryWorkOrder.findFirst).not.toHaveBeenCalled();
  });
});

it("recognizes legacy Article-based orders only when their organization Article exists", async () => {
  const bookingRow = {
    id: "booking-record-legacy-article",
    organization_id: "internal-org-1",
    order_id: "order-article",
    vendor_id: null,
    booking_no: "BK-ARTICLE",
    customer: null,
    brand: "Brand",
    style_name: "Oxford Shirt",
    delivery_date: null,
    created_at: new Date("2026-10-07T00:00:00.000Z"),
    order: { orderNo: "ORD-ARTICLE", sourceStatus: "DIRECT", article: "Oxford Shirt" },
    quotationLines: [],
    sizeLines: [{
      id: "size-article",
      size: "M",
      booked_quantity: 10,
      assignments: [],
    }],
  };
  mocks.prisma.advanceBooking.findMany.mockResolvedValue([bookingRow]);
  mocks.prisma.masterArticle.findMany.mockResolvedValue([{ article: "Oxford Shirt" }]);

  const result = await listAdvanceBookings("internal-org-1");

  expect(result.bookings[0]).toMatchObject({
    bookingId: "BK-ARTICLE",
    orderSourceStatus: "ARTICLE_BASED",
  });
  expect(mocks.prisma.masterArticle.findMany).toHaveBeenCalledWith({
    where: { organization_id: "internal-org-1", article: { in: ["Oxford Shirt"] } },
    select: { article: true },
  });
});
