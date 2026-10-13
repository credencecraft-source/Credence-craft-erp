import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  allocateAdvanceBookingFromGeneralStock: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
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
    mocks.allocateAdvanceBookingFromGeneralStock.mockResolvedValue({
      bookingId: "booking-1",
      bookingNo: "BK-1",
      allocatedLines: [{ size: "M", quantity: 12 }],
    });
  });

  it("allocates general stock with the authorized internal organization and actor", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org" }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "inventory-user",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.allocateAdvanceBookingFromGeneralStock).toHaveBeenCalledWith(
      "internal-org-1",
      "inventory-user",
      "booking-1",
    );
  });

  it("rejects an empty booking identifier before calling the service", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings//general-stock-allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org" }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: " " }) });

    expect(response.status).toBe(400);
    expect(mocks.allocateAdvanceBookingFromGeneralStock).not.toHaveBeenCalled();
  });
});
