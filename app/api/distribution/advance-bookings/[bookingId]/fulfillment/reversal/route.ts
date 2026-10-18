import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { reverseAdvanceBookingFulfillment } from "@/lib/services/distribution/quotation-booking-fulfillment-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ bookingId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "Booking inventory changed while reversing fulfillment. Reload and try again." }, { status: 409 });
    }
    if (["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Booking fulfillment cannot be reversed until the required database migration is deployed." }, { status: 503 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("Unable to reverse advance-booking fulfillment because the database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unable to move booking fulfillment to general stock." },
    { status: 400 },
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new Error("Submit a valid allocation reversal request.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid allocation reversal request.");
    }
    const organizationId = "organizationId" in body && typeof body.organizationId === "string"
      ? body.organizationId.trim()
      : "";
    if (!organizationId) throw new Error("Select the organization for this allocation reversal.");
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const { bookingId } = await context.params;
    if (!bookingId.trim()) throw new Error("Select a booking whose fulfillment should be reversed.");
    const reversed = await reverseAdvanceBookingFulfillment(organization.id, user.id, bookingId);
    return NextResponse.json({ reversed });
  } catch (error) {
    return errorResponse(error);
  }
}
