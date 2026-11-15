import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeMasterImportRoute: vi.fn(),
  masterImportErrorResponse: vi.fn(),
  stageMasterImportJob: vi.fn(),
}));

vi.mock("../../route-support", () => ({
  authorizeMasterImportRoute: mocks.authorizeMasterImportRoute,
  masterImportErrorResponse: mocks.masterImportErrorResponse,
}));
vi.mock("@/lib/services/master-data/master-import-service", () => ({
  stageMasterImportJob: mocks.stageMasterImportJob,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", jobId: "job-1" }) };

describe("master import stage route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { userId: "actor-1", organizationId: "internal-org-1" },
    });
    mocks.stageMasterImportJob.mockResolvedValue({
      job: { id: "job-1", status: "STAGED", totalRows: 1 },
      rows: [{ rowNumber: 1, status: "STAGED", checkpoint: "PARSED" }],
    });
  });

  it("does not stage unless organization authorization succeeds", async () => {
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(401);
    expect(mocks.stageMasterImportJob).not.toHaveBeenCalled();
  });

  it("stages only against the authorized internal organization and returns checkpoint DTOs", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.stageMasterImportJob).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      actorUserId: "actor-1",
      jobId: "job-1",
    });
    expect(body.rows).toEqual([{ rowNumber: 1, status: "STAGED", checkpoint: "PARSED" }]);
  });
});
