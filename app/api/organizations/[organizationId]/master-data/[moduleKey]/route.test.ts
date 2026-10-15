import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  getOrganizationShellContext: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  createMasterValueForOrganization: vi.fn(),
  getActiveOrganizationDummyDataBatch: vi.fn(),
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
  getOrganizationShellContext: mocks.getOrganizationShellContext,
  requireOrganizationAccess: mocks.requireOrganizationAccess,
}));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  createMasterValueForOrganization: mocks.createMasterValueForOrganization,
  getActiveOrganizationDummyDataBatch: mocks.getActiveOrganizationDummyDataBatch,
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
    mocks.getOrganizationShellContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationAccess.mockResolvedValue(undefined);
    mocks.getActiveOrganizationDummyDataBatch.mockResolvedValue({ id: "active-batch-id" });
    mocks.getMasterValuesForOrganization.mockImplementation(async (
      _organizationId: string,
      moduleKey: string,
      _includeInactive: boolean,
      options?: { onRowsFetched?: (rowIds: string[]) => Promise<void> | void },
    ) => {
      if (moduleKey === "size-group") {
        await options?.onRowsFetched?.(["group-id"]);
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
    expect(response.headers.get("Server-Timing")).toBeNull();
    expect(mocks.getOrganizationShellContext).toHaveBeenCalledExactlyOnceWith("user-1", "public-org");
    expect(mocks.getOrganizationForUser).not.toHaveBeenCalled();
    expect(body.masterOptions["size-group"][0].sizes).toEqual([
      { id: "size-id", value_id: "size-value-id", label: "M", fields: {} },
    ]);
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith("internal-org-1", ["group-id"], true);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(14);
  });

  it("loads Size Group links while other order lookups are still pending", async () => {
    let releaseArticles!: (values: never[]) => void;
    const articlesPending = new Promise<never[]>((resolve) => {
      releaseArticles = resolve;
    });
    let notifySizeLinksStarted!: () => void;
    const sizeLinksStarted = new Promise<void>((resolve) => {
      notifySizeLinksStarted = resolve;
    });
    mocks.getMasterValuesForOrganization.mockImplementation(async (
      _organizationId: string,
      moduleKey: string,
      _includeInactive: boolean,
      options?: { onRowsFetched?: (rowIds: string[]) => Promise<void> | void },
    ) => {
      if (moduleKey === "article") return articlesPending;
      if (moduleKey === "size-group") {
        await options?.onRowsFetched?.(["group-id"]);
        return [{ id: "group-id", value_id: "group-value-id", label: "Adult", fields: {}, is_active: true }];
      }
      return [];
    });
    mocks.getSizeGroupSizesForOrganization.mockImplementation(async () => {
      notifySizeLinksStarted();
      return [];
    });

    const responsePending = GET(
      new Request("http://localhost/api/organizations/public-org/master-data/order-lookups?keys=article,size-group"),
      contextFor("order-lookups"),
    );
    const startedBeforeArticleLookup = await Promise.race([
      sizeLinksStarted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    releaseArticles([]);
    const response = await responsePending;

    expect(response.status).toBe(200);
    expect(startedBeforeArticleLookup).toBe(true);
  });

  it("does not run lookup queries when the organization membership cannot be resolved", async () => {
    mocks.getOrganizationShellContext.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/category"),
      contextFor("category"),
    );

    expect(response.status).toBe(404);
    expect(mocks.getMasterValuesForOrganization).not.toHaveBeenCalled();
  });

  it("reuses the active dummy batch for Size Group values and size links", async () => {
    mocks.getSizeGroupSizesForOrganization.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/size-group"),
      contextFor("size-group"),
    );

    expect(response.status).toBe(200);
    expect(mocks.getActiveOrganizationDummyDataBatch).toHaveBeenCalledExactlyOnceWith("internal-org-1");
    const activeDummyDataBatch = mocks.getMasterValuesForOrganization.mock.calls[0][3].activeDummyDataBatch;
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith(
      "internal-org-1",
      ["group-id"],
      false,
      activeDummyDataBatch,
    );
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
      expect.objectContaining({
        limit: 500,
        includeDummyData: true,
        includeArticleMetrics: false,
      }),
    );
    await expect(mocks.getMasterValuesForOrganization.mock.calls[0][3].activeDummyDataBatch)
      .resolves.toEqual({ id: "active-batch-id" });
    const batchPromises = mocks.getMasterValuesForOrganization.mock.calls
      .map((call) => call[3].activeDummyDataBatch);
    expect(batchPromises.every((batchPromise) => batchPromise === batchPromises[0])).toBe(true);
    expect(mocks.getActiveOrganizationDummyDataBatch).toHaveBeenCalledExactlyOnceWith("internal-org-1");
    expect(mocks.getSizeGroupSizesForOrganization).toHaveBeenCalledWith("internal-org-1", ["group-id"], true);
  });

  it("returns a compact order lookup shape without duplicate top-level lists", async () => {
    const defaultResponse = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/order-lookups?keys=category,buyer,size-group"),
      contextFor("order-lookups"),
    );
    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/order-lookups?keys=category,buyer,size-group&shape=compact"),
      contextFor("order-lookups"),
    );
    const defaultBody = await defaultResponse.json();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(defaultResponse.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["masterOptions", "orderLookups"]);
    expect(Object.keys(body.masterOptions).sort()).toEqual(["buyer", "category", "size-group"]);
    expect(body.masterOptions).toEqual(defaultBody.masterOptions);
    expect(body.orderLookups).toEqual(defaultBody.orderLookups);
    expect(defaultBody.buyers).toEqual(expect.any(Array));
    expect(defaultBody.buyers).toEqual(defaultBody.masterOptions.buyer);
    expect(JSON.stringify(body).length).toBeLessThan(JSON.stringify(defaultBody).length);
    expect(body.masterOptions["size-group"][0].sizes).toEqual([
      { id: "size-id", value_id: "size-value-id", label: "M", fields: {} },
    ]);
    expect(body.orderLookups).toEqual(expect.any(Array));
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
    mocks.getMasterValuesForOrganization.mockImplementation(async (_organizationId: string, moduleKey: string) => {
      if (moduleKey === "process-template") {
        return [{ id: "template-id", value_id: "template-value-id", label: "Sewing", fields: {} }];
      }
      if (moduleKey === "process-template-step") {
        return [
          { id: "step-2", value_id: "step-value-2", parent_id: "template-id", label: "Topstitch", fields: { Process: "Sew", Sl_No: 2 } },
          { id: "step-1", value_id: "step-value-1", parent_id: "template-id", label: "Join", fields: { Process: "Sew", Sl_No: 1, Operation_Template: "Preferred" } },
        ];
      }
      if (moduleKey === "operation-template") {
        return [
          { id: "preferred-id", value_id: "preferred-value", label: "Preferred", fields: { Process: "Sew", Sort_Order: 9 } },
          { id: "fallback-id", value_id: "fallback-value", label: "Fallback", fields: { Process: "Sew", Sort_Order: 1 } },
        ];
      }
      if (moduleKey === "operation-template-step") {
        return [
          { id: "preferred-op-2", value_id: "preferred-op-value-2", parent_id: "preferred-id", label: "Second", fields: { Operation: "Second", Sl_No: 2, Price: 2 } },
          { id: "fallback-op", value_id: "fallback-op-value", parent_id: "fallback-id", label: "Fallback Op", fields: { Operation: "Fallback Op", Sl_No: 1, Price: 1 } },
          { id: "preferred-op-1", value_id: "preferred-op-value-1", parent_id: "preferred-id", label: "First", fields: { Operation: "First", Sl_No: 1, Price: 1 } },
        ];
      }
      return [];
    });

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/process-template"),
      contextFor("process-template"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(4);
    expect(body[0].steps.map((step: { slNo: number }) => step.slNo)).toEqual([1, 2]);
    expect(body[0].steps[0]).toMatchObject({
      processName: "Sew",
      operationTemplateId: "preferred-id",
      operations: [
        { id: "preferred-op-1", slNo: 1, operation: "First", price: 1 },
        { id: "preferred-op-2", slNo: 2, operation: "Second", price: 2 },
      ],
      operationTemplates: [
        { id: "fallback-id", label: "Fallback" },
        { id: "preferred-id", label: "Preferred" },
      ],
    });
    expect(body[0].steps[1]).toMatchObject({
      operationTemplateId: "fallback-id",
      operations: [{ id: "fallback-op", slNo: 1, operation: "Fallback Op", price: 1 }],
    });
    const batchPromises = mocks.getMasterValuesForOrganization.mock.calls
      .map((call) => call[3].activeDummyDataBatch);
    expect(batchPromises.every((batchPromise) => batchPromise === batchPromises[0])).toBe(true);
    expect(mocks.getActiveOrganizationDummyDataBatch).toHaveBeenCalledExactlyOnceWith("internal-org-1");
  });

  it("starts all process-template relation reads before awaiting any of them", async () => {
    const requestedKeys = new Set<string>();
    let releaseReads!: () => void;
    const allReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    mocks.getMasterValuesForOrganization.mockImplementation(async (_organizationId: string, moduleKey: string) => {
      if (moduleKey === "process-template") return [];
      requestedKeys.add(moduleKey);
      if (requestedKeys.size === 3) releaseReads();
      await allReadsStarted;
      return [];
    });

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/master-data/process-template"),
      contextFor("process-template"),
    );

    expect(response.status).toBe(200);
    expect(requestedKeys).toEqual(new Set([
      "process-template-step",
      "operation-template",
      "operation-template-step",
    ]));
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