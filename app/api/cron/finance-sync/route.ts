import { timingSafeEqual } from "node:crypto";
import { FinanceExternalProvider, FinanceSyncStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { dispatchFinanceOutboxForOrganization } from "@/lib/services/finance/finance-outbox-dispatcher";

export const maxDuration = 60;

const MAX_ACTIVE_ORGANIZATIONS = 2_000;
const ORGANIZATIONS_PER_RUN = 30;
const ORGANIZATIONS_PER_WAVE = 10;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const configurations = await prisma.financeIntegrationConfig.findMany({
      where: {
        auto_sync: true,
        active_provider: { not: FinanceExternalProvider.NONE },
      },
      orderBy: [{ updated_at: "asc" }, { organization_id: "asc" }],
      take: MAX_ACTIVE_ORGANIZATIONS,
      select: { organization_id: true },
    });
    if (configurations.length === 0) {
      return NextResponse.json({ organizations: 0, processed: 0, synced: 0, failed: 0, skipped: 0 });
    }

    const organizationIds = configurations.map((configuration) => configuration.organization_id);
    const now = new Date();
    const dueOrganizations = await prisma.financeSyncOutboxLog.groupBy({
      by: ["organization_id"],
      where: {
        organization_id: { in: organizationIds },
        OR: [
          { status: FinanceSyncStatus.PENDING, available_at: { lte: now } },
          { status: FinanceSyncStatus.FAILED, available_at: { lte: now } },
          { status: FinanceSyncStatus.QUEUED, available_at: { lte: new Date(now.getTime() - 15 * 60_000) } },
        ],
      },
      _min: { available_at: true },
      orderBy: { _min: { available_at: "asc" } },
      take: ORGANIZATIONS_PER_RUN,
    });

    let processed = 0;
    let synced = 0;
    let failed = 0;
    let skipped = 0;
    for (let index = 0; index < dueOrganizations.length; index += ORGANIZATIONS_PER_WAVE) {
      const wave = dueOrganizations.slice(index, index + ORGANIZATIONS_PER_WAVE);
      const results = await Promise.all(wave.map(async ({ organization_id }) => {
        try {
          return await dispatchFinanceOutboxForOrganization(organization_id, { limit: 1 });
        } catch (error) {
          console.error("Scheduled finance outbox dispatch failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          return { processed: 0, synced: 0, failed: 1, skipped: 0 };
        }
      }));
      for (const result of results) {
        processed += result.processed;
        synced += result.synced;
        failed += result.failed;
        skipped += result.skipped;
      }
    }
    return NextResponse.json({
      organizations: dueOrganizations.length,
      processed,
      synced,
      failed,
      skipped,
      organizationLimitReached: configurations.length === MAX_ACTIVE_ORGANIZATIONS,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scheduled finance outbox dispatch failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to process finance synchronization queue." }, { status: 500 });
  }
}
