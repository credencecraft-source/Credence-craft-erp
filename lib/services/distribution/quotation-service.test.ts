import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  transaction: {
    advanceBooking: { findMany: vi.fn() },
    distributionQuotationLine: { findFirst: vi.fn(), updateMany: vi.fn() },
    distributionQuotation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
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
  createDistributionMasterQuotation,
  createDistributionQuotationFromBookings,
  saveDistributionQuotationDraft,
} from "./quotation-service";

const line = {
  id: "size-line-1",
  size: "M",
  booked_quantity: 20,
  created_at: new Date("2026-10-07T00:00:00.000Z"),
};
const booking = (id: string, bookingNo: string, vendorId = "vendor-1") => ({
  id,
  booking_no: bookingNo,
  vendor_id: vendorId,
  customer: "Vendor A",
  brand: "Brand",
  style_name: "Style",
  order: { orderNo: "ORD-1" },
  sizeLines: [{ ...line, id: `${id}-size`, size: "M" }],
});
const createdQuotation = {
  id: "quotation-1",
  organization_id: "internal-org-1",
  vendor_id: "vendor-1",
  quotation_no: "QT-1",
  quotation_date: new Date("2026-10-07T00:00:00.000Z"),
  valid_until: null,
  order_no: "ORD-1",
  customer: "Vendor A",
  notes: null,
  mode: "MULTIPLE",
  status: "DRAFT",
  total_quantity: 40,
  subtotal: new Prisma.Decimal(0),
  parent_quotation_id: null,
  created_at: new Date("2026-10-07T00:00:00.000Z"),
  lines: [{
    id: "quotation-line-1",
    source_booking_size_id: "booking-1-size",
    booking_no: "BK-1",
    order_no: "ORD-1",
    item_description: "Brand Style",
    brand: "Brand",
    style_name: "Style",
    size: "M",
    quantity: 20,
    unit_price: new Prisma.Decimal(0),
    line_total: new Prisma.Decimal(0),
    created_at: new Date("2026-10-07T00:00:00.000Z"),
  }],
};

describe("distribution quotation persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction));
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([
      booking("booking-1", "BK-1"),
      booking("booking-2", "BK-2"),
    ]);
    mocks.transaction.distributionQuotationLine.findFirst.mockResolvedValue(null);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(createdQuotation);
    mocks.reserveProcurementDocumentNumber.mockResolvedValue("QT-1");
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("creates a persisted regular quotation header and booking-derived lines transactionally", async () => {
    const result = await createDistributionQuotationFromBookings(
      "internal-org-1",
      "user-1",
      ["booking-1", "booking-2"],
    );

    expect(result).toMatchObject({
      id: "quotation-1",
      quotationNo: "QT-1",
      mode: "MULTIPLE",
      status: "DRAFT",
      totalQuantity: 40,
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        vendor_id: "vendor-1",
        created_by: "user-1",
        mode: "MULTIPLE",
        lines: { create: expect.arrayContaining([
          expect.objectContaining({ source_booking_size_id: "booking-1-size", quantity: 20 }),
          expect.objectContaining({ source_booking_size_id: "booking-2-size", quantity: 20 }),
        ]) },
      }),
    }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });

  it("rejects bookings from mixed vendors and duplicate quotations", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([
      booking("booking-1", "BK-1"),
      booking("booking-2", "BK-2", "vendor-2"),
    ]);
    await expect(createDistributionQuotationFromBookings("internal-org-1", "user-1", ["booking-1", "booking-2"]))
      .rejects.toThrow("same Vendor Master vendor");
    expect(mocks.transaction.distributionQuotation.create).not.toHaveBeenCalled();

    mocks.transaction.advanceBooking.findMany.mockResolvedValue([booking("booking-1", "BK-1")]);
    mocks.transaction.distributionQuotationLine.findFirst.mockResolvedValue({ booking_no: "BK-1" });
    await expect(createDistributionQuotationFromBookings("internal-org-1", "user-1", ["booking-1"]))
      .rejects.toThrow("already has a quotation");
  });

  it("persists header and subform prices with server-calculated decimal totals", async () => {
    const current = {
      ...createdQuotation,
      lines: [{ ...createdQuotation.lines[0], quantity: 3 }],
    };
    const updated = {
      ...current,
      quotation_date: new Date("2026-10-07T00:00:00.000Z"),
      valid_until: new Date("2026-11-01T00:00:00.000Z"),
      notes: "Net 30",
      subtotal: new Prisma.Decimal("3.75"),
      lines: [{
        ...current.lines[0],
        unit_price: new Prisma.Decimal("1.25"),
        line_total: new Prisma.Decimal("3.75"),
      }],
    };
    mocks.transaction.distributionQuotation.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);
    mocks.transaction.distributionQuotationLine.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });

    const result = await saveDistributionQuotationDraft("internal-org-1", "user-1", "quotation-1", {
      quotationDate: "2026-10-07",
      validUntil: "2026-11-01",
      notes: "Net 30",
      lines: [{ id: "quotation-line-1", unitPrice: "1.25" }],
    });

    expect(result.subtotal).toBe("3.75");
    expect(mocks.transaction.distributionQuotationLine.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", quotation_id: "quotation-1", id: "quotation-line-1" },
      data: expect.objectContaining({ unit_price: new Prisma.Decimal("1.25"), line_total: new Prisma.Decimal("3.75") }),
    }));
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "quotation-1", status: "DRAFT" },
      data: expect.objectContaining({ notes: "Net 30", subtotal: new Prisma.Decimal("3.75") }),
    }));
  });

  it("creates a database master header and links selected quotation children transactionally", async () => {
    const childQuotes = [
      { ...createdQuotation, id: "quote-1", quotation_no: "QT-1", parent_quotation_id: null },
      { ...createdQuotation, id: "quote-2", quotation_no: "QT-2", parent_quotation_id: null },
    ];
    const master = {
      ...createdQuotation,
      id: "master-1",
      quotation_no: "MQT-1",
      mode: "MASTER",
      total_quantity: 80,
      subtotal: new Prisma.Decimal("25.00"),
      lines: [],
    };
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue(childQuotes);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(master);
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 2 });
    mocks.reserveProcurementDocumentNumber.mockResolvedValue("MQT-1");

    const result = await createDistributionMasterQuotation("internal-org-1", "user-1", ["quote-1", "quote-2"]);

    expect(result).toMatchObject({ id: "master-1", quotationNo: "MQT-1", mode: "MASTER", totalQuantity: 80 });
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["quote-1", "quote-2"] },
        parent_quotation_id: null,
        mode: { in: ["SINGLE", "MULTIPLE"] },
      },
      data: { parent_quotation_id: "master-1" },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
  });
});
