import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  getMasterValuesForOrganization: vi.fn(),
  getSizeGroupSizesForOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationAccess: vi.fn(),
}));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  createMasterValueForOrganization: vi.fn(),
  getMasterDefinition: vi.fn(),
  getMasterValuesForOrganization: mocks.getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization: mocks.getSizeGroupSizesForOrganization,
  syncSizeGroupSizes: vi.fn(),
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: vi.fn(() => false),
}));

import { GET } from "./route";

const contextFor = (moduleKey: string) => ({
  params: Promise.resolve({ organizationId: "public-org", moduleKey }),
});

describe("organization master-data lookup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-1" });
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
      groupId: "group-value-id",
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
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith("internal-org-1", undefined, true);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(14);
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
});