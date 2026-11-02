import { Prisma, type FGMaterialIssueMovement, type FGMaterialIssueSource } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import { listFgIssued } from "@/lib/services/inventory/fg-issued-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const sourceTypes = ["PACKING_LIST", "POS_INVOICE", "MANUAL_ADJUSTMENT"] as const satisfies readonly FGMaterialIssueSource[];
const movements = ["ISSUE", "REVERSAL"] as const satisfies readonly FGMaterialIssueMovement[];

class InvalidRequestError extends Error {}

function isFgIssuedSchemaError(error: unknown) {
  const pending: unknown[] = [error];
  const visited = new Set<object>();
  const schemaErrorCodes = new Set(["P2021", "P2022", "42P01", "42703"]);

  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || visited.has(current)) continue;
    visited.add(current);

    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && schemaErrorCodes.has(candidate.code)) {
      return true;
    }
    pending.push(candidate.cause);
  }

  return false;
}

function parseDate(value: string | null, label: string, endOfDay = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidRequestError(`${label} must be a valid calendar date.`);
  }
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidRequestError(`${label} must be a valid calendar date.`);
  }
  return date;
}

function errorResponse(error: unknown) {
  if (isFgIssuedSchemaError(error)) {
    return NextResponse.json(
      { error: "FG Issued is unavailable until its database migration is deployed." },
      { status: 503 },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P1001" || error.code === "P1002" || error.code === "P1017") {
      console.error("FG Issued report database connection failed.", { code: error.code });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("FG Issued report query failed.", { code: error.code });
    return NextResponse.json({ error: "Unable to load FG Issued records." }, { status: 500 });
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("FG Issued report database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  if (error instanceof InvalidRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ error: "Unable to load FG Issued records." }, { status: 500 });
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const search = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, search.get("organizationId") ?? "");
    const pageValue = search.get("page");
    const pageSizeValue = search.get("pageSize");
    const page = pageValue === null ? 1 : Number(pageValue);
    const pageSize = pageSizeValue === null ? 50 : Number(pageSizeValue);
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      throw new InvalidRequestError("Page must be a whole number between 1 and 100000.");
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new InvalidRequestError("Page size must be a whole number between 1 and 100.");
    }
    const dateFrom = parseDate(search.get("dateFrom"), "Start date");
    const dateTo = parseDate(search.get("dateTo"), "End date", true);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new InvalidRequestError("Start date must not be later than end date.");
    }
    const sourceTypeValue = search.get("sourceType") ?? "";
    if (sourceTypeValue && !sourceTypes.includes(sourceTypeValue as FGMaterialIssueSource)) {
      throw new InvalidRequestError("Select a valid FG issue source.");
    }
    const movementValue = search.get("movement") ?? "";
    if (movementValue && !movements.includes(movementValue as FGMaterialIssueMovement)) {
      throw new InvalidRequestError("Select a valid FG issue movement.");
    }

    const result = await listFgIssued(organization.id, {
      dateFrom,
      dateTo,
      sourceType: sourceTypeValue ? sourceTypeValue as FGMaterialIssueSource : undefined,
      movement: movementValue ? movementValue as FGMaterialIssueMovement : undefined,
      page,
      pageSize,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof InvalidRequestError)
      && !(error instanceof Error && error.message.startsWith("Access denied:"))) {
      console.error("FG Issued API Error:", error);
    }
    return errorResponse(error);
  }
}
