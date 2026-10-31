import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createDistributionMasterQuotations: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  createDistributionMasterQuotations: mocks.createDistributionMasterQuotations,
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
    mocks.createDistributionMasterQuotations.mockResolvedValue([{ id: "master-1" }]);
  });

  it("creates a master quotation with a selected Vendor Master vendor", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1", "quote-2"],
      vendorId: "vendor-1",
      contactId: null,
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ quotations: [{ id: "master-1" }] });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.createDistributionMasterQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quote-1", "quote-2"],
      "vendor-1",
      null,
    );
  });

  it("allows a single regular quotation to create a sales order", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1"],
      vendorId: "vendor-1",
      contactId: null,
    }));

    expect(response.status).toBe(201);
    expect(mocks.createDistributionMasterQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      "vendor-1",
      null,
    );
  });

  it("allows any Contact Master contact to create a sales order", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1"],
      contactId: "contact-1",
    }));

    expect(response.status).toBe(201);
    expect(mocks.createDistributionMasterQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      null,
      "contact-1",
    );
  });

  it("delegates automatic Distributor routing to the organization-scoped service", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1"],
    }));

    expect(response.status).toBe(201);
    expect(mocks.createDistributionMasterQuotations).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["quote-1"],
      null,
      null,
    );
  });

  it("asks the client for a counterparty when automatic routing is not eligible", async () => {
    mocks.createDistributionMasterQuotations.mockResolvedValueOnce(null);
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1"],
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requiresCounterpartySelection: true });
  });

  it("rejects simultaneous Vendor and Contact selections", async () => {
    const response = await POST(post({
      organizationId: "public-org",
      quotationIds: ["quote-1"],
      vendorId: "vendor-1",
      contactId: "contact-1",
    }));

    expect(response.status).toBe(400);
    expect(mocks.createDistributionMasterQuotations).not.toHaveBeenCalled();
  });

  it("does not call the creation service when the user lacks organization access", async () => {
    mocks.requireOrganizationContext.mockRejectedValueOnce(new Error("Access denied"));
    const response = await POST(post({
      organizationId: "foreign-public-org",
      quotationIds: ["foreign-quote"],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createDistributionMasterQuotations).not.toHaveBeenCalled();
  });
});
