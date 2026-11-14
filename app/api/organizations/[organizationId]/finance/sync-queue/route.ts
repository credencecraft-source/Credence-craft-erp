import { FinanceExternalProvider, FinanceSyncStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  encodeFinanceCursor,
  parseFinanceCursor,
  requireFinanceOrganizationAccess,
} from "@/lib/services/finance/finance-api-access";
import { listFinanceSyncQueue } from "@/lib/services/finance/central-finance-query-service";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const SYNC_STATUSES: readonly FinanceSyncStatus[] = Object.values(FinanceSyncStatus);
const EXTERNAL_PROVIDERS: readonly FinanceExternalProvider[] = Object.values(FinanceExternalProvider);

function isEnumValue<T extends string>(value: string, values: readonly T[]): value is T {
  return values.some((candidate) => candidate === value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawStatus = params.get("status");
    const rawProvider = params.get("provider");
    const status = rawStatus && isEnumValue(rawStatus, SYNC_STATUSES)
      ? rawStatus
      : undefined;
    const provider = rawProvider && isEnumValue(rawProvider, EXTERNAL_PROVIDERS)
      ? rawProvider
      : undefined;
    if (rawStatus && !status) {
      return NextResponse.json({ error: "Select a valid finance sync status." }, { status: 400 });
    }
    if (rawProvider && !provider) {
      return NextResponse.json({ error: "Select a valid external provider." }, { status: 400 });
    }
    const cursor = parseFinanceCursor<{ id: string; createdAt: Date }>(
      params.get("cursor"),
      "createdAt",
    );
    const result = await listFinanceSyncQueue({
      organizationId: organization.id,
      status,
      provider,
      take: limit,
      cursor,
    });
    return NextResponse.json({
      ...result,
      nextCursor: result.nextCursor ? encodeFinanceCursor(result.nextCursor) : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith("Invalid pagination cursor.")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Finance sync queue request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load the finance sync queue." }, { status: 500 });
  }
}
