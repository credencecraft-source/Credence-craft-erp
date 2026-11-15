import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  generatePurchaseOrders: vi.fn(),
  listPurchaseOrderReportPage: vi.fn(),
  listPurchaseOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
  requireOrganizationOrderManagementPermission: mocks.requireOrganizationOrderManagementPermission,
}));
vi.mock("@/lib/services/orders/purchase-order-service", () => ({
  generatePurchaseOrders: mocks.generatePurchaseOrders,
  listPurchaseOrderReportPage: mocks.listPurchaseOrderReportPage,
  listPurchaseOrders: mocks.listPurchaseOrders,
}));

import { GET, POST } from "./route";

describe("Purchase Order collection permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "User One" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    mocks.listPurchaseOrders.mockResolvedValue([]);
    mocks.listPurchaseOrderReportPage.mockResolvedValue({ purchaseOrders: [], nextCursor: null });
    mocks.generatePurchaseOrders.mockResolvedValue({ id: "po-1" });
  });

  it("requires view permission before listing organization Purchase Orders", async () => {
    const response = await GET(new Request(
      "http://localhost/api/orders/purchase-orders?organizationId=public-org",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "procurement/purchase-order",
      "view",
    );
    expect(mocks.listPurchaseOrders).toHaveBeenCalledWith("internal-org-1", { assetOnly: false });
  });

  it("denies Purchase Order reports without view permission", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValue(new Error("Access denied: missing permission."));

    const response = await GET(new Request(
      "http://localhost/api/orders/purchase-orders?organizationId=public-org&view=report",
    ));

    expect(response.status).toBe(403);
    expect(mocks.listPurchaseOrderReportPage).not.toHaveBeenCalled();
  });

  it("requires create permission before generating Purchase Orders", async () => {
    const response = await POST(new Request("http://localhost/api/orders/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", masterPurchaseOrderIds: ["master-1"] }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "procurement/purchase-order",
      "create",
    );
    expect(mocks.generatePurchaseOrders).toHaveBeenCalledWith(
      "internal-org-1",
      ["master-1"],
      "User One",
      null,
      null,
    );
  });

  it("does not generate Purchase Orders when create permission is denied", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValue(new Error("Access denied: missing permission."));

    const response = await POST(new Request("http://localhost/api/orders/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", masterPurchaseOrderIds: ["master-1"] }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.generatePurchaseOrders).not.toHaveBeenCalled();
  });
});
