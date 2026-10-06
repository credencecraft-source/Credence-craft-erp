import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  acceptRawMaterialOutwardRequest,
  cancelRawMaterialOutwardRequest,
  createRawMaterialOutwardBox,
  createRawMaterialOutwardShipment,
  createWorkOrderMaterialRequest,
  deleteRawMaterialOutwardBox,
  deleteRawMaterialOutwardShipment,
  getRawMaterialPickHistoryForGroupedLine,
  listRawMaterialOutwardWorkflow,
  markRawMaterialOutwardItemPicked,
  undoAcceptRawMaterialOutwardRequest,
  undoPickRawMaterialOutwardItem,
} from "@/lib/services/inventory/raw-material-outward-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "The workflow changed while saving. Reload and try again." }, { status: 409 });
    }
    if (["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "The raw-material outward schema is not ready. Apply the pending database migration before using this page." }, { status: 503 });
    }
    console.error("Raw-material outward database operation failed.", { code: error.code });
    return NextResponse.json({ error: fallback }, { status: 500 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error("Raw-material outward operation failed.", { errorType: typeof error });
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
    const groupedPurchaseOrderLineId = url.searchParams.get("groupedPurchaseOrderLineId")?.trim();
    if (groupedPurchaseOrderLineId) {
      const pickHistory = await getRawMaterialPickHistoryForGroupedLine(
        organization.id,
        user.id,
        groupedPurchaseOrderLineId,
      );
      if (!pickHistory) return NextResponse.json({ error: "Allocated material line not found." }, { status: 404 });
      return NextResponse.json({ pickHistory });
    }
    const workOrderId = url.searchParams.get("workOrderId")?.trim();
    return NextResponse.json(await listRawMaterialOutwardWorkflow(organization.id, user.id, workOrderId || undefined));
  } catch (error) {
    return handleError(error, "Unable to load raw-material outward workflow.");
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
    return NextResponse.json({ error: "A valid outward workflow request is required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const organizationId = text(input.organizationId);
  const action = text(input.action);
  if (!organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
  if (![
    "request", "accept", "pick", "box", "ship", "delete-shipment", "cancel-request",
    "undo-accept", "undo-pick", "delete-box",
  ].includes(action)) {
    return NextResponse.json({ error: "Select a valid outward workflow action." }, { status: 400 });
  }

  try {
    const allowedRoles = action === "request"
      ? ["OWNER", "ADMIN", "MERCHANDISING"]
      : ["OWNER", "ADMIN", "INVENTORY"];
    const organization = await requireOrganizationContext(user.id, organizationId, allowedRoles);
    const actor = { organizationId: organization.id, actorId: user.id, actorName: user.full_name };

    if (action === "request") {
      const result = await createWorkOrderMaterialRequest({
        ...actor,
        workOrderId: text(input.workOrderId),
        requestedBy: user.full_name,
      });
      return NextResponse.json({ ok: true, request: result }, { status: 201 });
    }
    if (action === "accept") {
      const result = await acceptRawMaterialOutwardRequest({ ...actor, requestId: text(input.requestId) });
      return NextResponse.json({ ok: true, request: result });
    }
    if (action === "cancel-request") {
      const requestId = text(input.requestId);
      if (!requestId) return NextResponse.json({ error: "Request ID is required." }, { status: 400 });
      const result = await cancelRawMaterialOutwardRequest({ ...actor, requestId });
      return NextResponse.json({ ok: true, request: result });
    }
    if (action === "undo-accept") {
      const requestId = text(input.requestId);
      if (!requestId) return NextResponse.json({ error: "Request ID is required." }, { status: 400 });
      const result = await undoAcceptRawMaterialOutwardRequest({ ...actor, requestId });
      return NextResponse.json({ ok: true, request: result });
    }
    if (action === "pick") {
      const result = await markRawMaterialOutwardItemPicked({ ...actor, requestLineId: text(input.requestLineId) });
      return NextResponse.json({ ok: true, item: result });
    }
    if (action === "undo-pick") {
      const requestLineId = text(input.requestLineId);
      if (!requestLineId) return NextResponse.json({ error: "Request line ID is required." }, { status: 400 });
      const result = await undoPickRawMaterialOutwardItem({ ...actor, requestLineId });
      return NextResponse.json({ ok: true, item: result });
    }
    if (action === "box") {
      if (!Array.isArray(input.requestLineIds) || input.requestLineIds.some((value) => typeof value !== "string")) {
        return NextResponse.json({ error: "Picked item IDs must be provided as a list." }, { status: 400 });
      }
      const result = await createRawMaterialOutwardBox({ ...actor, requestLineIds: input.requestLineIds as string[] });
      return NextResponse.json({ ok: true, box: result }, { status: 201 });
    }
    if (action === "delete-shipment") {
      const shipmentId = text(input.shipmentId);
      if (!shipmentId) return NextResponse.json({ error: "Packing list ID is required." }, { status: 400 });
      const result = await deleteRawMaterialOutwardShipment({ ...actor, shipmentId });
      return NextResponse.json({ ok: true, shipment: result });
    }
    if (action === "delete-box") {
      const boxId = text(input.boxId);
      if (!boxId) return NextResponse.json({ error: "Box ID is required." }, { status: 400 });
      const result = await deleteRawMaterialOutwardBox({ ...actor, boxId });
      return NextResponse.json({ ok: true, box: result });
    }
    if (!Array.isArray(input.boxIds) || input.boxIds.some((value) => typeof value !== "string")) {
      return NextResponse.json({ error: "Shipment box IDs must be provided as a list." }, { status: 400 });
    }
    const result = await createRawMaterialOutwardShipment({ ...actor, boxIds: input.boxIds as string[] });
    return NextResponse.json({ ok: true, shipment: result }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to save the raw-material outward workflow.");
  }
}
