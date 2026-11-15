import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getOrganizationPrintTemplate: vi.fn(),
  updateOrganizationPrintTemplate: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/distribution/organization-print-template-service", () => ({
  getOrganizationPrintTemplate: mocks.getOrganizationPrintTemplate,
  updateOrganizationPrintTemplate: mocks.updateOrganizationPrintTemplate,
}));

import { GET, PATCH } from "./route";

const context = { params: Promise.resolve({ templateId: "template-1" }) };
const requestUrl = "http://localhost/api/organizations/print-templates/template-1?workspaceId=workspace-1&organizationId=public-org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
  mocks.requireOrganizationContext.mockResolvedValue({ organizationId: "public-org-1" });
  mocks.getOrganizationPrintTemplate.mockResolvedValue(null);
  mocks.updateOrganizationPrintTemplate.mockResolvedValue(null);
});

describe("organization print-template detail route", () => {
  it("returns not-found for a template outside the authorized organization", async () => {
    const response = await GET(new Request(requestUrl), context);

    expect(response.status).toBe(404);
    expect(mocks.getOrganizationPrintTemplate).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "template-1",
    );
  });

  it("rejects unauthorized template changes", async () => {
    mocks.updateOrganizationPrintTemplate.mockRejectedValue(new Error("Access denied: settings permission required"));

    const response = await PATCH(new Request(requestUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), context);

    expect(response.status).toBe(403);
  });
});
