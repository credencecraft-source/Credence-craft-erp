import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getOrganizationInternalIdForUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getAdvanceBookingOrderDetails: vi.fn(),
  getOrderById: vi.fn(),
  getOrderCoreById: vi.fn(),
  getOrderDetailSection: vi.fn(),
  updateOrderWithDetails: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationInternalIdForUser: mocks.getOrganizationInternalIdForUser,
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/orders/order-service", () => ({
  getAdvanceBookingOrderDetails: mocks.getAdvanceBookingOrderDetails,
  getOrderById: mocks.getOrderById,
  getOrderCoreById: mocks.getOrderCoreById,
  getOrderDetailSection: mocks.getOrderDetailSection,
  updateOrderWithDetails: mocks.updateOrderWithDetails,
}));

import { GET } from "./orders-detail-handler";

describe("merchandising order detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.getOrganizationInternalIdForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.getOrderCoreById.mockResolvedValue({ id: "order-1" });
    mocks.getOrderDetailSection.mockResolvedValue({ bomItems: [] });
    mocks.getOrderById.mockResolvedValue({ id: "order-1", finishedGoods: [] });
  });

  it("uses membership-scoped organization context and the core-only query when requested", async () => {
    const response = await GET(
      new Request("http://localhost/api/orders/order-1?organizationId=public-org-id&view=core"),
      { params: Promise.resolve({ orderId: "order-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getOrganizationInternalIdForUser).toHaveBeenCalledWith("user-1", "public-org-id");
    expect(mocks.getOrderCoreById).toHaveBeenCalledWith("order-1", "internal-org-1");
    expect(mocks.getOrderById).not.toHaveBeenCalled();
  });

  it("loads only the selected tenant-scoped child section", async () => {
    const response = await GET(
      new Request("http://localhost/api/orders/order-1?organizationId=public-org-id&section=bom"),
      { params: Promise.resolve({ orderId: "order-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getOrderDetailSection).toHaveBeenCalledWith("order-1", "internal-org-1", "bom");
    expect(mocks.getOrderById).not.toHaveBeenCalled();
  });

  it("rejects unsupported sections before querying order data", async () => {
    const response = await GET(
      new Request("http://localhost/api/orders/order-1?organizationId=public-org-id&section=unknown"),
      { params: Promise.resolve({ orderId: "order-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.getOrderDetailSection).not.toHaveBeenCalled();
  });
});
