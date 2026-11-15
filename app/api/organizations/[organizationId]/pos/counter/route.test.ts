import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPosCounter: vi.fn(),
  listPosCounters: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-counter-service", () => ({
  createPosCounter: mocks.createPosCounter,
  listPosCounters: mocks.listPosCounters,
  PosCounterConflictError: class PosCounterConflictError extends Error {},
  PosCounterValidationError: class PosCounterValidationError extends Error {},
}));

import { GET, POST } from "./route";

describe("POS counter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosCounters.mockResolvedValue({
      counters: [{
        id: "counter-1",
        counterName: "COUNTER 1",
        subSubLocationId: "leaf-1",
        subSubLocationPath: "SITE / WAREHOUSE / STORE",
        createdAt: "2026-11-15T10:00:00.000Z",
      }],
      nextCursor: null,
    });
    mocks.createPosCounter.mockResolvedValue({
      id: "counter-2",
      counterName: "COUNTER 2",
    });
  });

  it("lists counters using the authorized internal organization", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter?search=front&limit=25"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenNthCalledWith(
      1,
      "user-1",
      "internal-org-1",
      "VIEW_POS_COUNTERS",
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledTimes(1);
    expect(mocks.listPosCounters).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      search: "front",
      cursor: null,
      limit: 25,
    });
    expect(body.counters).toHaveLength(1);
  });

  it("does not query the report without view permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: missing view permission."),
    );

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.listPosCounters).not.toHaveBeenCalled();
  });

  it("creates a counter using the authorized organization and authenticated actor", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterName: "Counter 2",
          subSubLocationId: "leaf-2",
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "CREATE_POS_COUNTERS",
    );
    expect(mocks.createPosCounter).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorId: "user-1",
      counterName: "Counter 2",
      subSubLocationId: "leaf-2",
    });
    expect(body.counter.id).toBe("counter-2");
  });

  it("rejects unauthenticated requests before organization lookup", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listPosCounters).not.toHaveBeenCalled();
  });
});
