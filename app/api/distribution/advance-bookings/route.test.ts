import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createAdvanceBooking: vi.fn(),
  deleteAdvanceBookings: vi.fn(),
  getAdvanceBookingById: vi.fn(),
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
  deleteAdvanceBookings: mocks.deleteAdvanceBookings,
  getAdvanceBookingById: mocks.getAdvanceBookingById,
  listAdvanceBookings: mocks.listAdvanceBookings,
  listAssignableWorkOrders: mocks.listAssignableWorkOrders,
}));

import { DELETE, GET, POST } from "./route";

const postRequest = (body: unknown) => new Request("http://localhost/api/distribution/advance-bookings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const deleteRequest = (body: unknown) => new Request("http://localhost/api/distribution/advance-bookings", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("advance-booking route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listAdvanceBookings.mockResolvedValue({ bookings: [] });
    mocks.getAdvanceBookingById.mockResolvedValue({ booking: { id: "record-1", bookingId: "BK-1" } });
    mocks.listAssignableWorkOrders.mockResolvedValue({ workOrders: [] });
    mocks.createAdvanceBooking.mockResolvedValue({ bookingId: "BK-1" });
    mocks.deleteAdvanceBookings.mockResolvedValue({ deletedBookingNos: ["BK-1"] });
  });

  it("loads saved bookings only for the authorized internal organization", async () => {
    const response = await GET(new Request("http://localhost/api/distribution/advance-bookings?organizationId=public-org"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listAdvanceBookings).toHaveBeenCalledWith("internal-org-1", {
      cursor: undefined,
      limit: 100,
    });
  });

  it("loads one booking detail by internal record ID within the authorized organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/distribution/advance-bookings?organizationId=public-org&bookingId=record-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getAdvanceBookingById).toHaveBeenCalledWith("internal-org-1", "record-1");
    expect(mocks.listAdvanceBookings).not.toHaveBeenCalled();
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

  it("deletes selected bookings using authorized internal organization and actor", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      bookingIds: ["booking-1", "booking-2"],
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.deleteAdvanceBookings).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["booking-1", "booking-2"],
    );
  });

  it("rejects malformed booking selections before persistence", async () => {
    const response = await DELETE(deleteRequest({ organizationId: "public-org", bookingIds: ["booking-1", 12] }));

    expect(response.status).toBe(400);
    expect(mocks.deleteAdvanceBookings).not.toHaveBeenCalled();
  });
});
