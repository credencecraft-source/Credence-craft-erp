import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getPosSalesReturnInvoice: vi.fn(),
  searchPosSalesReturnInvoices: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-sales-return-service", () => ({
  getPosSalesReturnInvoice: mocks.getPosSalesReturnInvoice,
  parsePosSalesReturnCursor: vi.fn((value: string) => value === "valid" ? { id: "invoice-1", postedAt: new Date("2026-10-10T00:00:00.000Z") } : null),
  PosSalesReturnError: class PosSalesReturnError extends Error {
    constructor(message: string, readonly status: number = 400) {
      super(message);
    }
  },
  searchPosSalesReturnInvoices: mocks.searchPosSalesReturnInvoices,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };

describe("POS sales return invoice route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getPosSalesReturnInvoice.mockResolvedValue({ invoiceNumber: "POS-0001" });
    mocks.searchPosSalesReturnInvoices.mockResolvedValue({ invoices: [], nextCursor: null });
  });

  it("loads an invoice by number only after tenant authorization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/invoices?invoiceNumber=POS-0001"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.getPosSalesReturnInvoice).toHaveBeenCalledWith("internal-org-1", "POS-0001");
    expect(await response.json()).toEqual({ invoice: { invoiceNumber: "POS-0001" } });
  });

  it("denies invoice lookup without VIEW_POS_SALES_RETURNS", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: VIEW_POS_SALES_RETURNS permission is required."),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/invoices?search=INV"),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.searchPosSalesReturnInvoices).not.toHaveBeenCalled();
    expect(mocks.getPosSalesReturnInvoice).not.toHaveBeenCalled();
  });

  it("rejects short searches and invalid cursors without querying", async () => {
    const shortSearch = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/invoices?search=x"),
      context,
    );
    const invalidCursor = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/invoices?search=customer&cursor=invalid"),
      context,
    );

    expect(shortSearch.status).toBe(400);
    expect(invalidCursor.status).toBe(400);
    expect(mocks.searchPosSalesReturnInvoices).not.toHaveBeenCalled();
  });

  it("passes bounded invoice search to the service using the internal organization id", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/invoices?search=customer&limit=10&cursor=valid"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.searchPosSalesReturnInvoices).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      search: "customer",
      take: 10,
      cursor: { id: "invoice-1", postedAt: new Date("2026-10-10T00:00:00.000Z") },
    });
  });
});
