import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, MockMasterImportServiceError } = vi.hoisted(() => {
  class MockMasterImportServiceError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
  return {
    MockMasterImportServiceError,
    mocks: {
      authorizeMasterImportRoute: vi.fn(),
      createMasterValueForOrganization: vi.fn(),
      getMasterDefinition: vi.fn(),
      getMasterImportJob: vi.fn(),
      masterImportErrorResponse: vi.fn((error: unknown) => Response.json({
        error: error instanceof Error ? error.message : "Unexpected error",
      }, { status: error instanceof MockMasterImportServiceError ? error.status : 500 })),
      parseBoundedJson: vi.fn(),
    },
  };
});

vi.mock("@/lib/master-data/master-data-constants", () => ({
  createMasterValueForOrganization: mocks.createMasterValueForOrganization,
}));
vi.mock("@/lib/master-data/master-data-registry", () => ({
  getMasterDefinition: mocks.getMasterDefinition,
}));
vi.mock("@/lib/services/master-data/master-import-service", () => ({
  getMasterImportJob: mocks.getMasterImportJob,
  MasterImportServiceError: MockMasterImportServiceError,
}));
vi.mock("../../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
  parseBoundedJson: mocks.parseBoundedJson,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({ organizationId: "public-org", jobId: "job-1" }),
};

describe("POST suggested import masters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "internal-org", userId: "user-1" },
    });
    mocks.getMasterImportJob.mockResolvedValue({
      job: { moduleKey: "article", expiresAt: "2099-01-01T00:00:00.000Z" },
    });
    mocks.parseBoundedJson.mockResolvedValue({
      suggestions: [{
        moduleKey: "brand",
        label: "NORTH STAR",
        fields: { Brand: "NORTH STAR" },
      }],
    });
    mocks.getMasterDefinition.mockReturnValue({
      label: "Brand",
      fields: [{ key: "Brand", required: true }],
    });
    mocks.createMasterValueForOrganization.mockResolvedValue({ id: "brand-1" });
  });

  it("creates organization-scoped suggested masters for Article import errors", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ createdCount: 1, failedCount: 0 });
    expect(mocks.getMasterImportJob).toHaveBeenCalledWith("internal-org", "job-1", {
      skip: 0,
      take: 1,
      tab: "errors",
    });
    expect(mocks.createMasterValueForOrganization).toHaveBeenCalledWith(
      "internal-org",
      "brand",
      { label: "NORTH STAR", fields: { Brand: "NORTH STAR" }, createOnly: true },
    );
  });

  it("rejects Size Groups so their brand and size links remain manually reviewed", async () => {
    mocks.parseBoundedJson.mockResolvedValue({
      suggestions: [{ moduleKey: "size-group", label: "CORE S-M", fields: { Size: ["S", "M"] } }],
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), context);

    expect(response.status).toBe(400);
    expect(mocks.createMasterValueForOrganization).not.toHaveBeenCalled();
  });

  it("reports individual creation failures without hiding successful batch results", async () => {
    mocks.parseBoundedJson.mockResolvedValue({
      suggestions: [
        { moduleKey: "brand", label: "GOOD", fields: { Brand: "GOOD" } },
        { moduleKey: "color", label: "CONFLICT", fields: { Colors: "CONFLICT" } },
      ],
    });
    mocks.getMasterDefinition.mockImplementation((moduleKey: string) => ({
      label: moduleKey === "brand" ? "Brand" : "Color",
      fields: [{ key: moduleKey === "brand" ? "Brand" : "Colors", required: true }],
    }));
    mocks.createMasterValueForOrganization
      .mockResolvedValueOnce({ id: "brand-1" })
      .mockRejectedValueOnce(new Error('Color "CONFLICT" already exists.'));

    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      createdCount: 1,
      failedCount: 1,
      results: [
        { moduleKey: "brand", label: "GOOD", created: true },
        { moduleKey: "color", label: "CONFLICT", created: false, error: 'Color "CONFLICT" already exists.' },
      ],
    });
  });
});
