import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMasterImportRoute: vi.fn(),
  createMasterImportPlans: vi.fn(),
  masterImportErrorResponse: vi.fn(),
  parseOptionalBoundedJson: vi.fn(),
}));

vi.mock("@/lib/services/master-data/master-import-service", () => ({
  MASTER_IMPORT_PLAN_SIZE: 1_000,
  createMasterImportPlans: mocks.createMasterImportPlans,
}));
vi.mock("../../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
  parseOptionalBoundedJson: mocks.parseOptionalBoundedJson,
}));

import { POST } from "./route";

describe("master import plan creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "org-internal", userId: "user-1" },
    });
    mocks.createMasterImportPlans.mockResolvedValue({
      plans: [{ planNumber: 1, recordCount: 50 }],
      planCount: 1,
      plannedRowCount: 50,
    });
    mocks.masterImportErrorResponse.mockReturnValue(Response.json({ error: "Unexpected error." }, { status: 500 }));
  });

  it("creates plans only within the authorized organization", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createMasterImportPlans).toHaveBeenCalledWith({
      organizationId: "org-internal",
      actorUserId: "user-1",
      jobId: "job-1",
    });
  });

  it("treats an empty body stream as a manual plan request", async () => {
    mocks.parseOptionalBoundedJson.mockResolvedValue(undefined);
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", {
        method: "POST",
        body: "",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.parseOptionalBoundedJson).toHaveBeenCalled();
    expect(mocks.createMasterImportPlans).toHaveBeenCalledWith({
      organizationId: "org-internal",
      actorUserId: "user-1",
      jobId: "job-1",
    });
  });

  it("returns authorization responses without creating plans", async () => {
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", { method: "POST" }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.createMasterImportPlans).not.toHaveBeenCalled();
  });

  it("plans only explicitly supplied rows for Auto Plan", async () => {
    mocks.parseOptionalBoundedJson.mockResolvedValue({ rowNumbers: [3, 8] });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.createMasterImportPlans).toHaveBeenCalledWith({
      organizationId: "org-internal",
      actorUserId: "user-1",
      jobId: "job-1",
      rowNumbers: [3, 8],
    });
  });

  it("accepts an Auto Plan row list up to the 1,000-record plan cap", async () => {
    mocks.parseOptionalBoundedJson.mockResolvedValue({
      rowNumbers: Array.from({ length: 1_000 }, (_, index) => index + 1),
    });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.parseOptionalBoundedJson).toHaveBeenCalledWith(expect.any(Request), 64 * 1024);
    expect(mocks.createMasterImportPlans).toHaveBeenCalledWith(expect.objectContaining({
      rowNumbers: Array.from({ length: 1_000 }, (_, index) => index + 1),
    }));
  });

  it("rejects oversized or duplicate Auto Plan row lists", async () => {
    mocks.parseOptionalBoundedJson.mockResolvedValue({
      rowNumbers: Array.from({ length: 1_001 }, (_, index) => index + 1),
    });
    const response = await POST(
      new Request("http://localhost/api/organizations/org-public/master-imports/job-1/plans", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ organizationId: "org-public", jobId: "job-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.createMasterImportPlans).not.toHaveBeenCalled();
  });
});
