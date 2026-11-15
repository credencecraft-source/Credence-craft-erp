import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createOrderShare: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/orders/order-share-service", () => ({
  createOrderShare: mocks.createOrderShare,
}));

import { POST } from "./route";

describe("order share permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.createOrderShare.mockResolvedValue({ id: "share-1" });
  });

  it("requires SHARE_ORDERS before sharing an order", async () => {
    const response = await POST(new Request("http://localhost/api/orders/order-1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceOrganizationId: "public-org" }),
    }), { params: Promise.resolve({ orderId: "order-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "SHARE_ORDERS");
    expect(mocks.createOrderShare).toHaveBeenCalledWith({
      orderId: "order-1",
      sourceOrganizationId: "internal-org-1",
      sharedByUserId: "user-1",
    });
  });

  it("denies sharing before invoking the share service", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await POST(new Request("http://localhost/api/orders/order-1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceOrganizationId: "public-org" }),
    }), { params: Promise.resolve({ orderId: "order-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.createOrderShare).not.toHaveBeenCalled();
  });
});
