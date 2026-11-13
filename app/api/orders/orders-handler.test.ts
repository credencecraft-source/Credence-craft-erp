import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  listOrdersPage: vi.fn(),
  deleteOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
  requireOrganizationOrderManagementPermission: mocks.requireOrganizationOrderManagementPermission,
}));

vi.mock("@/lib/services/orders/order-service", () => ({
  createOrder: vi.fn(),
  deleteOrders: mocks.deleteOrders,
  listOrdersPage: mocks.listOrdersPage,
  toDateOnly: vi.fn(),
  updateOrderWithDetails: vi.fn(),
}));

import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import { DELETE, GET } from "./orders-handler";

describe("merchandising orders list API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    mocks.listOrdersPage.mockResolvedValue({ orders: [], nextCursor: null });
    mocks.deleteOrders.mockResolvedValue({ deletedCount: 1 });
  });

  it("returns a JSON service-unavailable error when the database cannot be reached", async () => {
    mocks.listOrdersPage.mockRejectedValue({ code: "P1001" });

    const response = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("allows an authenticated member to read orders after trial expiry", async () => {
    const response = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org-id",
      undefined,
      { allowExpiredTrial: true },
    );
  });

  it("denies order reads when the member lacks VIEW_ORDERS", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValueOnce(
      new Error("Access denied: This role does not have the required Order Management permission."),
    );

    const response = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
    ));

    expect(response.status).toBe(403);
    expect(mocks.listOrdersPage).not.toHaveBeenCalled();
  });

  it("passes search and validated column filters to the tenant-scoped list service", async () => {
    const filters = { buyer: { operator: "contains", value: "Acme" } };
    const response = await GET(new Request(
      `http://localhost/api/orders?organizationId=public-org-id&limit=25&status=Draft&search=Jacket&filters=${encodeURIComponent(JSON.stringify(filters))}`,
    ));

    expect(response.status).toBe(200);
    expect(mocks.listOrdersPage).toHaveBeenCalledWith("internal-org-1", {
      cursor: undefined,
      limit: 25,
      status: "Draft",
      search: "Jacket",
      filters,
      purpose: undefined,
    });
  });

  it("rejects malformed or oversized server-side list filters", async () => {
    const malformed = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id&filters=%7B",
    ));
    const oversizedPage = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id&limit=101",
    ));
    const invalidQuantityOperator = await GET(new Request(
      `http://localhost/api/orders?organizationId=public-org-id&filters=${encodeURIComponent(JSON.stringify({
        orderQty: { operator: "contains", value: "4" },
      }))}`,
    ));

    expect(malformed.status).toBe(400);
    expect(oversizedPage.status).toBe(400);
    expect(invalidQuantityOperator.status).toBe(400);
    expect(mocks.listOrdersPage).not.toHaveBeenCalled();
  });

  it("returns a JSON server error for unexpected list failures", async () => {
    mocks.listOrdersPage.mockRejectedValue(new Error("Unexpected database query failure."));

    const response = await GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to load orders." });
  });

  it("preserves authentication redirects", async () => {
    const redirect = Object.assign(new Error("Redirect"), { digest: "NEXT_REDIRECT;replace;/" });
    mocks.requireSessionUser.mockRejectedValue(redirect);

    await expect(GET(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
    ))).rejects.toBe(redirect);
  });

  it("returns a safe, actionable conflict when advance bookings prevent order deletion", async () => {
    mocks.deleteOrders.mockRejectedValue(new Error(
      "Cannot delete these orders because advance booking BK-100 still references them. Resolve or delete the linked bookings in Advance Booking first.",
    ));
    const response = await DELETE(new Request(
      "http://localhost/api/orders?organizationId=public-org-id",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ["order-1"] }),
      },
    ));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot delete these orders because advance booking BK-100 still references them. Resolve or delete the linked bookings in Advance Booking first.",
    });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org-id",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.deleteOrders).toHaveBeenCalledWith(["order-1"], "internal-org-1", "user-1");
  });
});
