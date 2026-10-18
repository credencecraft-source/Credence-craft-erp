import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  reverseAdvanceBookingFulfillment: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-booking-fulfillment-service", () => ({
  reverseAdvanceBookingFulfillment: mocks.reverseAdvanceBookingFulfillment,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ bookingId: "booking-1" }) };
const request = (body: unknown) => new Request(
  "http://localhost/api/distribution/advance-bookings/booking-1/fulfillment/reversal",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("advance booking fulfillment reversal API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.reverseAdvanceBookingFulfillment.mockResolvedValue({
      bookingId: "booking-1",
      bookingNo: "BK-12",
      reversedQuantity: 200,
      grnNumbers: ["FGRN-1"],
    });
  });

  it("requires inventory permission and reverses only the booking in that organization", async () => {
    const response = await POST(request({ organizationId: "public-org" }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.reverseAdvanceBookingFulfillment).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "booking-1",
    );
  });

  it("rejects a malformed request before reversing inventory", async () => {
    const response = await POST(request({}), context);

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.reverseAdvanceBookingFulfillment).not.toHaveBeenCalled();
  });

  it("trims the organization route identifier before membership authorization", async () => {
    const response = await POST(request({ organizationId: " public-org " }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
  });
});
