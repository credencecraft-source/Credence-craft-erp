import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { dispatchFinanceOutboxForOrganization } from "@/lib/services/finance/finance-outbox-dispatcher";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.id, "DISPATCH_FINANCE_SYNC");
    const body: unknown = await request.json();
    if (!isRecord(body) || !["sync-now", "retry-failed", "retry-transaction"].includes(String(body.action))) {
      return NextResponse.json({ error: "Select a valid finance sync action." }, { status: 400 });
    }
    const transactionId = body.transactionId;
    if (transactionId !== undefined && (typeof transactionId !== "string" || transactionId.length < 1 || transactionId.length > 100)) {
      return NextResponse.json({ error: "Transaction ID is invalid." }, { status: 400 });
    }
    if (body.action === "retry-transaction" && typeof transactionId !== "string") {
      return NextResponse.json({ error: "A transaction ID is required for a targeted retry." }, { status: 400 });
    }
    const rawLimit = body.limit ?? 20;
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ error: "Batch size must be between 1 and 50." }, { status: 400 });
    }
    const result = await dispatchFinanceOutboxForOrganization(organization.id, {
      limit,
      forceRetry: body.action !== "sync-now",
      manual: true,
      ...(typeof transactionId === "string" ? { transactionId } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Finance outbox dispatch request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to dispatch finance synchronization." }, { status: 500 });
  }
}
