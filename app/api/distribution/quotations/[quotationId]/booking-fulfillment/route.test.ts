import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  listQuotationBookingFulfillment: vi.fn(),
  reverseQuotationBookingFulfillment: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-booking-fulfillment-service", () => ({
  listQuotationBookingFulfillment: mocks.listQuotationBookingFulfillment,
  reverseQuotationBookingFulfillment: mocks.reverseQuotationBookingFulfillment,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ quotationId: "quotation-1" }) };
const postRequest = (body: unknown) => new Request(
  "http://localhost/api/distribution/quotations/quotation-1/booking-fulfillment",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("quotation-linked booking fulfillment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listQuotationBookingFulfillment.mockResolvedValue({ bookings: [] });
    mocks.reverseQuotationBookingFulfillment.mockResolvedValue({
      bookingId: "booking-1",
      bookingNo: "BK-1",
      reversedQuantity: 5,
      grnNumbers: ["WGRN-1"],
    });
  });

  it("loads fulfillment preview under the authorized organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/distribution/quotations/quotation-1/booking-fulfillment?organizationId=public-org",
    ), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listQuotationBookingFulfillment).toHaveBeenCalledWith("internal-org-1", "quotation-1");
  });

  it("requires inventory authorization for reversal and passes only scoped identities", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      bookingId: "booking-1",
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.reverseQuotationBookingFulfillment).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "quotation-1",
      "booking-1",
    );
  });

  it("rejects missing booking IDs before invoking reversal", async () => {
    const response = await POST(postRequest({ organizationId: "public-org", bookingId: "" }), context);

    expect(response.status).toBe(400);
    expect(mocks.reverseQuotationBookingFulfillment).not.toHaveBeenCalled();
  });
});
