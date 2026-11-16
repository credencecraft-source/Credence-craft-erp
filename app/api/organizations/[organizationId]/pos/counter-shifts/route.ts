import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  closePosCounterShift,
  getPosCounterShiftReadinessMessage,
  listPosCounterShifts,
  openPosCounterShift,
  PosCounterShiftConflictError,
  PosCounterShiftNotFoundError,
  PosCounterShiftValidationError,
} from "@/lib/services/pos/pos-counter-shift-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeCursor(cursor: { id: string; openedAt: string }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      openedAt?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || !parsed.id
      || parsed.id.length > 100
      || typeof parsed.openedAt !== "string"
    ) {
      return null;
    }
    const openedAt = new Date(parsed.openedAt);
    if (Number.isNaN(openedAt.getTime()) || openedAt.toISOString() !== parsed.openedAt) {
      return null;
    }
    return { id: parsed.id, openedAt };
  } catch {
    return null;
  }
}

function handleError(error: unknown, fallback: string) {
  const readinessMessage = getPosCounterShiftReadinessMessage(error);
  if (readinessMessage) {
    return NextResponse.json({ error: readinessMessage }, { status: 503 });
  }
  if (error instanceof PosCounterShiftValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PosCounterShiftConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof PosCounterShiftNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to access POS counter shifts." }, { status: 403 });
  }
  if (error instanceof Error && error.message.includes("not found")) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  console.error("POS counter shift request failed", { operation: fallback });
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
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_SALES");

    const searchParams = new URL(request.url).searchParams;
    const counterId = searchParams.get("counterId")?.trim() ?? "";
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null
      ? DEFAULT_PAGE_SIZE
      : /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
    if (!counterId || counterId.length > 100) {
      throw new PosCounterShiftValidationError("Select a valid POS counter.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new PosCounterShiftValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      throw new PosCounterShiftValidationError("Invalid counter-shift pagination cursor.");
    }
    const result = await listPosCounterShifts({
      organizationId: organization.id,
      counterId,
      actorId: user.id,
      cursor,
      limit,
    });
    return NextResponse.json({
      ...result,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return handleError(error, "Unable to load counter shifts.");
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
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_SALES");
    const rawBody = await request.text();
    if (rawBody.length > 4096) {
      throw new PosCounterShiftValidationError("Counter-shift details are too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      throw new PosCounterShiftValidationError("Counter-shift details must be valid JSON.");
    }
    if (!isRecord(body)) {
      throw new PosCounterShiftValidationError("Counter-shift details must be sent as an object.");
    }
    if (typeof body.counterId !== "string") {
      throw new PosCounterShiftValidationError("Select a valid POS counter.");
    }
    const shift = await openPosCounterShift({
      organizationId: organization.id,
      counterId: body.counterId,
      actorId: user.id,
      actorName: user.full_name,
      openingBalance: body.openingBalance,
    });
    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to open the counter shift.");
  }
}

export async function PATCH(
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
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_SALES");
    const rawBody = await request.text();
    if (rawBody.length > 4096) {
      throw new PosCounterShiftValidationError("Counter-shift details are too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      throw new PosCounterShiftValidationError("Counter-shift details must be valid JSON.");
    }
    if (!isRecord(body)) {
      throw new PosCounterShiftValidationError("Counter-shift details must be sent as an object.");
    }
    if (typeof body.shiftId !== "string") {
      throw new PosCounterShiftValidationError("Select a valid counter shift.");
    }
    const shift = await closePosCounterShift({
      organizationId: organization.id,
      shiftId: body.shiftId,
      actorId: user.id,
      closingBalance: body.closingBalance,
    });
    return NextResponse.json({ shift });
  } catch (error) {
    return handleError(error, "Unable to close the counter shift.");
  }
}
