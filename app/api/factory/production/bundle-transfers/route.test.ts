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

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { POST } from "./route";

describe("factory bundle transfer permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
  });

  it("denies bundle issues before opening a stock transaction", async () => {
    const response = await POST(new Request("http://localhost/api/factory/production/bundle-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        action: "ISSUE",
        workOrderId: "work-order-1",
        fromProcessId: "process-1",
        toProcessId: "process-2",
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "UPDATE_FACTORY_PRODUCTION");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
