import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMasterImportRoute: vi.fn(),
  deleteMasterImportJob: vi.fn(),
  getMasterImportJob: vi.fn(),
  masterImportErrorResponse: vi.fn(),
  transitionMasterImportJob: vi.fn(),
}));

vi.mock("@/lib/services/master-data/master-import-service", () => ({
  MASTER_IMPORT_REPORT_PAGE_SIZE: 1_000,
  deleteMasterImportJob: mocks.deleteMasterImportJob,
  getMasterImportJob: mocks.getMasterImportJob,
  transitionMasterImportJob: mocks.transitionMasterImportJob,
}));
vi.mock("../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
  parseBoundedJson: vi.fn(),
}));

import { GET } from "./route";

describe("master import details route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "org-internal", userId: "user-1" },
    });
    mocks.getMasterImportJob.mockResolvedValue({ job: { id: "job-1" }, rows: [] });
    mocks.masterImportErrorResponse.mockReturnValue(Response.json({ error: "Unexpected error." }, { status: 500 }));
  });

  it("accepts bounded pagination for the all-rows report", async () => {
    const response = await GET(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1?limit=100&offset=100&tab=all"),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getMasterImportJob).toHaveBeenCalledWith("org-internal", "job-1", {
      skip: 100,
      take: 100,
      tab: "all",
    });
  });
});
