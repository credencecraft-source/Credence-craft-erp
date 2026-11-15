import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  listOrganizationsForUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  getSessionUser: mocks.getSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  listOrganizationsForUser: mocks.listOrganizationsForUser,
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    tenantUsageDaily: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import { GET } from "./route";

const decimal = (value: number) => ({ toNumber: () => value });

describe("workspace server cost API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.listOrganizationsForUser.mockResolvedValue([{ id: "internal-org-1" }]);
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
  });

  it("rejects unauthenticated and cross-workspace requests before reading usage", async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET(
      new Request("http://localhost/api/workspace/usage/cost?workspaceId=workspace-1"),
    );
    const wrongWorkspace = await GET(
      new Request("http://localhost/api/workspace/usage/cost?workspaceId=workspace-2"),
    );

    expect(unauthenticated.status).toBe(401);
    expect(wrongWorkspace.status).toBe(404);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("validates date ranges and pagination", async () => {
    const invalidDate = await GET(
      new Request("http://localhost/api/workspace/usage/cost?workspaceId=workspace-1&startDate=2026-02-31"),
    );
    const invalidPage = await GET(
      new Request("http://localhost/api/workspace/usage/cost?workspaceId=workspace-1&page=0"),
    );

    expect(invalidDate.status).toBe(400);
    expect(invalidPage.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("paginates only the authenticated user's organizations and returns monthly costs", async () => {
    mocks.findMany
      .mockResolvedValueOnce([{
        id: "usage-1",
        tenant_id: "internal-org-1",
        date: new Date("2026-11-10T00:00:00.000Z"),
        total_requests: 3,
        total_execution_ms: BigInt(45),
        total_egress_bytes: BigInt(0),
        db_storage_bytes: BigInt(2048),
        media_storage_bytes: BigInt(0),
        neon_compute_cost_usd: decimal(0.1),
        db_storage_cost_usd: decimal(0.01),
        vercel_invocation_cost_usd: decimal(0.02),
        egress_cost_usd: decimal(0),
        media_storage_cost_usd: decimal(0),
        estimated_cost_usd: decimal(0.13),
      }])
      .mockResolvedValueOnce([{
        date: new Date("2026-11-10T00:00:00.000Z"),
        total_requests: 3,
        total_execution_ms: BigInt(45),
        total_egress_bytes: BigInt(0),
        db_storage_bytes: BigInt(2048),
        media_storage_bytes: BigInt(0),
        neon_compute_cost_usd: decimal(0.1),
        db_storage_cost_usd: decimal(0.01),
        vercel_invocation_cost_usd: decimal(0.02),
        egress_cost_usd: decimal(0),
        media_storage_cost_usd: decimal(0),
        estimated_cost_usd: decimal(0.13),
      }]);
    mocks.count.mockResolvedValue(1);

    const response = await GET(
      new Request("http://localhost/api/workspace/usage/cost?workspaceId=workspace-1&page=2&pageSize=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ tenant_id: { in: ["internal-org-1"] } }),
      skip: 10,
      take: 10,
    }));
    expect(body.rows[0]).toMatchObject({
      tenantId: "internal-org-1",
      requests: 3,
      estimatedCostUsd: 0.13,
    });
    expect(body.summary.peakDay).toEqual({ date: "2026-11-10", costUsd: 0.13 });
  });
});
