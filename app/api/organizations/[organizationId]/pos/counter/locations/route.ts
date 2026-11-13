import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  listPosCounterLocations,
  PosCounterValidationError,
} from "@/lib/services/pos/pos-counter-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function encodeCursor(cursor: { id: string; nodeName: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      nodeName?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || !parsed.id
      || parsed.id.length > 100
      || typeof parsed.nodeName !== "string"
      || !parsed.nodeName
      || parsed.nodeName.length > 255
    ) {
      return null;
    }
    return { id: parsed.id, nodeName: parsed.nodeName };
  } catch {
    return null;
  }
}

function handleError(error: unknown) {
  if (error instanceof PosCounterValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to view POS counter locations for this organization." }, { status: 403 });
  }
  if (error instanceof Error && error.message.includes("not found")) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  console.error("POS counter location lookup failed", { operation: "list" });
  return NextResponse.json({ error: "Unable to load active POS counter locations." }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_COUNTERS");

    const searchParams = new URL(request.url).searchParams;
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null
      ? DEFAULT_PAGE_SIZE
      : /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new PosCounterValidationError(`Lookup page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      throw new PosCounterValidationError("Invalid Sub-sub-location pagination cursor.");
    }
    const result = await listPosCounterLocations({
      organizationId: organization.id,
      search: searchParams.get("search") ?? "",
      cursor,
      limit,
    });
    return NextResponse.json({
      locations: result.locations,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return handleError(error);
  }
}
