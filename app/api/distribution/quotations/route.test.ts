import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createDistributionQuotationFromBookings: vi.fn(),
  listDistributionQuotations: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  createDistributionQuotationFromBookings: mocks.createDistributionQuotationFromBookings,
  listDistributionQuotations: mocks.listDistributionQuotations,
}));

import { GET, POST } from "./route";

const post = (body: unknown) => new Request("http://localhost/api/distribution/quotations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("distribution quotation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listDistributionQuotations.mockResolvedValue({ quotations: [] });
    mocks.createDistributionQuotationFromBookings.mockResolvedValue({ id: "quotation-1" });
  });

  it("lists quotations under the authorized internal organization", async () => {
    const response = await GET(new Request("http://localhost/api/distribution/quotations?organizationId=public-org"));
    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith("internal-org-1");
  });

  it("creates a database quotation from booking IDs only for authorized merchandising roles", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      bookingIds: ["booking-1", "booking-2"],
    }));
    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createDistributionQuotationFromBookings).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["booking-1", "booking-2"],
    );
  });

  it("rejects invalid selection input before invoking the service", async () => {
    const response = await POST(post({ organizationId: "public-org", bookingIds: ["booking-1", 3] }));
    expect(response.status).toBe(400);
    expect(mocks.createDistributionQuotationFromBookings).not.toHaveBeenCalled();
  });

  it("does not list data when organization membership authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied."));
    const response = await GET(new Request("http://localhost/api/distribution/quotations?organizationId=other-org"));
    expect(response.status).toBe(400);
    expect(mocks.listDistributionQuotations).not.toHaveBeenCalled();
  });
});
