import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      authorizeMasterImportRoute: vi.fn(),
      getMasterImportErrorGroupAction: vi.fn(),
      masterImportErrorResponse: vi.fn((error: unknown) => Response.json({
        error: error instanceof Error ? error.message : "Unexpected error",
      }, { status: 500 })),
      parseBoundedJson: vi.fn(),
    },
  };
});

vi.mock("@/lib/services/master-data/master-import-service", () => ({
  getMasterImportErrorGroupAction: mocks.getMasterImportErrorGroupAction,
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

describe("POST error analysis group action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: true,
      context: { organizationId: "internal-org", userId: "user-1" },
    });
    mocks.parseBoundedJson.mockResolvedValue({ reason: "Brand is missing." });
    mocks.getMasterImportErrorGroupAction.mockResolvedValue({
      rowNumbers: [4, 9],
      totalAffectedRows: 2,
      truncated: false,
      suggestions: [],
    });
  });

  it("returns organization-scoped rows and suggestions for a reason group", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST" }), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ rowNumbers: [4, 9], totalAffectedRows: 2 });
    expect(mocks.getMasterImportErrorGroupAction).toHaveBeenCalledWith(
      "internal-org",
      "job-1",
      "Brand is missing.",
    );
  });

  it("rejects an invalid request body", async () => {
    mocks.parseBoundedJson.mockResolvedValue({ reason: " " });

    const response = await POST(new Request("http://localhost", { method: "POST" }), context);

    expect(response.status).toBe(400);
    expect(mocks.getMasterImportErrorGroupAction).not.toHaveBeenCalled();
  });

  it("returns authorization failures without reading import data", async () => {
    mocks.authorizeMasterImportRoute.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), context);

    expect(response.status).toBe(401);
    expect(mocks.parseBoundedJson).not.toHaveBeenCalled();
    expect(mocks.getMasterImportErrorGroupAction).not.toHaveBeenCalled();
  });
});
