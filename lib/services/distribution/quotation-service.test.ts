import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    distributionQuotation: { findFirst: vi.fn(), findMany: vi.fn() },
    distributionOrderForm: { findMany: vi.fn() },
    masterVendor: { findMany: vi.fn() },
    contactRoleAssignment: { findMany: vi.fn() },
  },
  transaction: {
    advanceBooking: { findMany: vi.fn() },
    contact: { findFirst: vi.fn(), findMany: vi.fn() },
    masterVendor: { findFirst: vi.fn(), findMany: vi.fn() },
    distributionOrderForm: { findMany: vi.fn(), updateMany: vi.fn() },
    contactDistributorDealerAssignment: { findMany: vi.fn() },
    contactRoleSetting: { findMany: vi.fn() },
    distributionQuotationLine: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    distributionQuotation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
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
  createDistributionMasterQuotations,
  createDistributionQuotationFromBookings,
  deleteDistributionQuotation,
  deleteDistributionQuotations,
  getDistributionQuotation,
  listDistributionOrderForms,
  listDistributionQuotations,
  saveDistributionQuotationDraft,
} from "./quotation-service";

const line = {
  id: "size-line-1",
  size: "M",
  booked_quantity: 20,
  created_at: new Date("2026-10-07T00:00:00.000Z"),
};
const booking = (id: string, bookingNo: string, vendorId: string | null = "vendor-1", customer: string | null = "Vendor A") => ({
  id,
  booking_no: bookingNo,
  vendor_id: vendorId,
  customer,
  brand: "Brand",
  style_name: "Style",
  order: { orderNo: "ORD-1" },
  quotationLines: [],
  sizeLines: [
    { ...line, id: `${id}-size-m`, size: "M", booked_quantity: 20 },
    ...(id === "booking-1" ? [{ ...line, id: `${id}-size-s`, size: "S", booked_quantity: 10 }] : []),
  ],
});
const createdQuotation = {
  id: "quotation-1",
  organization_id: "internal-org-1",
  vendor_id: "vendor-1",
  customer: "Master Vendor A",
  quotation_no: "QT-1",
  quotation_date: new Date("2026-10-07T00:00:00.000Z"),
  valid_until: null,
  order_no: "ORD-1",
  notes: null,
  mode: "MULTIPLE",
  status: "DRAFT",
  total_quantity: 50,
  subtotal: new Prisma.Decimal(0),
  parent_quotation_id: null,
  created_at: new Date("2026-10-07T00:00:00.000Z"),
  lines: [{
    id: "quotation-line-1",
    source_booking_id: "booking-1",
    sourceBooking: {
      customer: "End Customer A",
      sizeLines: [
        { size: "M", booked_quantity: 20 },
        { size: "S", booked_quantity: 10 },
      ],
    },
    booking_no: "BK-1",
    order_no: "ORD-1",
    item_description: "Brand Style",
    brand: "Brand",
    style_name: "Style",
    quantity: 30,
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
    mocks.transaction.contact.findFirst.mockResolvedValue(null);
    mocks.transaction.masterVendor.findFirst.mockResolvedValue({ id: "vendor-1", vendor: "Master Vendor A" });
    mocks.transaction.masterVendor.findMany.mockResolvedValue([]);
    mocks.transaction.contact.findMany.mockResolvedValue([]);
    mocks.transaction.distributionOrderForm.findMany.mockResolvedValue([]);
    mocks.transaction.distributionOrderForm.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.contactDistributorDealerAssignment.findMany.mockResolvedValue([]);
    mocks.transaction.contactRoleSetting.findMany.mockResolvedValue([]);
    mocks.transaction.distributionQuotationLine.findFirst.mockResolvedValue(null);
    mocks.transaction.distributionQuotationLine.findMany.mockResolvedValue([]);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(createdQuotation);
    mocks.transaction.distributionQuotation.deleteMany.mockResolvedValue({ count: 1 });
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });
    mocks.reserveProcurementDocumentNumber.mockResolvedValue("QT-1");
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it("returns size-wise booked quantities for every quotation line", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValue({
      ...createdQuotation,
      childQuotations: [],
    });
    const result = await getDistributionQuotation("internal-org-1", "quotation-1");

    expect(mocks.prisma.distributionQuotation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "quotation-1" },
    }));
    expect(result.quotation.lines[0]).toMatchObject({
      bookingNo: "BK-1",
      quantity: 30,
      sizes: [
        { size: "M", bookedQuantity: 20 },
        { size: "S", bookedQuantity: 10 },
      ],
    });
  });

  it("returns active persisted Contact Roles for direct contacts and linked Dealers", async () => {
    mocks.prisma.distributionOrderForm.findMany.mockResolvedValue([
      {
        id: "form-contact",
        order_form_no: "OF-1",
        order_form_date: new Date("2026-10-07T00:00:00.000Z"),
        customer: "Contact A",
        contact_id: "contact-1",
        vendor_id: null,
        status: "DRAFT",
        quotation_id: null,
        total_quantity: 10,
        subtotal: new Prisma.Decimal("25.00"),
        created_at: new Date("2026-10-07T00:00:00.000Z"),
        lines: [],
      },
      {
        id: "form-vendor",
        order_form_no: "OF-2",
        order_form_date: new Date("2026-10-07T00:00:00.000Z"),
        customer: "Dealer A",
        contact_id: null,
        vendor_id: "vendor-1",
        status: "DRAFT",
        quotation_id: null,
        total_quantity: 20,
        subtotal: new Prisma.Decimal("50.00"),
        created_at: new Date("2026-10-07T00:00:00.000Z"),
        lines: [],
      },
    ]);
    mocks.prisma.masterVendor.findMany.mockResolvedValue([{ id: "vendor-1", contact_id: "contact-2" }]);
    mocks.prisma.contactRoleAssignment.findMany.mockResolvedValue([
      { contact_id: "contact-1", role_code: "CUSTOMER", role: { label: "Customer" } },
      { contact_id: "contact-2", role_code: "DEALER", role: { label: "Dealer" } },
    ]);

    const result = await listDistributionOrderForms("internal-org-1");

    expect(mocks.prisma.masterVendor.findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["vendor-1"] } },
      select: { id: true, contact_id: true },
    });
    expect(mocks.prisma.contactRoleAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        contact_id: { in: ["contact-1", "contact-2"] },
        is_active: true,
        role: { is_active: true },
      }),
    }));
    expect(result.map((form) => form.contactRole)).toEqual(["Customer", "Dealer"]);
  });

  it("keeps ordinary master sales order reads summary-only", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValueOnce({
      ...createdQuotation,
      mode: "MASTER",
      lines: [],
      childQuotations: [],
    });

    const result = await getDistributionQuotation("internal-org-1", "quotation-1", { masterOrder: true });

    expect(mocks.prisma.distributionQuotation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "quotation-1", mode: "MASTER" },
      include: expect.objectContaining({ lines: expect.objectContaining({ take: 0 }) }),
    }));
    expect(mocks.prisma.distributionQuotation.findFirst.mock.calls[0][0].include.childQuotations)
      .toEqual({ select: expect.objectContaining({ quotation_no: true }) });
    expect(mocks.prisma.distributionQuotation.findFirst.mock.calls[0][0].include).not.toHaveProperty("organization");
    expect(mocks.prisma.distributionQuotation.findFirst).toHaveBeenCalledTimes(1);
    expect(result.quotation.lines).toEqual([]);
    expect(result.children).toEqual([]);
    expect(result).not.toHaveProperty("salesOrderDocument");
  });

  it("loads linked line items and party details only for a Sales Order PDF", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValueOnce({
      ...createdQuotation,
      mode: "MASTER",
      lines: [],
      childQuotations: [{
        ...createdQuotation,
        notes: "Delivery terms apply.",
        lines: createdQuotation.lines,
        vendor: {
          vendor: "Quotation Vendor",
          gst_number: "QUOTE-GST",
          registered_state: "Quote State",
          contact: {
            legal_name: "Quotation Vendor Legal",
            email: "quote@example.com",
            phone: "0987654321",
            addresses: [{
              usage: "BILLING",
              address_line_1: "20 Quote Road",
              address_line_2: null,
              city: "Quote City",
              state_name: "Quote State",
              postal_code: "654321",
              country_code: "IN",
              is_default_billing: true,
              is_default_shipping: false,
              tax_registration: { gstin: "ADDRESS-GST" },
            }],
          },
        },
      }],
      organization: {
        organization_name: "Seller Ltd",
        organization_email: "sales@example.com",
        gst_number: "SELLER-GST",
        mobile_number: "1234567890",
        address_line_1: "1 Main Street",
        address_line_2: null,
        city: "City",
        state: "State",
        country: "India",
        pin_code: "123456",
      },
      vendor: null,
    });

    const result = await getDistributionQuotation("internal-org-1", "quotation-1", {
      masterOrder: true,
      salesOrderDocument: true,
    });

    const include = mocks.prisma.distributionQuotation.findFirst.mock.calls[0][0].include;
    expect(include.childQuotations).toHaveProperty("include.lines");
    expect(include).toHaveProperty("organization.select.organization_name", true);
    expect(result.salesOrderDocument).toMatchObject({
      seller: { name: "Seller Ltd", gstin: "SELLER-GST", address: "1 Main Street, City, State, 123456, India" },
      buyer: { name: "Master Vendor A" },
    });
    expect(result.children[0]).toMatchObject({
      quotationNo: "QT-1",
      notes: "Delivery terms apply.",
      lines: [{ description: "Brand Style", quantity: 30, lineTotal: "0.00" }],
      quotationParty: {
        name: "Quotation Vendor",
        legalName: "Quotation Vendor Legal",
        gstin: "QUOTE-GST",
        billingAddress: {
          lines: ["20 Quote Road", "Quote City", "Quote State", "654321", "IN"],
          gstin: "ADDRESS-GST",
        },
      },
    });
    expect(include.childQuotations.include).toHaveProperty("vendor.select.contact.select.addresses");
  });

  it("skips child-quotation relations for a quotation detail", async () => {
    mocks.prisma.distributionQuotation.findFirst.mockResolvedValueOnce({
      ...createdQuotation,
      childQuotations: undefined,
    });

    const result = await getDistributionQuotation("internal-org-1", "quotation-1", { includeChildren: false });

    expect(mocks.prisma.distributionQuotation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "quotation-1" },
      include: expect.not.objectContaining({ childQuotations: expect.anything() }),
    }));
    expect(result.children).toEqual([]);
  });

  it("loads quotation registers from summary fields without fetching detail lines", async () => {
    mocks.prisma.distributionQuotation.findMany.mockResolvedValue([{
      id: "quotation-1",
      quotation_no: "QT-1",
      quotation_date: new Date("2026-10-07T00:00:00.000Z"),
      order_no: "ORD-1",
      customer: "Vendor A",
      mode: "SINGLE",
      status: "DRAFT",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
      parent_quotation_id: null,
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      vendor_id: "vendor-1",
      orderForms: [],
    }, {
      id: "quotation-2",
      quotation_no: "QT-2",
      quotation_date: new Date("2026-10-06T00:00:00.000Z"),
      order_no: "ORD-2",
      customer: "Contact B",
      mode: "SINGLE",
      status: "DRAFT",
      total_quantity: 10,
      subtotal: new Prisma.Decimal("5.00"),
      parent_quotation_id: null,
      created_at: new Date("2026-10-06T00:00:00.000Z"),
      vendor_id: null,
      orderForms: [{ contact_id: "contact-2", vendor_id: null }],
    }]);
    mocks.prisma.masterVendor.findMany.mockResolvedValue([
      { id: "vendor-1", contact_id: "contact-1" },
    ]);
    mocks.prisma.contactRoleAssignment.findMany.mockResolvedValue([
      { contact_id: "contact-1", role: { label: "Dealer" } },
      { contact_id: "contact-2", role: { label: "Customer" } },
    ]);

    const result = await listDistributionQuotations("internal-org-1");

    expect(mocks.prisma.distributionQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1" },
      select: expect.objectContaining({
        id: true,
        quotation_no: true,
        subtotal: true,
        vendor_id: true,
        orderForms: expect.anything(),
      }),
      take: 500,
    }));
    expect(mocks.prisma.distributionQuotation.findMany.mock.calls[0][0].select).not.toHaveProperty("lines");
    expect(mocks.prisma.masterVendor.findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["vendor-1"] } },
      select: { id: true, contact_id: true },
    });
    expect(mocks.prisma.contactRoleAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        contact_id: { in: ["contact-1", "contact-2"] },
        is_active: true,
        role: { is_active: true },
      }),
    }));
    expect(result.quotations[0]).toMatchObject({
      id: "quotation-1",
      quotationNo: "QT-1",
      subtotal: "12.50",
      contactRole: "Dealer",
    });
    expect(result.quotations[1].contactRole).toBe("Customer");
    expect(result.quotations[0]).not.toHaveProperty("lines");
  });

  it("creates a quotation transactionally and returns only fields needed by the creation screen", async () => {
    const result = await createDistributionQuotationFromBookings(
      "internal-org-1",
      "user-1",
      ["booking-1", "booking-2"],
      "vendor-1",
      null,
    );

    expect(result).toMatchObject({
      id: "quotation-1",
      quotationNo: "QT-1",
      customer: "Master Vendor A",
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        vendor_id: "vendor-1",
        created_by: "user-1",
        mode: "MULTIPLE",
        lines: { create: expect.arrayContaining([
          expect.objectContaining({ source_booking_id: "booking-1", quantity: 30 }),
          expect.objectContaining({ source_booking_id: "booking-2", quantity: 20 }),
        ]) },
      }),
      select: {
        id: true,
        quotation_no: true,
        customer: true,
      },
    }));
    expect(mocks.transaction.advanceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: { in: ["booking-1", "booking-2"] } },
      include: expect.objectContaining({
        quotationLines: { select: { booking_no: true }, take: 1 },
      }),
    }));
    const createdData = mocks.transaction.distributionQuotation.create.mock.calls[0][0].data;
    expect(createdData.organization_id).toBe("internal-org-1");
    expect(createdData.lines.create).toHaveLength(2);
    expect(createdData.lines.create.every((quotationLine: Record<string, unknown>) =>
      !Object.prototype.hasOwnProperty.call(quotationLine, "organization_id") &&
      !Object.prototype.hasOwnProperty.call(quotationLine, "size"),
    )).toBe(true);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledOnce();
    expect(result).not.toHaveProperty("lines");
  });

  it("allows bookings from different vendors and rejects duplicate quotations", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([
      booking("booking-1", "BK-1"),
      booking("booking-2", "BK-2", "vendor-2"),
    ]);
    await expect(createDistributionQuotationFromBookings("internal-org-1", "user-1", ["booking-1", "booking-2"], "vendor-1"))
      .resolves.toMatchObject({ quotationNo: "QT-1" });

    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      ...booking("booking-1", "BK-1"),
      quotationLines: [{ booking_no: "BK-1" }],
    }]);
    await expect(createDistributionQuotationFromBookings("internal-org-1", "user-1", ["booking-1"], "vendor-1"))
      .rejects.toThrow("already has a quotation");
  });

  it("creates a quotation for a booking without an End Customer", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([
      booking("booking-1", "BK-1", null, null),
    ]);

    await expect(createDistributionQuotationFromBookings(
      "internal-org-1",
      "user-1",
      ["booking-1"],
      "vendor-1",
    )).resolves.toMatchObject({
      quotationNo: "QT-1",
    });
    expect(mocks.transaction.masterVendor.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: "vendor-1", is_active: true },
      select: { id: true, vendor: true },
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendor_id: "vendor-1",
        customer: "Master Vendor A",
      }),
    }));
    expect(mocks.transaction.contactRoleSetting.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction.contactDistributorDealerAssignment.findMany).not.toHaveBeenCalled();
  });

  it("creates a quotation for any organization Contact Master contact", async () => {
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([booking("booking-1", "BK-1")]);
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      legal_name: "ACME GARMENTS",
      display_name: "ACME",
    });
    mocks.transaction.masterVendor.findFirst.mockResolvedValueOnce(null);

    await createDistributionQuotationFromBookings(
      "internal-org-1",
      "user-1",
      ["booking-1"],
      null,
      "contact-1",
    );

    expect(mocks.transaction.contact.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: "contact-1" },
      select: { id: true, legal_name: true, display_name: true },
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vendor_id: null,
        customer: "ACME",
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        vendor_id: null,
        contact_id: "contact-1",
      }),
    }), mocks.transaction);
  });

  it("requires an active Dealer from Vendor Master", async () => {
    mocks.transaction.masterVendor.findFirst.mockResolvedValue(null);
    await expect(createDistributionQuotationFromBookings("internal-org-1", "user-1", ["booking-1"], "inactive-vendor"))
      .rejects.toThrow("active Dealer from Vendor Master");
    expect(mocks.transaction.distributionQuotation.create).not.toHaveBeenCalled();
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
      total_quantity: 100,
      subtotal: new Prisma.Decimal("25.00"),
      lines: [],
    };
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue(childQuotes);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(master);
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 2 });
    mocks.reserveProcurementDocumentNumber.mockResolvedValue("MQT-1");

    const result = await createDistributionMasterQuotations("internal-org-1", "user-1", ["quote-1", "quote-2"], "vendor-1");

    expect(result).toMatchObject([{ id: "master-1", quotationNo: "MQT-1", mode: "MASTER", totalQuantity: 100 }]);
    expect(mocks.transaction.masterVendor.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: "vendor-1", is_active: true },
      select: { id: true, vendor: true, contact_id: true },
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: "vendor-1", customer: "Master Vendor A" }),
    }));
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

  it("creates a sales order from a single quotation", async () => {
    const child = {
      id: "quote-1",
      quotation_no: "QT-1",
      order_no: "ORD-1",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
    };
    const master = {
      ...createdQuotation,
      id: "master-single",
      quotation_no: "MQT-SINGLE",
      mode: "MASTER",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
      lines: [],
    };
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([child]);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(master);
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });

    const result = await createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      "vendor-1",
    );

    expect(result).toMatchObject([{ id: "master-single", mode: "MASTER", totalQuantity: 30 }]);
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["quote-1"] } }),
      data: { parent_quotation_id: "master-single" },
    }));
  });

  it("creates a sales order for any organization Contact Master contact", async () => {
    const child = {
      id: "quote-1",
      quotation_no: "QT-1",
      order_no: "ORD-1",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
    };
    const master = {
      ...createdQuotation,
      id: "master-contact",
      vendor_id: null,
      customer: "ACME",
      quotation_no: "MQT-CONTACT",
      mode: "MASTER",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
      lines: [],
    };
    mocks.transaction.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      legal_name: "ACME GARMENTS",
      display_name: "ACME",
    });
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([child]);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(master);
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });

    await expect(createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      null,
      "contact-1",
    )).resolves.toMatchObject([{ id: "master-contact", customer: "ACME", mode: "MASTER" }]);

    expect(mocks.transaction.contact.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: "contact-1" },
      select: { id: true, legal_name: true, display_name: true },
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: null, customer: "ACME" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        vendor_id: null,
        contact_id: "contact-1",
        contact_name: "ACME",
      }),
    }), mocks.transaction);
  });

  it("uses the mapped Distributor as bill-to when the Dealer setting is enabled", async () => {
    const child = {
      id: "quote-1",
      quotation_no: "QT-1",
      order_no: "ORD-1",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
      vendor: { contact_id: "dealer-contact" },
    };
    const master = {
      ...createdQuotation,
      id: "master-distributor",
      vendor_id: null,
      customer: "DISTRIBUTOR CONTACT",
      quotation_no: "MQT-DISTRIBUTOR",
      mode: "MASTER",
      total_quantity: 30,
      subtotal: new Prisma.Decimal("12.50"),
      lines: [],
    };
    mocks.transaction.masterVendor.findFirst
      .mockResolvedValueOnce({ id: "dealer-vendor", vendor: "DEALER VENDOR", contact_id: "dealer-contact" });
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([child]);
    mocks.transaction.contactDistributorDealerAssignment.findMany.mockResolvedValue([{
      dealer_id: "dealer-contact",
      distributor_id: "distributor-contact",
    }]);
    mocks.transaction.contactRoleSetting.findMany.mockResolvedValue([
      {
        contact_id: "distributor-contact",
        mapped_contact_id: null,
        always_bill_to_distributor: false,
        use_common_settings: false,
      },
      {
        contact_id: "distributor-contact",
        mapped_contact_id: "dealer-contact",
        always_bill_to_distributor: true,
        use_common_settings: false,
      },
    ]);
    mocks.transaction.contact.findMany.mockResolvedValue([{
      id: "distributor-contact",
      legal_name: "DISTRIBUTOR LEGAL NAME",
      display_name: "DISTRIBUTOR CONTACT",
    }]);
    mocks.transaction.distributionQuotation.create.mockResolvedValue(master);
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });

    await expect(createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      "dealer-vendor",
    )).resolves.toMatchObject([{ customer: "DISTRIBUTOR CONTACT", mode: "MASTER" }]);

    expect(mocks.transaction.contactDistributorDealerAssignment.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        dealer_id: { in: ["dealer-contact"] },
      },
      select: { dealer_id: true, distributor_id: true },
    });
    expect(mocks.transaction.contactRoleSetting.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        contact_id: { in: ["distributor-contact"] },
        role_code: "DISTRIBUTOR",
      },
      select: {
        contact_id: true,
        mapped_contact_id: true,
        always_bill_to_distributor: true,
        use_common_settings: true,
      },
    });
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ vendor_id: null, customer: "DISTRIBUTOR CONTACT" }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        bill_to_distributor_contact_id: "distributor-contact",
        dealer_contact_ids: ["dealer-contact"],
        bill_to_distributor_name: "DISTRIBUTOR CONTACT",
      }),
    }), mocks.transaction);
  });

  it("creates separate sales orders for quotations billed to different Distributors", async () => {
    const children = [
      {
        id: "quote-a",
        quotation_no: "QT-A",
        order_no: "ORD-A",
        total_quantity: 10,
        subtotal: new Prisma.Decimal("100"),
        vendor: { contact_id: "dealer-a" },
      },
      {
        id: "quote-b",
        quotation_no: "QT-B",
        order_no: "ORD-B",
        total_quantity: 20,
        subtotal: new Prisma.Decimal("200"),
        vendor: { contact_id: "dealer-b" },
      },
    ];
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue(children);
    mocks.transaction.contactDistributorDealerAssignment.findMany.mockResolvedValue([
      { dealer_id: "dealer-a", distributor_id: "distributor-a" },
      { dealer_id: "dealer-b", distributor_id: "distributor-b" },
    ]);
    mocks.transaction.contactRoleSetting.findMany.mockResolvedValue([
      {
        contact_id: "distributor-a",
        mapped_contact_id: "dealer-a",
        always_bill_to_distributor: true,
        use_common_settings: false,
      },
      {
        contact_id: "distributor-b",
        mapped_contact_id: "dealer-b",
        always_bill_to_distributor: true,
        use_common_settings: false,
      },
    ]);
    mocks.transaction.contact.findMany.mockResolvedValue([
      { id: "distributor-a", legal_name: "DIST A", display_name: "DIST A" },
      { id: "distributor-b", legal_name: "DIST B", display_name: "DIST B" },
    ]);
    mocks.transaction.masterVendor.findMany.mockResolvedValue([]);
    let createdMasterCount = 0;
    mocks.transaction.distributionQuotation.create.mockImplementation(async ({ data }) => {
      createdMasterCount += 1;
      return {
        ...createdQuotation,
        id: `master-${createdMasterCount}`,
        quotation_no: `MQT-${createdMasterCount}`,
        customer: data.customer,
        mode: "MASTER",
        total_quantity: data.total_quantity,
        subtotal: data.subtotal,
        lines: [],
      };
    });
    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 1 });
    mocks.reserveProcurementDocumentNumber
      .mockResolvedValueOnce("MQT-1")
      .mockResolvedValueOnce("MQT-2");

    const result = await createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-a", "quote-b"],
      "vendor-1",
    );

    expect(result).toHaveLength(2);
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ customer: "DIST A", mode: "MASTER" }),
      }),
    );
    expect(mocks.transaction.distributionQuotation.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ customer: "DIST B", mode: "MASTER" }),
      }),
    );
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["quote-a"] } }) }),
    );
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["quote-b"] } }) }),
    );
  });

  it("rejects a Contact Master contact from outside the organization", async () => {
    mocks.transaction.contact.findFirst.mockResolvedValue(null);

    await expect(createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      null,
      "foreign-contact",
    )).rejects.toThrow("Select a Contact Master contact from this organization.");

    expect(mocks.transaction.distributionQuotation.create).not.toHaveBeenCalled();
  });

  it("rejects inactive or cross-organization vendors before creating a master quotation", async () => {
    mocks.transaction.masterVendor.findFirst.mockResolvedValue(null);

    await expect(createDistributionMasterQuotations(
      "internal-org-1",
      "user-1",
      ["quote-1", "quote-2"],
      "foreign-vendor",
    )).rejects.toThrow("Select an active Vendor Master vendor.");

    expect(mocks.transaction.distributionQuotation.create).not.toHaveBeenCalled();
  });

  it("deletes a draft master header and unlinks its child quotations without deleting them", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "master-1",
      quotation_no: "MQT-1",
      mode: "MASTER",
      status: "DRAFT",
      parent_quotation_id: null,
      lines: [],
      childQuotations: [{ id: "quote-1", quotation_no: "QT-1" }, { id: "quote-2", quotation_no: "QT-2" }],
    }]);

    mocks.transaction.distributionQuotation.updateMany.mockResolvedValue({ count: 2 });
    const result = await deleteDistributionQuotation("internal-org-1", "user-1", "master-1");

    expect(result).toEqual({
      id: "master-1",
      quotationNo: "MQT-1",
      mode: "MASTER",
      unlinkedQuotationCount: 2,
      reopenedOrderFormCount: 0,
    });
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["quote-1", "quote-2"] }, parent_quotation_id: "master-1" },
      data: { parent_quotation_id: null },
    });
    expect(mocks.transaction.distributionQuotation.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["master-1"] },
        status: "DRAFT",
        parent_quotation_id: null,
      },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELETE_DISTRIBUTION_MASTER_QUOTATION",
      entityId: "master-1",
    }), mocks.transaction);
  });

  it("requires deleting the master before a child and protects non-draft quotations", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "quote-1",
      quotation_no: "QT-1",
      mode: "SINGLE",
      status: "DRAFT",
      parent_quotation_id: "master-1",
      lines: [],
      childQuotations: [],
    }]);
    await expect(deleteDistributionQuotation("internal-org-1", "user-1", "quote-1"))
      .rejects.toThrow("Delete the parent sales order first");
    expect(mocks.transaction.distributionQuotation.deleteMany).not.toHaveBeenCalled();

    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "quote-1",
      quotation_no: "QT-1",
      mode: "SINGLE",
      status: "APPROVED",
      parent_quotation_id: null,
      lines: [],
      childQuotations: [],
    }]);
    await expect(deleteDistributionQuotation("internal-org-1", "user-1", "quote-1"))
      .rejects.toThrow("Only draft quotations can be deleted");
  });

  it("deletes an ungrouped draft quotation and audits the source booking references", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "quote-1",
      quotation_no: "QT-1",
      mode: "SINGLE",
      status: "DRAFT",
      parent_quotation_id: null,
      lines: [{ booking_no: "BK-1" }],
      childQuotations: [],
    }]);

    await deleteDistributionQuotation("internal-org-1", "user-1", "quote-1");

    expect(mocks.transaction.distributionQuotation.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["quote-1"] },
        status: "DRAFT",
        parent_quotation_id: null,
      },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "DELETE_DISTRIBUTION_QUOTATION",
      details: expect.objectContaining({ booking_nos: ["BK-1"] }),
    }), mocks.transaction);
  });

  it("reopens converted order forms when deleting their draft quotation", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "quote-1",
      quotation_no: "QT-1",
      mode: "SINGLE",
      status: "DRAFT",
      parent_quotation_id: null,
      lines: [],
      childQuotations: [],
    }]);
    mocks.transaction.distributionOrderForm.findMany.mockResolvedValue([
      {
        id: "order-form-1",
        order_form_no: "OF-1",
        quotation_id: "quote-1",
        status: "CONVERTED",
      },
    ]);
    mocks.transaction.distributionOrderForm.updateMany.mockResolvedValue({ count: 1 });

    const deleted = await deleteDistributionQuotation("internal-org-1", "user-1", "quote-1");

    expect(deleted).toMatchObject({ reopenedOrderFormCount: 1 });
    expect(mocks.transaction.distributionOrderForm.findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", quotation_id: { in: ["quote-1"] } },
      select: { id: true, order_form_no: true, quotation_id: true, status: true },
    });
    expect(mocks.transaction.distributionOrderForm.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["order-form-1"] },
        quotation_id: { in: ["quote-1"] },
        status: "CONVERTED",
      },
      data: { quotation_id: null, status: "DRAFT" },
    });
    expect(mocks.transaction.distributionQuotation.deleteMany).toHaveBeenCalled();
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "REOPEN_DISTRIBUTION_ORDER_FORM",
      entityType: "DistributionOrderForm",
      entityId: "order-form-1",
      details: expect.objectContaining({ previous_status: "CONVERTED", status: "DRAFT" }),
    }), mocks.transaction);
  });

  it("does not delete a quotation linked to an order form in another lifecycle state", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "quote-1",
      quotation_no: "QT-1",
      mode: "SINGLE",
      status: "DRAFT",
      parent_quotation_id: null,
      lines: [],
      childQuotations: [],
    }]);
    mocks.transaction.distributionOrderForm.findMany.mockResolvedValue([{
      id: "order-form-1",
      order_form_no: "OF-1",
      quotation_id: "quote-1",
      status: "APPROVED",
    }]);

    await expect(deleteDistributionQuotation("internal-org-1", "user-1", "quote-1"))
      .rejects.toThrow("Cannot reopen distribution order form OF-1");

    expect(mocks.transaction.distributionOrderForm.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.distributionQuotation.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes multiple ungrouped draft quotations atomically and audits each record", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([
      {
        id: "quote-1",
        quotation_no: "QT-1",
        mode: "SINGLE",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [{ booking_no: "BK-1" }],
        childQuotations: [],
      },
      {
        id: "quote-2",
        quotation_no: "QT-2",
        mode: "MULTIPLE",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [{ booking_no: "BK-2" }],
        childQuotations: [],
      },
    ]);
    mocks.transaction.distributionQuotation.deleteMany.mockResolvedValue({ count: 2 });

    const result = await deleteDistributionQuotations("internal-org-1", "user-1", ["quote-1", "quote-2"]);

    expect(result).toEqual([
      { id: "quote-1", quotationNo: "QT-1", mode: "SINGLE", unlinkedQuotationCount: 0, reopenedOrderFormCount: 0 },
      { id: "quote-2", quotationNo: "QT-2", mode: "MULTIPLE", unlinkedQuotationCount: 0, reopenedOrderFormCount: 0 },
    ]);
    expect(mocks.transaction.distributionQuotation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: { in: ["quote-1", "quote-2"] } },
    }));
    expect(mocks.transaction.distributionQuotation.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["quote-1", "quote-2"] },
        status: "DRAFT",
        parent_quotation_id: null,
      },
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("deletes selected sales orders and unlinks, but does not delete, their regular quotations", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([
      {
        id: "master-1",
        quotation_no: "MQT-1",
        mode: "MASTER",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [{ id: "quote-1", quotation_no: "QT-1" }],
      },
      {
        id: "master-2",
        quotation_no: "MQT-2",
        mode: "MASTER",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [{ id: "quote-2", quotation_no: "QT-2" }],
      },
    ]);
    mocks.transaction.distributionQuotation.deleteMany.mockResolvedValue({ count: 2 });

    const result = await deleteDistributionQuotations("internal-org-1", "user-1", ["master-1", "master-2"]);

    expect(result).toEqual([
      { id: "master-1", quotationNo: "MQT-1", mode: "MASTER", unlinkedQuotationCount: 1, reopenedOrderFormCount: 0 },
      { id: "master-2", quotationNo: "MQT-2", mode: "MASTER", unlinkedQuotationCount: 1, reopenedOrderFormCount: 0 },
    ]);
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.distributionQuotation.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["quote-1"] },
        parent_quotation_id: "master-1",
      },
      data: { parent_quotation_id: null },
    });
  });

  it("blocks bulk deletion when a source booking still has GRN fulfillment", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([{
      id: "master-1",
      quotation_no: "MQT-1",
      mode: "MASTER",
      status: "DRAFT",
      parent_quotation_id: null,
      lines: [],
      childQuotations: [{ id: "quote-1", quotation_no: "QT-1" }],
    }]);
    mocks.transaction.distributionQuotationLine.findMany.mockResolvedValue([
      { source_booking_id: "booking-1" },
    ]);
    mocks.transaction.advanceBooking.findMany.mockResolvedValue([{
      booking_no: "BK-1",
      sizeLines: [{
        assignments: [{
          grnAllocations: [{ id: "allocation-1" }],
          finishedGoodsStockReceipts: [{ id: "receipt-1" }],
        }],
      }],
    }]);

    await expect(deleteDistributionQuotations("internal-org-1", "user-1", ["master-1"]))
      .rejects.toThrow("Booking BK-1 has Work Order GRN fulfillment");

    expect(mocks.transaction.distributionQuotation.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.distributionQuotation.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid member of a bulk selection without deleting any record", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([
      {
        id: "quote-1",
        quotation_no: "QT-1",
        mode: "SINGLE",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [],
      },
      {
        id: "quote-2",
        quotation_no: "QT-2",
        mode: "SINGLE",
        status: "APPROVED",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [],
      },
    ]);

    await expect(deleteDistributionQuotations("internal-org-1", "user-1", ["quote-1", "quote-2"]))
      .rejects.toThrow("Only draft quotations can be deleted");

    expect(mocks.transaction.distributionQuotation.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects mixed sales-order and quotation selections before unlinking or deleting", async () => {
    mocks.transaction.distributionQuotation.findMany.mockResolvedValue([
      {
        id: "master-1",
        quotation_no: "MQT-1",
        mode: "MASTER",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [{ id: "quote-1", quotation_no: "QT-1" }],
      },
      {
        id: "quote-1",
        quotation_no: "QT-1",
        mode: "SINGLE",
        status: "DRAFT",
        parent_quotation_id: null,
        lines: [],
        childQuotations: [],
      },
    ]);

    await expect(deleteDistributionQuotations("internal-org-1", "user-1", ["master-1", "quote-1"]))
      .rejects.toThrow("Delete sales orders and regular quotations in separate selections");

    expect(mocks.transaction.distributionQuotation.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.distributionQuotation.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects duplicate IDs before opening a transaction", async () => {
    await expect(deleteDistributionQuotations("internal-org-1", "user-1", ["quote-1", "quote-1"]))
      .rejects.toThrow("unique quotations");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
