import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  allocateAdvanceBookingFromGeneralStock: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/inventory/finished-goods-general-stock-allocation-service", () => ({
  allocateAdvanceBookingFromGeneralStock: mocks.allocateAdvanceBookingFromGeneralStock,
}));

import { POST } from "./route";

describe("advance-booking general-stock allocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "inventory-user" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.allocateAdvanceBookingFromGeneralStock.mockResolvedValue({
      bookingId: "booking-1",
      bookingNo: "BK-1",
      allocatedLines: [{ size: "M", quantity: 12 }],
    });
  });

  it("allocates requested quantities with the authorized organization and actor", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        lines: [{ bookingSizeLineId: "booking-size-1", quantity: 12 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "inventory-user",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("inventory-user", "internal-org-1", "MANAGE_FINISHED_GOODS_OUTWARD");
    expect(mocks.allocateAdvanceBookingFromGeneralStock).toHaveBeenCalledWith(
      "internal-org-1",
      "inventory-user",
      "booking-1",
      [{ bookingSizeLineId: "booking-size-1", quantity: 12 }],
    );
  });

  it("rejects an empty booking identifier before calling the service", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings//general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        lines: [{ bookingSizeLineId: "booking-size-1", quantity: 12 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: " " }) });

    expect(response.status).toBe(400);
    expect(mocks.allocateAdvanceBookingFromGeneralStock).not.toHaveBeenCalled();
  });

  it("rejects invalid quantity lines before calling the allocation service", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        lines: [{ bookingSizeLineId: "booking-size-1", quantity: 1.5 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.allocateAdvanceBookingFromGeneralStock).not.toHaveBeenCalled();
  });

  it("denies allocation before changing general stock", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        lines: [{ bookingSizeLineId: "booking-size-1", quantity: 12 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.allocateAdvanceBookingFromGeneralStock).not.toHaveBeenCalled();
  });
});
