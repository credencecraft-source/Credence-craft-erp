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
    finishedGoodsOutwardBoxLine: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    finishedGoodsOutwardShipment: { create: vi.fn() },
    finishedGoodsOutwardShipmentBox: { createMany: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
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
  createFinishedGoodsOutwardShipment,
} from "./finished-goods-outward-service";

describe("finished-goods-outward-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.reserveNumber.mockResolvedValue("FGR-1");
    mocks.createAuditEvent.mockResolvedValue({});
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "org-1", role: "INVENTORY" });
    mocks.tx.finishedGoodsOutwardRequestLine.findMany.mockResolvedValue([]);
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
    expect(mocks.tx.finishedGoodsOutwardRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "org-internal-1",
        lines: {
          create: [expect.objectContaining({
            source_stock_type: "SKU",
            source_stock_id: "sku-1",
            requested_quantity: new Prisma.Decimal("2.5"),
          })],
        },
      }),
    }));
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
      { id: "booking-1", booking_no: "BK-1", sizeLines: [{ booked_quantity: 10, assignments: [{ assigned_quantity: 10 }] }] },
      { id: "booking-2", booking_no: "BK-2", sizeLines: [{ booked_quantity: 5, assignments: [{ assigned_quantity: 5 }] }] },
    ]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.findMany.mockResolvedValue([
      { id: "receipt-1", booking_id: "booking-1", current_stock: 10 },
      { id: "receipt-2", booking_id: "booking-2", current_stock: 5 },
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
      bookingIds: ["booking-1", "booking-2"],
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
              requested_quantity: new Prisma.Decimal(5),
            }),
            expect.objectContaining({
              source_booking_id: "booking-2",
              source_stock_id: "receipt-2",
              requested_quantity: new Prisma.Decimal(5),
            }),
          ]),
        },
      }),
    }));
  });

  it("refuses to request unfinished or unassigned shipment bookings", async () => {
    mocks.tx.advanceBooking.findMany.mockResolvedValue([{
      id: "booking-1",
      booking_no: "BK-1",
      sizeLines: [{ booked_quantity: 10, assignments: [{ assigned_quantity: 8 }] }],
    }]);

    await expect(createFinishedGoodsOutwardRequestFromBookings({
      organizationId: "org-1",
      actorId: "merch-user",
      actorName: "Merch User",
      bookingIds: ["booking-1"],
    })).rejects.toThrow("Assign every booked size");
    expect(mocks.tx.finishedGoodsAllocatedStockReceipt.findMany).not.toHaveBeenCalled();
  });

  it("does not create a shipment when the source finished-goods balance has fallen below packed quantity", async () => {
    mocks.tx.finishedGoodsOutwardBox.findMany.mockResolvedValue([{
      id: "box-1",
      box_no: "FG-BOX-1",
      lines: [{
        request_line_id: "request-line-1",
        quantity: new Prisma.Decimal(4),
        requestLine: {
          id: "request-line-1",
          request_id: "request-1",
          source_stock_type: "ALLOCATED",
          source_stock_id: "receipt-1",
          requested_quantity: new Prisma.Decimal(4),
          shipped_quantity: new Prisma.Decimal(0),
          picked_quantity: new Prisma.Decimal(4),
          style_name: "Shirt",
        },
      }],
    }]);
    mocks.tx.finishedGoodsAllocatedStockReceipt.updateMany.mockResolvedValue({ count: 0 });

    await expect(createFinishedGoodsOutwardShipment({
      organizationId: "org-1",
      actorId: "user-1",
      actorName: "Inventory User",
      boxIds: ["box-1"],
    })).rejects.toThrow("FG stock changed or is insufficient");

    expect(mocks.tx.finishedGoodsOutwardShipment.create).not.toHaveBeenCalled();
  });
});
