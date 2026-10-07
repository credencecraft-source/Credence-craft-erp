import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  acceptRequest: vi.fn(),
  cancelRequest: vi.fn(),
  createBox: vi.fn(),
  createRequest: vi.fn(),
  createRequestFromBookings: vi.fn(),
  createShipment: vi.fn(),
  deleteBox: vi.fn(),
  listWorkflow: vi.fn(),
  pickLine: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/inventory/finished-goods-outward-service", () => ({
  acceptFinishedGoodsOutwardRequest: mocks.acceptRequest,
  cancelFinishedGoodsOutwardRequest: mocks.cancelRequest,
  createFinishedGoodsOutwardBox: mocks.createBox,
  createFinishedGoodsOutwardRequest: mocks.createRequest,
  createFinishedGoodsOutwardRequestFromBookings: mocks.createRequestFromBookings,
  createFinishedGoodsOutwardShipment: mocks.createShipment,
  deleteFinishedGoodsOutwardBox: mocks.deleteBox,
  listFinishedGoodsOutwardWorkflow: mocks.listWorkflow,
  pickFinishedGoodsOutwardLine: mocks.pickLine,
}));

import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/inventory/finished-goods-outward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("finished-goods-outward route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "Merch User" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createRequestFromBookings.mockResolvedValue({
      id: "request-1",
      request_no: "FGR-1",
      status: "REQUESTED",
      bookingCount: 2,
    });
  });

  it("accepts selected shipment bookings from authorized merchandising users", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingIds: ["booking-1", "booking-2"],
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createRequestFromBookings).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Merch User",
      bookingIds: ["booking-1", "booking-2"],
    });
  });

  it("rejects malformed shipment booking selections before creating an inventory request", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingIds: ["booking-1", 7],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createRequestFromBookings).not.toHaveBeenCalled();
  });

  it("does not allow a non-merchandising user to request FG stock from shipment tracking", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: merchandising permission required."));

    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingIds: ["booking-1"],
    }));

    expect(response.status).toBe(403);
    expect(mocks.createRequestFromBookings).not.toHaveBeenCalled();
  });
});
