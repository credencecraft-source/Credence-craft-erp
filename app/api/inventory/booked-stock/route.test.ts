import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getRawMaterialStockBooking: vi.fn(),
  listRawMaterialStockBookings: vi.fn(),
  createRawMaterialStockBookings: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/inventory/rm-stock-booking-service", () => ({
  createRawMaterialStockBookings: mocks.createRawMaterialStockBookings,
  getRawMaterialStockBooking: mocks.getRawMaterialStockBooking,
  listRawMaterialStockBookings: mocks.listRawMaterialStockBookings,
}));

import { GET, POST } from "./route";

describe("booked stock route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getRawMaterialStockBooking.mockResolvedValue({ id: "booking-1" });
    mocks.listRawMaterialStockBookings.mockResolvedValue([]);
    mocks.createRawMaterialStockBookings.mockResolvedValue({ bookings: [] });
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

  it("requires the reservation permission and uses the authorized tenant when creating bookings", async () => {
    const response = await POST(new Request("http://localhost/api/inventory/booked-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        currentStoreVendorId: "vendor-1",
        lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "2" }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "RESERVE_RAW_MATERIAL_STOCK",
    );
    expect(mocks.createRawMaterialStockBookings).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      bookedBy: undefined,
      currentStoreVendorId: "vendor-1",
      lines: [{ bomItemId: "bom-1", takeFromStockId: "stock-1", bookedQuantity: "2" }],
    });
  });

  it("does not reserve stock when reservation permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(new Request("http://localhost/api/inventory/booked-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        currentStoreVendorId: "vendor-1",
        lines: [],
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.createRawMaterialStockBookings).not.toHaveBeenCalled();
  });
});
