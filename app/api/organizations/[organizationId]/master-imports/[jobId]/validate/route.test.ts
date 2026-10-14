import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMasterImportRoute: vi.fn(),
  masterImportErrorResponse: vi.fn(),
  parseBoundedJson: vi.fn(),
  validateMasterImportJob: vi.fn(),
}));

vi.mock("@/lib/services/master-data/master-import-service", () => ({
  MASTER_IMPORT_VALIDATION_BATCH_SIZE: 1_000,
  validateMasterImportJob: mocks.validateMasterImportJob,
}));
vi.mock("../../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
  parseBoundedJson: mocks.parseBoundedJson,
}));

import { POST } from "./route";

describe("master import validation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "org-internal", userId: "user-1" },
    });
    mocks.masterImportErrorResponse.mockReturnValue(Response.json({ error: "Unexpected error." }, { status: 500 }));
    mocks.validateMasterImportJob.mockResolvedValue({ job: { id: "job-1" } });
  });

  it("validates only the explicitly selected rows", async () => {
    mocks.parseBoundedJson.mockResolvedValue({ rowNumbers: [4, 9] });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/validate", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.validateMasterImportJob).toHaveBeenCalledWith({
      organizationId: "org-internal",
      actorUserId: "user-1",
      jobId: "job-1",
      rowNumbers: [4, 9],
    });
  });

  it("rejects validation requests that do not identify selected rows", async () => {
    mocks.parseBoundedJson.mockResolvedValue({ batchSize: 1_000 });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/validate", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.validateMasterImportJob).not.toHaveBeenCalled();
  });

  it("accepts a full safe validation batch of 1,000 selected rows", async () => {
    const rowNumbers = Array.from({ length: 1_000 }, (_, index) => index + 1);
    mocks.parseBoundedJson.mockResolvedValue({ rowNumbers });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/validate", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.validateMasterImportJob).toHaveBeenCalledWith({
      organizationId: "org-internal",
      actorUserId: "user-1",
      jobId: "job-1",
      rowNumbers,
    });
    expect(mocks.parseBoundedJson).toHaveBeenCalledWith(expect.any(Request), 32 * 1024);
  });

  it("rejects batches larger than the safe validation limit", async () => {
    mocks.parseBoundedJson.mockResolvedValue({
      rowNumbers: Array.from({ length: 1_001 }, (_, index) => index + 1),
    });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/validate", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.validateMasterImportJob).not.toHaveBeenCalled();
  });
});
