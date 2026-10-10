import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSessionUser, requireOrganizationContext, createVariantOrder, prepareVariantOrder, toDateOnly } = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createVariantOrder: vi.fn(),
  prepareVariantOrder: vi.fn(),
  toDateOnly: vi.fn((value: unknown) => value),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext }));
vi.mock("@/lib/services/orders/order-service", () => ({ createVariantOrder, prepareVariantOrder, toDateOnly }));

import { GET, POST } from "./route";

describe("variant order API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionUser.mockResolvedValue({ id: "user-id" });
    requireOrganizationContext.mockResolvedValue({ id: "internal-organization-id" });
    createVariantOrder.mockResolvedValue({ id: "new-order-id", deliveryDate: null });
    prepareVariantOrder.mockResolvedValue({ preparedToken: "prepared-token", sizes: ["M", "L"] });
  });

  it("prepares source data using the authorized internal organization", async () => {
    const request = new Request("http://localhost/api/orders/source-order-id/variant?organizationId=public-organization-id");

    const response = await GET(request, { params: Promise.resolve({ orderId: "source-order-id" }) });

    expect(requireOrganizationContext).toHaveBeenCalledWith("user-id", "public-organization-id", ["OWNER", "ADMIN", "MERCHANDISING"]);
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
});