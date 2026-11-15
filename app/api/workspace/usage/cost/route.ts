import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { listOrganizationsForUser } from "@/lib/services/organizations/organization-service";

export const maxDuration = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

function serializeDailyRow(row: {
  id: string;
  tenant_id: string;
  date: Date;
  total_requests: number;
  total_execution_ms: bigint;
  total_egress_bytes: bigint;
  db_storage_bytes: bigint;
  media_storage_bytes: bigint;
  neon_compute_cost_usd: { toNumber(): number };
  db_storage_cost_usd: { toNumber(): number };
  vercel_invocation_cost_usd: { toNumber(): number };
  egress_cost_usd: { toNumber(): number };
  media_storage_cost_usd: { toNumber(): number };
  estimated_cost_usd: { toNumber(): number };
}) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
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

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId || workspaceId !== user.workspace_id) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    const today = new Date();
    const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const defaultStart = new Date(defaultEnd.getTime() - 29 * DAY_MS);
    const startDate = parseDate(url.searchParams.get("startDate"), defaultStart);
    const requestedEndDate = parseDate(url.searchParams.get("endDate"), defaultEnd);
    if (!startDate || !requestedEndDate || startDate > requestedEndDate) {
      return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
    }
    if (requestedEndDate.getTime() - startDate.getTime() > 365 * DAY_MS) {
      return NextResponse.json({ error: "Date ranges are limited to 366 days." }, { status: 400 });
    }

    const pageValue = Number(url.searchParams.get("page") ?? 1);
    const pageSizeValue = Number(url.searchParams.get("pageSize") ?? 20);
    if (!Number.isInteger(pageValue) || pageValue < 1) {
      return NextResponse.json({ error: "Page must be a positive integer." }, { status: 400 });
    }
    if (!Number.isInteger(pageSizeValue) || pageSizeValue < 1 || pageSizeValue > 100) {
      return NextResponse.json({ error: "Page size must be between 1 and 100." }, { status: 400 });
    }

    const organizations = await listOrganizationsForUser(user.id);
    const tenantIds = organizations.map((organization) => organization.id);
    const endExclusive = new Date(requestedEndDate.getTime() + DAY_MS);
    const where = {
      tenant_id: { in: tenantIds },
      date: { gte: startDate, lt: endExclusive },
    };
    const [rows, total] = tenantIds.length
      ? await Promise.all([
          prisma.tenantUsageDaily.findMany({
            where,
            orderBy: [{ date: "desc" }, { tenant_id: "asc" }],
            skip: (pageValue - 1) * pageSizeValue,
            take: pageSizeValue,
          }),
          prisma.tenantUsageDaily.count({ where }),
        ])
      : [[], 0];

    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const monthRows = tenantIds.length
      ? await prisma.tenantUsageDaily.findMany({
          where: {
            tenant_id: { in: tenantIds },
            date: { gte: monthStart, lt: nextMonthStart },
          },
          select: {
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
        })
      : [];
    const costBreakdown = {
      neonComputeUsd: 0,
      dbStorageUsd: 0,
      vercelInvocationUsd: 0,
      egressUsd: 0,
      mediaStorageUsd: 0,
    };
    let monthCost = 0;
    let monthRequests = 0;
    let monthExecutionMs = 0;
    let monthEgressBytes = 0;
    let monthDbStorageBytes = 0;
    let monthMediaStorageBytes = 0;
    const costByDate = new Map<string, number>();
    for (const row of monthRows) {
      const dailyCost = row.estimated_cost_usd.toNumber();
      monthCost += dailyCost;
      monthRequests += row.total_requests;
      monthExecutionMs += Number(row.total_execution_ms);
      monthEgressBytes += Number(row.total_egress_bytes);
      monthDbStorageBytes += Number(row.db_storage_bytes);
      monthMediaStorageBytes += Number(row.media_storage_bytes);
      costBreakdown.neonComputeUsd += row.neon_compute_cost_usd.toNumber();
      costBreakdown.dbStorageUsd += row.db_storage_cost_usd.toNumber();
      costBreakdown.vercelInvocationUsd += row.vercel_invocation_cost_usd.toNumber();
      costBreakdown.egressUsd += row.egress_cost_usd.toNumber();
      costBreakdown.mediaStorageUsd += row.media_storage_cost_usd.toNumber();
      const dateKey = row.date.toISOString().slice(0, 10);
      costByDate.set(dateKey, (costByDate.get(dateKey) ?? 0) + dailyCost);
    }
    const peakEntry = [...costByDate.entries()].sort((left, right) => right[1] - left[1])[0];
    const peakDay = peakEntry ? { date: peakEntry[0], costUsd: peakEntry[1] } : null;
    const elapsedDays = Math.max(1, today.getUTCDate());
    const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();

    return NextResponse.json(
      {
        rows: rows.map(serializeDailyRow),
        total,
        page: pageValue,
        pageSize: pageSizeValue,
        summary: {
          currentMonthCostUsd: monthCost,
          projectedMonthCostUsd: (monthCost / elapsedDays) * daysInMonth,
          averageDailyCostUsd: monthCost / elapsedDays,
          peakDay,
          costBreakdown,
          requests: monthRequests,
          executionMs: monthExecutionMs,
          egressBytes: monthEgressBytes,
          dbStorageBytes: monthDbStorageBytes,
          mediaStorageBytes: monthMediaStorageBytes,
        },
        telemetry: {
          egressCaptured: false,
          mediaStorageConnected: false,
          attribution: "Authorized organization API requests only",
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Unable to load workspace server cost usage.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load server cost usage." }, { status: 500 });
  }
}
