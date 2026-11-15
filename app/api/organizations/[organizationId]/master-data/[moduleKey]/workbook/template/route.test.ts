import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getMasterDefinition: vi.fn(),
  getMasterValuesForOrganization: vi.fn(),
  getActiveOrganizationDummyDataBatch: vi.fn(),
  getSizeGroupSizesForOrganization: vi.fn(),
  createWorkbook: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  getActiveOrganizationDummyDataBatch: mocks.getActiveOrganizationDummyDataBatch,
  getMasterDefinition: mocks.getMasterDefinition,
  getMasterValuesForOrganization: mocks.getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization: mocks.getSizeGroupSizesForOrganization,
}));
vi.mock("@/lib/master-data/master-records-template-workbook", () => ({
  createMasterRecordsTemplateWorkbook: mocks.createWorkbook,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { GET } from "./route";

const definition = {
  key: "season",
  label: "Season",
  hidden: false,
  fields: [
    { key: "season_name", label: "Season Name", type: "text" },
    { key: "buyer_id", label: "Buyer", type: "lookup", lookupModuleKey: "buyer" },
  ],
};
const context = {
  params: Promise.resolve({ organizationId: "public-org", moduleKey: "season" }),
};

describe("organization master-data template route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({});
    mocks.getActiveOrganizationDummyDataBatch.mockResolvedValue({ id: "active-batch-id" });
    mocks.getMasterDefinition.mockReturnValue(definition);
    mocks.getMasterValuesForOrganization.mockResolvedValue([{
      id: "buyer-id",
      value_id: "buyer-value",
      label: "Buyer One",
      parent_id: null,
    }]);
    mocks.getSizeGroupSizesForOrganization.mockResolvedValue([]);
    mocks.createWorkbook.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("rejects unauthenticated requests before generating a workbook", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/template"), context);

    expect(response.status).toBe(401);
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
  });

  it("requires master-data permission before loading organization lookup values", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: Insufficient permissions."));

    const response = await GET(new Request("http://localhost/api/template"), context);

    expect(response.status).toBe(403);
    expect(mocks.getMasterValuesForOrganization).not.toHaveBeenCalled();
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
  });

  it("generates a blank template with lookup options scoped to the authorized organization", async () => {
    const response = await GET(new Request("http://localhost/api/template"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toContain("season-master-template.xlsx");
    expect(mocks.getOrganizationForUser).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_MASTER_DATA");
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledWith(
      "internal-org-1",
      "buyer",
      true,
      expect.objectContaining({ includeDummyData: true }),
    );
    await expect(mocks.getMasterValuesForOrganization.mock.calls[0][3].activeDummyDataBatch)
      .resolves.toEqual({ id: "active-batch-id" });
    expect(mocks.createWorkbook).toHaveBeenCalledWith({
      records: [],
      fields: definition.fields,
      lookupOptions: {
        buyer: [{ id: "buyer-id", value_id: "buyer-value", label: "Buyer One", parent_id: null }],
      },
      childRecords: [],
      moduleLabel: "Season",
    });
  });
});
