import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock, getOrganizationForUserMock, requireOrganizationAccessMock, createWorkbookMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getOrganizationForUserMock: vi.fn(),
  requireOrganizationAccessMock: vi.fn(),
  createWorkbookMock: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: getOrganizationForUserMock,
  requireOrganizationAccess: requireOrganizationAccessMock,
}));
vi.mock("@/lib/services/master-data/organization-master-setup-workbook-service", () => ({
  createOrganizationMasterSetupWorkbook: createWorkbookMock,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ organizationId: "organization-public-id" }) };

function createRequest(query = "step=related&workspaceId=workspace-id") {
  return new Request(`http://localhost/api/organizations/organization-public-id/master-data/organization-master-setup-template?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUserMock.mockResolvedValue({ id: "user-id", workspace_id: "workspace-id" });
  getOrganizationForUserMock.mockResolvedValue({ id: "organization-internal-id" });
  createWorkbookMock.mockResolvedValue(Buffer.from([1, 2, 3]));
});

describe("organization master setup template route", () => {
  it("requires an authenticated session", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await GET(createRequest(), context);

    expect(response.status).toBe(401);
    expect(getOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("rejects a workspace mismatch before reading organization masters", async () => {
    const response = await GET(createRequest("step=related&workspaceId=another-workspace"), context);

    expect(response.status).toBe(403);
    expect(getOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("rejects invalid setup steps", async () => {
    const response = await GET(createRequest("step=unknown&workspaceId=workspace-id"), context);

    expect(response.status).toBe(400);
    expect(getOrganizationForUserMock).not.toHaveBeenCalled();
  });

  it("creates a workbook only after organization access is authorized", async () => {
    const response = await GET(createRequest(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("step-2.xlsx");
    expect(getOrganizationForUserMock).toHaveBeenCalledWith("user-id", "organization-public-id");
    expect(requireOrganizationAccessMock).toHaveBeenCalledWith(
      "user-id",
      "organization-internal-id",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    expect(createWorkbookMock).toHaveBeenCalledWith("organization-internal-id", "related");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
