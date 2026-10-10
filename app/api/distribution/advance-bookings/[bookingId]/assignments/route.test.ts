import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  assignAdvanceBookingToWorkOrder: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/distribution/advance-booking-service", () => ({
  assignAdvanceBookingToWorkOrder: mocks.assignAdvanceBookingToWorkOrder,
}));

import { POST } from "./route";

describe("advance-booking assignment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.assignAdvanceBookingToWorkOrder.mockResolvedValue({ bookingId: "booking-1", workOrderId: "work-order-1" });
  });

  it("assigns size quantities with the authorized organization and actor", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        workOrderId: "work-order-1",
        lines: [{ bookingSizeLineId: "booking-size-1", assignedQuantity: 30 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.assignAdvanceBookingToWorkOrder).toHaveBeenCalledWith("internal-org-1", "user-1", "booking-1", {
      workOrderId: "work-order-1",
      lines: [{ bookingSizeLineId: "booking-size-1", assignedQuantity: 30 }],
    });
  });

  it("rejects fractional assignment quantity before calling the service", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        workOrderId: "work-order-1",
        lines: [{ bookingSizeLineId: "booking-size-1", assignedQuantity: 1.5 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.assignAdvanceBookingToWorkOrder).not.toHaveBeenCalled();
  });
});
