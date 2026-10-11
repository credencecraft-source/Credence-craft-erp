import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  findContactRoles: vi.fn(),
  createContactWorkbook: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    contactRoleDefinition: { findMany: mocks.findContactRoles },
  },
}));
vi.mock("@/lib/master-data/contact-records-workbook-generator", () => ({
  createContactWorkbook: mocks.createContactWorkbook,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };
const requestFor = (body: unknown) => new Request("http://localhost/api/organizations/public-org/contacts/workbook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("organization contact workbook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({});
    mocks.findContactRoles.mockResolvedValue([{ code: "CUSTOMER" }]);
    mocks.createContactWorkbook.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("rejects unauthenticated exports", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(requestFor({ contacts: [] }), context);

    expect(response.status).toBe(401);
    expect(mocks.createContactWorkbook).not.toHaveBeenCalled();
  });

  it("requires the organization master-data permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));

    const response = await POST(requestFor({ contacts: [] }), context);

    expect(response.status).toBe(403);
    expect(mocks.createContactWorkbook).not.toHaveBeenCalled();
  });

  it("returns an authorized workbook with the expected download headers", async () => {
    const response = await POST(requestFor({ contacts: [] }), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(mocks.getOrganizationForUser).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_MASTER_DATA");
    expect(mocks.createContactWorkbook).toHaveBeenCalledWith([], ["CUSTOMER"]);
  });
});
