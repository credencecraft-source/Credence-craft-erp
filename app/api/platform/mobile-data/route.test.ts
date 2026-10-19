import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatformSessionAdmin: vi.fn(),
  listOrganizationClients: vi.fn(),
  listBusinessTypes: vi.fn(),
  listPlans: vi.fn(),
  listPlatformTags: vi.fn(),
  listSegments: vi.fn(),
  listSubscriptions: vi.fn(),
  listWorkspaceUsers: vi.fn(),
  listPlatformCampaigns: vi.fn(),
  listPlatformLeadAppLogins: vi.fn(),
  listPlatformLeads: vi.fn(),
  listSupportTickets: vi.fn(),
}));

vi.mock("@/lib/auth/platform-session-manager", () => ({
  getPlatformSessionAdmin: mocks.getPlatformSessionAdmin,
}));
vi.mock("@/lib/services/platform/client-service", () => ({ listOrganizationClients: mocks.listOrganizationClients }));
vi.mock("@/lib/services/platform/business-type-service", () => ({ listBusinessTypes: mocks.listBusinessTypes }));
vi.mock("@/lib/services/platform/plan-service", () => ({ listPlans: mocks.listPlans }));
vi.mock("@/lib/services/platform/platform-tag-service", () => ({ listPlatformTags: mocks.listPlatformTags }));
vi.mock("@/lib/services/platform/segment-service", () => ({ listSegments: mocks.listSegments }));
vi.mock("@/lib/services/platform/subscription-service", () => ({ listSubscriptions: mocks.listSubscriptions }));
vi.mock("@/lib/services/platform/workspace-user-service", () => ({ listWorkspaceUsers: mocks.listWorkspaceUsers }));
vi.mock("@/lib/services/platform/platform-campaign-service", () => ({ listPlatformCampaigns: mocks.listPlatformCampaigns }));
vi.mock("@/lib/services/platform/platform-lead-service", () => ({
  listPlatformLeadAppLogins: mocks.listPlatformLeadAppLogins,
  listPlatformLeads: mocks.listPlatformLeads,
}));
vi.mock("@/lib/services/organizations/support-ticket-service", () => ({ listSupportTickets: mocks.listSupportTickets }));

import { GET } from "./route";

function platformAdmin(teamRole: "CMO" | "CTO" | null) {
  return {
    id: "admin-1",
    role: teamRole ? "ADMIN" : "SUPER_ADMIN",
    actualRole: teamRole ? "ADMIN" : "SUPER_ADMIN",
    team_role: teamRole,
  };
}

function request(module: string) {
  return new Request(`https://example.test/api/platform/mobile-data?module=${module}`);
}

describe("platform mobile data API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlatformSessionAdmin.mockResolvedValue(platformAdmin(null));
    mocks.listOrganizationClients.mockResolvedValue([{ organization_id: "org-1" }]);
    mocks.listSubscriptions.mockResolvedValue([{ id: "subscription-1" }]);
  });

  it("returns 401 when the platform session is missing", async () => {
    mocks.getPlatformSessionAdmin.mockResolvedValue(null);

    const response = await GET(request("organisations"));

    expect(response.status).toBe(401);
  });

  it("denies organization data to a CMO view", async () => {
    mocks.getPlatformSessionAdmin.mockResolvedValue(platformAdmin("CMO"));

    const response = await GET(request("organisations"));

    expect(response.status).toBe(403);
    expect(mocks.listOrganizationClients).not.toHaveBeenCalled();
  });

  it("allows the CMO Leads and Subscriptions permission for subscriptions", async () => {
    mocks.getPlatformSessionAdmin.mockResolvedValue(platformAdmin("CMO"));

    const response = await GET(request("subscriptions"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      subscriptions: [{ id: "subscription-1" }],
    });
  });
});
