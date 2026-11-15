import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  removeDistributorDealer: vi.fn(),
  replaceDistributorDealers: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/master-data/distributor-dealer-service", () => ({
  listDistributorDealers: vi.fn(),
  removeDistributorDealer: mocks.removeDistributorDealer,
  replaceDistributorDealers: mocks.replaceDistributorDealers,
}));

import { DELETE, PUT } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", contactId: "contact-1" }) };

describe("Distributor Dealer mapping mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  });

  it("denies replacement when MANAGE_MASTER_DATA is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: MANAGE_MASTER_DATA permission is required."),
    );

    const response = await PUT(new Request("http://localhost/api/organizations/public-org/contacts/contact-1/dealers", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealerIds: ["dealer-1"] }),
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.replaceDistributorDealers).not.toHaveBeenCalled();
  });

  it("denies removal when MANAGE_MASTER_DATA is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: MANAGE_MASTER_DATA permission is required."),
    );

    const response = await DELETE(new Request("http://localhost/api/organizations/public-org/contacts/contact-1/dealers", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealerId: "dealer-1" }),
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.removeDistributorDealer).not.toHaveBeenCalled();
  });
});
