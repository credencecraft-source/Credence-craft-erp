import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listWorkInProgress: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/factory/production-wip-service", () => ({
  listWorkInProgress: mocks.listWorkInProgress,
}));

import { GET } from "./route";

describe("factory production WIP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listWorkInProgress.mockResolvedValue({ records: [] });
  });

  it("requires VIEW_FACTORY_PRODUCTION before querying WIP", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: VIEW_FACTORY_PRODUCTION permission is required."),
    );

    const response = await GET(new Request(
      "http://localhost/api/factory/production/wip?organizationId=public-org",
    ));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_FACTORY_PRODUCTION",
    );
    expect(mocks.listWorkInProgress).not.toHaveBeenCalled();
  });
});
