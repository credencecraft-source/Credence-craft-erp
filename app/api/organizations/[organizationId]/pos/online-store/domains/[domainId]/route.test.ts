import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  deleteDomain: vi.fn(),
  setPrimaryDomain: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  deleteOrganizationOnlineStoreDomain: mocks.deleteDomain,
  setOrganizationOnlineStorePrimaryDomain: mocks.setPrimaryDomain,
  OnlineStoreDomainError: class extends Error {
    status = 400;
  },
}));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", domainId: "domain-1" }) };

describe("POS online-store domain detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.setPrimaryDomain.mockResolvedValue({ id: "domain-1", isPrimary: true });
    mocks.deleteDomain.mockResolvedValue(undefined);
  });

  it("requires online-store management permission before changing the primary domain", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/domains/domain-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "make-primary" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "MANAGE_POS_ONLINE_STORE",
    );
    expect(mocks.setPrimaryDomain).toHaveBeenCalledWith({
      organization: { id: "internal-org-1" },
      actorId: "user-1",
      domainId: "domain-1",
    });
  });

  it("does not delete a domain when management permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );

    const response = await DELETE(new Request("http://localhost/api/domains/domain-1", { method: "DELETE" }), context);

    expect(response.status).toBe(403);
    expect(mocks.deleteDomain).not.toHaveBeenCalled();
  });
});
