import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPageSetupTemplateRequestContext: vi.fn(),
  deletePageSetupTemplates: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { designDevelopmentPageSetupTemplate: {} },
}));
vi.mock("@/lib/services/design-development/page-setup-template-api-access", () => ({
  getPageSetupTemplateRequestContext: mocks.getPageSetupTemplateRequestContext,
}));
vi.mock("@/lib/services/design-development/page-setup-template-service", () => ({
  deletePageSetupTemplates: mocks.deletePageSetupTemplates,
  PageSetupTemplateDeleteConflictError: class PageSetupTemplateDeleteConflictError extends Error {},
}));

import { DELETE } from "./route";

const requestUrl =
  "http://localhost/api/design-development/page-setup-templates?organizationId=public-org&workspaceId=workspace-1";

describe("Page Setup template delete API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPageSetupTemplateRequestContext.mockResolvedValue({
      authorized: true,
      user: { id: "user-1" },
      organizationId: "public-org",
    });
    mocks.deletePageSetupTemplates.mockResolvedValue({
      success: true,
      deletedCount: 2,
    });
  });

  it("deletes a validated selection through the tenant-authorized service", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["setup-1", "setup-2"] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.deletePageSetupTemplates).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["setup-1", "setup-2"],
    );
    await expect(response.json()).resolves.toEqual({ deletedCount: 2 });
  });

  it("rejects empty or duplicated selections without invoking deletion", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["setup-1", "setup-1"] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.deletePageSetupTemplates).not.toHaveBeenCalled();
  });
});
