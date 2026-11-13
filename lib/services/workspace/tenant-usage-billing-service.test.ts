import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    tenantUsageBill: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      createMany: vi.fn(),
    },
    tenantUsageDaily: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    auditEvent: { createMany: vi.fn() },
  };
  return {
    transaction,
    transactionRunner: vi.fn(),
    usageQuery: vi.fn(),
    billFindMany: vi.fn(),
    billFindFirst: vi.fn(),
    dailyFindMany: vi.fn(),
    listOrganizationsForUser: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $queryRaw: mocks.usageQuery,
    $transaction: mocks.transactionRunner,
    tenantUsageBill: {
      findMany: mocks.billFindMany,
      findFirst: mocks.billFindFirst,
    },
    tenantUsageDaily: { findMany: mocks.dailyFindMany },
  },
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  listOrganizationsForUser: mocks.listOrganizationsForUser,
}));

import { Prisma } from "@prisma/client";
import {
  createTenantUsageBills,
  getTenantUsageDailyCostBreakdown,
  listTenantUsageBillMonths,
  TenantUsageBillPermissionError,
} from "./tenant-usage-billing-service";

const authorizedOrganization = {
  id: "internal-org-1",
  organization_id: "public-org-1",
  organization_name: "SAMPLE ORGANIZATION",
  can_manage_settings: true,
};

function usageGroup(tenantId = "internal-org-1") {
  return {
    tenant_id: tenantId,
    _sum: {
      total_requests: 12,
      total_execution_ms: BigInt(1000),
      total_egress_bytes: BigInt(2048),
      db_storage_bytes: BigInt(4096),
      media_storage_bytes: BigInt(0),
      neon_compute_cost_usd: new Prisma.Decimal("0.001"),
      db_storage_cost_usd: new Prisma.Decimal("0.002"),
      vercel_invocation_cost_usd: new Prisma.Decimal("0.003"),
      egress_cost_usd: new Prisma.Decimal("0"),
      media_storage_cost_usd: new Prisma.Decimal("0"),
      estimated_cost_usd: new Prisma.Decimal("0.006"),
    },
  };
}

