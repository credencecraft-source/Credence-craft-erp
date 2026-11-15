import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMasterImportRoute: vi.fn(),
  commitNextMasterImportRow: vi.fn(),
  getMasterImportCommitLookupIndex: vi.fn(),
  getMasterImportPlanProgress: vi.fn(),
  getValidatedMasterImportPlanRows: vi.fn(),
  masterImportErrorResponse: vi.fn(),
}));

vi.mock("@/lib/services/master-data/master-import-service", () => ({
  commitNextMasterImportRow: mocks.commitNextMasterImportRow,
  getMasterImportCommitLookupIndex: mocks.getMasterImportCommitLookupIndex,
  getMasterImportPlanProgress: mocks.getMasterImportPlanProgress,
  getValidatedMasterImportPlanRows: mocks.getValidatedMasterImportPlanRows,
}));
vi.mock("../../../../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
}));

import { POST } from "./route";

describe("master import plan commit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "org-internal", userId: "user-1" },
    });
    mocks.getValidatedMasterImportPlanRows.mockResolvedValue([]);
    mocks.getMasterImportCommitLookupIndex.mockResolvedValue(undefined);
    mocks.getMasterImportPlanProgress.mockResolvedValue({
      recordCount: 2,
      validatedCount: 0,
      importedCount: 2,
      errorCount: 0,
    });
    mocks.commitNextMasterImportRow.mockImplementation(async ({ rowNumber }: { rowNumber: number }) => ({
      job: { id: "job-1", status: "IMPORTING" },
      row: { rowNumber, status: "IMPORTED" },
    }));
    mocks.masterImportErrorResponse.mockReturnValue(
      Response.json({ error: "Unexpected error." }, { status: 500 }),
    );
  });

  it("commits only the validated workbook rows in the requested plan", async () => {
    mocks.getValidatedMasterImportPlanRows
      .mockResolvedValueOnce([101, 102]);
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/2/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getValidatedMasterImportPlanRows).toHaveBeenCalledWith("org-internal", "job-1", 2);
    expect(mocks.commitNextMasterImportRow.mock.calls.map(([input]) => input.rowNumber)).toEqual([101, 102]);
    expect(mocks.commitNextMasterImportRow).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      planProgress: {
        recordCount: 2,
        validatedCount: 0,
        importedCount: 2,
        errorCount: 0,
        hasMore: false,
      },
    });

    expect(mocks.getMasterImportPlanProgress).toHaveBeenCalledWith("org-internal", "job-1", 2);
  });

  it("loads master lookup data once and reuses it for every row in the batch", async () => {
    const lookupIndex = new Map();
    mocks.getValidatedMasterImportPlanRows.mockResolvedValueOnce([101, 102]);
    mocks.getMasterImportCommitLookupIndex.mockResolvedValueOnce(lookupIndex);

    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/2/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getMasterImportCommitLookupIndex).toHaveBeenCalledTimes(1);
    expect(mocks.getMasterImportCommitLookupIndex).toHaveBeenCalledWith("org-internal", "job-1");
    expect(mocks.commitNextMasterImportRow).toHaveBeenNthCalledWith(1, expect.objectContaining({
      rowNumber: 101,
      lookupIndex,
    }));
    expect(mocks.commitNextMasterImportRow).toHaveBeenNthCalledWith(2, expect.objectContaining({
      rowNumber: 102,
      lookupIndex,
    }));
  });

  it("rejects invalid plan numbers before authorization or importing", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/0/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "0" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.authorizeMasterImportRoute).not.toHaveBeenCalled();
    expect(mocks.getValidatedMasterImportPlanRows).not.toHaveBeenCalled();
    expect(mocks.commitNextMasterImportRow).not.toHaveBeenCalled();
  });

  it("keeps processing plan rows after moving a failed row into Errors", async () => {
    const firstBatch = Array.from({ length: 25 }, (_, index) => 101 + index);
    mocks.getValidatedMasterImportPlanRows
      .mockResolvedValueOnce(firstBatch);
    mocks.getMasterImportPlanProgress.mockResolvedValueOnce({
      recordCount: 26,
      validatedCount: 1,
      importedCount: 24,
      errorCount: 1,
    });
    mocks.commitNextMasterImportRow.mockImplementation(async ({ rowNumber }: { rowNumber: number }) => ({
      job: { id: "job-1", status: "PARTIAL" },
      row: { rowNumber, status: rowNumber === 101 ? "FAILED" : "IMPORTED" },
    }));

    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/2/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.commitNextMasterImportRow).toHaveBeenCalledTimes(25);
    expect(mocks.commitNextMasterImportRow.mock.calls.map(([input]) => input.rowNumber))
      .toEqual(firstBatch);
    await expect(response.json()).resolves.toMatchObject({
      row: { rowNumber: 125, status: "IMPORTED" },
      planProgress: { hasMore: true, validatedCount: 1 },
    });
  });

  it("returns live per-plan counts including imported and error rows", async () => {
    mocks.getValidatedMasterImportPlanRows.mockResolvedValueOnce([101]);
    mocks.getMasterImportPlanProgress.mockResolvedValueOnce({
      recordCount: 50,
      validatedCount: 25,
      importedCount: 24,
      errorCount: 1,
    });

    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/2/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "2" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      planProgress: {
        recordCount: 50,
        validatedCount: 25,
        importedCount: 24,
        errorCount: 1,
        hasMore: true,
      },
    });
  });

  it("moves commit-time validation failures out of the plan and continues", async () => {
    mocks.getValidatedMasterImportPlanRows
      .mockResolvedValueOnce([101, 102]);
    mocks.commitNextMasterImportRow
      .mockResolvedValueOnce({
        job: { id: "job-1", status: "STAGED" },
        row: null,
        validationRequired: true,
      })
      .mockResolvedValueOnce({
        job: { id: "job-1", status: "IMPORTING" },
        row: { rowNumber: 102, status: "IMPORTED" },
      });

    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans/2/commit", {
        method: "POST",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1", planNumber: "2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.commitNextMasterImportRow.mock.calls.map(([input]) => input.rowNumber)).toEqual([101, 102]);
    await expect(response.json()).resolves.toMatchObject({
      row: { rowNumber: 102, status: "IMPORTED" },
      planProgress: { hasMore: false },
    });
  });
});
