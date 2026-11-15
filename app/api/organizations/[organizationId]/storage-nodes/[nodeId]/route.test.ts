import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  updateStorageNode: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/inventory/storage-node-service", () => ({
  StorageNodeError: class StorageNodeError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
    }
  },
  updateStorageNode: mocks.updateStorageNode,
}));

import { PATCH } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", nodeId: "node-1" }) };
const request = (body: unknown) => new Request("http://localhost/api/organizations/public-org/storage-nodes/node-1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("organization storage-node detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({ id: "internal-org-1" });
    mocks.updateStorageNode.mockResolvedValue({ id: "node-1", name: "Main Warehouse" });
  });

  it("requires the dedicated management permission and updates within the authorized organization", async () => {
    const response = await PATCH(request({ name: "Main Warehouse" }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "MANAGE_STORAGE_NODES",
    );
    expect(mocks.updateStorageNode).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "node-1",
      { label: "Main Warehouse" },
    );
  });

  it("does not update storage nodes when management permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );

    const response = await PATCH(request({ name: "Unauthorized edit" }), context);

    expect(response.status).toBe(403);
    expect(mocks.updateStorageNode).not.toHaveBeenCalled();
  });
});
