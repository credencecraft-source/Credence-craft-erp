import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  invoiceFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { posSalesInvoice: { findMany: mocks.invoiceFindMany } },
}));
vi.mock("@/lib/services/pos/pos-general-stock-sale-service", () => ({
  createPosGeneralStockSale: vi.fn(),
}));

import { GET } from "./route";

describe("POS sales invoice detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.invoiceFindMany.mockResolvedValue([{
      id: "invoice-record-1",
      invoice_no: "POS-0001",
      invoice_date: new Date("2026-10-17T00:00:00Z"),
      customer: "Customer",
      subtotal: 100,
      tax_amount: 5,
      total_amount: 105,
      posted_at: new Date("2026-10-17T00:00:00Z"),
      lines: [],
    }]);
  });

  it("returns the selected invoice only within the authorized organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?invoiceNumber=POS-0001"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", invoice_no: "POS-0001" },
    }));
    expect((await response.json()).invoices[0].invoiceNumber).toBe("POS-0001");
  });

  it("returns not found for a missing organization-scoped invoice", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales?invoiceNumber=UNKNOWN"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(404);
  });
});
