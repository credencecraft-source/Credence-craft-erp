import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createWorkbook: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/master-data/master-records-template-workbook", () => ({
  createMasterRecordsTemplateWorkbook: mocks.createWorkbook,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", moduleKey: "season" }) };
const requestFor = (body: unknown) => new Request("http://localhost/api/organizations/public-org/master-data/season/workbook", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const blankTemplateRequest = {
  includeRecords: false,
  records: [],
  fields: [{ key: "Season_Name", label: "Season Name", type: "text" }],
  lookupOptions: {},
  childRecords: [],
  moduleLabel: "Season",
};

describe("organization master-data workbook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({});
    mocks.createWorkbook.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("rejects unauthenticated exports", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(requestFor(blankTemplateRequest), context);

    expect(response.status).toBe(401);
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
  });

  it("rejects invalid workbook payloads before generation", async () => {
    const response = await POST(requestFor({ ...blankTemplateRequest, fields: [{ key: "bad" }] }), context);

    expect(response.status).toBe(400);
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
  });

  it("generates only a blank template for an authorized organization", async () => {
    const response = await POST(requestFor(blankTemplateRequest), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(mocks.getOrganizationForUser).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_MASTER_DATA");
    expect(mocks.createWorkbook).toHaveBeenCalledWith({
      records: [],
      fields: blankTemplateRequest.fields,
      lookupOptions: {},
      childRecords: [],
      moduleLabel: "Season",
    });
  });
});
