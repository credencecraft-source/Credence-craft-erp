import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getTenantUsageDailyCostBreakdown: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/workspace/tenant-usage-billing-service", () => ({
  getTenantUsageDailyCostBreakdown: mocks.getTenantUsageDailyCostBreakdown,
  TenantUsageBillMonthError: class TenantUsageBillMonthError extends Error {},
}));

import { GET } from "./route";

describe("workspace daily usage cost breakdown API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getTenantUsageDailyCostBreakdown.mockResolvedValue({
      month: "2026-10",
      organizationName: "SAMPLE ORGANIZATION",
      rows: [],
      isBilledSnapshot: false,
      rates: {},
      telemetry: { egressCaptured: false, mediaStorageConnected: false },
    });
  });

  it("requires authentication and the matching workspace", async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET(new Request(
      "http://localhost/api/workspace/usage/cost/bills/breakdown?workspaceId=workspace-1&organizationId=public-org-1&month=2026-10",
    ));
    const wrongWorkspace = await GET(new Request(
      "http://localhost/api/workspace/usage/cost/bills/breakdown?workspaceId=workspace-2&organizationId=public-org-1&month=2026-10",
    ));

    expect(unauthenticated.status).toBe(401);
    expect(wrongWorkspace.status).toBe(404);
    expect(mocks.getTenantUsageDailyCostBreakdown).not.toHaveBeenCalled();
  });

  it("passes the public organization id and month to the authorized service", async () => {
    const response = await GET(new Request(
      "http://localhost/api/workspace/usage/cost/bills/breakdown?workspaceId=workspace-1&organizationId=public-org-1&month=2026-10",
    ));

    expect(response.status).toBe(200);
    expect(mocks.getTenantUsageDailyCostBreakdown).toHaveBeenCalledWith({
      workspaceUserId: "user-1",
      publicOrganizationId: "public-org-1",
      month: "2026-10",
    });
    await expect(response.json()).resolves.toMatchObject({
      month: "2026-10",
      isBilledSnapshot: false,
    });
  });
});
