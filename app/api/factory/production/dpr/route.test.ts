import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { GET, POST } from "./route";

describe("factory DPR permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
  });

  it("denies DPR reads before loading report data", async () => {
    const response = await GET(new Request("http://localhost/api/factory/production/dpr?organizationId=public-org"));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_FACTORY_PRODUCTION");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses production-update permission for DPR generation", async () => {
    const response = await POST(new Request("http://localhost/api/factory/production/dpr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", action: "GENERATE", date: "2026-11-11" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "UPDATE_FACTORY_PRODUCTION");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses management permission for DPR decisions", async () => {
    const response = await POST(new Request("http://localhost/api/factory/production/dpr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", action: "APPROVE", date: "2026-11-11" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_FACTORY_PRODUCTION");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
