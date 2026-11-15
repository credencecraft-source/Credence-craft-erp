import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  organizationFindFirst: vi.fn(),
  createPosGeneralStockSale: vi.fn(),
  isPosPurchaseRewardAvailable: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    posSalesInvoice: {
      findMany: mocks.invoiceFindMany,
      findFirst: mocks.invoiceFindFirst,
    },
    organization: {
      findFirst: mocks.organizationFindFirst,
    },
  },
}));
vi.mock("@/lib/services/pos/pos-general-stock-sale-service", () => ({
  createPosGeneralStockSale: mocks.createPosGeneralStockSale,
  isPosPurchaseRewardAvailable: mocks.isPosPurchaseRewardAvailable,
}));

import { GET, POST } from "./route";

describe("POS sales invoice detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.organizationFindFirst.mockResolvedValue({
      organization_name: "Example Organization",
      gst_number: "29ABCDE1234F1Z5",
      address_line_1: "1 Market Road",
      address_line_2: null,
      city: "Bengaluru",
      state: "Karnataka",
      pin_code: "560001",
    });
    mocks.createPosGeneralStockSale.mockResolvedValue({
      id: "invoice-1",
      invoiceNo: "POS-0001",
      invoiceDate: new Date("2026-10-17T00:00:00Z"),
      customer: "Customer",
      taxMode: "LOCAL",
      subtotal: "100.00",
      cgstAmount: "0.00",
      sgstAmount: "0.00",
      igstAmount: "0.00",
      taxAmount: "0.00",
      totalAmount: "100.00",
    });
    mocks.isPosPurchaseRewardAvailable.mockResolvedValue(true);
    mocks.invoiceFindFirst.mockResolvedValue({
      id: "invoice-record-1",
      invoice_no: "POS-0001",
      invoice_date: new Date("2026-10-17T00:00:00Z"),
      customer: "Customer",
      entity: { entity_name: "Store A" },
      shipping_address: {
        recipientName: "Store Customer",
        phone: "9876543210",
        addressLine1: "12 Market Road",
        addressLine2: null,
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560001",
        countryCode: "IN",
      },
      couponRedemption: {
        coupon_code: "REDEEMED-CODE",
        discount_amount: 15,
        coupon: {
          name: "WELCOME OFFER",
          discount_type: "PERCENTAGE",
          discount_value: 15,
        },
      },
      issuedCoupon: {
        coupon_code: "REWARD-CODE",
        expires_at: new Date("2026-12-17T00:00:00Z"),
        coupon: {
          name: "NEXT VISIT REWARD",
          discount_type: "FLAT_AMOUNT",
          discount_value: 100,
        },
      },
      subtotal: 100,
      coupon_discount_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      tax_amount: 5,
      total_amount: 105,
      posted_at: new Date("2026-10-17T00:00:00Z"),
      lines: [],
    });
  });

  it("returns the selected invoice only within the authorized organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?invoiceNumber=POS-0001"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    expect(mocks.invoiceFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", invoice_no: "POS-0001" },
      include: {
        lines: true,
        entity: { select: { entity_name: true } },
        couponRedemption: {
          select: {
            coupon_code: true,
            discount_amount: true,
            coupon: { select: { name: true, discount_type: true, discount_value: true } },
          },
        },
        issuedCoupon: {
          select: {
            coupon_code: true,
            expires_at: true,
            coupon: { select: { name: true, discount_type: true, discount_value: true } },
          },
        },
      },
    }));
    expect(mocks.organizationFindFirst).toHaveBeenCalledWith({
      where: { id: "internal-org-1" },
      select: {
        organization_name: true,
        gst_number: true,
        address_line_1: true,
        address_line_2: true,
        city: true,
        state: true,
        pin_code: true,
      },
    });
    expect((await response.json()).invoices[0]).toMatchObject({
      invoiceNumber: "POS-0001",
      shippingAddress: {
        recipientName: "Store Customer",
        addressLine1: "12 Market Road",
        postalCode: "560001",
      },
      issuer: { name: "Example Organization", gstNumber: "29ABCDE1234F1Z5" },
      appliedCouponCode: "REDEEMED-CODE",
      appliedCouponName: "WELCOME OFFER",
      appliedCouponDiscountType: "PERCENTAGE",
      appliedCouponDiscountValue: 15,
      appliedCouponDiscountAmount: 15,
      issuedCouponCode: "REWARD-CODE",
      issuedCouponExpiresAt: "2026-12-17",
      issuedCouponName: "NEXT VISIT REWARD",
      issuedCouponDiscountType: "FLAT_AMOUNT",
      issuedCouponDiscountValue: 100,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
    });
  });

  it("returns not found for a missing organization-scoped invoice", async () => {
    mocks.invoiceFindFirst.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?invoiceNumber=UNKNOWN"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(404);
  });

  it("loads invoice lines linked to SKU stock", async () => {
    mocks.invoiceFindFirst.mockResolvedValue({
      id: "invoice-record-1",
      invoice_no: "POS-0001",
      invoice_date: new Date("2026-10-17T00:00:00Z"),
      customer: "Customer",
      subtotal: 100,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      tax_amount: 5,
      total_amount: 105,
      posted_at: new Date("2026-10-17T00:00:00Z"),
      lines: [{
        sku_stock_id: "sku-stock-1",
        general_stock_receipt_id: null,
        style_name: "Rascal",
        order_no: "DIRECT",
        article_no: "DIRECT",
        size: "M",
        colour: "Black",
        quantity: "2.5",
        unit_rate: 100,
        gst_rate: 5,
        discount_percent: 0,
        taxable_amount: 100,
      }],
    });

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?invoiceNumber=POS-0001"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.invoices[0].lines[0].record).toMatchObject({
      id: "sku-stock-1",
      stock_type: "SKU",
      style_name: "Rascal",
    });
    expect(data.invoices[0].lines[0].quantity).toBe(2.5);
  });

  it("passes the selected General SKU type through the tenant-authorized sale route", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "sale-request-1",
          entityId: "entity-1",
          stockHierarchy: {
            entityId: "entity-1",
            divisionId: "division-1",
            locationId: "location-1",
            subLocationId: "sub-location-1",
            subSubLocationId: "leaf-1",
          },
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          customerContactId: "customer-contact-1",
          returnCreditApplications: [{ returnId: "return-1", amount: "12.50" }],
          lines: [{
            stockId: "sku-stock-1",
            stockType: "SKU",
            quantity: 1,
            rate: 100,
            gstRate: 0,
            discountPercent: 0,
            offerId: "offer-1",
          }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "CREATE_POS_SALES",
    );
    expect(mocks.createPosGeneralStockSale).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      customerContactId: "customer-contact-1",
      stockHierarchy: expect.objectContaining({ subSubLocationId: "leaf-1" }),
      returnCreditApplications: [{ returnId: "return-1", amount: "12.50" }],
      lines: [expect.objectContaining({
        stockId: "sku-stock-1",
        stockType: "SKU",
        offerId: "offer-1",
      })],
    }));
    expect(data.invoice.invoiceNo).toBe("POS-0001");
  });

  it("does not post a POS invoice when the dedicated permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "sale-request-denied",
          entityId: "entity-1",
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          customerContactId: "customer-contact-1",
          lines: [{ stockId: "sku-stock-1", quantity: 1, rate: 100, gstRate: 0, discountPercent: 0 }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("rejects a counter invoice without a complete stock hierarchy before posting", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "sale-missing-location",
          entityId: "entity-1",
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          customerContactId: "customer-contact-1",
          lines: [{ stockId: "sku-stock-1", quantity: 1, rate: 100, gstRate: 0, discountPercent: 0 }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("complete stock hierarchy");
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("rejects counter invoices without a registered customer", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "sale-request-1",
          entityId: "entity-1",
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          lines: [{
            stockId: "sku-stock-1",
            stockType: "SKU",
            quantity: 1,
            rate: 100,
            gstRate: 0,
            discountPercent: 0,
          }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("registered customer");
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("passes validated online shipping details to the authorized catalog-priced sale service", async () => {
    const shippingAddress = {
      recipientName: "Store Customer",
      phone: "9876543210",
      addressLine1: "12 Market Road",
      addressLine2: null,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      countryCode: "IN",
    };
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesChannel: "ONLINE_STORE",
          requestKey: "store-request-1",
          entityId: "entity-1",
          invoiceDate: "2026-10-17",
          customer: shippingAddress.recipientName,
          taxMode: "LOCAL",
          shippingAddress,
          lines: [{
            stockId: "sku-stock-1",
            stockType: "SKU",
            quantity: 1,
            rate: 1,
            gstRate: 0,
            discountPercent: 0,
          }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.createPosGeneralStockSale).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      salesChannel: "ONLINE_STORE",
      shippingAddress,
      lines: [expect.objectContaining({ stockId: "sku-stock-1", stockType: "SKU" })],
    }));
  });

  it("rejects online checkout without an address before calling the sale service", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesChannel: "ONLINE_STORE",
          requestKey: "store-request-missing-address",
          entityId: "entity-1",
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          lines: [{ stockId: "sku-stock-1", stockType: "SKU", quantity: 1, rate: 1, gstRate: 0, discountPercent: 0 }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("requires an Entity before creating a POS invoice", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: "sale-request-2",
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          lines: [{ stockId: "sku-stock-1", quantity: 1, rate: 100, gstRate: 0, discountPercent: 0 }],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.createPosGeneralStockSale).not.toHaveBeenCalled();
  });

  it("returns a bounded summary page without loading invoice lines", async () => {
    const postedAt = new Date("2026-10-17T00:00:00Z");
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-record-1",
        invoice_no: "POS-0001",
        invoice_date: postedAt,
        customer: "Customer",
        issuedCoupon: { id: "coupon-issue-1" },
        subtotal: 100,
        tax_amount: 5,
        total_amount: 105,
        posted_at: postedAt,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?search=customer"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        OR: [
          { invoice_no: { contains: "customer", mode: "insensitive" } },
          { customer: { contains: "customer", mode: "insensitive" } },
        ],
      }),
      select: expect.not.objectContaining({ lines: true }),
      take: 51,
    }));
    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        couponRedemption: { select: { id: true } },
        issuedCoupon: { select: { id: true } },
      }),
    }));
    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0].lines).toEqual([]);
    expect(data.invoices[0].hasCouponCode).toBe(true);
    expect(data.nextCursor).toBeNull();
  });

  it("rejects malformed cursors and out-of-range page sizes", async () => {
    const invalidCursorResponse = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?cursor=invalid"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const invalidLimitResponse = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?limit=101"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(invalidCursorResponse.status).toBe(400);
    expect(invalidLimitResponse.status).toBe(400);
    expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
  });

  it("checks purchase-reward availability within the authorized POS organization", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/organizations/public-org/pos/sales?rewardEligibility=true&invoiceDate=2026-11-07&subtotal=1000.00",
      ),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.isPosPurchaseRewardAvailable).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      invoiceDate: "2026-11-07",
      subtotal: "1000.00",
    });
    expect(await response.json()).toEqual({ available: true });
  });
});
