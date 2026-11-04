import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createStorageNode: vi.fn(),
  listStorageNodesForOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/inventory/storage-node-service", () => ({
  createStorageNode: mocks.createStorageNode,
  listStorageNodesForOrganization: mocks.listStorageNodesForOrganization,
  STORAGE_NODE_TYPES: ["LOCATION_SITE", "WAREHOUSE", "SUB_STORE", "RACK", "BIN"],
  StorageNodeError: class StorageNodeError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };
const request = (body: unknown) => new Request("http://localhost/api/organizations/public-org/storage-nodes", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("organization storage-node API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({ id: "internal-org-1" });
    mocks.listStorageNodesForOrganization.mockResolvedValue([{ id: "bin-1" }]);
    mocks.createStorageNode.mockResolvedValue({ id: "node-1" });
  });

  it("lists nodes only after organization authorization and uses the internal organization ID", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/storage-nodes?nodeType=BIN&limit=100"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listStorageNodesForOrganization).toHaveBeenCalledWith("internal-org-1", {
      includeInactive: false,
      nodeType: "BIN",
      siteEntityId: undefined,
      search: undefined,
      limit: 101,
      cursor: undefined,
    });
  });

  it("scopes bounded Bin lookups to the selected tenant-owned Entity", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/storage-nodes?nodeType=BIN&siteEntityId=entity-1&search=bin&limit=50"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.listStorageNodesForOrganization).toHaveBeenCalledWith("internal-org-1", {
      includeInactive: false,
      nodeType: "BIN",
      siteEntityId: "entity-1",
      search: "bin",
      limit: 51,
      cursor: undefined,
    });
    expect(await response.json()).toMatchObject({
      nodes: [{ id: "bin-1" }],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("rejects unauthenticated writes before organization authorization", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Unauthenticated"));

    const response = await POST(request({ nodeType: "LOCATION_SITE", code: "SITE-1", name: "Site", entityId: "entity-1" }), context);

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationPermission).not.toHaveBeenCalled();
    expect(mocks.createStorageNode).not.toHaveBeenCalled();
  });

  it("requires master-data permission and passes the authorized internal organization ID to creation", async () => {
    const response = await POST(request({
      nodeType: "LOCATION_SITE",
      code: "SITE-1",
      name: "Bengaluru",
      entityId: "entity-1",
    }), context);

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "public-org", "MANAGE_MASTER_DATA");
    expect(mocks.createStorageNode).toHaveBeenCalledWith("internal-org-1", "user-1", {
      nodeType: "LOCATION_SITE",
      code: "SITE-1",
      name: "Bengaluru",
      parentId: undefined,
      entityId: "entity-1",
    });
  });

  it("rejects invalid lookup types and out-of-range lookup limits", async () => {
    const badType = await GET(
      new Request("http://localhost/api/organizations/public-org/storage-nodes?nodeType=UNKNOWN"),
      context,
    );
    const badLimit = await GET(
      new Request("http://localhost/api/organizations/public-org/storage-nodes?limit=501"),
      context,
    );

    expect(badType.status).toBe(400);
    expect(badLimit.status).toBe(400);
    expect(mocks.listStorageNodesForOrganization).not.toHaveBeenCalled();
  });
});
