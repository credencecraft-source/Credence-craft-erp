import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { listOrganizationsForUser } from "@/lib/services/organizations/organization-service";
import { getTenantUsageRates } from "@/lib/services/workspace/tenant-usage-metering-service";

type UsageDailyCostRecord = {
  date: Date;
  total_requests: number;
  total_execution_ms: bigint;
  total_egress_bytes: bigint;
  db_storage_bytes: bigint;
  media_storage_bytes: bigint;
  neon_compute_cost_usd: Prisma.Decimal;
  db_storage_cost_usd: Prisma.Decimal;
  vercel_invocation_cost_usd: Prisma.Decimal;
  egress_cost_usd: Prisma.Decimal;
  media_storage_cost_usd: Prisma.Decimal;
  estimated_cost_usd: Prisma.Decimal;
};

export type UsageDailyCostRow = {
  date: string;
  requests: number;
  executionMs: string;
  egressBytes: string;
  dbStorageBytes: string;
  mediaStorageBytes: string;
  neonComputeCostUsd: number;
  dbStorageCostUsd: number;
  vercelInvocationCostUsd: number;
  egressCostUsd: number;
  mediaStorageCostUsd: number;
  estimatedCostUsd: number;
};

type UsageMonthAggregate = {
  tenant_id: string;
  month: string;
  organization_name: string;
  total_requests: number;
  total_execution_ms: bigint;
  total_egress_bytes: bigint;
  db_storage_bytes: bigint;
  media_storage_bytes: bigint;
  neon_compute_cost_usd: string;
  db_storage_cost_usd: string;
  vercel_invocation_cost_usd: string;
  egress_cost_usd: string;
  media_storage_cost_usd: string;
  estimated_cost_usd: string;
};

type UsageBillTenant = {
  organizationId: string;
  organizationName: string;
  requests: number;
  estimatedCostUsd: number;
  canBill: boolean;
  billName?: string;
  billedAt?: string;
};

type UsageBillMonth = {
  month: string;
  monthName: string;
  unbilledCostUsd: number;
  billedCostUsd: number;
  unbilledTenants: UsageBillTenant[];
  billedTenants: UsageBillTenant[];
};

export class TenantUsageBillPermissionError extends Error {
  constructor() {
    super("Organization settings permission is required for every organization in this bill.");
    this.name = "TenantUsageBillPermissionError";
  }
}

export class TenantUsageBillMonthError extends Error {
  constructor() {
    super("Choose a valid billing month that is not in the future.");
    this.name = "TenantUsageBillMonthError";
  }
}

function monthName(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function asMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function decimalToNumber(value: string | Prisma.Decimal | null | undefined) {
  return value == null ? 0 : Number(value.toString());
}

function serializeDailyCostRow(row: UsageDailyCostRecord): UsageDailyCostRow {
  return {
    date: row.date.toISOString().slice(0, 10),
    requests: row.total_requests,
    executionMs: row.total_execution_ms.toString(),
    egressBytes: row.total_egress_bytes.toString(),
    dbStorageBytes: row.db_storage_bytes.toString(),
    mediaStorageBytes: row.media_storage_bytes.toString(),
    neonComputeCostUsd: row.neon_compute_cost_usd.toNumber(),
    dbStorageCostUsd: row.db_storage_cost_usd.toNumber(),
    vercelInvocationCostUsd: row.vercel_invocation_cost_usd.toNumber(),
    egressCostUsd: row.egress_cost_usd.toNumber(),
    mediaStorageCostUsd: row.media_storage_cost_usd.toNumber(),
    estimatedCostUsd: row.estimated_cost_usd.toNumber(),
  };
}

function readSnapshotString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value : null;
}

function readSnapshotNumber(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseDailyBreakdownSnapshot(value: Prisma.JsonValue | null): UsageDailyCostRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: UsageDailyCostRow[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const snapshot = entry as Prisma.JsonObject;
    const date = readSnapshotString(snapshot.date);
    const requests = readSnapshotNumber(snapshot.requests);
    const executionMs = readSnapshotString(snapshot.executionMs);
    const egressBytes = readSnapshotString(snapshot.egressBytes);
    const dbStorageBytes = readSnapshotString(snapshot.dbStorageBytes);
    const mediaStorageBytes = readSnapshotString(snapshot.mediaStorageBytes);
    const neonComputeCostUsd = readSnapshotNumber(snapshot.neonComputeCostUsd);
    const dbStorageCostUsd = readSnapshotNumber(snapshot.dbStorageCostUsd);
    const vercelInvocationCostUsd = readSnapshotNumber(snapshot.vercelInvocationCostUsd);
    const egressCostUsd = readSnapshotNumber(snapshot.egressCostUsd);
    const mediaStorageCostUsd = readSnapshotNumber(snapshot.mediaStorageCostUsd);
    const estimatedCostUsd = readSnapshotNumber(snapshot.estimatedCostUsd);
    if (
      !date
      || requests === null
      || !executionMs
      || !egressBytes
      || !dbStorageBytes
      || !mediaStorageBytes
      || neonComputeCostUsd === null
      || dbStorageCostUsd === null
      || vercelInvocationCostUsd === null
      || egressCostUsd === null
      || mediaStorageCostUsd === null
      || estimatedCostUsd === null
    ) {
      return null;
    }

    rows.push({
      date,
      requests,
      executionMs,
      egressBytes,
      dbStorageBytes,
      mediaStorageBytes,
      neonComputeCostUsd,
      dbStorageCostUsd,
      vercelInvocationCostUsd,
      egressCostUsd,
      mediaStorageCostUsd,
      estimatedCostUsd,
    });
  }

  return rows;
}

