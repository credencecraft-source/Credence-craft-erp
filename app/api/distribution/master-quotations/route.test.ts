import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createDistributionMasterQuotation: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  createDistributionMasterQuotation: mocks.createDistributionMasterQuotation,
}));

import { POST } from "./route";

const post = (body: unknown) => new Request("http://localhost/api/distribution/master-quotations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("distribution master quotation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createDistributionMasterQuotation.mockResolvedValue({ id: "master-1" });
  });

  it("creates a master quotation with a selected Vendor Master vendor", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1", "quote-2"],
      vendorId: "vendor-1",
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createDistributionMasterQuotation).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quote-1", "quote-2"],
      "vendor-1",
    );
  });

  it("requires a vendor selection before calling the service", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1", "quote-2"],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createDistributionMasterQuotation).not.toHaveBeenCalled();
  });
});
