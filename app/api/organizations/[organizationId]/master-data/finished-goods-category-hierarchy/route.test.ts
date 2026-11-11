import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createFinishedGoodsCategoryHierarchy: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationAccess: mocks.requireOrganizationAccess,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/master-data/finished-goods-category-hierarchy-service", () => ({
  createFinishedGoodsCategoryHierarchy: mocks.createFinishedGoodsCategoryHierarchy,
  FinishedGoodsCategoryHierarchyError: class FinishedGoodsCategoryHierarchyError extends Error {
    readonly status = 409;
  },
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };
const validPayload = {
  productType: "Finished Goods",
  existingCategory: "Coord Set",
  category: "Indigo Denim",
  subcategory: "Coord Set",
};

function request(body: unknown, workspaceId = "workspace-1") {
  return new Request(`http://localhost/api/organizations/public-org/master-data/finished-goods-category-hierarchy?workspaceId=${workspaceId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
  mocks.getOrganizationForUser.mockResolvedValue({
    id: "internal-org",
    organization_id: "public-org",
  });
  mocks.requireOrganizationAccess.mockResolvedValue({ role: "ADMIN" });
  mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  mocks.createFinishedGoodsCategoryHierarchy.mockResolvedValue({
    category: "INDIGO DENIM",
    subcategory: "COORD SET",
    createdCategory: true,
    createdSubcategory: true,
  });
});

describe("Finished Goods Category hierarchy API", () => {
  it("requires authentication and matching workspace", async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const unauthenticated = await POST(request(validPayload), context);
    expect(unauthenticated.status).toBe(401);

    const wrongWorkspace = await POST(request(validPayload, "other-workspace"), context);
    expect(wrongWorkspace.status).toBe(403);
    expect(mocks.createFinishedGoodsCategoryHierarchy).not.toHaveBeenCalled();
  });

  it("rejects non-members and insufficient organization roles", async () => {
    mocks.getOrganizationForUser.mockResolvedValueOnce(null);
    const nonMember = await POST(request(validPayload), context);
    expect(nonMember.status).toBe(404);

    mocks.requireOrganizationAccess.mockRejectedValueOnce(new Error("Access denied: Insufficient permissions."));
    const insufficientRole = await POST(request(validPayload), context);
    expect(insufficientRole.status).toBe(403);
    expect(mocks.createFinishedGoodsCategoryHierarchy).not.toHaveBeenCalled();
  });

  it("requires master-data permission before creating hierarchy records", async () => {
    mocks.requireOrganizationPermission.mockRejectedValueOnce(
      new Error("Access denied: MANAGE_MASTER_DATA permission is required."),
    );

    const response = await POST(request(validPayload), context);

    expect(response.status).toBe(403);
    expect(mocks.createFinishedGoodsCategoryHierarchy).not.toHaveBeenCalled();
  });

  it("validates request shape and creates records using the internal organization id", async () => {
    const invalid = await POST(request({ ...validPayload, unexpected: true }), context);
    expect(invalid.status).toBe(400);

    const response = await POST(request({
      ...validPayload,
      productType: "",
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.createFinishedGoodsCategoryHierarchy).toHaveBeenCalledWith({
      organizationId: "internal-org",
      actorUserId: "user-1",
      productType: "",
      existingCategory: "Coord Set",
      category: "Indigo Denim",
      subcategory: "Coord Set",
    });
  });
});
