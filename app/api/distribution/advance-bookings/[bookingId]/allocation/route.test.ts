import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  allocateAdvanceBooking: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/distribution/advance-booking-allocation-service", () => ({
  allocateAdvanceBooking: mocks.allocateAdvanceBooking,
}));

import { POST } from "./route";

describe("advance-booking combined allocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.allocateAdvanceBooking.mockResolvedValue({
      bookingId: "booking-1",
      generalStock: { allocatedLines: [{ size: "M", quantity: 100 }] },
      workOrder: { workOrderId: "work-order-1" },
    });
  });

  it("authorizes both permissions and submits the split through one combined service call", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        workOrderId: "work-order-1",
        generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 100 }],
        workOrderLines: [{ bookingSizeLineId: "booking-size-m", assignedQuantity: 100 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.requireOrganizationContext).toHaveBeenNthCalledWith(
      2,
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenNthCalledWith(1, "user-1", "internal-org-1", "MANAGE_FINISHED_GOODS_OUTWARD");
    expect(mocks.requireOrganizationPermission).toHaveBeenNthCalledWith(2, "user-1", "internal-org-1", "UPDATE_FACTORY_PRODUCTION");
    expect(mocks.allocateAdvanceBooking).toHaveBeenCalledWith("internal-org-1", "user-1", "booking-1", {
      workOrderId: "work-order-1",
      generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 100 }],
      workOrderLines: [{ bookingSizeLineId: "booking-size-m", assignedQuantity: 100 }],
    });
  });

  it("requires only inventory authorization for a stock-only allocation", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 100 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledOnce();
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_FINISHED_GOODS_OUTWARD");
    expect(mocks.allocateAdvanceBooking).toHaveBeenCalledWith("internal-org-1", "user-1", "booking-1", {
      workOrderId: "",
      generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 100 }],
      workOrderLines: [],
    });
  });

  it("rejects fractional quantities before authorization or service execution", async () => {
    const request = new Request("http://localhost/api/distribution/advance-bookings/booking-1/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 10.5 }],
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.allocateAdvanceBooking).not.toHaveBeenCalled();
  });

  it("denies a stock-only allocation before calling the allocation service", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await POST(new Request("http://localhost/api/distribution/advance-bookings/booking-1/allocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        generalStockLines: [{ bookingSizeLineId: "booking-size-m", quantity: 100 }],
      }),
    }), { params: Promise.resolve({ bookingId: "booking-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.allocateAdvanceBooking).not.toHaveBeenCalled();
  });
});
