import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  createPosCounter,
  listPosCounters,
  PosCounterConflictError,
  PosCounterValidationError,
} from "@/lib/services/pos/pos-counter-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeCursor(cursor: { id: string; createdAt: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || !parsed.id
      || parsed.id.length > 100
      || typeof parsed.createdAt !== "string"
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

function handleError(error: unknown, fallback: string) {
  if (error instanceof PosCounterValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PosCounterConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to access POS counters for this organization." }, { status: 403 });
  }
  if (error instanceof Error && error.message.includes("not found")) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  console.error("POS counter request failed", { operation: fallback });
  return NextResponse.json({ error: fallback }, { status: 500 });
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
      throw new PosCounterValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      throw new PosCounterValidationError("Invalid counter pagination cursor.");
    }

    const result = await listPosCounters({
      organizationId: organization.id,
      search: searchParams.get("search") ?? "",
      cursor,
      limit,
    });
    return NextResponse.json({
      counters: result.counters,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return handleError(error, "Unable to load POS counters.");
  }
}

export async function POST(
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
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_COUNTERS");

    const rawBody = await request.text();
    if (rawBody.length > 4096) {
      throw new PosCounterValidationError("Counter details are too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      throw new PosCounterValidationError("Counter details must be valid JSON.");
    }
    if (!isRecord(body)) {
      throw new PosCounterValidationError("Counter details must be sent as an object.");
    }
    const counter = await createPosCounter({
      organizationId: organization.id,
      actorId: user.id,
      counterName: body.counterName,
      subSubLocationId: body.subSubLocationId,
    });
    return NextResponse.json({ counter }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to create the POS counter.");
  }
}
