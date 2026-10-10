import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { assignAdvanceBookingToWorkOrder } from "@/lib/services/distribution/advance-booking-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    const { bookingId } = await context.params;
    if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 200) {
      throw new Error("Submit the size-wise quantities to assign.");
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each booking assignment line must be valid.");
      }
      const line = value as Record<string, unknown>;
      const bookingSizeLineId = String(line.bookingSizeLineId ?? "").trim();
      const assignedQuantity = typeof line.assignedQuantity === "number" ? line.assignedQuantity : Number.NaN;
      if (!bookingSizeLineId || !Number.isSafeInteger(assignedQuantity) || assignedQuantity < 0) {
        throw new Error("Each assignment needs a booking size and a whole-number quantity.");
      }
      return { bookingSizeLineId, assignedQuantity };
    });
    const result = await assignAdvanceBookingToWorkOrder(
      organization.id,
      user.id,
      bookingId,
      { workOrderId: String(body.workOrderId ?? "").trim(), lines },
    );
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Booking assignment is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "Booking or work-order quantities changed concurrently. Reload and try again." }, { status: 409 });
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to assign advance booking because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to assign advance booking." }, { status: 400 });
  }
}
