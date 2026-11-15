import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  createStandaloneUser: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-invitation-service", () => ({
  createStandaloneUser: mocks.createStandaloneUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationAccess: mocks.requireOrganizationAccess,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { POST } from "./organization-user-handler";

describe("organization user creation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationAccess.mockResolvedValue({ organization_id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.createStandaloneUser.mockResolvedValue({ id: "new-user" });
  });

  it("denies user creation when MANAGE_USERS is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: MANAGE_USERS permission is required."),
    );

    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "Employee", email: "employee@example.com" }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createStandaloneUser).not.toHaveBeenCalled();
  });
});
