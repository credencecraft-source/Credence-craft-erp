import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock, requireOrganizationContextMock, findFirstMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  requireOrganizationContextMock: vi.fn(),
  findFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ getSessionUser: getSessionUserMock }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: requireOrganizationContextMock,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { organization: { findFirst: findFirstMock } },
}));

import { POST } from "./route";

const validRequest = {
  message: "Summarize the open orders",
  organization_id: "org-public-1",
  current_module: "Order Management",
  history: [{ role: "user", content: "Show open orders" }],
};

function createRequest(body: unknown) {
  return new Request("http://localhost/api/ai/copilot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/copilot/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    requireOrganizationContextMock.mockResolvedValue({
      id: "org-internal-1",
      organizationId: "org-public-1",
      membershipId: "membership-1",
      role: "VIEWER",
    });
    findFirstMock.mockResolvedValue({ ai_enabled: false });
  });

  it("requires an authenticated workspace user", async () => {
    getSessionUserMock.mockResolvedValue(null);

    const response = await POST(createRequest(validRequest));

    expect(response.status).toBe(401);
    expect(requireOrganizationContextMock).not.toHaveBeenCalled();
  });

  it("rejects invalid requests before organization lookup", async () => {
    const response = await POST(createRequest({ ...validRequest, history: [{ role: "system", content: "bad" }] }));

    expect(response.status).toBe(400);
    expect(requireOrganizationContextMock).not.toHaveBeenCalled();
  });

  it("checks membership and rejects chat when the platform disabled AI", async () => {
    const response = await POST(createRequest(validRequest));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "AI Copilot is disabled for this organization." });
    expect(requireOrganizationContextMock).toHaveBeenCalledWith("user-1", "org-public-1");
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: "org-internal-1", organization_id: "org-public-1" },
      select: { ai_enabled: true },
    });
  });

  it("reports the missing response service without returning a fabricated answer", async () => {
    findFirstMock.mockResolvedValue({ ai_enabled: true });

    const response = await POST(createRequest(validRequest));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "AI Copilot is enabled, but its response service is not configured yet.",
    });
  });
});
