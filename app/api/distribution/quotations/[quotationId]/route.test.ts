import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getDistributionQuotation: vi.fn(),
  saveDistributionQuotationDraft: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/quotation-service", () => ({
  getDistributionQuotation: mocks.getDistributionQuotation,
  saveDistributionQuotationDraft: mocks.saveDistributionQuotationDraft,
}));

import { GET, PATCH } from "./route";

const context = { params: Promise.resolve({ quotationId: "quotation-1" }) };
const patch = (body: unknown) => new Request("http://localhost/api/distribution/quotations/quotation-1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("distribution quotation detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.getDistributionQuotation.mockResolvedValue({ quotation: { id: "quotation-1" }, children: [] });
    mocks.saveDistributionQuotationDraft.mockResolvedValue({ id: "quotation-1" });
  });

  it("loads the quotation using authorized tenant scope", async () => {
    const response = await GET(new Request("http://localhost/api/distribution/quotations/quotation-1?organizationId=public-org"), context);
    expect(response.status).toBe(200);
    expect(mocks.getDistributionQuotation).toHaveBeenCalledWith("internal-org-1", "quotation-1");
  });

  it("saves header and detail inputs only for an authorized merchandising role", async () => {
    const response = await PATCH(patch({
      organizationId: "public-org",
      quotationDate: "2026-10-07",
      validUntil: "",
      notes: "Terms",
      lines: [{ id: "line-1", unitPrice: "12.50" }],
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(mocks.saveDistributionQuotationDraft).toHaveBeenCalledWith("internal-org-1", "user-1", "quotation-1", {
      quotationDate: "2026-10-07",
      validUntil: "",
      notes: "Terms",
      lines: [{ id: "line-1", unitPrice: "12.50" }],
    });
  });

  it("rejects malformed line values before persisting", async () => {
    const response = await PATCH(patch({
      organizationId: "public-org",
      quotationDate: "2026-10-07",
      validUntil: "",
      notes: "",
      lines: [{ id: "line-1", unitPrice: 12.5 }],
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.saveDistributionQuotationDraft).not.toHaveBeenCalled();
  });
});
