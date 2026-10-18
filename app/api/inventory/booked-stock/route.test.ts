import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getRawMaterialStockBooking: vi.fn(),
  listRawMaterialStockBookings: vi.fn(),
  createRawMaterialStockBookings: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/inventory/rm-stock-booking-service", () => ({
  createRawMaterialStockBookings: mocks.createRawMaterialStockBookings,
  getRawMaterialStockBooking: mocks.getRawMaterialStockBooking,
  listRawMaterialStockBookings: mocks.listRawMaterialStockBookings,
}));

import { GET } from "./route";

describe("booked stock route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.getRawMaterialStockBooking.mockResolvedValue({ id: "booking-1" });
    mocks.listRawMaterialStockBookings.mockResolvedValue([]);
  });

  it("reads a booking by ID only within the authorized organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/booked-stock?organizationId=public-org&bookingId=booking-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getRawMaterialStockBooking).toHaveBeenCalledWith("internal-org-1", "booking-1");
    await expect(response.json()).resolves.toEqual({ booking: { id: "booking-1" } });
  });

  it("continues to list booked stock through the authorized internal organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/booked-stock?organizationId=public-org",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listRawMaterialStockBookings).toHaveBeenCalledWith("internal-org-1");
  });

  it("returns not found if the authorized tenant has no matching booking", async () => {
    mocks.getRawMaterialStockBooking.mockResolvedValue(null);

    const response = await GET(new Request(
      "http://localhost/api/inventory/booked-stock?organizationId=public-org&bookingId=missing",
    ));

    expect(response.status).toBe(404);
  });
});
