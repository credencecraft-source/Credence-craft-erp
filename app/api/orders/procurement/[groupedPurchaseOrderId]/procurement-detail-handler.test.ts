import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getGroupedPurchaseOrder: vi.fn(),
  approveGroupedPurchaseOrder: vi.fn(),
  deleteGroupedPurchaseOrder: vi.fn(),
  rejectGroupedPurchaseOrder: vi.fn(),
  updateGroupedPurchaseOrderPrices: vi.fn(),
  updateGroupedPurchaseOrderHeader: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext: mocks.requireOrganizationContext }));
vi.mock("@/lib/services/orders/grouped-purchase-order-service", () => ({
  approveGroupedPurchaseOrder: mocks.approveGroupedPurchaseOrder,
  deleteGroupedPurchaseOrder: mocks.deleteGroupedPurchaseOrder,
  getGroupedPurchaseOrder: mocks.getGroupedPurchaseOrder,
  rejectGroupedPurchaseOrder: mocks.rejectGroupedPurchaseOrder,
  updateGroupedPurchaseOrderPrices: mocks.updateGroupedPurchaseOrderPrices,
}));
vi.mock("@/lib/services/orders/grouped-purchase-order-header-service", () => ({
  updateGroupedPurchaseOrderHeader: mocks.updateGroupedPurchaseOrderHeader,
}));

import { DELETE, GET } from "./procurement-detail-handler";

describe("Grouped PO detail endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.getGroupedPurchaseOrder.mockResolvedValue({ id: "group-1" });
  });

  it("authorizes the route organization before loading a tenant-scoped Grouped PO", async () => {
    const response = await GET(new Request("http://localhost/api/orders/procurement/group-1?organizationId=public-org"), {
      params: Promise.resolve({ groupedPurchaseOrderId: "group-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getGroupedPurchaseOrder).toHaveBeenCalledWith("internal-org-1", "group-1");
  });

  it("does not load a Grouped PO when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));

    const response = await GET(new Request("http://localhost/api/orders/procurement/group-1?organizationId=other-org"), {
      params: Promise.resolve({ groupedPurchaseOrderId: "group-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.getGroupedPurchaseOrder).not.toHaveBeenCalled();
  });

  it("authorizes deletion and passes the authenticated actor to the service", async () => {
    const response = await DELETE(new Request("http://localhost/api/orders/procurement/group-1?organizationId=public-org", {
      method: "DELETE",
    }), { params: Promise.resolve({ groupedPurchaseOrderId: "group-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(mocks.deleteGroupedPurchaseOrder).toHaveBeenCalledWith("internal-org-1", "group-1", "user-1");
  });

  it("does not delete a Grouped PO when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));

    const response = await DELETE(new Request("http://localhost/api/orders/procurement/group-1?organizationId=other-org", {
      method: "DELETE",
    }), { params: Promise.resolve({ groupedPurchaseOrderId: "group-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.deleteGroupedPurchaseOrder).not.toHaveBeenCalled();
  });
});