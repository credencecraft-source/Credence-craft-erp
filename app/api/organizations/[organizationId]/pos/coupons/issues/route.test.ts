import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listPosCouponIssues: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-coupon-service", () => ({
  listPosCouponIssues: mocks.listPosCouponIssues,
}));

import { GET } from "./route";

describe("POS issued coupon route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "actor-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosCouponIssues.mockResolvedValue({
      issues: [{ id: "issue-1", couponCode: "CC-ACTIVE" }],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("loads issued coupon records using the authorized internal organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons/issues?status=ACTIVE&search=CC&limit=20"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "actor-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("actor-1", "internal-org-1", "VIEW_POS_COUPONS");
    expect(mocks.listPosCouponIssues).toHaveBeenCalledWith("internal-org-1", expect.objectContaining({
      take: 20,
      search: "CC",
      status: "ACTIVE",
      asOfDate: expect.any(Date),
    }));
    expect((await response.json()).issues).toHaveLength(1);
  });

  it("rejects an invalid issued-coupon status without querying records", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons/issues?status=REDEEMED"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listPosCouponIssues).not.toHaveBeenCalled();
  });

  it("supports loading claimed coupon issues", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons/issues?status=CLAIMED"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.listPosCouponIssues).toHaveBeenCalledWith("internal-org-1", expect.objectContaining({
      status: "CLAIMED",
    }));
  });

  it("denies issued-coupon reads without the dedicated view permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons/issues?status=ACTIVE"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listPosCouponIssues).not.toHaveBeenCalled();
  });
});
