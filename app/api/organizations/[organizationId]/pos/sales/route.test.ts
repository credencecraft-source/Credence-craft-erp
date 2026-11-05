import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  organizationFindFirst: vi.fn(),
  createPosGeneralStockSale: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
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
}));

import { GET, POST } from "./route";

describe("POS sales invoice detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
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
      include: { lines: true },
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
      issuer: { name: "Example Organization", gstNumber: "29ABCDE1234F1Z5" },
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
          invoiceDate: "2026-10-17",
          taxMode: "LOCAL",
          customerContactId: "customer-contact-1",
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

    expect(response.status).toBe(201);
    expect(mocks.createPosGeneralStockSale).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      customerContactId: "customer-contact-1",
      lines: [expect.objectContaining({
        stockId: "sku-stock-1",
        stockType: "SKU",
      })],
    }));
    expect(data.invoice.invoiceNo).toBe("POS-0001");
  });

  it("returns a bounded summary page without loading invoice lines", async () => {
    const postedAt = new Date("2026-10-17T00:00:00Z");
    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "invoice-record-1",
        invoice_no: "POS-0001",
        invoice_date: postedAt,
        customer: "Customer",
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
    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0].lines).toEqual([]);
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
});
