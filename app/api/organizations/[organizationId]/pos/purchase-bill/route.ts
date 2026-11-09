import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createPurchaseBill, listPurchaseBills } from "@/lib/services/pos/purchase-bill-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseCursor(value: string) {
  if (value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      parsed.id.length > 100 ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) {
      return null;
    }
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    const searchParams = new URL(request.url).searchParams;
    const search = searchParams.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Purchase bill search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = searchParams.get("cursor");
    const parsedCursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !parsedCursor) {
      return NextResponse.json({ error: "Invalid purchase bill pagination cursor." }, { status: 400 });
    }
    const cursor = parsedCursor ?? undefined;
    const result = await listPurchaseBills(organization.id, { take: limit, cursor, search });
    return NextResponse.json({
      bills: result.bills,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor
        ? Buffer.from(JSON.stringify({
            id: result.nextCursor.id,
            createdAt: result.nextCursor.createdAt.toISOString(),
          })).toString("base64url")
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load purchase bills." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE"]);
    const body = await request.json() as Record<string, unknown>;
    const result = await createPurchaseBill(organization.id, user.id, {
      entityId: String(body.entityId ?? ""),
      vendorId: String(body.vendorId ?? ""),
      billNumber: String(body.billNumber ?? ""),
      billDate: String(body.billDate ?? ""),
      taxMode: body.taxMode === "INTERSTATE" ? "INTERSTATE" : "LOCAL",
      recordIds: Array.isArray(body.recordIds) ? body.recordIds.map(String) : [],
    });
    return NextResponse.json({ bill: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to post purchase bill." }, { status: 400 });
  }
}
