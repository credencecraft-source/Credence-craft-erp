import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getPosCounterById: vi.fn(),
  getPosCounterIdFromRouteKey: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-counter-service", () => ({
  getPosCounterById: mocks.getPosCounterById,
  getPosCounterIdFromRouteKey: mocks.getPosCounterIdFromRouteKey,
}));

import PosDayBookCounterRoute from "./page";

const params = {
  workspaceId: "workspace-1",
  organizationId: "public-org-1",
  counterType: "COUNTER",
  counterKey: "front-counter--counter-1",
};

describe("POS Day Book counter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({
      id: "user-1",
      workspace_id: "workspace-1",
    });
    mocks.requireOrganizationContext.mockResolvedValue({
      id: "internal-org-1",
      organizationId: "public-org-1",
    });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getPosCounterIdFromRouteKey.mockReturnValue("counter-1");
    mocks.getPosCounterById.mockResolvedValue({
      id: "counter-1",
      counterName: "FRONT COUNTER",
      routeKey: "front-counter--counter-1",
      subSubLocationPath: "SITE / WAREHOUSE / STORE",
      createdAt: "2026-11-15T10:00:00.000Z",
    });
  });

  it("authorizes the route before loading the counter by tenant and stable ID", async () => {
    const result = await PosDayBookCounterRoute({ params: Promise.resolve(params) });

    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org-1");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_COUNTERS",
    );
    expect(mocks.getPosCounterById).toHaveBeenCalledWith("internal-org-1", "counter-1");
    expect(result).toHaveProperty("props.organizationId", "public-org-1");
    expect(result).toBeTruthy();
  });

  it("redirects workspace mismatches before organization lookup", async () => {
    mocks.requireSessionUser.mockResolvedValue({
      id: "user-1",
      workspace_id: "other-workspace",
    });

    await expect(
      PosDayBookCounterRoute({ params: Promise.resolve(params) }),
    ).rejects.toThrow("REDIRECT:/dashboard/other-workspace/home");
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.getPosCounterById).not.toHaveBeenCalled();
  });

  it("does not reveal a counter that is not found in the authorized organization", async () => {
    mocks.getPosCounterById.mockResolvedValue(null);

    await expect(
      PosDayBookCounterRoute({ params: Promise.resolve(params) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.getPosCounterById).toHaveBeenCalledWith("internal-org-1", "counter-1");
  });
});
