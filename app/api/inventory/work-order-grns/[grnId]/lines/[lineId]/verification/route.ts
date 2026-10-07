import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { verifyWorkOrderInventoryGrnLine } from "@/lib/services/inventory/work-order-grn-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ grnId: string; lineId: string }> };

function parseQuantity(value: unknown, fieldName: string) {
  const quantity = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2147483647) {
    throw new Error(`${fieldName} quantity must be a whole number of zero or more.`);
  }
  return quantity;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit valid Work Order GRN verification quantities.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const { grnId, lineId } = await context.params;
    const result = await verifyWorkOrderInventoryGrnLine(
      organization.id,
      user.id,
      grnId,
      lineId,
      {
        actualReceivedQuantity: parseQuantity(body.actualReceivedQuantity, "Actual received"),
        approvedQuantity: parseQuantity(body.approvedQuantity, "Approved"),
        locationId: typeof body.locationId === "string" ? body.locationId.trim() : "",
        actorEmail: user.email,
      },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") {
        return NextResponse.json({ error: "Work Order GRN verification is unavailable until its database migration is deployed." }, { status: 503 });
      }
      if (error.code === "P2002" || error.code === "P2034") {
        return NextResponse.json({ error: "This GRN or booking allocation changed concurrently. Reload and try again." }, { status: 409 });
      }
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to verify Work Order GRN because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify Work Order GRN." },
      { status: 400 },
    );
  }
}
