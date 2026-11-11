import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionUser, requireOrganizationContext, requireOrganizationPermission, requireOrganizationOrderManagementPermission, createVariantOrder, prepareVariantOrder, toDateOnly } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  createVariantOrder: vi.fn(),
  prepareVariantOrder: vi.fn(),
  toDateOnly: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext, requireOrganizationPermission, requireOrganizationOrderManagementPermission }));
vi.mock("@/lib/services/orders/order-service", () => ({ createVariantOrder, prepareVariantOrder, toDateOnly }));

import { GET, POST } from "./route";

describe("variant order API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUser.mockResolvedValue({ id: "user-id" });
    requireOrganizationContext.mockResolvedValue({ id: "internal-organization-id" });
    requireOrganizationPermission.mockResolvedValue(undefined);
    requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    createVariantOrder.mockResolvedValue({ id: "new-order-id", deliveryDate: null });
    prepareVariantOrder.mockResolvedValue({ preparedToken: "prepared-token", sizes: ["M", "L"] });
  });

  it("prepares source data using the authorized internal organization", async () => {
    const request = new Request("http://localhost/api/orders/source-order-id/variant?organizationId=public-organization-id");

    const response = await GET(request, { params: Promise.resolve({ orderId: "source-order-id" }) });

    expect(requireOrganizationContext).toHaveBeenCalledWith("user-id", "public-organization-id", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-id", "internal-organization-id", "merchandising/order", "view",
    );
    expect(prepareVariantOrder).toHaveBeenCalledWith("internal-organization-id", "source-order-id", "user-id");
    expect(response.status).toBe(200);
  });

  it("creates from the source order using the authorized internal organization", async () => {
    const body = { styleName: "New style", colors: "Red", rows: [{ size: "M", qty: "10" }] };
    const request = new Request("http://localhost/api/orders/source-order-id/variant?organizationId=public-organization-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params: Promise.resolve({ orderId: "source-order-id" }) });

    expect(requireOrganizationContext).toHaveBeenCalledWith("user-id", "public-organization-id", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-id", "internal-organization-id", "merchandising/order", "create",
    );
    expect(createVariantOrder).toHaveBeenCalledWith("internal-organization-id", "source-order-id", body, "user-id");
    expect(response.status).toBe(200);
  });

  it("does not create when organization authorization fails", async () => {
    requireOrganizationContext.mockRejectedValue(new Error("Access denied."));
    const request = new Request("http://localhost/api/orders/source-order-id/variant?organizationId=other-organization-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleName: "New style", colors: "Red", rows: [{ size: "M", qty: "10" }] }),
    });

    const response = await POST(request, { params: Promise.resolve({ orderId: "source-order-id" }) });

    expect(createVariantOrder).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("denies variant creation before calling the order service", async () => {
    requireOrganizationOrderManagementPermission.mockRejectedValue(new Error("Access denied: This role does not have the required Order Management permission."));
    const request = new Request("http://localhost/api/orders/source-order-id/variant?organizationId=public-organization-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleName: "New style", colors: "Red", rows: [{ size: "M", qty: "10" }] }),
    });

    const response = await POST(request, { params: Promise.resolve({ orderId: "source-order-id" }) });

    expect(response.status).toBe(403);
    expect(createVariantOrder).not.toHaveBeenCalled();
  });
});