import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  createMasterValueForOrganization: vi.fn(),
  getMasterDefinition: vi.fn(),
  getMasterValuesForOrganization: vi.fn(),
  getSizeGroupSizesForOrganization: vi.fn(),
  syncSizeGroupSizes: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationAccess: mocks.requireOrganizationAccess,
}));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  createMasterValueForOrganization: mocks.createMasterValueForOrganization,
  getMasterDefinition: mocks.getMasterDefinition,
  getMasterValuesForOrganization: mocks.getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization: mocks.getSizeGroupSizesForOrganization,
  syncSizeGroupSizes: mocks.syncSizeGroupSizes,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));

import { GET, POST } from "./route";

const contextFor = (moduleKey: string) => ({
  params: Promise.resolve({ organizationId: "public-org", moduleKey }),
});

describe("organization master-data lookup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationAccess.mockResolvedValue(undefined);
    mocks.getMasterValuesForOrganization.mockImplementation(async (_organizationId: string, moduleKey: string) => {
      if (moduleKey === "size-group") {
        return [{
          id: "group-id",
          value_id: "group-value-id",
          label: "Adult",
          fields: {},
          is_active: true,
        }];
      }
      if (moduleKey === "process-template") {
        return [{ id: "template-id", value_id: "template-value-id", label: "Sewing", fields: {} }];
      }
      if (moduleKey === "process-template-step") {
        return [{
          id: "step-id",
          value_id: "step-value-id",
          parent_id: "template-id",
          label: "Stitch",
          fields: { Process: "Stitch", Sl_No: 1, Operation_Template: "" },
        }];
      }
      if (moduleKey === "operation-template") {
        return [{
          id: "operation-template-id",
          value_id: "operation-template-value-id",
          label: "Stitch Ops",
          parent_id: null,
          fields: { Process: "Stitch", Sort_Order: 1 },
        }];
      }
      if (moduleKey === "operation-template-step") {
        return [{
          id: "operation-id",
          value_id: "operation-value-id",
          parent_id: "operation-template-id",
          label: "Lockstitch",
          fields: { Operation: "Lockstitch", Sl_No: 1, Price: 2 },
        }];
      }
      return [];
    });
    mocks.getSizeGroupSizesForOrganization.mockResolvedValue([{
      groupId: "group-id",
      size: { id: "size-id", value_id: "size-value-id", label: "M", fields: {} },
    }]);
  });

  it("groups size links by group once and preserves group size options", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/size-group"),
      contextFor("order-lookups"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.masterOptions["size-group"][0].sizes).toEqual([
      { id: "size-id", value_id: "size-value-id", label: "M", fields: {} },
    ]);
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith("internal-org-1", ["group-id"], true);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(14);
  });

  it("loads only the requested Article-order lookup lists", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/order-lookups?includeInactive=false&limit=500&keys=article,entity,buyer,season,size-group"),
      contextFor("order-lookups"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body.masterOptions).sort()).toEqual(["article", "buyer", "entity", "season", "size-group"]);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(5);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledWith(
      "internal-org-1",
      "article",
      false,
      { limit: 500, includeDummyData: true, includeArticleMetrics: false },
    );
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith("internal-org-1", ["group-id"], true);
  });

  it("rejects unknown requested order lookup keys", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/order-lookups?keys=article,unknown"),
      contextFor("order-lookups"),
    );

    expect(response.status).toBe(400);
    expect(mocks.getMasterValuesForOrganization).not.toHaveBeenCalled();
  });

  it("loads process-template relations in parallel and preserves ordered operation results", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/process-template"),
      contextFor("process-template"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(4);
    expect(body[0].steps[0]).toMatchObject({
      processName: "Stitch",
      operationTemplateId: "operation-template-id",
      operations: [{
        id: "operation-id",
        slNo: 1,
        operation: "Lockstitch",
        price: 2,
      }],
    });
  });

  it("creates Size Group links through the master's single transaction", async () => {
    mocks.getMasterDefinition.mockReturnValue({
      label: "Size Group",
      fields: [
        { key: "Brand1", required: true },
        { key: "Size_Group", required: true },
        { key: "Size", required: true, multiple: true, lookupModuleKey: "size" },
      ],
    });
    mocks.createMasterValueForOrganization.mockResolvedValue({ id: "group-id", value_id: "group-value-id" });

    const response = await POST(new Request("http://localhost/api/organizations/public-org/master-data/size-group", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: "CORE S-M",
        fields: { Brand1: "ACME", Size_Group: "CORE S-M", Size: ["S", "M"] },
        createOnly: true,
      }),
    }), {
      params: Promise.resolve({ organizationId: "public-org", moduleKey: "size-group" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createMasterValueForOrganization).toHaveBeenCalledWith(
      "internal-org-1",
      "size-group",
      expect.objectContaining({
        label: "CORE S-M",
        fields: { Brand1: "ACME", Size_Group: "CORE S-M", Size: ["S", "M"] },
        createOnly: true,
      }),
    );
    expect(mocks.syncSizeGroupSizes).not.toHaveBeenCalled();
  });
});