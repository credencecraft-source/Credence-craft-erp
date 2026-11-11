import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  deletePurchaseOrder: vi.fn(),
  getPurchaseOrder: vi.fn(),
  sharePurchaseOrderByEmail: vi.fn(),
  submitPurchaseOrderForApproval: vi.fn(),
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
  deletePurchaseOrder: mocks.deletePurchaseOrder,
  getPurchaseOrder: mocks.getPurchaseOrder,
  sharePurchaseOrderByEmail: mocks.sharePurchaseOrderByEmail,
  submitPurchaseOrderForApproval: mocks.submitPurchaseOrderForApproval,
}));

import { DELETE, GET, POST } from "./route";

const context = { params: Promise.resolve({ purchaseOrderId: "po-1" }) };

describe("Purchase Order detail permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "User One" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    mocks.getPurchaseOrder.mockResolvedValue({ id: "po-1" });
    mocks.deletePurchaseOrder.mockResolvedValue(undefined);
    mocks.submitPurchaseOrderForApproval.mockResolvedValue(undefined);
    mocks.sharePurchaseOrderByEmail.mockResolvedValue(undefined);
  });

  it("requires view permission before reading a Purchase Order", async () => {
    const response = await GET(
      new Request("http://localhost/api/orders/purchase-orders/po-1?organizationId=public-org"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "procurement/purchase-order",
      "view",
    );
    expect(mocks.getPurchaseOrder).toHaveBeenCalledWith("internal-org-1", "po-1");
  });

  it("does not delete a Purchase Order when delete permission is denied", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValue(new Error("Access denied: missing permission."));

    const response = await DELETE(
      new Request("http://localhost/api/orders/purchase-orders/po-1?organizationId=public-org", {
        method: "DELETE",
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.deletePurchaseOrder).not.toHaveBeenCalled();
  });

  it("requires submit permission before submitting a Purchase Order for approval", async () => {
    const response = await POST(
      new Request("http://localhost/api/orders/purchase-orders/po-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org", action: "submit-approval" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL",
    );
    expect(mocks.submitPurchaseOrderForApproval).toHaveBeenCalledWith(
      "internal-org-1",
      "po-1",
      "User One",
      "user-1",
    );
  });

  it("does not share a Purchase Order when sharing permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: missing permission."));

    const response = await POST(
      new Request("http://localhost/api/orders/purchase-orders/po-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "public-org",
          action: "share-email",
          email: "vendor@example.com",
        }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.sharePurchaseOrderByEmail).not.toHaveBeenCalled();
  });
});
