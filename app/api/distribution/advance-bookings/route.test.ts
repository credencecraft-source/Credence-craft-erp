import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createAdvanceBooking: vi.fn(),
  listAdvanceBookings: vi.fn(),
  listAssignableWorkOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/distribution/advance-booking-service", () => ({
  createAdvanceBooking: mocks.createAdvanceBooking,
  listAdvanceBookings: mocks.listAdvanceBookings,
  listAssignableWorkOrders: mocks.listAssignableWorkOrders,
}));

import { GET, POST } from "./route";

const postRequest = (body: unknown) => new Request("http://localhost/api/distribution/advance-bookings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("advance-booking route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listAdvanceBookings.mockResolvedValue({ bookings: [] });
    mocks.listAssignableWorkOrders.mockResolvedValue({ workOrders: [] });
    mocks.createAdvanceBooking.mockResolvedValue({ bookingId: "BK-1" });
  });

  it("loads saved bookings only for the authorized internal organization", async () => {
    const response = await GET(new Request("http://localhost/api/distribution/advance-bookings?organizationId=public-org"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listAdvanceBookings).toHaveBeenCalledWith("internal-org-1");
  });

  it("creates a booking with authorized tenant, actor, order, vendor, and size quantities", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 30 }],
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createAdvanceBooking).toHaveBeenCalledWith("internal-org-1", "user-1", {
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 30 }],
    });
  });

  it("rejects invalid quantities before persistence", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      orderId: "order-1",
      vendorId: "vendor-1",
      sizes: [{ size: "M", quantity: 1.5 }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createAdvanceBooking).not.toHaveBeenCalled();
  });

  it("requires authentication before listing bookings", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Authentication required."));

    const response = await GET(new Request("http://localhost/api/distribution/advance-bookings?organizationId=public-org"));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });
});
