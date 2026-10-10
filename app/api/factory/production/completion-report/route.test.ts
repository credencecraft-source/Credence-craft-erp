import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  listFactoryProductionCompletionReport: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/factory/factory-production-completion-report-service", () => ({
  listFactoryProductionCompletionReport: mocks.listFactoryProductionCompletionReport,
}));

import { GET } from "./route";

describe("factory production completion report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listFactoryProductionCompletionReport.mockResolvedValue({ records: [], nextCursor: null });
  });

  it("requires an authenticated user before loading organization data", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Authentication required."));

    const response = await GET(new Request("http://localhost/api/factory/production/completion-report?organizationId=public-org"));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listFactoryProductionCompletionReport).not.toHaveBeenCalled();
  });

  it("loads the cursor page using the authorized internal organization id", async () => {
    const response = await GET(new Request("http://localhost/api/factory/production/completion-report?organizationId=public-org&cursor=grn-1"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listFactoryProductionCompletionReport).toHaveBeenCalledWith("internal-org-1", { cursor: "grn-1" });
    await expect(response.json()).resolves.toEqual({ records: [], nextCursor: null });
  });
});
