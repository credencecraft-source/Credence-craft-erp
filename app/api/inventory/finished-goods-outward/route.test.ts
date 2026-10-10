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
  markShipmentShipped: vi.fn(),
  deletePackingList: vi.fn(),
  listWorkflow: vi.fn(),
  pickLine: vi.fn(),
  reverseShipment: vi.fn(),
  unpickLine: vi.fn(),
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
  createFinishedGoodsOutwardPackingList: mocks.createShipment,
  markFinishedGoodsOutwardShipmentShipped: mocks.markShipmentShipped,
  deleteFinishedGoodsOutwardPackingList: mocks.deletePackingList,
  deleteFinishedGoodsOutwardBox: mocks.deleteBox,
  listFinishedGoodsOutwardWorkflow: mocks.listWorkflow,
  pickFinishedGoodsOutwardLine: mocks.pickLine,
  reverseFinishedGoodsOutwardShipment: mocks.reverseShipment,
  unpickFinishedGoodsOutwardLine: mocks.unpickLine,
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

  it("accepts selected shipment bookings and explicit quantities from authorized merchandising users", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingRequests: [
        { bookingId: "booking-1", sizeRequests: [
          { sizeLineId: "size-s", quantity: "2" },
          { sizeLineId: "size-m", quantity: "2" },
        ] },
        { bookingId: "booking-2", sizeRequests: [{ sizeLineId: "size-2", quantity: "6" }] },
      ],
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
      bookingRequests: [
        { bookingId: "booking-1", sizeRequests: [
          { sizeLineId: "size-s", quantity: "2" },
          { sizeLineId: "size-m", quantity: "2" },
        ] },
        { bookingId: "booking-2", sizeRequests: [{ sizeLineId: "size-2", quantity: "6" }] },
      ],
    });
  });

  it("rejects malformed shipment booking selections before creating an inventory request", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingRequests: [
        { bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-1", quantity: "4" }] },
        { bookingId: "booking-2", sizeRequests: [{ sizeLineId: "size-2", quantity: 7 }] },
      ],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createRequestFromBookings).not.toHaveBeenCalled();
  });

  it("rejects shipment request bodies that omit an explicit quantity", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingIds: ["booking-1"],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createRequestFromBookings).not.toHaveBeenCalled();
  });

  it("does not allow a non-merchandising user to request FG stock from shipment tracking", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: merchandising permission required."));

    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "request-bookings",
      bookingRequests: [{ bookingId: "booking-1", sizeRequests: [{ sizeLineId: "size-1", quantity: "2" }] }],
    }));

    expect(response.status).toBe(403);
    expect(mocks.createRequestFromBookings).not.toHaveBeenCalled();
  });

  it("routes a pick reversal through the inventory-authorized service", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "unpick",
      requestLineId: "line-1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.unpickLine).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Merch User",
      requestLineId: "line-1",
    });
  });

  it("routes shipment reversal using the authorized internal organization ID", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "reverse-shipment",
      shipmentId: "shipment-1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.reverseShipment).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      shipmentId: "shipment-1",
    });
  });

  it("rejects a shipment reversal with a missing shipment ID", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "reverse-shipment",
    }));

    expect(response.status).toBe(400);
    expect(mocks.reverseShipment).not.toHaveBeenCalled();
  });

  it("requires a box number before creating a box", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "box",
      requestLineIds: ["line-1"],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createBox).not.toHaveBeenCalled();
  });

  it("creates a packing list for selected boxes without marking it shipped", async () => {
    mocks.createShipment.mockResolvedValue({ id: "packing-list-1", packing_list_no: "FGL-1" });
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "packing-list",
      boxIds: ["box-1", "box-2"],
    }));

    expect(response.status).toBe(201);
    expect(mocks.createShipment).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Merch User",
      boxIds: ["box-1", "box-2"],
    });
    expect(mocks.markShipmentShipped).not.toHaveBeenCalled();
  });

  it("posts packing-list stock only on an authorized mark-shipped action", async () => {
    mocks.markShipmentShipped.mockResolvedValue({ id: "packing-list-1", status: "SHIPPED" });
    const response = await POST(postRequest({
      organizationId: "public-org",
      action: "mark-shipped",
      shipmentId: "packing-list-1",
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.markShipmentShipped).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      actorName: "Merch User",
      shipmentId: "packing-list-1",
    });
  });
});
