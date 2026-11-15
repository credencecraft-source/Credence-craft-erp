import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listPosCounterLocations: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/pos-counter-service", () => ({
  listPosCounterLocations: mocks.listPosCounterLocations,
  PosCounterValidationError: class PosCounterValidationError extends Error {},
}));

import { GET } from "./route";

describe("POS counter location lookup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPosCounterLocations.mockResolvedValue({
      locations: [{ id: "leaf-1", label: "SITE / WAREHOUSE / STORE" }],
      nextCursor: { id: "leaf-2", nodeName: "STORE 2" },
    });
  });

  it("returns bounded, tenant-scoped active location choices with an opaque cursor", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter/locations?search=store&limit=25"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_COUNTERS",
    );
    expect(mocks.listPosCounterLocations).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      search: "store",
      cursor: null,
      limit: 25,
    });
    expect(body.locations).toHaveLength(1);
    expect(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString("utf8"))).toEqual({
      id: "leaf-2",
      nodeName: "STORE 2",
    });
  });

  it("rejects malformed cursors without querying locations", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/counter/locations?cursor=invalid"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.listPosCounterLocations).not.toHaveBeenCalled();
  });
});
