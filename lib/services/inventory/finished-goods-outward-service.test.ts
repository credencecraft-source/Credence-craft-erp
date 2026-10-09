import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveNumber: vi.fn(),
  createAuditEvent: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  tx: {
    finishedGoodsSkuStock: { findFirst: vi.fn(), updateMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findFirst: vi.fn(), updateMany: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    advanceBooking: { findMany: vi.fn() },
    finishedGoodsOutwardRequest: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    finishedGoodsOutwardRequestLine: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
    finishedGoodsOutwardBox: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    finishedGoodsOutwardBoxLine: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn() },
    finishedGoodsOutwardShipment: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    finishedGoodsOutwardShipmentBox: { createMany: vi.fn(), deleteMany: vi.fn() },
    auditEvent: { findFirst: vi.fn() },
  },
  prisma: {
    $transaction: vi.fn(),
    finishedGoodsSkuStock: { findMany: vi.fn() },
    finishedGoodsGeneralStockReceipt: { findMany: vi.fn() },
    finishedGoodsAllocatedStockReceipt: { findMany: vi.fn() },
    finishedGoodsOutwardRequest: { findMany: vi.fn() },
    finishedGoodsOutwardBox: { findMany: vi.fn() },
    finishedGoodsOutwardShipment: { findMany: vi.fn() },
    finishedGoodsOutwardRequestLine: { findMany: vi.fn() },
    auditEvent: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({ createAuditEvent: mocks.createAuditEvent }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));
vi.mock("@/lib/services/orders/procurement-document-number-service", () => ({
  reserveProcurementDocumentNumber: mocks.reserveNumber,
}));

import { Prisma } from "@prisma/client";
import {
  createFinishedGoodsOutwardRequest,
  createFinishedGoodsOutwardRequestFromBookings,
  createFinishedGoodsOutwardPackingList,
  cancelFinishedGoodsOutwardRequest,
  reverseFinishedGoodsOutwardShipment,
  unpickFinishedGoodsOutwardLine,
  markFinishedGoodsOutwardShipmentShipped,
  deleteFinishedGoodsOutwardPackingList,
  createFinishedGoodsOutwardBox,
  listFinishedGoodsOutwardWorkflow,
} from "./finished-goods-outward-service";

const requiredVendorChain = {
  quotationLines: [{
    quotation: {
      vendor_id: "quotation-vendor-id",
      customer: "Quotation Vendor",
      vendor: { vendor: "Quotation Vendor" },
      parentQuotation: {
        vendor_id: "sales-order-vendor-id",
        customer: "Sales Order Vendor",
        vendor: { vendor: "Sales Order Vendor" },
      },
    },
  }],
};