export async function listTenantUsageBillMonths(workspaceUserId: string) {
  const organizations = await listOrganizationsForUser(workspaceUserId);
  const tenantIds = organizations.map(({ id }) => id);
  if (tenantIds.length === 0) return { months: [] as UsageBillMonth[] };

  const [usageRows, bills] = await Promise.all([
    prisma.$queryRaw<UsageMonthAggregate[]>(Prisma.sql`
      SELECT
        daily."tenant_id",
        to_char(date_trunc('month', daily."date"::timestamp), 'YYYY-MM') AS "month",
        organization."organization_name",
        COALESCE(SUM(daily."total_requests"), 0)::integer AS "total_requests",
        COALESCE(SUM(daily."total_execution_ms"), 0)::bigint AS "total_execution_ms",
        COALESCE(SUM(daily."total_egress_bytes"), 0)::bigint AS "total_egress_bytes",
        COALESCE(SUM(daily."db_storage_bytes"), 0)::bigint AS "db_storage_bytes",
        COALESCE(SUM(daily."media_storage_bytes"), 0)::bigint AS "media_storage_bytes",
        COALESCE(SUM(daily."neon_compute_cost_usd"), 0)::text AS "neon_compute_cost_usd",
        COALESCE(SUM(daily."db_storage_cost_usd"), 0)::text AS "db_storage_cost_usd",
        COALESCE(SUM(daily."vercel_invocation_cost_usd"), 0)::text AS "vercel_invocation_cost_usd",
        COALESCE(SUM(daily."egress_cost_usd"), 0)::text AS "egress_cost_usd",
        COALESCE(SUM(daily."media_storage_cost_usd"), 0)::text AS "media_storage_cost_usd",
        COALESCE(SUM(daily."estimated_cost_usd"), 0)::text AS "estimated_cost_usd"
      FROM "tenant_usage_daily" AS daily
      INNER JOIN "organizations" AS organization
        ON organization."id" = daily."tenant_id"
      WHERE daily."tenant_id" IN (${Prisma.join(tenantIds)})
      GROUP BY daily."tenant_id", "month", organization."organization_name"
      ORDER BY "month" DESC, organization."organization_name" ASC
    `),
    prisma.tenantUsageBill.findMany({
      where: { tenant_id: { in: tenantIds } },
      select: {
        tenant_id: true,
        billing_month: true,
        bill_name: true,
        organization_name: true,
        total_requests: true,
        estimated_cost_usd: true,
        billed_at: true,
      },
    }),
  ]);

  const organizationById = new Map(organizations.map((organization) => [
    organization.id,
    organization,
  ]));
  const billByTenantMonth = new Map(bills.map((bill) => [
    `${bill.tenant_id}:${asMonthKey(bill.billing_month)}`,
    bill,
  ]));
  const months = new Map<string, UsageBillMonth>();
  const billedTenantKeys = new Set<string>();

  function getPublicOrganizationId(tenantId: string) {
    const organization = organizationById.get(tenantId);
    if (!organization) throw new Error("A usage bill is outside the authorized organization set.");
    return organization.organization_id;
  }

  function getMonth(month: string) {
    let group = months.get(month);
    if (!group) {
      group = {
        month,
        monthName: monthName(month),
        unbilledCostUsd: 0,
        billedCostUsd: 0,
        unbilledTenants: [],
        billedTenants: [],
      };
      months.set(month, group);
    }
    return group;
  }

  for (const row of usageRows) {
    const group = getMonth(row.month);
    const key = `${row.tenant_id}:${row.month}`;
    const bill = billByTenantMonth.get(key);
    if (bill) {
      billedTenantKeys.add(key);
      const cost = bill.estimated_cost_usd.toNumber();
      group.billedCostUsd += cost;
      group.billedTenants.push({
        organizationId: getPublicOrganizationId(bill.tenant_id),
        organizationName: bill.organization_name,
        requests: bill.total_requests,
        estimatedCostUsd: cost,
        canBill: false,
        billName: bill.bill_name,
        billedAt: bill.billed_at.toISOString(),
      });
      continue;
    }

    const cost = decimalToNumber(row.estimated_cost_usd);
    group.unbilledCostUsd += cost;
    group.unbilledTenants.push({
      organizationId: getPublicOrganizationId(row.tenant_id),
      organizationName: row.organization_name,
      requests: row.total_requests,
      estimatedCostUsd: cost,
      canBill: organizationById.get(row.tenant_id)?.can_manage_settings === true,
    });
  }

  for (const bill of bills) {
    const month = asMonthKey(bill.billing_month);
    const key = `${bill.tenant_id}:${month}`;
    if (billedTenantKeys.has(key)) continue;
    const group = getMonth(month);
    const cost = bill.estimated_cost_usd.toNumber();
    group.billedCostUsd += cost;
    group.billedTenants.push({
      organizationId: getPublicOrganizationId(bill.tenant_id),
      organizationName: bill.organization_name,
      requests: bill.total_requests,
      estimatedCostUsd: cost,
      canBill: false,
      billName: bill.bill_name,
      billedAt: bill.billed_at.toISOString(),
    });
  }

  return {
    months: [...months.values()].sort((left, right) => right.month.localeCompare(left.month)),
  };
}

function parseBillingMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const date = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== month) return null;
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  currentMonth.setUTCHours(0, 0, 0, 0);
  return date > currentMonth ? null : date;
}

export async function createTenantUsageBills(input: {
  workspaceUserId: string;
  month: string;
}) {
  const billingMonth = parseBillingMonth(input.month);
  if (!billingMonth) throw new TenantUsageBillMonthError();

  const organizations = await listOrganizationsForUser(input.workspaceUserId);
  const tenantIds = organizations.map(({ id }) => id);
  if (tenantIds.length === 0) return { month: input.month, createdCount: 0 };

  const nextMonth = new Date(Date.UTC(
    billingMonth.getUTCFullYear(),
    billingMonth.getUTCMonth() + 1,
    1,
  ));
  const formattedMonth = monthName(input.month);
  const billName = `Server Cost - ${formattedMonth}`;
  const organizationById = new Map(organizations.map((organization) => [
    organization.id,
    organization,
  ]));

  return prisma.$transaction(async (transaction) => {
    const [existingBills, monthlyUsage, dailyUsageRows] = await Promise.all([
      transaction.tenantUsageBill.findMany({
        where: {
          tenant_id: { in: tenantIds },
          billing_month: billingMonth,
        },
        select: { tenant_id: true },
      }),
      transaction.tenantUsageDaily.groupBy({
        by: ["tenant_id"],
        where: {
          tenant_id: { in: tenantIds },
          date: { gte: billingMonth, lt: nextMonth },
        },
        _sum: {
          total_requests: true,
          total_execution_ms: true,
          total_egress_bytes: true,
          db_storage_bytes: true,
          media_storage_bytes: true,
          neon_compute_cost_usd: true,
          db_storage_cost_usd: true,
          vercel_invocation_cost_usd: true,
          egress_cost_usd: true,
          media_storage_cost_usd: true,
          estimated_cost_usd: true,
        },
      }),
      transaction.tenantUsageDaily.findMany({
        where: {
          tenant_id: { in: tenantIds },
          date: { gte: billingMonth, lt: nextMonth },
        },
        orderBy: [{ tenant_id: "asc" }, { date: "asc" }],
        select: {
          tenant_id: true,
          date: true,
          total_requests: true,
          total_execution_ms: true,
          total_egress_bytes: true,
          db_storage_bytes: true,
          media_storage_bytes: true,
          neon_compute_cost_usd: true,
          db_storage_cost_usd: true,
          vercel_invocation_cost_usd: true,
          egress_cost_usd: true,
          media_storage_cost_usd: true,
          estimated_cost_usd: true,
        },
      }),
    ]);

    const existingTenantIds = new Set(existingBills.map(({ tenant_id }) => tenant_id));
    const unbilledUsage = monthlyUsage.filter(({ tenant_id }) =>
      !existingTenantIds.has(tenant_id),
    );
    if (unbilledUsage.some(({ tenant_id }) =>
      organizationById.get(tenant_id)?.can_manage_settings !== true,
    )) {
      throw new TenantUsageBillPermissionError();
    }
    if (unbilledUsage.length === 0) {
      return { month: input.month, createdCount: 0 };
    }
    const dailyRowsByTenant = new Map<string, UsageDailyCostRecord[]>();
    for (const row of dailyUsageRows) {
      const tenantRows = dailyRowsByTenant.get(row.tenant_id) ?? [];
      tenantRows.push(row);
      dailyRowsByTenant.set(row.tenant_id, tenantRows);
    }

    const billRecords = unbilledUsage.map((usage) => {
      const organization = organizationById.get(usage.tenant_id);
      if (!organization) throw new TenantUsageBillPermissionError();

      const sum = usage._sum;
      const estimatedCost = sum.estimated_cost_usd ?? new Prisma.Decimal(0);
      return {
        id: randomUUID(),
        tenant_id: usage.tenant_id,
        billing_month: billingMonth,
        bill_name: billName,
        organization_name: organization.organization_name,
        total_requests: sum.total_requests ?? 0,
        total_execution_ms: sum.total_execution_ms ?? BigInt(0),
        total_egress_bytes: sum.total_egress_bytes ?? BigInt(0),
        db_storage_bytes: sum.db_storage_bytes ?? BigInt(0),
        media_storage_bytes: sum.media_storage_bytes ?? BigInt(0),
        neon_compute_cost_usd: sum.neon_compute_cost_usd ?? new Prisma.Decimal(0),
        db_storage_cost_usd: sum.db_storage_cost_usd ?? new Prisma.Decimal(0),
        vercel_invocation_cost_usd: sum.vercel_invocation_cost_usd ?? new Prisma.Decimal(0),
        egress_cost_usd: sum.egress_cost_usd ?? new Prisma.Decimal(0),
        media_storage_cost_usd: sum.media_storage_cost_usd ?? new Prisma.Decimal(0),
        estimated_cost_usd: estimatedCost,
        daily_breakdown: (dailyRowsByTenant.get(usage.tenant_id) ?? []).map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          requests: row.total_requests,
          executionMs: row.total_execution_ms.toString(),
          egressBytes: row.total_egress_bytes.toString(),
          dbStorageBytes: row.db_storage_bytes.toString(),
          mediaStorageBytes: row.media_storage_bytes.toString(),
          neonComputeCostUsd: row.neon_compute_cost_usd.toNumber(),
          dbStorageCostUsd: row.db_storage_cost_usd.toNumber(),
          vercelInvocationCostUsd: row.vercel_invocation_cost_usd.toNumber(),
          egressCostUsd: row.egress_cost_usd.toNumber(),
          mediaStorageCostUsd: row.media_storage_cost_usd.toNumber(),
          estimatedCostUsd: row.estimated_cost_usd.toNumber(),
        })),
      };
    });

    await transaction.tenantUsageBill.createMany({ data: billRecords });
    await transaction.auditEvent.createMany({
      data: billRecords.map((bill) => ({
        organization_id: bill.tenant_id,
        user_id: input.workspaceUserId,
        module: "SERVER_COST",
        action: "CREATE_USAGE_BILL",
        entity_type: "tenant_usage_bill",
        entity_id: bill.id,
        details: {
          billingMonth: input.month,
          billName: bill.bill_name,
          estimatedCostUsd: bill.estimated_cost_usd.toString(),
        },
      })),
    });

    return { month: input.month, createdCount: billRecords.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getTenantUsageDailyCostBreakdown(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  month: string;
}) {
  const billingMonth = parseBillingMonth(input.month);
  if (!billingMonth) throw new TenantUsageBillMonthError();

  const organizations = await listOrganizationsForUser(input.workspaceUserId);
  const organization = organizations.find(
    ({ organization_id }) => organization_id === input.publicOrganizationId,
  );
  if (!organization) return null;

  const nextMonth = new Date(Date.UTC(
    billingMonth.getUTCFullYear(),
    billingMonth.getUTCMonth() + 1,
    1,
  ));
  const bill = await prisma.tenantUsageBill.findFirst({
    where: {
      tenant_id: organization.id,
      billing_month: billingMonth,
    },
    select: { daily_breakdown: true },
  });
  const snapshot = parseDailyBreakdownSnapshot(bill?.daily_breakdown ?? null);
  const rows = snapshot ?? (await prisma.tenantUsageDaily.findMany({
    where: {
      tenant_id: organization.id,
      date: { gte: billingMonth, lt: nextMonth },
    },
    orderBy: { date: "asc" },
  })).map(serializeDailyCostRow);

  return {
    month: input.month,
    organizationName: organization.organization_name,
    rows,
    isBilledSnapshot: snapshot !== null,
    rates: getTenantUsageRates(),
    telemetry: {
      egressCaptured: false,
      mediaStorageConnected: false,
    },
  };
}