describe("tenant usage billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listOrganizationsForUser.mockResolvedValue([authorizedOrganization]);
    mocks.usageQuery.mockResolvedValue([]);
    mocks.billFindMany.mockResolvedValue([]);
    mocks.billFindFirst.mockResolvedValue(null);
    mocks.dailyFindMany.mockResolvedValue([]);
    mocks.transaction.tenantUsageBill.findMany.mockResolvedValue([]);
    mocks.transaction.tenantUsageDaily.groupBy.mockResolvedValue([usageGroup()]);
    mocks.transaction.tenantUsageDaily.findMany.mockResolvedValue([{
      tenant_id: "internal-org-1",
      date: new Date("2026-10-01T00:00:00.000Z"),
      total_requests: 12,
      total_execution_ms: BigInt(1000),
      total_egress_bytes: BigInt(2048),
      db_storage_bytes: BigInt(4096),
      media_storage_bytes: BigInt(0),
      neon_compute_cost_usd: new Prisma.Decimal("0.001"),
      db_storage_cost_usd: new Prisma.Decimal("0.002"),
      vercel_invocation_cost_usd: new Prisma.Decimal("0.003"),
      egress_cost_usd: new Prisma.Decimal("0"),
      media_storage_cost_usd: new Prisma.Decimal("0"),
      estimated_cost_usd: new Prisma.Decimal("0.006"),
    }]);
    mocks.transaction.tenantUsageBill.createMany.mockResolvedValue({ count: 1 });
    mocks.transaction.auditEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.transactionRunner.mockImplementation((callback) => callback(mocks.transaction));
  });

  it("lists only authorized organizations and exposes month-named unbilled groups", async () => {
    mocks.usageQuery.mockResolvedValue([{
      tenant_id: "internal-org-1",
      month: "2026-10",
      organization_name: "SAMPLE ORGANIZATION",
      total_requests: 12,
      total_execution_ms: BigInt(1000),
      total_egress_bytes: BigInt(2048),
      db_storage_bytes: BigInt(4096),
      media_storage_bytes: BigInt(0),
      neon_compute_cost_usd: "0.001",
      db_storage_cost_usd: "0.002",
      vercel_invocation_cost_usd: "0.003",
      egress_cost_usd: "0",
      media_storage_cost_usd: "0",
      estimated_cost_usd: "0.006",
    }]);

    const result = await listTenantUsageBillMonths("user-1");

    expect(mocks.listOrganizationsForUser).toHaveBeenCalledWith("user-1");
    expect(result.months).toEqual([expect.objectContaining({
      month: "2026-10",
      monthName: "October 2026",
      unbilledTenants: [expect.objectContaining({
        organizationId: "public-org-1",
        organizationName: "SAMPLE ORGANIZATION",
        estimatedCostUsd: 0.006,
        canBill: true,
      })],
    })]);
  });

  it("shows stored bill names and snapshots in the billed group", async () => {
    mocks.usageQuery.mockResolvedValue([{
      tenant_id: "internal-org-1",
      month: "2026-10",
      organization_name: "RENAMED ORGANIZATION",
      total_requests: 20,
      total_execution_ms: BigInt(2000),
      total_egress_bytes: BigInt(4096),
      db_storage_bytes: BigInt(8192),
      media_storage_bytes: BigInt(0),
      neon_compute_cost_usd: "0.010",
      db_storage_cost_usd: "0.002",
      vercel_invocation_cost_usd: "0.003",
      egress_cost_usd: "0",
      media_storage_cost_usd: "0",
      estimated_cost_usd: "0.015",
    }]);
    mocks.billFindMany.mockResolvedValue([{
      tenant_id: "internal-org-1",
      billing_month: new Date("2026-10-01T00:00:00.000Z"),
      bill_name: "Server Cost - October 2026",
      organization_name: "SAMPLE ORGANIZATION",
      total_requests: 12,
      estimated_cost_usd: new Prisma.Decimal("0.006"),
      billed_at: new Date("2026-11-01T00:00:00.000Z"),
    }]);

    const result = await listTenantUsageBillMonths("user-1");

    expect(result.months[0]).toMatchObject({
      month: "2026-10",
      unbilledTenants: [],
      billedCostUsd: 0.006,
      billedTenants: [{
        organizationName: "SAMPLE ORGANIZATION",
        requests: 12,
        estimatedCostUsd: 0.006,
        billName: "Server Cost - October 2026",
      }],
    });
  });

  it("creates one immutable monthly snapshot per unbilled tenant and audits it transactionally", async () => {
    const result = await createTenantUsageBills({
      workspaceUserId: "user-1",
      month: "2026-10",
    });

    expect(result).toEqual({ month: "2026-10", createdCount: 1 });
    expect(mocks.transactionRunner).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(mocks.transaction.tenantUsageBill.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenant_id: "internal-org-1",
        bill_name: "Server Cost - October 2026",
        organization_name: "SAMPLE ORGANIZATION",
        total_requests: 12,
        estimated_cost_usd: new Prisma.Decimal("0.006"),
      })],
    });
    const createdBill = mocks.transaction.tenantUsageBill.createMany.mock.calls[0][0].data[0];
    expect(createdBill.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mocks.transaction.auditEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organization_id: "internal-org-1",
        user_id: "user-1",
        action: "CREATE_USAGE_BILL",
        entity_type: "tenant_usage_bill",
        entity_id: createdBill.id,
      })],
    });
    expect(createdBill.daily_breakdown).toEqual([expect.objectContaining({
      date: "2026-10-01",
      requests: 12,
      neonComputeCostUsd: 0.001,
      estimatedCostUsd: 0.006,
    })]);
  });

  it("rejects bill creation when the actor lacks settings access", async () => {
    mocks.listOrganizationsForUser.mockResolvedValue([{
      ...authorizedOrganization,
      can_manage_settings: false,
    }]);

    await expect(createTenantUsageBills({
      workspaceUserId: "user-1",
      month: "2026-10",
    })).rejects.toBeInstanceOf(TenantUsageBillPermissionError);

    expect(mocks.transaction.tenantUsageBill.createMany).not.toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.createMany).not.toHaveBeenCalled();
  });

  it("does not create duplicate bills for an already-billed month", async () => {
    mocks.transaction.tenantUsageBill.findMany.mockResolvedValue([
      { tenant_id: "internal-org-1" },
    ]);

    const result = await createTenantUsageBills({
      workspaceUserId: "user-1",
      month: "2026-10",
    });

    expect(result).toEqual({ month: "2026-10", createdCount: 0 });
    expect(mocks.transaction.tenantUsageBill.createMany).not.toHaveBeenCalled();
  });

  it("rejects malformed or future billing months", async () => {
    await expect(createTenantUsageBills({
      workspaceUserId: "user-1",
      month: "2026-13",
    })).rejects.toThrow("Choose a valid billing month");

    expect(mocks.listOrganizationsForUser).not.toHaveBeenCalled();
  });

  it("uses the immutable bill snapshot for billed daily details", async () => {
    mocks.billFindFirst.mockResolvedValue({
      daily_breakdown: [{
        date: "2026-10-01",
        requests: 12,
        executionMs: "1000",
        egressBytes: "0",
        dbStorageBytes: "4096",
        mediaStorageBytes: "0",
        neonComputeCostUsd: 0.001,
        dbStorageCostUsd: 0.002,
        vercelInvocationCostUsd: 0.003,
        egressCostUsd: 0,
        mediaStorageCostUsd: 0,
        estimatedCostUsd: 0.006,
      }],
    });

    const result = await getTenantUsageDailyCostBreakdown({
      workspaceUserId: "user-1",
      publicOrganizationId: "public-org-1",
      month: "2026-10",
    });

    expect(result?.isBilledSnapshot).toBe(true);
    expect(result?.rows[0]).toMatchObject({
      date: "2026-10-01",
      requests: 12,
      estimatedCostUsd: 0.006,
    });
    expect(mocks.dailyFindMany).not.toHaveBeenCalled();
  });

  it("falls back to tenant-scoped daily aggregates when no bill snapshot exists", async () => {
    mocks.dailyFindMany.mockResolvedValue([{
      tenant_id: "internal-org-1",
      date: new Date("2026-10-02T00:00:00.000Z"),
      total_requests: 7,
      total_execution_ms: BigInt(2000),
      total_egress_bytes: BigInt(1024),
      db_storage_bytes: BigInt(8192),
      media_storage_bytes: BigInt(0),
      neon_compute_cost_usd: new Prisma.Decimal("0.004"),
      db_storage_cost_usd: new Prisma.Decimal("0.001"),
      vercel_invocation_cost_usd: new Prisma.Decimal("0.002"),
      egress_cost_usd: new Prisma.Decimal("0"),
      media_storage_cost_usd: new Prisma.Decimal("0"),
      estimated_cost_usd: new Prisma.Decimal("0.007"),
    }]);

    const result = await getTenantUsageDailyCostBreakdown({
      workspaceUserId: "user-1",
      publicOrganizationId: "public-org-1",
      month: "2026-10",
    });

    expect(result?.isBilledSnapshot).toBe(false);
    expect(result?.rows).toEqual([expect.objectContaining({
      date: "2026-10-02",
      requests: 7,
      executionMs: "2000",
      dbStorageBytes: "8192",
      estimatedCostUsd: 0.007,
    })]);
    expect(mocks.dailyFindMany).toHaveBeenCalledWith({
      where: {
        tenant_id: "internal-org-1",
        date: {
          gte: new Date("2026-10-01T00:00:00.000Z"),
          lt: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
      orderBy: { date: "asc" },
    });
  });

  it("returns no daily details for an organization outside the user's memberships", async () => {
    const result = await getTenantUsageDailyCostBreakdown({
      workspaceUserId: "user-1",
      publicOrganizationId: "other-public-org",
      month: "2026-10",
    });

    expect(result).toBeNull();
    expect(mocks.billFindFirst).not.toHaveBeenCalled();
    expect(mocks.dailyFindMany).not.toHaveBeenCalled();
  });
});
