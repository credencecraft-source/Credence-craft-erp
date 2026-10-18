import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  allocateSalesOrder,
  getSalesOrderAllocationData,
} from "@/lib/services/distribution/advance-booking-allocation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ quotationId: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Sales Order allocation is unavailable until its database schema is deployed." }, { status: 503 });
    }
    if (["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "Booking, work-order, or stock balances changed concurrently. Reload and try again." }, { status: 409 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("Unable to access Sales Order allocation because the database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const search = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, search.get("organizationId") ?? "");
    const { quotationId } = await context.params;
    return NextResponse.json(await getSalesOrderAllocationData(organization.id, quotationId));
  } catch (error) {
    return errorResponse(error, "Unable to load Sales Order allocation.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new Error("Submit a valid Sales Order allocation request.");
    if (body.mode !== "GENERAL" && body.mode !== "PRODUCTION") {
      throw new Error("Select General Stock or Production allocation.");
    }
    const mode = body.mode;
    if (typeof body.organizationId !== "string" || !body.organizationId.trim()) {
      throw new Error("Select the organization for this Sales Order allocation.");
    }
    let workOrderSelections: Array<{ orderId: string; workOrderId: string }> = [];
    if (body.workOrders !== undefined) {
      if (!Array.isArray(body.workOrders) || body.workOrders.length > 200) {
        throw new Error("Submit valid work-order selections for this Sales Order.");
      }
      workOrderSelections = body.workOrders.map((value) => {
        if (!isRecord(value) || typeof value.orderId !== "string" || typeof value.workOrderId !== "string") {
          throw new Error("Each source order needs a valid work-order selection.");
        }
        return { orderId: value.orderId.trim(), workOrderId: value.workOrderId.trim() };
      });
    }
    const { quotationId } = await context.params;
    const result = await allocateSalesOrder(
      user.id,
      body.organizationId,
      quotationId,
      mode,
      workOrderSelections,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error, "Unable to allocate this Sales Order.");
  }
}
