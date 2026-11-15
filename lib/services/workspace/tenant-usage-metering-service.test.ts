import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrganizationContext: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    tenantUsageLog: {
      createMany: mocks.createMany,
    },
  },
}));

import { recordOrganizationRequestUsage } from "./tenant-usage-metering-service";

describe("organization request usage metering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("verifies membership and batches only the authorized tenant's sanitized request record", async () => {
    await recordOrganizationRequestUsage({
      workspaceUserId: "user-1",
      publicOrganizationId: "public-org",
      endpoint: `/api/organizations/${"a".repeat(300)}/orders`,
      method: "POST",
      executionMs: -7.8,
    });

    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{
        tenant_id: "internal-org-1",
        endpoint: expect.stringMatching(/^\/api\/organizations\//),
        http_method: "POST",
        execution_ms: 0,
        egress_bytes: null,
      }],
    });
    expect(mocks.createMany.mock.calls[0][0].data[0].endpoint).toHaveLength(255);
  });

  it("does not enqueue usage for an organization the actor cannot access", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied"));

    await expect(recordOrganizationRequestUsage({
      workspaceUserId: "user-1",
      publicOrganizationId: "other-org",
      endpoint: "/api/organizations/other-org/orders",
      method: "GET",
      executionMs: 1,
    })).rejects.toThrow("Access denied");

    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