describe("finished-goods-outward-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.reserveNumber.mockResolvedValue("FGR-1");
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "org-1", role: "INVENTORY" });
    mocks.tx.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsSkuStock.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsAllocatedStockReceipt.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsOutwardRequest.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsOutwardBox.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsOutwardShipment.findMany.mockResolvedValue([]);
    mocks.prisma.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([]);
    mocks.prisma.auditEvent.findMany.mockResolvedValue([]);
  });

  it("creates a request against an exact SKU stock record in the authorized organization", async () => {
    mocks.tx.finishedGoodsSkuStock.findFirst.mockResolvedValue({
      id: "sku-1",
      sku_code: "FG-001",
      style_name: "Jacket",
      order_no: "ORD-1",
      article_no: "ART-1",
      brand: "Brand",
      size: "M",
      colour: "Navy",
      current_stock: new Prisma.Decimal("12.5"),
      location: { location_name: "Main Store" },
    });
    mocks.tx.finishedGoodsOutwardRequest.create.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-1",
      status: "REQUESTED",
    });

    const result = await createFinishedGoodsOutwardRequest({
      organizationId: "org-internal-1",
      actorId: "user-1",
      actorName: "Inventory User",
      lines: [{ stockType: "SKU", stockId: "sku-1", quantity: "2.5" }],
    });

    expect(result.request_no).toBe("FGR-1");
    expect(mocks.tx.finishedGoodsSkuStock.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sku-1", organization_id: "org-internal-1" },
    }));
    const createRequestCall = mocks.tx.finishedGoodsOutwardRequest.create.mock.calls[0][0];
    expect(createRequestCall.data).toMatchObject({
      organization_id: "org-internal-1",
      lines: {
        create: [expect.objectContaining({
          source_stock_type: "SKU",
          source_stock_id: "sku-1",
          requested_quantity: new Prisma.Decimal("2.5"),
        })],
      },
    });
    expect(createRequestCall.data.lines.create[0]).not.toHaveProperty("organization_id");
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_REQUESTED",
      entityId: "request-1",
    }), mocks.tx);
  });

  it("rejects quantities already reserved by another non-cancelled request", async () => {
    mocks.tx.finishedGoodsGeneralStockReceipt.findFirst.mockResolvedValue({
      id: "receipt-1",
      style_name: "Tee",
      order_no: "ORD-2",
      article_no: "ART-2",
      brand: null,
      size: "S",
      colour: "White",
      current_stock: 10,
      location: { location_name: "Main Store" },
    });
    mocks.tx.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      source_stock_type: "GENERAL",
      source_stock_id: "receipt-1",
      requested_quantity: new Prisma.Decimal(8),
      shipped_quantity: new Prisma.Decimal(2),
    }]);

    await expect(createFinishedGoodsOutwardRequest({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Inventory User",
      lines: [{ stockType: "GENERAL", stockId: "receipt-1", quantity: "5" }],
    })).rejects.toThrow("only 4 available to request");

    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("does not resolve a stock record outside the authorized organization", async () => {
    mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst.mockResolvedValue(null);

    await expect(createFinishedGoodsOutwardRequest({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Inventory User",
      lines: [{ stockType: "ALLOCATED", stockId: "foreign-receipt", quantity: "1" }],
    })).rejects.toThrow("not found in this organization");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "foreign-receipt", organization_id: "org-1" },
    }));
  });

  it("requires whole quantities for General and Allocated GRN stock", async () => {
    mocks.tx.finishedGoodsGeneralStockReceipt.findFirst.mockResolvedValue({
      id: "receipt-2",
      style_name: "Tee",
      order_no: "ORD-2",
      article_no: "ART-2",
      brand: null,
      size: "S",
      colour: "White",
      current_stock: 10,
      location: { location_name: "Main Store" },
    });

    await expect(createFinishedGoodsOutwardRequest({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Inventory User",
      lines: [{ stockType: "GENERAL", stockId: "receipt-2", quantity: "1.5" }],
    })).rejects.toThrow("whole-number quantity");
    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("requests the remaining allocated FG balance for multiple fully-assigned shipment bookings", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([
      {
        ...requiredVendorChain,
        id: "booking-1",
        booking_no: "BK-1",
        sizeLines: [{
          id: "size-line-1",
          size: "M",
          booked_quantity: 10,
          assignments: [{ assigned_quantity: 10, grnAllocations: [{ allocated_quantity: 5 }] }],
        }],
      },
      {
        ...requiredVendorChain,
        id: "booking-2",
        booking_no: "BK-2",
        sizeLines: [{
          id: "size-line-2",
          size: "L",
          booked_quantity: 5,
          assignments: [{ assigned_quantity: 5, grnAllocations: [{ allocated_quantity: 5 }] }],
        }],
      },
    ]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findMany.mockResolvedValue([
      { id: "receipt-1", booking_id: "booking-1", booking_size_line_id: "size-line-1", current_stock: 10 },
      { id: "receipt-2", booking_id: "booking-2", booking_size_line_id: "size-line-2", current_stock: 5 },
    ]);
    mocks.tx.finishedGoodsOutwardRequestLine.findMany
      .mockResolvedValueOnce([{
        source_stock_id: "receipt-1",
        requested_quantity: new Prisma.Decimal(7),
        shipped_quantity: new Prisma.Decimal(2),
      }])
      .mockResolvedValueOnce([{
        source_stock_type: "ALLOCATED",
        source_stock_id: "receipt-1",
        requested_quantity: new Prisma.Decimal(7),
        shipped_quantity: new Prisma.Decimal(2),
      }]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst.mockImplementation(async ({ where }) => ({
      id: where.id,
      style_name: where.id === "receipt-1" ? "Jacket" : "Shirt",
      order_no: where.id === "receipt-1" ? "ORD-1" : "ORD-2",
      article_no: where.id === "receipt-1" ? "ART-1" : "ART-2",
      brand: "Brand",
      size: "M",
      colour: "Navy",
      current_stock: where.id === "receipt-1" ? new Prisma.Decimal(10) : new Prisma.Decimal(5),
      location: { location_name: "Main Store" },
    }));
    mocks.tx.finishedGoodsOutwardRequest.create.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-2",
      status: "REQUESTED",
    });

    const result = await createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-internal-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [
        { bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "3" }] },
        { bookingId: "booking-2", sizeRequests: [{ sizeLineId: "size-line-2", quantity: "4" }] },
      ],
    });

    expect(result).toMatchObject({ request_no: "FGR-2", bookingCount: 2 });
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith(
      "merch-user",
      "org-internal-1",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.tx.finishedGoodsOutwardRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lines: {
          create: expect.arrayContaining([
            expect.objectContaining({
              source_booking_id: "booking-1",
              source_stock_id: "receipt-1",
              requested_quantity: new Prisma.Decimal(3),
            }),
            expect.objectContaining({
              source_booking_id: "booking-2",
              source_stock_id: "receipt-2",
              requested_quantity: new Prisma.Decimal(4),
            }),
          ]),
        },
      }),
    }));
    const createRequestCall = mocks.tx.finishedGoodsOutwardRequest.create.mock.calls[0][0];
    expect(createRequestCall.data.organization_id).toBe("org-internal-1");
    expect(createRequestCall.data.lines.create.every((line: Record<string, unknown>) => !("organization_id" in line))).toBe(true);
  });

  it("rejects shipment requests above the fulfilled quantity without creating a request", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      ...requiredVendorChain,
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [{
        id: "size-line-1",
        size: "M",
        booked_quantity: 10,
        assignments: [{ assigned_quantity: 10, grnAllocations: [{ allocated_quantity: 5 }] }],
      }],
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "6" }] }],
    })).rejects.toThrow("size M of BK-1 exceeds its fulfilled quantity of 5");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("rejects invalid whole-number shipment request quantities", async () => {
    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "1.5" }] }],
    })).rejects.toThrow("whole-number finished-goods request quantity for every size");

    expect(mocks.tx.advanceBooking.findMany).not.toHaveBeenCalled();
  });

  it("does not request more than the unreserved allocated stock balance", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      ...requiredVendorChain,
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [{
        id: "size-line-1",
        size: "M",
        booked_quantity: 10,
        assignments: [{ assigned_quantity: 10, grnAllocations: [{ allocated_quantity: 10 }] }],
      }],
    }]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findMany.mockResolvedValue([
      { id: "receipt-1", booking_id: "booking-1", booking_size_line_id: "size-line-1", current_stock: 10 },
    ]);
    mocks.tx.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      source_stock_type: "ALLOCATED",
      source_stock_id: "receipt-1",
      requested_quantity: new Prisma.Decimal(8),
      shipped_quantity: new Prisma.Decimal(0),
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "3" }] }],
    })).rejects.toThrow("exceeds its available Allocated inventory");

    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("keeps requested quantities attached to their exact booking sizes and source stock", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      ...requiredVendorChain,
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [
        {
          id: "size-s",
          size: "S",
          booked_quantity: 4,
          assignments: [{ assigned_quantity: 4, grnAllocations: [{ allocated_quantity: 4 }] }],
        },
        {
          id: "size-m",
          size: "M",
          booked_quantity: 6,
          assignments: [{ assigned_quantity: 6, grnAllocations: [{ allocated_quantity: 6 }] }],
        },
      ],
    }]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findMany.mockResolvedValue([
      { id: "receipt-s", booking_id: "booking-1", booking_size_line_id: "size-s", current_stock: 4 },
      { id: "receipt-m", booking_id: "booking-1", booking_size_line_id: "size-m", current_stock: 6 },
    ]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst.mockImplementation(async ({ where }) => ({
      id: where.id,
      style_name: "Tee",
      order_no: "ORD-1",
      article_no: "ART-1",
      brand: "Brand",
      size: where.id === "receipt-s" ? "S" : "M",
      colour: "Navy",
      current_stock: where.id === "receipt-s" ? 4 : 6,
      location: { location_name: "Main Store" },
    }));
    mocks.tx.finishedGoodsOutwardRequest.create.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-SIZE",
      status: "REQUESTED",
    });

    await createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{
        bookingId: "booking-1",
        sizeRequests: [
          { sizeLineId: "size-s", quantity: "2" },
          { sizeLineId: "size-m", quantity: "3" },
        ],
      }],
    });

    const createRequestCall = mocks.tx.finishedGoodsOutwardRequest.create.mock.calls[0][0];
    expect(createRequestCall.data.lines.create).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_stock_id: "receipt-s",
        size: "S",
        requested_quantity: new Prisma.Decimal(2),
      }),
      expect.objectContaining({
        source_stock_id: "receipt-m",
        size: "M",
        requested_quantity: new Prisma.Decimal(3),
      }),
    ]));
  });

  it("rejects one size exceeding its fulfillment even when the booking total would fit", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [
        {
          id: "size-s",
          size: "S",
          booked_quantity: 2,
          assignments: [{ assigned_quantity: 2, grnAllocations: [{ allocated_quantity: 2 }] }],
        },
        {
          id: "size-m",
          size: "M",
          booked_quantity: 8,
          assignments: [{ assigned_quantity: 8, grnAllocations: [{ allocated_quantity: 8 }] }],
        },
      ],
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{
        bookingId: "booking-1",
        sizeRequests: [
          { sizeLineId: "size-s", quantity: "3" },
          { sizeLineId: "size-m", quantity: "1" },
        ],
      }],
    })).rejects.toThrow("size S of BK-1 exceeds its fulfilled quantity of 2");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("refuses to request unfinished or unassigned shipment bookings", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [{
        id: "size-line-1",
        size: "M",
        booked_quantity: 10,
        assignments: [{ assigned_quantity: 8, grnAllocations: [] }],
      }],
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "1" }] }],
    })).rejects.toThrow("Assign every booked size");
    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findMany).not.toHaveBeenCalled();
  });

  it("requires quotation and sales-order vendors before a booking-backed FG request", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      booking_no: "BK-1",
      quotationLines: [],
      sizeLines: [{
        id: "size-line-1",
        size: "M",
        booked_quantity: 10,
        assignments: [{ assigned_quantity: 10, grnAllocations: [{ allocated_quantity: 10 }] }],
      }],
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-line-1", quantity: "1" }] }],
    })).rejects.toThrow("A quotation vendor and Sales Order vendor are required");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardRequest.create).not.toHaveBeenCalled();
  });

  it("returns all three vendor roles on request, box, and packing-list payloads", async () => {
    const sourceBooking = {
      booking_no: "BK-1",
      customer: null,
      quotationLines: [{
        quotation: {
          customer: "Quotation Vendor Snapshot",
          vendor: { vendor: "Quotation Vendor" },
          parentQuotation: {
            customer: "Sales Order Vendor Snapshot",
            vendor: { vendor: "Sales Order Vendor" },
          },
        },
      }],
    };
    const requestLine = {
      id: "request-line-1",
      sourceBooking,
      source_stock_type: "ALLOCATED",
      source_stock_id: "receipt-1",
      stock_bucket: "ALLOCATED",
      location_name: "Main Store",
      sku_code: null,
      style_name: "Tee",
      order_no: "ORD-1",
      article_no: "ART-1",
      brand: "Brand",
      size: "M",
      colour: "Navy",
      requested_quantity: new Prisma.Decimal(2),
      picked_quantity: new Prisma.Decimal(2),
      shipped_quantity: new Prisma.Decimal(0),
      status: "ACCEPTED",
      picked_by: null,
      picked_at: null,
      request: { request_no: "FGR-1" },
    };
    const expectedVendors = {
      bookingVendor: null,
      quotationVendor: "Quotation Vendor",
      salesOrderVendor: "Sales Order Vendor",
    };
    mocks.prisma.finishedGoodsOutwardRequest.findMany.mockResolvedValue([{
      id: "request-1",
      request_no: "FGR-1",
      status: "ACCEPTED",
      requested_at: new Date("2026-10-07T00:00:00.000Z"),
      requested_by: "Merch User",
      lines: [requestLine],
    }]);
    mocks.prisma.finishedGoodsOutwardBox.findMany.mockResolvedValue([{
      id: "box-1",
      box_no: "BOX-1",
      packed_at: new Date("2026-10-07T00:00:00.000Z"),
      packed_by: "Inventory User",
      shipment: null,
      lines: [{
        id: "box-line-1",
        request_line_id: "request-line-1",
        quantity: new Prisma.Decimal(2),
        requestLine,
      }],
    }]);
    mocks.prisma.finishedGoodsOutwardShipment.findMany.mockResolvedValue([{
      id: "shipment-1",
      packing_list_no: "PL-1",
      shipped_at: new Date("2026-10-07T00:00:00.000Z"),
      shipped_by: null,
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      boxes: [{ box: { id: "box-1", box_no: "BOX-1" } }],
    }]);

    const result = await listFinishedGoodsOutwardWorkflow("org-1", "inventory-user");

    expect(result.requests[0].lines[0]).toMatchObject(expectedVendors);
    expect(result.boxes[0]).toMatchObject({ vendors: expectedVendors, lines: [expectedVendors] });
    expect(result.shipments[0].vendors).toEqual({
      bookingVendor: null,
      quotationVendor: "Quotation Vendor",
      salesOrderVendor: "Sales Order Vendor",
    });
  });

  it("creates a packing list without deducting stock before dispatch", async () => {
    mocks.tx.finishedGoodsOutwardBox.findMany.mockResolvedValue([{
      id: "box-1",
      box_no: "FG-BOX-1",
      lines: [{ id: "box-line-1" }],
    }]);
    mocks.reserveNumber.mockResolvedValue("FGL-1");
    mocks.tx.finishedGoodsOutwardShipment.create.mockResolvedValue({
      id: "packing-list-1",
      packing_list_no: "FGL-1",
      created_at: new Date("2026-10-08T00:00:00Z"),
    });
    mocks.tx.finishedGoodsOutwardShipmentBox.createMany.mockResolvedValue({ count: 1 });

    await expect(createFinishedGoodsOutwardPackingList({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Inventory User",
      boxIds: ["box-1"],
    })).resolves.toMatchObject({ id: "packing-list-1", packing_list_no: "FGL-1", boxCount: 1 });

    expect(mocks.tx.finishedGoodsOutwardShipment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { organization_id: "org-1", packing_list_no: "FGL-1", shipped_by: "Inventory User" },
    }));
    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardRequestLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_PACKING_LIST_CREATED",
      entityId: "packing-list-1",
    }), mocks.tx);
  });

  it("requires an explicit box number and stores it on the packed document", async () => {
    mocks.tx.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([{
      id: "line-1",
      request_id: "request-1",
      picked_quantity: new Prisma.Decimal(3),
    }]);
    mocks.tx.finishedGoodsOutwardBoxLine.findMany.mockResolvedValue([]);
    mocks.tx.finishedGoodsOutwardBox.create.mockResolvedValue({
      id: "box-1",
      box_no: "CARTON-042",
      packed_at: new Date("2026-10-08T00:00:00Z"),
    });
    mocks.tx.finishedGoodsOutwardBoxLine.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      status: "PICKED",
      lines: [{ status: "PACKED" }],
    });
    mocks.tx.finishedGoodsOutwardRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(createFinishedGoodsOutwardBox({
      organizationId: "org-1",
      requestLineIds: ["line-1"],
      boxNo: " CARTON-042 ",
      actorId: "user-1",
      actorName: "Inventory User",
    })).resolves.toMatchObject({ box_no: "CARTON-042" });

    expect(mocks.reserveNumber).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardBox.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { organization_id: "org-1", box_no: "CARTON-042", packed_by: "Inventory User" },
    }));
  });

  it("does not mark a packing list shipped when available source stock is insufficient", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "packing-list-1",
      packing_list_no: "FGL-1",
      boxes: [{
        box_id: "box-1",
        box: {
          box_no: "BOX-1",
          lines: [{
            quantity: new Prisma.Decimal(4),
            requestLine: {
              id: "line-1",
              request_id: "request-1",
              source_stock_type: "ALLOCATED",
              source_stock_id: "receipt-1",
              requested_quantity: new Prisma.Decimal(4),
              shipped_quantity: new Prisma.Decimal(0),
              picked_quantity: new Prisma.Decimal(4),
              style_name: "Shirt",
            },
          }],
        },
      }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "created-audit" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst.mockResolvedValue({
      id: "receipt-1",
      style_name: "Shirt",
      order_no: "ORD-1",
      article_no: "ART-1",
      brand: null,
      size: "M",
      colour: "Blue",
      current_stock: new Prisma.Decimal(2),
      location: { location_name: "Main Store" },
    });

    await expect(markFinishedGoodsOutwardShipmentShipped({
      organizationId: "org-1",
      shipmentId: "packing-list-1",
      actorId: "user-1",
      actorName: "Inventory User",
    })).rejects.toThrow("FG stock changed or is insufficient");

    expect(mocks.tx.finishedGoodsOutwardRequestLine.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardShipment.updateMany).not.toHaveBeenCalled();
  });

  it("marks the packing list shipped and deducts the linked allocated stock exactly once", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "packing-list-1",
      packing_list_no: "FGL-1",
      boxes: [{
        box_id: "box-1",
        box: {
          box_no: "BOX-1",
          lines: [{
            quantity: new Prisma.Decimal(4),
            requestLine: {
              id: "line-1",
              request_id: "request-1",
              source_stock_type: "ALLOCATED",
              source_stock_id: "receipt-1",
              requested_quantity: new Prisma.Decimal(4),
              shipped_quantity: new Prisma.Decimal(0),
              picked_quantity: new Prisma.Decimal(4),
              style_name: "Shirt",
            },
          }],
        },
      }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "created-audit" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findFirst.mockResolvedValue({
      id: "receipt-1",
      style_name: "Shirt",
      order_no: "ORD-1",
      article_no: "ART-1",
      brand: null,
      size: "M",
      colour: "Blue",
      current_stock: new Prisma.Decimal(7),
      location: { location_name: "Main Store" },
    });
    mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      status: "PACKED",
      lines: [{ status: "SHIPPED" }],
    });
    mocks.tx.finishedGoodsOutwardRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardShipment.updateMany.mockResolvedValue({ count: 1 });

    await expect(markFinishedGoodsOutwardShipmentShipped({
      organizationId: "org-1",
      shipmentId: "packing-list-1",
      actorId: "user-1",
      actorName: "Inventory User",
    })).resolves.toMatchObject({ id: "packing-list-1", status: "SHIPPED" });

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", organization_id: "org-1", current_stock: { gte: 4 } },
      data: { quantity_out: { increment: 4 }, current_stock: { decrement: 4 } },
    });
    expect(mocks.tx.finishedGoodsOutwardShipment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "packing-list-1", organization_id: "org-1" },
      data: expect.objectContaining({ shipped_by: "Inventory User" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_SHIPPED",
      entityId: "packing-list-1",
      details: expect.objectContaining({ packingListNo: "FGL-1", boxNos: ["BOX-1"] }),
    }), mocks.tx);
  });

  it("rejects a repeated mark-shipped request before changing stock", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "packing-list-1",
      packing_list_no: "FGL-1",
      boxes: [{ box_id: "box-1", box: { box_no: "BOX-1", lines: [] } }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "created-audit" })
      .mockResolvedValueOnce({ id: "shipped-audit" })
      .mockResolvedValueOnce(null);

    await expect(markFinishedGoodsOutwardShipmentShipped({
      organizationId: "org-1",
      shipmentId: "packing-list-1",
      actorId: "user-1",
      actorName: "Inventory User",
    })).rejects.toThrow("already been marked as shipped");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany).not.toHaveBeenCalled();
  });

  it("deletes an unshipped packing list while preserving and releasing its boxes", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "packing-list-1",
      packing_list_no: "FGL-1",
      boxes: [{ box_id: "box-1" }, { box_id: "box-2" }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "created-audit" })
      .mockResolvedValueOnce(null);
    mocks.tx.finishedGoodsOutwardShipmentBox.deleteMany.mockResolvedValue({ count: 2 });
    mocks.tx.finishedGoodsOutwardShipment.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteFinishedGoodsOutwardPackingList({
      organizationId: "org-1",
      shipmentId: "packing-list-1",
      actorId: "user-1",
    })).resolves.toMatchObject({ id: "packing-list-1", packing_list_no: "FGL-1", status: "DELETED" });

    expect(mocks.tx.finishedGoodsOutwardShipmentBox.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", shipment_id: "packing-list-1" },
    });
    expect(mocks.tx.finishedGoodsOutwardShipment.deleteMany).toHaveBeenCalledWith({
      where: { id: "packing-list-1", organization_id: "org-1" },
    });
    expect(mocks.tx.finishedGoodsSkuStock.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_PACKING_LIST_DELETED",
      entityId: "packing-list-1",
    }), mocks.tx);
  });

  it("cancels an approved request only before any quantity has been picked", async () => {
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-1",
      status: "ACCEPTED",
      lines: [{
        id: "line-1",
        status: "ACCEPTED",
        picked_quantity: new Prisma.Decimal(0),
        shipped_quantity: new Prisma.Decimal(0),
        boxLines: [],
      }],
    });
    mocks.tx.finishedGoodsOutwardRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });

    await expect(cancelFinishedGoodsOutwardRequest({
      organizationId: "org-1",
      requestId: "request-1",
      actorId: "user-1",
    })).resolves.toMatchObject({ id: "request-1", status: "CANCELLED" });

    expect(mocks.tx.finishedGoodsOutwardRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-1", organization_id: "org-1", status: "ACCEPTED" },
    }));
  });

  it("does not cancel a request while any item remains picked", async () => {
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-1",
      status: "ACCEPTED",
      lines: [{
        id: "line-1",
        status: "ACCEPTED",
        picked_quantity: new Prisma.Decimal(3),
        shipped_quantity: new Prisma.Decimal(0),
        boxLines: [],
      }],
    });

    await expect(cancelFinishedGoodsOutwardRequest({
      organizationId: "org-1",
      requestId: "request-1",
      actorId: "user-1",
    })).rejects.toThrow("Undo picking and remove boxes");

    expect(mocks.tx.finishedGoodsOutwardRequest.updateMany).not.toHaveBeenCalled();
  });

  it("returns an unboxed pick to the approved stage and audits the reversal", async () => {
    mocks.tx.finishedGoodsOutwardRequestLine.findFirst.mockResolvedValue({
      id: "line-1",
      request_id: "request-1",
      style_name: "Shirt",
      picked_quantity: new Prisma.Decimal(4),
      boxLines: [],
    });
    mocks.tx.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      status: "ACCEPTED",
      lines: [{ status: "ACCEPTED" }],
    });

    await expect(unpickFinishedGoodsOutwardLine({
      organizationId: "org-1",
      requestLineId: "line-1",
      actorId: "user-1",
    })).resolves.toMatchObject({ id: "line-1", status: "ACCEPTED" });

    expect(mocks.tx.finishedGoodsOutwardRequestLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "line-1", organization_id: "org-1" }),
      data: { status: "ACCEPTED", picked_quantity: 0, picked_by: null, picked_at: null },
    }));
    expect(mocks.tx.finishedGoodsOutwardRequestLine.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        request: { organization_id: "org-1", status: { in: ["ACCEPTED", "PICKED"] } },
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_PICK_REVERSED",
      entityId: "line-1",
    }), mocks.tx);
  });

  it("restores exact source stock, detaches boxes, and retains an auditable reversed shipment", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "shipment-1",
      packing_list_no: "FGL-1",
      boxes: [{
        box_id: "box-1",
        box: {
          box_no: "FG-BOX-1",
          lines: [{
            request_line_id: "line-1",
            quantity: new Prisma.Decimal(4),
            requestLine: {
              id: "line-1",
              request_id: "request-1",
              source_stock_type: "ALLOCATED",
              source_stock_id: "receipt-1",
              requested_quantity: new Prisma.Decimal(4),
              shipped_quantity: new Prisma.Decimal(4),
              picked_quantity: new Prisma.Decimal(4),
              style_name: "Shirt",
            },
          }],
        },
      }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "posted-audit" })
      .mockResolvedValueOnce(null);
    mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardShipmentBox.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardBoxLine.aggregate.mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(4) },
    });
    mocks.tx.finishedGoodsOutwardRequestLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.finishedGoodsOutwardRequest.findFirst.mockResolvedValue({
      status: "SHIPPED",
      lines: [{ status: "PACKED" }],
    });
    mocks.tx.finishedGoodsOutwardRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(reverseFinishedGoodsOutwardShipment({
      organizationId: "org-1",
      shipmentId: "shipment-1",
      actorId: "user-1",
    })).resolves.toMatchObject({ id: "shipment-1", packing_list_no: "FGL-1", status: "REVERSED" });

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: "receipt-1", organization_id: "org-1", quantity_out: { gte: 4 } },
      data: { quantity_out: { decrement: 4 }, current_stock: { increment: 4 } },
    });
    expect(mocks.tx.finishedGoodsOutwardShipmentBox.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", shipment_id: "shipment-1" },
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "FG_STOCK_OUTWARD_SHIPMENT_REVERSED",
      entityId: "shipment-1",
      details: expect.objectContaining({ packingListNo: "FGL-1", boxNos: ["FG-BOX-1"] }),
    }), mocks.tx);
  });

  it("does not restore stock twice for an already reversed shipment", async () => {
    mocks.tx.finishedGoodsOutwardShipment.findFirst.mockResolvedValue({
      id: "shipment-1",
      packing_list_no: "FGL-1",
      boxes: [{ box_id: "box-1", box: { box_no: "FG-BOX-1", lines: [] } }],
    });
    mocks.tx.auditEvent.findFirst
      .mockResolvedValueOnce({ id: "posted-audit" })
      .mockResolvedValueOnce({ id: "audit-1" });

    await expect(reverseFinishedGoodsOutwardShipment({
      organizationId: "org-1",
      shipmentId: "shipment-1",
      actorId: "user-1",
    })).rejects.toThrow("already been reversed");

    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.finishedGoodsOutwardShipmentBox.deleteMany).not.toHaveBeenCalled();
  });
});
