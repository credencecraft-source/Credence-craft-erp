import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createDistributionQuotationFromBookings: vi.fn(),
  deleteDistributionQuotations: vi.fn(),
  listDistributionQuotations: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  createDistributionQuotationFromBookings: mocks.createDistributionQuotationFromBookings,
  deleteDistributionQuotations: mocks.deleteDistributionQuotations,
  listDistributionQuotations: mocks.listDistributionQuotations,
}));

import { DELETE, GET, POST } from "./route";

const post = (body: unknown) => new Request("http://localhost/api/distribution/quotations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const deleteRequest = (body: unknown) => new Request("http://localhost/api/distribution/quotations", {
  method: "DELETE",
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
    mocks.deleteDistributionQuotations.mockResolvedValue([
      { id: "quotation-1", quotationNo: "QT-1", mode: "SINGLE", unlinkedQuotationCount: 0 },
    ]);
  });

  it("lists quotations under the authorized internal organization", async () => {
    const response = await GET(new Request("http://localhost/api/distribution/quotations?organizationId=public-org"));
    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      { includeContactRole: true },
    );
  });

  it("uses the minimal summary view for the Sales Order list", async () => {
    const response = await GET(new Request(
      "http://localhost/api/distribution/quotations?organizationId=public-org&view=sales-order",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      { includeContactRole: false },
    );
  });

  it("passes pagination cursors through after organization authorization", async () => {
    await GET(new Request(
      "http://localhost/api/distribution/quotations?organizationId=public-org&cursor=cursor-token",
    ));

    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      { includeContactRole: true, cursor: "cursor-token" },
    );
  });

  it("filters quotation register rows linked to a Sales Order", async () => {
    const response = await GET(new Request(
      "http://localhost/api/distribution/quotations?organizationId=public-org&salesOrderStatus=created",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      { includeContactRole: true, salesOrderCreated: true },
    );
  });

  it("filters quotation register rows not linked to a Sales Order", async () => {
    await GET(new Request(
      "http://localhost/api/distribution/quotations?organizationId=public-org&salesOrderStatus=not-created",
    ));

    expect(mocks.listDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      { includeContactRole: true, salesOrderCreated: false },
    );
  });

  it("rejects unsupported Sales Order status filters", async () => {
    const response = await GET(new Request(
      "http://localhost/api/distribution/quotations?organizationId=public-org&salesOrderStatus=unknown",
    ));

    expect(response.status).toBe(400);
    expect(mocks.requireSessionUser).not.toHaveBeenCalled();
    expect(mocks.listDistributionQuotations).not.toHaveBeenCalled();
  });

  it("creates a database quotation from booking IDs only for authorized merchandising roles", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      bookingIds: ["booking-1", "booking-2"],
      vendorId: "vendor-1",
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
      "vendor-1",
      null,
    );
  });

  it("creates a quotation using an organization Contact Master contact", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      bookingIds: ["booking-1"],
      vendorId: null,
      contactId: "contact-1",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createDistributionQuotationFromBookings).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["booking-1"],
      null,
      "contact-1",
    );
  });

  it("rejects invalid selection input before invoking the service", async () => {
    const response = await POST(post({ organizationId: "public-org", bookingIds: ["booking-1", 3], vendorId: "vendor-1" }));
    expect(response.status).toBe(400);
    expect(mocks.createDistributionQuotationFromBookings).not.toHaveBeenCalled();
  });

  it("requires exactly one Dealer or Contact Master contact", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      bookingIds: ["booking-1"],
      vendorId: "vendor-1",
      contactId: "contact-1",
    }));
    expect(response.status).toBe(400);
    expect(mocks.createDistributionQuotationFromBookings).not.toHaveBeenCalled();
  });

  it("deletes selected quotations only within the authorized organization", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      quotationIds: ["quotation-1"],
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.deleteDistributionQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quotation-1"],
    );
  });

  it("rejects malformed bulk deletion IDs before invoking the service", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      quotationIds: ["quotation-1", 2],
    }));

    expect(response.status).toBe(400);
    expect(mocks.deleteDistributionQuotations).not.toHaveBeenCalled();
  });

  it("does not list data when organization membership authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied."));
    const response = await GET(new Request("http://localhost/api/distribution/quotations?organizationId=other-org"));
    expect(response.status).toBe(400);
    expect(mocks.listDistributionQuotations).not.toHaveBeenCalled();
  });
});
