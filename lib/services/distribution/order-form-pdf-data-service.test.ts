import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  distributionOrderForm: { findFirst: vi.fn() },
  masterVendor: { findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
  organization: { findUnique: vi.fn() },
  getSizeGroupSizeOrderMapForOrganization: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    distributionOrderForm: mocks.distributionOrderForm,
    masterVendor: mocks.masterVendor,
    contact: mocks.contact,
    organization: mocks.organization,
  },
}));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  getSizeGroupSizeOrderMapForOrganization: mocks.getSizeGroupSizeOrderMapForOrganization,
  sortBySizeGroupOrder: <T>(values: T[], orderedSizes: string[], getSize: (value: T) => string) => {
    const order = new Map(orderedSizes.map((size, index) => [size, index]));
    return [...values].sort((a, b) => (order.get(getSize(a)) ?? 999) - (order.get(getSize(b)) ?? 999));
  },
}));

import { getDistributionOrderFormPdfData } from "./order-form-pdf-data-service";

describe("distribution Order Form PDF data service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSizeGroupSizeOrderMapForOrganization.mockResolvedValue(new Map([["sg-1", ["S", "M"]]]));
    mocks.distributionOrderForm.findFirst.mockResolvedValue({
      id: "form-1",
      order_form_no: "OF-1",
      order_form_date: new Date("2026-10-07T00:00:00.000Z"),
      customer: "Buyer A",
      status: "DRAFT",
      total_quantity: 30,
      quotation_id: null,
      created_at: new Date("2026-10-07T00:00:00.000Z"),
      vendor_id: "vendor-1",
      contact_id: null,
      lines: [{
        booking_no: "BK-1",
        order_no: "ORD-1",
        brand: "Brand",
        style_name: "Style",
        quantity: 30,
        sourceBooking: {
          order: { sizeGroup: "SG-1" },
          sizeLines: [
            { size: "M", booked_quantity: 20 },
            { size: "S", booked_quantity: 10 },
          ],
        },
      }],
    });
    mocks.masterVendor.findFirst.mockResolvedValue({
      id: "vendor-1",
      vendor: "Vendor A",
      contact_id: "contact-1",
      gst_number: "29ABCDE1234F1Z5",
      registered_state: null,
      registeredState: null,
      contact: {
        legal_name: "Vendor A Legal",
        display_name: "Vendor A",
        email: "vendor@example.com",
        phone: "9876543210",
        addresses: [{
          usage: "BILLING",
          address_line_1: "10 Market Road",
          address_line_2: null,
          city: "Bengaluru",
          state_name: "Karnataka",
          state_code: "29",
          postal_code: "560001",
          country_code: "IN",
          is_default_billing: true,
          is_default_shipping: false,
          tax_registration: { gstin: "29ABCDE1234F1Z5" },
        }],
      },
    });
    mocks.organization.findUnique.mockResolvedValue({
      organization_name: "Seller Ltd",
      organization_email: "seller@example.com",
      gst_number: "SELLER-GST",
      mobile_number: "1234567890",
      address_line_1: "1 Main Street",
      address_line_2: null,
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      pin_code: "560001",
    });
  });

  it("returns tenant-scoped Order Form, party, and ordered size details", async () => {
    const result = await getDistributionOrderFormPdfData("internal-org-1", "form-1");

    expect(mocks.distributionOrderForm.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "form-1" },
    }));
    expect(mocks.masterVendor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "vendor-1" },
    }));
    expect(mocks.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "internal-org-1" },
    }));
    expect(mocks.contact.findFirst).not.toHaveBeenCalled();
    expect(result.orderForm).toMatchObject({
      id: "form-1",
      orderFormNo: "OF-1",
      hasQuotation: false,
      lines: [{
        bookingNo: "BK-1",
        sizes: [{ size: "S", bookedQuantity: 10 }, { size: "M", bookedQuantity: 20 }],
      }],
    });
    expect(result.buyer).toMatchObject({
      name: "Vendor A",
      gstin: "29ABCDE1234F1Z5",
      billingAddress: { lines: ["10 Market Road", "Bengaluru", "Karnataka", "560001", "IN"] },
    });
  });

  it("does not return an Order Form from another organization", async () => {
    mocks.distributionOrderForm.findFirst.mockResolvedValue(null);

    await expect(getDistributionOrderFormPdfData("internal-org-1", "other-org-form"))
      .rejects.toThrow("The Order Form was not found in this organization.");
    expect(mocks.masterVendor.findFirst).not.toHaveBeenCalled();
    expect(mocks.organization.findUnique).not.toHaveBeenCalled();
  });
});
