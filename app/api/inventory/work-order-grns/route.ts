import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import { createWorkOrderInventoryGrn, listWorkOrderInventoryGrns, listWorkOrdersForReceiving } from "@/lib/services/inventory/work-order-grn-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Work Order GRN is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "Work-order receiving changed while this GRN was being saved. Reload and try again." }, { status: 409 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("Unable to access Work Order GRN data because the database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    if (searchParams.get("workOrders") === "true") {
      const limitValue = searchParams.get("limit");
      const limit = limitValue ? Number(limitValue) : undefined;
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
        return NextResponse.json({ error: "Work-order page size must be between 1 and 200." }, { status: 400 });
      }
      const cursor = searchParams.get("cursor")?.trim() || undefined;
      return NextResponse.json(await listWorkOrdersForReceiving(organization.id, { cursor, limit }));
    }
    const status = searchParams.get("status")?.trim() || undefined;
    if (status && status !== "PENDING_VERIFICATION" && status !== "VERIFIED") {
      return NextResponse.json({ error: "Select a valid Work Order GRN status." }, { status: 400 });
    }
    const limitValue = searchParams.get("limit");
    const limit = limitValue ? Number(limitValue) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      return NextResponse.json({ error: "Work Order GRN page size must be between 1 and 200." }, { status: 400 });
    }
    const cursor = searchParams.get("cursor")?.trim() || undefined;
    return NextResponse.json(await listWorkOrderInventoryGrns(organization.id, { status, cursor, limit }));
  } catch (error) {
    return errorResponse(error, "Unable to load Work Order GRNs.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as {
      organizationId?: unknown;
      workOrderId?: unknown;
      receivedDate?: unknown;
      notes?: unknown;
      lines?: unknown;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid Work Order GRN form.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    if (!Array.isArray(body.lines) || body.lines.length > 200) {
      throw new Error("Submit a valid list of work-order size quantities.");
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object") throw new Error("Each work-order size quantity must be valid.");
      const line = value as Record<string, unknown>;
      const workOrderSizeLineId = typeof line.workOrderSizeLineId === "string" ? line.workOrderSizeLineId.trim() : "";
      const rawQuantity = line.receivedQuantity;
      const receivedQuantity = typeof rawQuantity === "number"
        ? rawQuantity
        : typeof rawQuantity === "string" && /^\d+$/.test(rawQuantity.trim())
          ? Number(rawQuantity)
          : Number.NaN;
      if (!workOrderSizeLineId || !Number.isSafeInteger(receivedQuantity) || receivedQuantity < 0) {
        throw new Error("Every work-order size needs a whole-number received quantity.");
      }
      return { workOrderSizeLineId, receivedQuantity };
    });
    const grn = await createWorkOrderInventoryGrn(organization.id, user.id, {
      workOrderId: String(body.workOrderId ?? "").trim(),
      receivedDate: String(body.receivedDate ?? ""),
      notes: typeof body.notes === "string" ? body.notes : "",
      lines,
    });
    return NextResponse.json({ grn }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to submit Work Order GRN.");
  }
}
