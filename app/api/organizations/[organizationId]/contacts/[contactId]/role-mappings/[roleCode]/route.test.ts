import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  replaceRoleMappedContacts: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/master-data/distributor-dealer-service", () => ({
  listRoleMappedContacts: vi.fn(),
  replaceRoleMappedContacts: mocks.replaceRoleMappedContacts,
}));

import { PUT } from "./route";

describe("organization contact role mapping mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  });

  it("denies role mapping changes without MANAGE_MASTER_DATA", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: MANAGE_MASTER_DATA permission is required."),
    );

    const response = await PUT(new Request(
      "http://localhost/api/organizations/public-org/contacts/contact-1/role-mappings/DEALER",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactIds: ["dealer-1"] }),
      },
    ), {
      params: Promise.resolve({
        organizationId: "public-org",
        contactId: "contact-1",
        roleCode: "DEALER",
      }),
    });

    expect(response.status).toBe(403);
    expect(mocks.replaceRoleMappedContacts).not.toHaveBeenCalled();
  });
});
