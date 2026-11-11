import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listAvailablePosSalesReturnCredits: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-sales-return-service", () => ({
  listAvailablePosSalesReturnCredits: mocks.listAvailablePosSalesReturnCredits,
}));

import { GET } from "./route";

describe("POS sales-return credits route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listAvailablePosSalesReturnCredits.mockResolvedValue([]);
  });

  it("returns available credits only after organization authorization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales/return-credits?customerContactId=customer-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    expect(mocks.listAvailablePosSalesReturnCredits).toHaveBeenCalledWith("internal-org-1", "customer-1");
  });

  it("denies credit lookup without VIEW_POS_SALES_RETURNS", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: VIEW_POS_SALES_RETURNS permission is required."),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales/return-credits?customerContactId=customer-1"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listAvailablePosSalesReturnCredits).not.toHaveBeenCalled();
  });

  it("rejects missing customers without calling the service", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/sales/return-credits"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listAvailablePosSalesReturnCredits).not.toHaveBeenCalled();
  });
});
