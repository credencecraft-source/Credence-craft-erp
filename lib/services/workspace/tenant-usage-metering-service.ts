import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type UsageRates = {
  neonComputePerCuHour: number;
  databaseStoragePerGbMonth: number;
  vercelInvocationPerMillion: number;
  egressPerGb: number;
  mediaStoragePerGbMonth: number;
};

type PendingUsageEvent = {
  tenant_id: string;
  endpoint: string;
  http_method: string;
  execution_ms: number;
  egress_bytes: null;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const pendingUsageEvents: PendingUsageEvent[] = [];
let usageFlushTimer: ReturnType<typeof setTimeout> | null = null;
let usageFlush: Promise<void> | null = null;
const MAX_USAGE_BATCH_SIZE = 100;
const MAX_PENDING_USAGE_EVENTS = 5_000;

function flushPendingUsageEvents(): Promise<void> {
  if (usageFlush) {
    return usageFlush.then(() =>
      pendingUsageEvents.length > 0 ? flushPendingUsageEvents() : undefined,
    );
  }
  if (usageFlushTimer) {
    clearTimeout(usageFlushTimer);
    usageFlushTimer = null;
  }

  const batch = pendingUsageEvents.splice(0, MAX_USAGE_BATCH_SIZE);
  if (batch.length === 0) return Promise.resolve();

  usageFlush = (async () => {
    const data = batch.map((event) => ({
      tenant_id: event.tenant_id,
      endpoint: event.endpoint,
      http_method: event.http_method,
      execution_ms: event.execution_ms,
      egress_bytes: event.egress_bytes,
    }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.tenantUsageLog.createMany({ data });
        for (const event of batch) event.resolve();
        return;
      } catch (error) {
        if (attempt === 2) {
          for (const event of batch) event.reject(error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  })().finally(() => {
    usageFlush = null;
    if (pendingUsageEvents.length > 0) void flushPendingUsageEvents();
  });

  return usageFlush;
}

function enqueueUsageEvent(
  event: Omit<PendingUsageEvent, "resolve" | "reject">,
): Promise<void> {
  if (pendingUsageEvents.length >= MAX_PENDING_USAGE_EVENTS) {
    return Promise.reject(new Error("Tenant usage batch queue reached its capacity."));
  }
  const completion = new Promise<void>((resolve, reject) => {
    pendingUsageEvents.push({ ...event, resolve, reject });
  });
  if (pendingUsageEvents.length >= MAX_USAGE_BATCH_SIZE) {
    void flushPendingUsageEvents();
  } else if (!usageFlushTimer) {
    usageFlushTimer = setTimeout(() => {
      usageFlushTimer = null;
      void flushPendingUsageEvents();
    }, 20);
  }
  return completion;
}

function getRate(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getTenantUsageRates(): UsageRates {
  return {
    neonComputePerCuHour: getRate("USAGE_NEON_COMPUTE_USD_PER_CU_HOUR", 0.16),
    databaseStoragePerGbMonth: getRate("USAGE_DATABASE_STORAGE_USD_PER_GB_MONTH", 0.25),
    vercelInvocationPerMillion: getRate("USAGE_VERCEL_INVOCATION_USD_PER_MILLION", 0.6),
    egressPerGb: getRate("USAGE_EGRESS_USD_PER_GB", 0.15),
    mediaStoragePerGbMonth: getRate("USAGE_MEDIA_STORAGE_USD_PER_GB_MONTH", 0.02),
  };
}

export async function recordOrganizationRequestUsage(input: {
  workspaceUserId: string;
  publicOrganizationId: string;
  endpoint: string;
  method: string;
  executionMs: number;
}) {
  const organization = await requireOrganizationContext(
    input.workspaceUserId,
    input.publicOrganizationId,
  );
  await enqueueUsageEvent({
    tenant_id: organization.id,
    endpoint: input.endpoint.slice(0, 255),
    http_method: input.method.slice(0, 10),
    execution_ms: Math.min(2_147_483_647, Math.max(0, Math.trunc(input.executionMs))),
    egress_bytes: null,
  });
}

async function getDatabaseStorageByTenant(tenantIds: string[]) {
  if (tenantIds.length === 0) return new Map<string, bigint>();

  const tables = await prisma.$queryRaw<Array<{ table_schema: string; table_name: string }>>`
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organization_id'
      AND table_name <> 'organizations'
      AND table_name <> 'tenant_usage_logs'
      AND table_name <> 'tenant_usage_daily'
    GROUP BY table_schema, table_name
  `;

  const tenantValues = Prisma.join(tenantIds.map((tenantId) => Prisma.sql`(${tenantId})`));
  const tableQueries = tables.map(({ table_schema, table_name }) => {
    const tableIdentifier = Prisma.raw(
      `"${table_schema.replaceAll('"', '""')}"."${table_name.replaceAll('"', '""')}"`,
    );
    return Prisma.sql`
      SELECT usage_row.organization_id AS tenant_id,
             SUM(pg_column_size(usage_row))::bigint AS bytes
      FROM ${tableIdentifier} AS usage_row
      INNER JOIN tenants ON tenants.tenant_id = usage_row.organization_id
      GROUP BY usage_row.organization_id
    `;
  });
  const organizationTable = Prisma.sql`
    SELECT organization_row.id AS tenant_id,
           pg_column_size(organization_row)::bigint AS bytes
    FROM "organizations" AS organization_row
    INNER JOIN tenants ON tenants.tenant_id = organization_row.id
  `;
  const query = Prisma.sql`
    WITH tenants(tenant_id) AS (VALUES ${tenantValues})
    SELECT tenant_id, SUM(bytes)::bigint AS bytes
    FROM (${Prisma.join([...tableQueries, organizationTable], " UNION ALL ")}) AS tenant_rows
    GROUP BY tenant_id
  `;
  const rows = await prisma.$queryRaw<Array<{ tenant_id: string; bytes: bigint }>>(query);
  return new Map(rows.map((row) => [row.tenant_id, row.bytes]));
}

export async function aggregateTenantUsageForDate(date: Date) {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const tenants = await prisma.organization.findMany({
    where: { is_active: true },
    select: { id: true },
  });
  const tenantIds = tenants.map(({ id }) => id);
  if (tenantIds.length === 0) return { aggregatedTenants: 0 };

  const storageByTenant = await getDatabaseStorageByTenant(tenantIds);
  const rates = getTenantUsageRates();
  const tenantValues = Prisma.join(tenantIds.map((tenantId) => Prisma.sql`(${tenantId})`));
  const storageRows = tenantIds.map((tenantId) => Prisma.sql`
    (${tenantId}, ${storageByTenant.get(tenantId) ?? BigInt(0)}::bigint, 0::bigint)
  `);
  const dayCount = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth() + 1, 0)).getUTCDate();
  const gigabyte = 1_073_741_824;

  const affected = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "tenant_usage_daily" (
      "id", "tenant_id", "date", "total_requests", "total_execution_ms",
      "total_egress_bytes", "db_storage_bytes", "media_storage_bytes",
      "neon_compute_cost_usd", "db_storage_cost_usd", "vercel_invocation_cost_usd",
      "egress_cost_usd", "media_storage_cost_usd", "estimated_cost_usd", "updated_at"
    )
    SELECT
      'usage_' || md5(tenants.tenant_id || ${dayStart}::date::text),
      tenants.tenant_id,
      ${dayStart}::date,
      COALESCE(usage."total_requests", 0),
      COALESCE(usage."total_execution_ms", 0),
      COALESCE(usage."total_egress_bytes", 0),
      storage."db_storage_bytes",
      storage."media_storage_bytes",
      COALESCE(usage."total_execution_ms", 0)::numeric / 3600000 * ${rates.neonComputePerCuHour},
      storage."db_storage_bytes"::numeric / ${gigabyte} * ${rates.databaseStoragePerGbMonth} / ${dayCount},
      COALESCE(usage."total_requests", 0)::numeric / 1000000 * ${rates.vercelInvocationPerMillion},
      COALESCE(usage."total_egress_bytes", 0)::numeric / ${gigabyte} * ${rates.egressPerGb},
      storage."media_storage_bytes"::numeric / ${gigabyte} * ${rates.mediaStoragePerGbMonth} / ${dayCount},
      COALESCE(usage."total_execution_ms", 0)::numeric / 3600000 * ${rates.neonComputePerCuHour}
        + storage."db_storage_bytes"::numeric / ${gigabyte} * ${rates.databaseStoragePerGbMonth} / ${dayCount}
        + COALESCE(usage."total_requests", 0)::numeric / 1000000 * ${rates.vercelInvocationPerMillion}
        + COALESCE(usage."total_egress_bytes", 0)::numeric / ${gigabyte} * ${rates.egressPerGb}
        + storage."media_storage_bytes"::numeric / ${gigabyte} * ${rates.mediaStoragePerGbMonth} / ${dayCount},
      NOW()
    FROM (VALUES ${tenantValues}) AS tenants(tenant_id)
    INNER JOIN (VALUES ${Prisma.join(storageRows)}) AS storage(
      "tenant_id", "db_storage_bytes", "media_storage_bytes"
    ) ON storage."tenant_id" = tenants.tenant_id
    LEFT JOIN (
      SELECT "tenant_id", ${dayStart}::date AS "date",
             COUNT(*)::integer AS "total_requests",
             COALESCE(SUM("execution_ms"), 0)::bigint AS "total_execution_ms",
             COALESCE(SUM("egress_bytes"), 0)::bigint AS "total_egress_bytes"
      FROM "tenant_usage_logs"
      WHERE "timestamp" >= ${dayStart} AND "timestamp" < ${dayEnd}
        AND "tenant_id" IN (${Prisma.join(tenantIds)})
      GROUP BY "tenant_id"
    ) AS usage ON usage."tenant_id" = tenants.tenant_id
    ON CONFLICT ("tenant_id", "date") DO UPDATE SET
      "total_requests" = EXCLUDED."total_requests",
      "total_execution_ms" = EXCLUDED."total_execution_ms",
      "total_egress_bytes" = EXCLUDED."total_egress_bytes",
      "db_storage_bytes" = EXCLUDED."db_storage_bytes",
      "media_storage_bytes" = EXCLUDED."media_storage_bytes",
      "neon_compute_cost_usd" = EXCLUDED."neon_compute_cost_usd",
      "db_storage_cost_usd" = EXCLUDED."db_storage_cost_usd",
      "vercel_invocation_cost_usd" = EXCLUDED."vercel_invocation_cost_usd",
      "egress_cost_usd" = EXCLUDED."egress_cost_usd",
      "media_storage_cost_usd" = EXCLUDED."media_storage_cost_usd",
      "estimated_cost_usd" = EXCLUDED."estimated_cost_usd",
      "updated_at" = NOW()
  `);

  return { aggregatedTenants: affected };
}
