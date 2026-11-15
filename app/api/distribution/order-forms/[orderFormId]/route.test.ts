import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getDistributionOrderFormPdfData: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/order-form-pdf-data-service", () => ({
  getDistributionOrderFormPdfData: mocks.getDistributionOrderFormPdfData,
}));

import { GET } from "./route";

describe("distribution Order Form PDF API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.getDistributionOrderFormPdfData.mockResolvedValue({ orderForm: { id: "form-1" } });
  });

  it("loads the requested Order Form using the authorized internal organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/distribution/order-forms/form-1?organizationId=public-org"),
      { params: Promise.resolve({ orderFormId: "form-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getDistributionOrderFormPdfData).toHaveBeenCalledWith("internal-org-1", "form-1");
  });

  it("does not load an Order Form when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied."));

    const response = await GET(
      new Request("http://localhost/api/distribution/order-forms/form-1?organizationId=other-org"),
      { params: Promise.resolve({ orderFormId: "form-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.getDistributionOrderFormPdfData).not.toHaveBeenCalled();
  });
});
