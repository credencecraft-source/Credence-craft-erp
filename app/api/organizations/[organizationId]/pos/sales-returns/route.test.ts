import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPosSalesReturn: vi.fn(),
  listPosSalesReturns: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-sales-return-service", () => ({
  createPosSalesReturn: mocks.createPosSalesReturn,
  encodePosSalesReturnCursor: vi.fn(),
  listPosSalesReturns: mocks.listPosSalesReturns,
  parsePosSalesReturnCursor: vi.fn(() => null),
  PosSalesReturnError: class PosSalesReturnError extends Error {
    constructor(message: string, readonly status: number = 400) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };

describe("POS sales returns route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosSalesReturns.mockResolvedValue({ returns: [], nextCursor: null });
    mocks.createPosSalesReturn.mockResolvedValue({ returnNumber: "SR-1", duplicate: false });
  });

  it("lists organization returns using the authorized internal organization id", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns?limit=20&search=mobile"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.listPosSalesReturns).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      search: "mobile",
      take: 20,
      cursor: null,
    });
  });

  it("rejects malformed return lines before invoking the service", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: "POS-1",
          requestKey: "request-1",
          reason: "Customer return",
          lines: [{ invoiceLineId: "line-1", quantity: "1" }],
        }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.createPosSalesReturn).not.toHaveBeenCalled();
  });

  it("posts validated quantities for the tenant and returns the created credit note", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: "POS-1",
          requestKey: "request-1",
          reason: "Customer return",
          settlementType: "STORE_CREDIT",
          refundMethod: null,
          lines: [{ invoiceLineId: "line-1", quantity: 1 }],
        }),
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "CREATE_POS_SALES_RETURNS",
    );
    expect(mocks.createPosSalesReturn).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      invoiceNumber: "POS-1",
      requestKey: "request-1",
      reason: "Customer return",
      settlementType: "STORE_CREDIT",
      refundMethod: null,
      lines: [{ invoiceLineId: "line-1", quantity: 1 }],
    });
    expect(await response.json()).toEqual({
      salesReturn: { returnNumber: "SR-1", duplicate: false },
    });
  });

  it("does not create a POS sales return when the dedicated permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: "POS-1",
          requestKey: "request-denied",
          reason: "Customer return",
          settlementType: "STORE_CREDIT",
          lines: [{ invoiceLineId: "line-1", quantity: 1 }],
        }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.createPosSalesReturn).not.toHaveBeenCalled();
  });
});
