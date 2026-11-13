import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  createTenantUsageBills: vi.fn(),
  listTenantUsageBillMonths: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/workspace/tenant-usage-billing-service", () => ({
  createTenantUsageBills: mocks.createTenantUsageBills,
  listTenantUsageBillMonths: mocks.listTenantUsageBillMonths,
  TenantUsageBillMonthError: class TenantUsageBillMonthError extends Error {},
  TenantUsageBillPermissionError: class TenantUsageBillPermissionError extends Error {},
}));

import { GET, POST } from "./route";

describe("workspace usage bills API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.listTenantUsageBillMonths.mockResolvedValue({ months: [] });
    mocks.createTenantUsageBills.mockResolvedValue({ month: "2026-10", createdCount: 1 });
  });

  it("requires authentication and the matching workspace to list bill groups", async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET(
      new Request("http://localhost/api/workspace/usage/cost/bills?workspaceId=workspace-1"),
    );
    const wrongWorkspace = await GET(
      new Request("http://localhost/api/workspace/usage/cost/bills?workspaceId=workspace-2"),
    );

    expect(unauthenticated.status).toBe(401);
    expect(wrongWorkspace.status).toBe(404);
    expect(mocks.listTenantUsageBillMonths).not.toHaveBeenCalled();
  });

  it("creates bills only for the authenticated workspace and returns the count", async () => {
    const response = await POST(new Request("http://localhost/api/workspace/usage/cost/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace-1", month: "2026-10" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createTenantUsageBills).toHaveBeenCalledWith({
      workspaceUserId: "user-1",
      month: "2026-10",
    });
    await expect(response.json()).resolves.toEqual({
      month: "2026-10",
      createdCount: 1,
    });
  });

  it("rejects cross-workspace and malformed billing requests", async () => {
    const wrongWorkspace = await POST(new Request("http://localhost/api/workspace/usage/cost/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace-2", month: "2026-10" }),
    }));
    const malformed = await POST(new Request("http://localhost/api/workspace/usage/cost/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }));

    expect(wrongWorkspace.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(mocks.createTenantUsageBills).not.toHaveBeenCalled();
  });
});
