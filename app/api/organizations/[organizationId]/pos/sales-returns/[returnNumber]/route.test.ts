import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getPosSalesReturn: vi.fn(),
  markPosSalesReturnRefunded: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-sales-return-service", () => ({
  getPosSalesReturn: mocks.getPosSalesReturn,
  markPosSalesReturnRefunded: mocks.markPosSalesReturnRefunded,
  PosSalesReturnError: class PosSalesReturnError extends Error {
    constructor(message: string, readonly status: number = 400) {
      super(message);
    }
  },
}));

import { PATCH } from "./route";

describe("POS sales-return refund route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.markPosSalesReturnRefunded.mockResolvedValue({ duplicate: false });
  });

  it("requires finance-level organization access and records a refund settlement", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/SR-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: "UPI-REF-1" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org", returnNumber: "SR-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "SETTLE_POS_SALES_RETURN_REFUNDS",
    );
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE"],
    );
    expect(mocks.markPosSalesReturnRefunded).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      returnNumber: "SR-1",
      reference: "UPI-REF-1",
    });
  });

  it("does not settle a POS refund when the dedicated permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await PATCH(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/SR-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: "UPI-REF-1" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org", returnNumber: "SR-1" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.markPosSalesReturnRefunded).not.toHaveBeenCalled();
  });

  it("rejects malformed refund references", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/organizations/public-org/pos/sales-returns/SR-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: { secret: true } }),
      }),
      { params: Promise.resolve({ organizationId: "public-org", returnNumber: "SR-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.markPosSalesReturnRefunded).not.toHaveBeenCalled();
  });
});
