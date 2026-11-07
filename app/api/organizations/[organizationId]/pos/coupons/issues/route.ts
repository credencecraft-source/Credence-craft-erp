import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listPosCouponIssues } from "@/lib/services/pos/pos-coupon-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

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
      typeof parsed.id !== "string"
      || parsed.id.length === 0
      || parsed.id.length > 100
      || typeof parsed.createdAt !== "string"
    ) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) return null;
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
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE"],
    );
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    if (status !== "ACTIVE" && status !== "EXPIRED" && status !== "CLAIMED") {
      return NextResponse.json({ error: "Select Active, Expired, or Claimed issued coupons." }, { status: 400 });
    }
    const search = params.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Coupon search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = params.get("cursor");
    const parsedCursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !parsedCursor) {
      return NextResponse.json({ error: "Invalid issued-coupon pagination cursor." }, { status: 400 });
    }
    const cursor = parsedCursor ?? undefined;

    const asOfDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const result = await listPosCouponIssues(organization.id, {
      take: limit,
      cursor,
      search,
      status,
      asOfDate,
    });
    return NextResponse.json({
      issues: result.issues,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor
        ? Buffer.from(JSON.stringify({
            id: result.nextCursor.id,
            createdAt: result.nextCursor.createdAt.toISOString(),
          })).toString("base64url")
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load issued POS coupons." },
      { status: 400 },
    );
  }
}
