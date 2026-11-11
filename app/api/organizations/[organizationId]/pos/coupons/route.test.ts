import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPosCoupon: vi.fn(),
  listPosCoupons: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-coupon-service", () => ({
  createPosCoupon: mocks.createPosCoupon,
  listPosCoupons: mocks.listPosCoupons,
}));

import { GET, POST } from "./route";

describe("POS coupon routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "actor-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosCoupons.mockResolvedValue({
      coupons: [{ id: "coupon-1", couponCode: "SAVE10" }],
      hasMore: false,
      nextCursor: null,
    });
    mocks.createPosCoupon.mockResolvedValue({ id: "coupon-1", coupon_code: "SAVE10" });
  });

  it("lists coupon records through the authorized organization context", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons?search=SAVE&couponType=GENERAL&status=ACTIVE"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "actor-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("actor-1", "internal-org-1", "VIEW_POS_COUPONS");
    expect(mocks.listPosCoupons).toHaveBeenCalledWith("internal-org-1", {
      take: 50,
      cursor: undefined,
      search: "SAVE",
      couponType: "GENERAL",
      status: "ACTIVE",
    });
    expect((await response.json()).coupons).toHaveLength(1);
  });

  it("creates a coupon only through the authorized organization-scoped service", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponCode: "SAVE10",
          name: "Save ten",
          couponType: "GENERAL",
          status: "ACTIVE",
          discountType: "FLAT_AMOUNT",
          discountValue: "10",
          minimumPurchase: "50",
          startsAt: "2026-11-07",
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("actor-1", "internal-org-1", "MANAGE_POS_COUPONS");
    expect(mocks.createPosCoupon).toHaveBeenCalledWith("internal-org-1", "actor-1", expect.objectContaining({
      couponCode: "SAVE10",
      couponType: "GENERAL",
      discountValue: "10",
    }));
  });

  it("rejects unknown coupon report filters", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons?couponType=UNKNOWN"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listPosCoupons).not.toHaveBeenCalled();
  });

  it("denies coupon reads without the dedicated view permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/coupons"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listPosCoupons).not.toHaveBeenCalled();
  });

  it("denies coupon creation without the dedicated management permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Save ten",
          couponType: "GENERAL",
          status: "ACTIVE",
          discountType: "FLAT_AMOUNT",
          discountValue: "10",
          minimumPurchase: "50",
          startsAt: "2026-11-07",
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createPosCoupon).not.toHaveBeenCalled();
  });
});
