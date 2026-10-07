import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  acceptFinishedGoodsOutwardRequest,
  cancelFinishedGoodsOutwardRequest,
  createFinishedGoodsOutwardBox,
  createFinishedGoodsOutwardRequest,
  createFinishedGoodsOutwardRequestFromBookings,
  createFinishedGoodsOutwardShipment,
  deleteFinishedGoodsOutwardBox,
  listFinishedGoodsOutwardWorkflow,
  pickFinishedGoodsOutwardLine,
} from "@/lib/services/inventory/finished-goods-outward-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type StockType = "SKU" | "GENERAL" | "ALLOCATED";
const stockTypes: StockType[] = ["SKU", "GENERAL", "ALLOCATED"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isStockType(value: unknown): value is StockType {
  return typeof value === "string" && stockTypes.some((stockType) => stockType === value);
}

function isRequestLine(value: unknown): value is { stockType: StockType; stockId: string; quantity: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && "stockType" in value && isStockType(value.stockType)
    && "stockId" in value && typeof value.stockId === "string"
    && "quantity" in value && typeof value.quantity === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "The workflow changed while saving. Reload and try again." }, { status: 409 });
    }
    if (["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "The FG Stock DC schema is not deployed. Apply its database migration before using this page." }, { status: 503 });
    }
    console.error("FG Stock DC database operation failed.", { code: error.code });
    return NextResponse.json({ error: fallback }, { status: 500 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error("FG Stock DC operation failed.", { errorType: typeof error });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const organization = await requireOrganizationContext(user.id, url.searchParams.get("organizationId") ?? "");
    return NextResponse.json(await listFinishedGoodsOutwardWorkflow(organization.id, user.id));
  } catch (error) {
    return handleError(error, "Unable to load FG Stock DC workflow.");
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid FG Stock DC request is required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const organizationId = text(input.organizationId);
  const action = text(input.action);
  if (!organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
  if (!["request", "request-bookings", "accept", "cancel-request", "pick", "box", "delete-box", "ship"].includes(action)) {
    return NextResponse.json({ error: "Select a valid FG Stock DC action." }, { status: 400 });
  }

  try {
    const requesterRoles = action === "request-bookings"
      ? ["OWNER", "ADMIN", "MERCHANDISING"]
      : ["OWNER", "ADMIN", "INVENTORY"];
    const organization = await requireOrganizationContext(user.id, organizationId, requesterRoles);
    const actor = { organizationId: organization.id, actorId: user.id, actorName: user.full_name };

    if (action === "request") {
      if (!Array.isArray(input.lines) || !input.lines.every(isRequestLine)) {
        return NextResponse.json({ error: "Select valid finished-goods stock records and quantities." }, { status: 400 });
      }
      const lines = input.lines.map((line) => ({
        stockType: line.stockType,
        stockId: text(line.stockId),
        quantity: text(line.quantity),
      }));
      const result = await createFinishedGoodsOutwardRequest({ ...actor, lines });
      return NextResponse.json({ ok: true, request: result }, { status: 201 });
    }
    if (action === "request-bookings") {
      if (!isStringArray(input.bookingIds)) {
        return NextResponse.json({ error: "Select shipment tracking records to request finished goods." }, { status: 400 });
      }
      const result = await createFinishedGoodsOutwardRequestFromBookings({
        ...actor,
        bookingIds: input.bookingIds,
      });
      return NextResponse.json({ ok: true, request: result }, { status: 201 });
    }
    if (action === "accept") {
      const requestId = text(input.requestId);
      if (!requestId) return NextResponse.json({ error: "Request ID is required." }, { status: 400 });
      const result = await acceptFinishedGoodsOutwardRequest({ ...actor, requestId });
      return NextResponse.json({ ok: true, request: result });
    }
    if (action === "cancel-request") {
      const requestId = text(input.requestId);
      if (!requestId) return NextResponse.json({ error: "Request ID is required." }, { status: 400 });
      const result = await cancelFinishedGoodsOutwardRequest({ ...actor, requestId });
      return NextResponse.json({ ok: true, request: result });
    }
    if (action === "pick") {
      const requestLineId = text(input.requestLineId);
      if (!requestLineId) return NextResponse.json({ error: "Request line ID is required." }, { status: 400 });
      const result = await pickFinishedGoodsOutwardLine({ ...actor, requestLineId });
      return NextResponse.json({ ok: true, item: result });
    }
    if (action === "box" || action === "ship") {
      const ids = action === "box" ? input.requestLineIds : input.boxIds;
      if (!isStringArray(ids)) {
        return NextResponse.json({ error: action === "box" ? "Picked item IDs must be provided as a list." : "Box IDs must be provided as a list." }, { status: 400 });
      }
      const result = action === "box"
        ? await createFinishedGoodsOutwardBox({ ...actor, requestLineIds: ids })
        : await createFinishedGoodsOutwardShipment({ ...actor, boxIds: ids });
      return NextResponse.json(action === "box" ? { ok: true, box: result } : { ok: true, shipment: result }, { status: 201 });
    }

    const boxId = text(input.boxId);
    if (!boxId) return NextResponse.json({ error: "Box ID is required." }, { status: 400 });
    const result = await deleteFinishedGoodsOutwardBox({ ...actor, boxId });
    return NextResponse.json({ ok: true, box: result });
  } catch (error) {
    return handleError(error, "Unable to save the FG Stock DC workflow.");
  }
}
